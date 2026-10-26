/**
 * R02: the staging Worker (worker/src/index.mjs) + D1 adapter, driven through real Request/Response objects.
 * D1 is the SQLite shim (batch = transaction), so this proves the HTTP, routing, auth, budget and rollback logic;
 * it does NOT prove Cloudflare D1 behaviour (see docs/analytics-staging-contract.md §7, status R02-STAGING-BLOCKED-CREDENTIALS).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

let worker = null; let createSqliteD1 = null;
try { ({ default: worker } = await import('../worker/src/index.mjs')); ({ createSqliteD1 } = await import('../worker/src/sqlite-d1-shim.mjs')); } catch { /* Node without node:sqlite */ }
const skip = createSqliteD1 ? false : 'node:sqlite is not available';
if (!createSqliteD1 && process.env.ANALYTICS_INGEST_ALLOW_SQLITE_SKIP !== '1') {
  test('R02 tests need node:sqlite (Node >= 24)', () => { assert.fail('node:sqlite is not available on this Node'); });
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));
const TOKEN = 'report-token-for-tests-0123456789';
const ADMIN = 'admin-token-for-tests-0123456789ab';
const today = () => new Date().toISOString().slice(0, 10);
const packet = (over = {}) => ({ ...JSON.parse(JSON.stringify(fixture.validPacket)), day: today(), ...over });
const FIVE = ['songs', 'favorites', 'prayers_all', 'prayers_home', 'hours_list'].map((catalog_id) => ({ e: 'catalog_open', catalog_id, n: 1 }));
// the worker logs fixed-code lines; keep test output quiet except where a test captures them
console.log = () => {};
const totalN = (rows) => rows.reduce((s, r) => s + r.n, 0);

function setup(vars = {}) {
  const DB = createSqliteD1();
  const env = { DB, INGEST_ENABLED: 'true', REPORT_TOKEN: TOKEN, ADMIN_TOKEN: ADMIN, ...vars };
  const call = (p, init = {}) => worker.fetch(new Request(`https://staging.invalid${p}`, init), env);
  const post = (body, headers = {}) => call('/v2/ingest', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const rows = () => DB.raw.prepare('SELECT cell_key, n FROM cell_counts').all();
  return { DB, env, call, post, rows };
}

test('OFF by default: 503 before the body is read, nothing written', { skip }, async () => {
  const { DB, post, rows } = setup({ INGEST_ENABLED: undefined });
  const res = await post(packet());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { code: 'ingest_disabled' });
  assert.equal(rows().length, 0);
  for (const value of ['TRUE', '1', 'yes', 'false', '']) {
    const s = setup({ INGEST_ENABLED: value });
    assert.equal((await s.post(packet())).status, 503, `INGEST_ENABLED=${JSON.stringify(value)}`);
    s.DB.close();
  }
  DB.close();
});

test('ON + valid packet: 204 with an empty body, counters grow by exactly n', { skip }, async () => {
  const { DB, post, rows } = setup();
  const p = packet();
  const res = await post(p);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
  assert.equal(totalN(rows()), p.cells.reduce((s, c) => s + c.n, 0));
  DB.close();
});

test('invalid input maps to 4xx and writes nothing (schema 426, bad json/ID/region 400, oversize 413, type 415)', { skip }, async () => {
  const { DB, post, rows, call } = setup();
  assert.equal((await post({ ...packet(), schema_version: 1 })).status, 426);
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post({ ...packet(), region: 'BY' })).status, 400); // D-04: only UNKNOWN
  assert.equal((await post(packet({ cells: [{ e: 'screen_view', section: 'songs', content_id: 'not-a-public-id', n: 1 }] }))).status, 400);
  assert.equal((await post(packet({ day: '2019-01-01' }))).status, 400);
  assert.equal((await post({ ...packet(), user_id: 'u1' })).status, 400); // unknown field
  assert.equal((await post('x'.repeat(16 * 1024 + 1))).status, 413);
  assert.equal((await post('x', { 'content-length': '999999' })).status, 413);
  assert.equal((await post(packet(), { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await call('/v2/ingest', { method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20000)); c.close(); } }), duplex: 'half', headers: { 'content-type': 'text/plain' } })).status, 413);
  assert.equal(rows().length, 0);
  DB.close();
});

test('routes and methods: unknown path 404, GET/PUT/DELETE on ingest 405, wrong methods elsewhere 405', { skip }, async () => {
  const { DB, call } = setup();
  assert.equal((await call('/')).status, 404);
  assert.equal((await call('/v2/ingest/extra', { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await call('/v2/ingest?x=1')).status, 405);
  for (const method of ['PUT', 'DELETE', 'PATCH']) assert.equal((await call('/v2/ingest', { method, body: '{}' })).status, 405);
  assert.equal((await call('/v2/report', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await call('/v2/admin/ingest')).status, 405);
  DB.close();
});

test('parallel valid packets: the total n is exact', { skip }, async () => {
  const { DB, post, rows } = setup();
  const p = packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 3 }] });
  const results = await Promise.all(Array.from({ length: 25 }, () => post(p)));
  assert.ok(results.every((r) => r.status === 204));
  assert.equal(totalN(rows()), 75);
  DB.close();
});

