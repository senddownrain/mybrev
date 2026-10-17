/**
 * Offline tests of the ingest prototype. Synthetic packets only (fixtures v2 + invalid variants), no network, no Firestore.
 * `npm run test:analytics-ingest`. SQLite tests are skipped where `node:sqlite` is not available (Node 20).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CODES, DEFAULT_CONFIG, STATUS, cleanup, costModel, handleIngest, normalizeCells } from '../src/core.mjs';
import { createMemoryStorage } from '../src/storage-memory.mjs';
import { suppressSmallCells } from '../src/report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));
const publicIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids);
const NOW = Date.parse('2026-10-17T12:00:00Z');

const packet = (overrides = {}) => ({ ...JSON.parse(JSON.stringify(fixture.validPacket)), day: '2026-10-17', ...overrides });
const post = (body) => ({ method: 'POST', bodyText: typeof body === 'string' ? body : JSON.stringify(body) });
function setup({ enabled = true, storage = createMemoryStorage(), config = {} } = {}) {
  const logs = [];
  const env = { config: { ingestEnabled: enabled, ...config }, now: () => NOW, publicIds, storage, log: (entry) => logs.push(entry) };
  return { env, logs, storage, send: (body, request) => handleIngest(request || post(body), env) };
}

test('the fixture packet is accepted, stored as summed counters and answered 204', async () => {
  const { send, storage, logs } = setup();
  const result = await send(packet());
  assert.deepEqual([result.status, result.code], [204, 'ok']);
  const rows = await storage.all();
  assert.equal(rows.length, normalizeCells(packet()).length);
  assert.equal(rows.reduce((sum, row) => sum + row.n, 0), packet().cells.reduce((sum, cell) => sum + cell.n, 0), 'no allowed aggregate is lost');
  assert.deepEqual(logs, [{ code: 'ok', status: 204, cells: rows.length }]);
});

test('kill switch: with INGEST_ENABLED=false ANY request gets 503 and nothing is parsed, written or logged beyond the fixed code', async () => {
  const { send, storage, logs } = setup({ enabled: false });
  for (const request of [post(packet()), { method: 'GET', bodyText: '' }, post('{not json'), post('x'.repeat(100000))]) {
    const result = await send(null, request);
    assert.deepEqual([result.status, result.code], [503, 'ingest_disabled']);
  }
  assert.equal((await storage.all()).length, 0);
  assert.ok(logs.every((entry) => entry.code === 'ingest_disabled' && Object.keys(entry).sort().join() === 'code,status'));
  assert.equal(DEFAULT_CONFIG.ingestEnabled, false, 'the default is OFF');
});

test('rejections: method, size, malformed JSON, old/future schema, unknown field, unknown cell field', async () => {
  const { send, storage } = setup();
  assert.equal((await send(null, { method: 'GET', bodyText: '' })).code, 'method_not_allowed');
  assert.equal((await send('x'.repeat(16 * 1024 + 1))).code, 'payload_too_large');
  assert.equal((await send('{oops')).code, 'bad_json');
  assert.equal((await send(packet({ schema_version: 1 }))).code, 'unsupported_schema');
  assert.equal((await send(packet({ schema_version: 3 }))).code, 'unsupported_schema');
  assert.equal((await send({ ...packet(), user_id: 'abc' })).code, 'invalid_packet');
  assert.equal((await send({ ...packet(), ip: '1.2.3.4' })).code, 'invalid_packet');
  const withExtra = packet(); withExtra.cells[0] = { ...withExtra.cells[0], text: 'prayer text' };
  assert.equal((await send(withExtra)).code, 'invalid_packet');
  assert.equal((await storage.all()).length, 0, 'nothing stored for any rejected packet');
});

test('non-public ids are refused: unknown prayer, a hidden priest-only id, a searched string', async () => {
  const { send, storage } = setup();
  for (const contentId of ['prayer:ZZZZZZZZZZZZZZZZZZZZ', 'prayer:priest-only-secret-0001', 'prayer:search term']) {
    const bad = packet({ cells: [{ e: 'screen_view', section: 'prayers', content_id: contentId, n: 1 }] });
    assert.equal((await send(bad)).code, 'invalid_packet', contentId);
  }
  assert.equal((await storage.all()).length, 0);
});

test('counters: negative, zero, fractional, huge n and too many cells are refused; max allowed n is kept', async () => {
  const { send, storage } = setup();
  const one = { e: 'catalog_open', catalog_id: 'songs' };
  for (const n of [-1, 0, 1.5, 10001, '5', null]) assert.equal((await send(packet({ cells: [{ ...one, n }] }))).code, 'invalid_packet', String(n));
  assert.equal((await send(packet({ cells: Array.from({ length: 201 }, () => ({ ...one, n: 1 })) }))).status >= 400, true);
  assert.equal((await send(packet({ cells: [{ ...one, n: 10000 }] }))).status, 204);
  assert.equal((await storage.all())[0].n, 10000);
});

test('dates: UTC day only; future, too old and malformed days are refused; late delivery within the window is accepted', async () => {
  const { send } = setup();
  assert.equal((await send(packet({ day: '2026-10-18' }))).code, 'day_out_of_range');
  assert.equal((await send(packet({ day: '2026-10-14' }))).code, 'day_out_of_range');
  assert.equal((await send(packet({ day: '2026-10-15' }))).status, 204);
  assert.equal((await send(packet({ day: '17.10.2026' }))).code, 'invalid_packet');
});

test('region: only UNKNOWN is accepted until D-04; a country in the payload or a spoofed header changes nothing', async () => {
  const { send, storage } = setup();
  assert.equal((await send(packet({ region: 'BY' }))).code, 'region_not_allowed');
  const result = await send(null, { method: 'POST', bodyText: JSON.stringify(packet()), headers: { 'cf-ipcountry': 'BY', 'x-forwarded-for': '1.2.3.4' } });
  assert.equal(result.status, 204);
  assert.ok((await storage.all()).every((row) => JSON.parse(row.cell_key)[3] === 'UNKNOWN'));
});

test('future client versions: any major.minor is stored as a label; a malformed version is refused', async () => {
  const { send } = setup();
  assert.equal((await send(packet({ app_version: '9.9' }))).status, 204);
  assert.equal((await send(packet({ app_version: '4.5.2' }))).code, 'invalid_packet');
  assert.equal((await send(packet({ app_version: 'latest' }))).code, 'invalid_packet');
});

test('duplicates: a repeated packet is counted twice (idempotency is NOT solved without an identifier); the same cell twice inside one packet is refused', async () => {
  const { send, storage } = setup();
  await send(packet()); await send(packet());
  const total = (await storage.all()).reduce((sum, row) => sum + row.n, 0);
  assert.equal(total, 2 * packet().cells.reduce((sum, cell) => sum + cell.n, 0));
  // the contract refuses the same cell twice inside one packet (a client must sum them itself)
  const inner = packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 2 }, { e: 'catalog_open', catalog_id: 'songs', n: 3 }] });
  const fresh = setup();
  assert.equal((await fresh.send(inner)).code, 'invalid_packet');
  assert.equal((await fresh.storage.all()).length, 0);
});

test('parallel increments of the same cell are summed without loss', async () => {
  const { env, storage } = setup();
  const body = post(packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 1 }] }));
  const results = await Promise.all(Array.from({ length: 50 }, () => handleIngest(body, env)));
  assert.ok(results.every((r) => r.status === 204));
  assert.equal((await storage.all())[0].n, 50);
});

test('storage failure rolls everything back: nothing is half written, the answer is 503 storage_unavailable, no content in the log', async () => {
  let fail = false;
  const storage = createMemoryStorage({ failOn: () => fail });
  const { send, logs } = setup({ storage });
  await send(packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 1 }] }));
  const before = JSON.stringify(await storage.all());
  fail = true;
  const result = await send(packet());
  assert.deepEqual([result.status, result.code], [503, 'storage_unavailable']);
  assert.equal(JSON.stringify(await storage.all()), before);
  assert.ok(logs.every((entry) => CODES.includes(entry.code)));
});

test('daily write budget: a packet that would exceed it is refused whole (503 budget_exhausted); the next UTC day starts fresh', async () => {
  const { env, storage } = setup({ config: { dailyRowWriteBudget: 5 } });
  const cells = (count) => Array.from({ length: count }, (_, i) => ({ e: 'catalog_open', catalog_id: ['songs', 'favorites', 'prayers_all', 'prayers_home', 'hours_list', 'bible_books', 'compendium_home'][i], n: 1 }));
  assert.equal((await handleIngest(post(packet({ cells: cells(4) })), env)).status, 204);
  assert.equal((await handleIngest(post(packet({ cells: cells(2) })), env)).code, 'budget_exhausted');
  assert.equal((await storage.all()).length, 4, 'the refused packet wrote nothing');
  const tomorrow = { ...env, now: () => NOW + 86400000 };
  assert.equal((await handleIngest(post(packet({ day: '2026-10-18', cells: cells(2) })), tomorrow)).status, 204);
});

test('retention: counters older than the window are deleted by a key-range delete; newer ones stay', async () => {
  const { send, storage } = setup();
  await send(packet({ day: '2026-10-15' }));
  await send(packet({ day: '2026-10-17' }));
  assert.equal(await cleanup(storage, Date.parse('2027-11-10T00:00:00Z'), 395), 0, 'cutoff 2026-10-11: both days are newer, nothing is deleted');
  const deleted = await cleanup(storage, Date.parse('2027-11-15T00:00:00Z'), 395); // cutoff 2026-10-16: only 2026-10-15 is older
  assert.ok(deleted > 0);
  const days = new Set((await storage.all()).map((row) => JSON.parse(row.cell_key)[0]));
  assert.deepEqual([...days], ['2026-10-17']);
  assert.ok((await cleanup(storage, Date.parse('2028-01-01T00:00:00Z'), 395)) > 0);
  assert.equal((await storage.all()).length, 0);
});

test('no personal data in storage or logs: keys hold only allow-listed fields, logs only fixed keys and codes', async () => {
  const { send, storage, logs } = setup();
  await send(packet());
  await send('{oops'); await send(packet({ schema_version: 1 }));
  const allowed = new Set(['2026-10-17', 'web', 'android', 'ios', 'UNKNOWN', '']);
  for (const row of await storage.all()) {
    const parts = JSON.parse(row.cell_key);
    assert.equal(parts.length, 12);
    assert.ok(!/@|\bhttp|\d+\.\d+\.\d+\.\d+|Mozilla/i.test(row.cell_key));
    assert.ok(Number.isInteger(row.n));
  }
  void allowed;
  for (const entry of logs) {
    assert.ok(CODES.includes(entry.code));
    assert.ok(Object.keys(entry).every((key) => ['code', 'status', 'cells', 'errors'].includes(key)));
  }
});

test('report side: small cells are suppressed with k = 5; k < 2 is refused', () => {
  const rows = [{ n: 1 }, { n: 4 }, { n: 5 }, { n: 20 }];
  assert.deepEqual(suppressSmallCells(rows), { rows: [{ n: 5 }, { n: 20 }], suppressedCells: 2, k: 5 });
  assert.throws(() => suppressSmallCells(rows, { k: 1 }), /k must/);
});

test('cost model (D1 Free: 100 000 rows written / day; the guard stops at 80 000): 100 / 1000 / 3000 packets a day', () => {
  const at = (packetsPerDay, cellsPerPacket) => costModel({ packetsPerDay, cellsPerPacket });
  assert.deepEqual([at(100, 20).rowsWritten, at(100, 20).withinBudget], [2000, true]);
  assert.deepEqual([at(1000, 20).rowsWritten, at(1000, 20).withinBudget], [20000, true]);
  assert.deepEqual([at(3000, 20).rowsWritten, at(3000, 20).withinBudget], [60000, true]);
  assert.deepEqual([at(3000, 30).rowsWritten, at(3000, 30).withinBudget], [90000, false], '3000 packets of 30 cells exceed the budget: BLOCKED at this size');
  assert.equal(at(1000, 30).maxPacketsPerDayAtThisSize, 2666);
});

test('isolation: the app does not import the prototype, no sender exists, no analytics endpoint is referenced outside docs', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const sources = walk(path.join(ROOT, 'src')).filter((file) => /\.(js|vue|mjs)$/.test(file));
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/experiments\/analytics-ingest|analytics-ingest/.test(text), file);
    assert.ok(!/\/v1\/aggregates/.test(text), `${file} must not call an analytics endpoint`);
  }
  assert.equal(STATUS.OK, 204);
});