test('daily budget: at the cap exactly one more packet fits, the rest are refused with a full rollback', { skip }, async () => {
  const { DB, post, rows, env } = setup();
  DB.raw.prepare('INSERT INTO daily_budget (day, rows_written, cap) VALUES (?, ?, ?)').run(today(), 79990, 80000);
  const results = await Promise.all(Array.from({ length: 10 }, () => post(packet({ cells: FIVE }))));
  assert.equal(results.filter((r) => r.status === 204).length, 1);
  assert.equal(results.filter((r) => r.status === 503).length, 9);
  assert.equal(DB.raw.prepare('SELECT rows_written FROM daily_budget').get().rows_written, 79996);
  assert.equal(totalN(rows()), 5);
  // a packet larger than the whole budget on an empty day: refused, nothing stored, no budget row
  const s = setup({ DAILY_ROW_WRITE_BUDGET: '5' });
  assert.equal((await s.post(packet({ cells: FIVE }))).status, 503);
  assert.equal(s.rows().length, 0);
  assert.equal(s.DB.raw.prepare('SELECT COUNT(*) AS c FROM daily_budget').get().c, 0);
  s.DB.close(); assert.ok(env); DB.close();
});

test('counter overflow rolls the whole batch back (503, other cells of the packet untouched)', { skip }, async () => {
  const { DB, post, rows } = setup();
  const key = JSON.stringify([today(), 'web', fixture.validPacket.app_version, 'UNKNOWN', 'catalog_open', '', '', '', '', '', 'songs', '']);
  DB.raw.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, ?)').run(key, Number.MAX_SAFE_INTEGER);
  const before = JSON.stringify(rows());
  const res = await post(packet({ platform: 'web', cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 1 }, { e: 'catalog_open', catalog_id: 'favorites', n: 1 }] }));
  assert.equal(res.status, 503);
  assert.equal(JSON.stringify(rows()), before);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS c FROM daily_budget').get().c, 0);
  DB.close();
});

test('a packet of 150 distinct cells (near the 16 KiB cap) goes through the chunked batch: 204, 150 rows, budget charge 151', { skip }, async () => {
  const { DB, post, rows } = setup();
  const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids.filter((id) => id.startsWith('song:')).slice(0, 150);
  assert.equal(songs.length, 150);
  const res = await post(packet({ cells: songs.map((content_id) => ({ e: 'screen_view', section: 'songs', content_id, n: 2 })) }));
  assert.equal(res.status, 204);
  assert.equal(rows().length, 150);
  assert.equal(totalN(rows()), 300);
  assert.equal(DB.raw.prepare('SELECT rows_written FROM daily_budget').get().rows_written, 151);
  DB.close();
});

test('kill switch row stops intake without redeploy; admin endpoint needs ADMIN_TOKEN', { skip }, async () => {
  const { DB, post, call, rows } = setup();
  assert.equal((await post(packet())).status, 204);
  assert.equal((await call('/v2/admin/ingest', { method: 'POST', body: '{"enabled":false}' })).status, 401);
  assert.equal((await call('/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{"enabled":false}' })).status, 401); // report token is not admin
  const off = await call('/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: '{"enabled":false}' });
  assert.equal(off.status, 200);
  const count = rows().length;
  assert.equal((await post(packet({ cells: FIVE }))).status, 503);
  assert.equal(rows().length, count);
  await call('/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: '{"enabled":true}' });
  assert.equal((await post(packet({ cells: FIVE }))).status, 204);
  assert.equal((await call('/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: '{"enabled":"yes"}' })).status, 400);
  DB.close();
});

test('report: 401 without, with a wrong, or with a weak/unset token; 200 only with the token; small cells suppressed', { skip }, async () => {
  const { DB, post, call } = setup();
  for (let i = 0; i < 5; i += 1) await post(packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 1 }] }));
  await post(packet({ cells: [{ e: 'catalog_open', catalog_id: 'favorites', n: 1 }] })); // n=1 < k
  assert.equal((await call('/v2/report')).status, 401);
  assert.equal((await call('/v2/report', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call('/v2/report', { headers: { authorization: `Basic ${TOKEN}` } })).status, 401);
  const ok = await call('/v2/report?x=1', { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await ok.json();
  assert.equal(body.cells.length, 1);
  assert.equal(body.cells[0].catalog_id, 'songs');
  assert.equal(body.cells[0].n, 5);
  assert.equal(body.totalsAreLowerBounds, true);
  assert.ok(!JSON.stringify(body).includes('favorites'), 'a cell with n < k must not appear');
  const unset = setup({ REPORT_TOKEN: undefined });
  assert.equal((await unset.call('/v2/report', { headers: { authorization: 'Bearer undefined' } })).status, 401);
  const weak = setup({ REPORT_TOKEN: 'short' });
  assert.equal((await weak.call('/v2/report', { headers: { authorization: 'Bearer short' } })).status, 401);
  unset.DB.close(); weak.DB.close(); DB.close();
});

test('retention: scheduled() deletes days older than 90 days and keeps the rest; budget rows follow', { skip }, async () => {
  const { DB, env } = setup();
  const old = '2020-01-01'; const recent = new Date(Date.now() - 80 * 86400000).toISOString().slice(0, 10);
  const key = (day) => JSON.stringify([day, 'web', '1.0.0', 'UNKNOWN', 'catalog_open', '', '', '', '', '', 'songs', '']);
  for (const day of [old, recent]) {
    DB.raw.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, 1)').run(key(day));
    DB.raw.prepare('INSERT INTO daily_budget (day, rows_written, cap) VALUES (?, 2, 80000)').run(day);
  }
  await worker.scheduled({}, env);
  assert.deepEqual(DB.raw.prepare('SELECT cell_key FROM cell_counts').all().map((r) => JSON.parse(r.cell_key)[0]), [recent]);
  assert.deepEqual(DB.raw.prepare('SELECT day FROM daily_budget').all().map((r) => r.day), [recent]);
  DB.close();
});

test('CORS: allow-listed origins get headers, others do not; preflight answers 204', { skip }, async () => {
  const { DB, call, post } = setup({ ALLOWED_ORIGINS: 'https://qa.example.invalid' });
  const pre = await call('/v2/ingest', { method: 'OPTIONS', headers: { origin: 'https://qa.example.invalid' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://qa.example.invalid');
  assert.equal((await call('/v2/ingest', { method: 'OPTIONS', headers: { origin: 'https://evil.invalid' } })).headers.get('access-control-allow-origin'), null);
  assert.equal((await post(packet(), { origin: 'https://evil.invalid' })).headers.get('access-control-allow-origin'), null);
  DB.close();
});

test('privacy: IP / User-Agent / cookie / Origin / URL never reach the database or the logs', { skip }, async () => {
  const { DB, post, call } = setup({ ALLOWED_ORIGINS: 'https://qa.example.invalid' });
  const SENTINELS = ['203.0.113.77', 'SentinelAgent/9.9', 'sentinel-cookie-value', 'https://qa.example.invalid', 'sentinel-query'];
  const logged = []; const original = console.log; console.log = (...a) => logged.push(a.join(' '));
  try {
    const hdr = { 'cf-connecting-ip': SENTINELS[0], 'user-agent': SENTINELS[1], cookie: `sid=${SENTINELS[2]}`, origin: SENTINELS[3], 'x-forwarded-for': SENTINELS[0] };
    await call(`/v2/ingest?q=${SENTINELS[4]}`, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr }, body: JSON.stringify(packet()) });
    await call('/v2/ingest', { method: 'POST', headers: { 'content-type': 'application/json', ...hdr }, body: JSON.stringify({ ...packet(), note: SENTINELS[1] }) });
    await post('x'.repeat(20000), hdr);
  } finally { console.log = original; }
  const dump = JSON.stringify([DB.raw.prepare('SELECT * FROM cell_counts').all(), DB.raw.prepare('SELECT * FROM daily_budget').all(), DB.raw.prepare('SELECT * FROM control').all(), logged]);
  for (const s of SENTINELS) assert.ok(!dump.includes(s), `sentinel leaked: ${s}`);
  assert.ok(logged.length >= 1);
  for (const line of logged) assert.ok(Object.keys(JSON.parse(line)).every((k) => ['code', 'status', 'cells', 'errors', 'rowsWritten', 'deleted'].includes(k)), line);
  const tables = DB.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name).sort();
  assert.deepEqual(tables, ['cell_counts', 'control', 'daily_budget']);
  DB.close();
});

test('two D1 connections to one file never overspend the budget (engine-level guard, no read-then-write)', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r02-')); const file = path.join(dir, 'db.sqlite');
  try {
    const a = setup(); a.DB.close();
    const A = createSqliteD1({ file }); const B = createSqliteD1({ file });
    A.raw.prepare('INSERT INTO daily_budget (day, rows_written, cap) VALUES (?, 79990, 80000)').run(today());
    const mk = (DB) => (body) => worker.fetch(new Request('https://x.invalid/v2/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { DB, INGEST_ENABLED: 'true' });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => mk(i % 2 ? A : B)(packet({ cells: FIVE }))));
    assert.equal(results.filter((r) => r.status === 204).length, 1);
    assert.equal(A.raw.prepare('SELECT rows_written FROM daily_budget').get().rows_written, 79996);
    A.close(); B.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('wrangler.toml: ingest OFF by default, no account id, no secrets, staging names only', { skip }, async () => {
  const toml = fs.readFileSync(path.join(ROOT, 'experiments/analytics-ingest/wrangler.toml'), 'utf8');
  assert.match(toml, /INGEST_ENABLED = "false"/);
  assert.match(toml, /name = "mybrev-analytics-staging"/);
  assert.ok(!/account_id\s*=/.test(toml));
  assert.ok(!/(TOKEN|SECRET|KEY)\s*=\s*"[^"]+"/.test(toml));
  assert.ok(!/routes?\s*=/.test(toml), 'no custom/production route');
});
