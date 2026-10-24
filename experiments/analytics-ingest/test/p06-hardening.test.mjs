/* global TextEncoder */
/**
 * P06 hardening: negative / fuzz / abuse / privacy tests of the pure core + memory storage + report. Synthetic data only, no network.
 * (SQLite counterparts: p06-sqlite.test.mjs.)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as core from '../src/core.mjs';
import { CODES, cleanup, handleIngest, normalizeCells } from '../src/core.mjs';
import { createMemoryStorage } from '../src/storage-memory.mjs';
import * as reportModule from '../src/report.mjs';
import { buildReport } from '../src/report.mjs';
import { FEATURE_IDS, SECTIONS, validatePacket } from '../../../src/utils/analytics/contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));
const publicIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids);
const NOW = Date.parse('2026-10-17T12:00:00Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const packet = (overrides = {}) => ({ ...clone(fixture.validPacket), day: '2026-10-17', ...overrides });
const post = (body) => ({ method: 'POST', bodyText: typeof body === 'string' ? body : (JSON.stringify(body) ?? '') });
const songs = (n = 1) => [{ e: 'catalog_open', catalog_id: 'songs', n }];
function setup({ storage = createMemoryStorage(), config = {}, now = NOW } = {}) {
  const logs = [];
  const env = { config: { ingestEnabled: true, ...config }, now: () => now, publicIds, storage, log: (entry) => logs.push(entry) };
  return { env, logs, storage, send: (body) => handleIngest(post(body), env) };
}

test('kill switch: with ingestEnabled=false neither the method nor the body is even READ (not just not parsed)', async () => {
  const touched = [];
  const spy = new Proxy({}, { get(_t, prop) { touched.push(String(prop)); throw new Error('the request must not be touched'); } });
  const { env, storage, logs } = setup({ config: { ingestEnabled: false } });
  const result = await handleIngest(spy, env);
  assert.deepEqual([result.status, result.code], [503, 'ingest_disabled']);
  assert.deepEqual(touched, []);
  // a malformed, huge, hostile body is denied the same way and is never parsed
  const valid = JSON.stringify(packet());
  const realParse = JSON.parse; let parsed = 0;
  JSON.parse = (...args) => { parsed += 1; return realParse(...args); };
  try {
    for (const bodyText of ['{oops', '['.repeat(100000), 'x'.repeat(10 * 1024 * 1024), valid]) {
      assert.equal((await handleIngest({ method: 'POST', bodyText }, env)).code, 'ingest_disabled');
    }
    assert.equal((await handleIngest({ method: 'GET', bodyText: '' }, env)).code, 'ingest_disabled');
  } finally { JSON.parse = realParse; }
  assert.equal(parsed, 0);
  assert.equal((await storage.all()).length, 0);
  assert.ok(logs.every((entry) => entry.code === 'ingest_disabled' && Object.keys(entry).join() === 'code,status'));
});

test('the default config fails closed: no config at all means disabled', async () => {
  const result = await handleIngest(post(packet()), { now: () => NOW, publicIds, storage: createMemoryStorage() });
  assert.equal(result.code, 'ingest_disabled');
});

test('POST only: every other method (and a lower-case post) is refused without writes', async () => {
  const { env, storage } = setup();
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'post', '', undefined, null]) {
    const result = await handleIngest({ method, bodyText: JSON.stringify(packet()) }, env);
    assert.deepEqual([result.status, result.code], [405, 'method_not_allowed'], String(method));
  }
  assert.equal((await storage.all()).length, 0);
});

test('16 KiB limit is measured in BYTES of the text: 16384 passes the size gate, 16385 and multi-byte overshoot get 413', async () => {
  const { send, storage } = setup();
  const base = JSON.stringify(packet());
  const exact = base + ' '.repeat(16384 - base.length);
  assert.equal(new TextEncoder().encode(exact).byteLength, 16384);
  assert.equal((await send(exact)).status, 204);
  assert.equal((await send(`${exact} `)).code, 'payload_too_large');
  assert.equal((await send('ж'.repeat(9000))).code, 'payload_too_large', '9000 characters but 18000 bytes');
  assert.equal((await send('')).code, 'bad_json');
  assert.equal((await handleIngest({ method: 'POST', bodyText: undefined }, setup().env)).code, 'bad_json');
  assert.equal((await handleIngest({ method: 'POST', bodyText: { not: 'a string' } }, setup().env)).code, 'bad_json');
  assert.equal((await storage.all()).length, normalizeCells(packet()).length, 'only the one accepted packet is stored');
});

test('hostile JSON shapes are 4xx, never an exception and never a write (deep nesting, __proto__, constructor, arrays, scalars)', async () => {
  const { send, storage } = setup();
  const cases = [
    '['.repeat(16000), `${'{"a":'.repeat(3000)}1${'}'.repeat(3000)}`, 'null', 'true', '42', '"text"', '[]', '[1,2]', '{}',
    `{"__proto__":{"polluted":true},"schema_version":2}`, JSON.stringify({ ...packet(), constructor: { prototype: {} } }),
    JSON.stringify({ ...packet(), __proto__x: 1 }), '﻿' + JSON.stringify(packet()),
  ];
  for (const body of cases) {
    const result = await send(body);
    assert.ok(result.status >= 400 && result.status < 500, `${body.slice(0, 30)} -> ${result.status}`);
  }
  assert.equal({}.polluted, undefined);
  assert.equal((await storage.all()).length, 0);
});

test('invalid packets write nothing: wrong schema, platform/"scheme", region, day, private id, extra field, bad version', async () => {
  const privateIds = ['prayer:priest-only-secret-0001', 'prayer:AAAAAAAAAAAAAAAAAAAA', 'song:holysongs-00000000000000000000', 'comp:admin', 'reading:2026-10-17', 'bible:xx:genesis'];
  const bad = [
    packet({ schema_version: 1 }), packet({ schema_version: 3 }), packet({ schema_version: '2' }),
    packet({ platform: 'desktop' }), packet({ platform: 'WEB' }), packet({ platform: 'https' }),
    packet({ region: 'BY' }), packet({ region: 'OTHER' }), packet({ region: 'by' }), packet({ region: 'DE' }),
    packet({ day: '2026-10-18' }), packet({ day: '2026-10-14' }), packet({ day: '2026-02-30' }), packet({ day: '2026-10-17T00:00:00Z' }), packet({ day: '17.10.2026' }),
    packet({ app_version: '4.5.1' }), packet({ app_version: 'latest' }), packet({ app_version: '4.5\n' }),
    { ...packet(), user_id: 'u1' }, { ...packet(), ip: '1.2.3.4' }, { ...packet(), url: 'https://x.example/p?q=1' }, { ...packet(), user_agent: 'Mozilla/5.0' },
    packet({ cells: [{ e: 'catalog_open', catalog_id: 'songs', n: 1, search: 'пакаянне' }] }),
    packet({ cells: [{ e: 'screen_view', section: 'prayers', content_id: 'prayer:abc', n: 1 }] }),
    ...privateIds.map((id) => packet({ cells: [{ e: 'screen_view', section: id.startsWith('song') ? 'songs' : id.startsWith('comp') ? 'compendium' : id.startsWith('reading') ? 'readings' : id.startsWith('bible') ? 'bible' : 'prayers', content_id: id, n: 1 }] })),
    packet({ cells: [] }), packet({ cells: 'x' }), packet({ cells: [null] }), packet({ cells: [{ e: 'admin_open', n: 1 }] }),
  ];
  for (const body of bad) {
    const { send, storage, logs } = setup();
    const result = await send(body);
    assert.ok(result.status >= 400 && result.status < 500, `${JSON.stringify(body).slice(0, 80)} -> ${result.status}`);
    assert.equal((await storage.all()).length, 0);
    assert.equal(await storage.budgetUsed('2026-10-17'), 0, 'a refused packet does not consume budget');
    assert.ok(logs.every((entry) => CODES.includes(entry.code)));
  }
});

test('n: boundaries 1 and 10000 pass; 0, -1, 10001, 2^53, 1.5, NaN-like, strings, booleans and an exponent overflow are refused', async () => {
  for (const n of [1, 10000]) assert.equal((await setup().send(packet({ cells: songs(n) }))).status, 204);
  for (const raw of ['0', '-1', '10001', '9007199254740992', '1.5', '"5"', 'true', 'null', '1e999', '-1e999', '[1]', '{"v":1}']) {
    const { send, storage } = setup();
    const text = `{"schema_version":2,"day":"2026-10-17","platform":"web","app_version":"4.5","region":"UNKNOWN","cells":[{"e":"catalog_open","catalog_id":"songs","n":${raw}}]}`;
    assert.equal((await send(text)).code, 'invalid_packet', raw);
    assert.equal((await storage.all()).length, 0);
  }
});

test('UTC day window and midnight rollover: the window is [today-2, today] on the SERVER UTC clock', async () => {
  const at = (iso) => setup({ now: Date.parse(iso) });
  const just = at('2026-10-17T23:59:59.999Z');
  assert.equal((await just.send(packet({ day: '2026-10-18', cells: songs() }))).code, 'day_out_of_range', 'tomorrow is the future for a client with a fast clock');
  assert.equal((await just.send(packet({ day: '2026-10-15', cells: songs() }))).status, 204);
  assert.equal((await just.send(packet({ day: '2026-10-14', cells: songs() }))).code, 'day_out_of_range');
  const after = at('2026-10-18T00:00:00.000Z');
  assert.equal((await after.send(packet({ day: '2026-10-18', cells: songs() }))).status, 204, 'the new day opens exactly at 00:00:00Z');
  assert.equal((await after.send(packet({ day: '2026-10-15', cells: songs() }))).code, 'day_out_of_range', 'two seconds earlier it was still accepted');
  // the budget belongs to the server day, not to the (late) packet day
  assert.equal(await just.storage.budgetUsed('2026-10-17'), 2);
  assert.equal(await just.storage.budgetUsed('2026-10-15'), 0);
  // non-UTC "local" spellings cannot shift the day
  assert.equal((await at('2026-10-18T00:30:00Z').send(packet({ day: '2026-10-18T00:30:00+03:00', cells: songs() }))).code, 'invalid_packet');
});

test('FUZZ (seeded, 1500 mutations): never throws; a 204 only for a packet that validates; everything else writes nothing and logs only fixed codes', async () => {
  let seed = 0xC0FFEE;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const junk = [null, undefined, 0, -1, 1e9, 2 ** 53, 1.5, '', 'x', '😀', 'ж'.repeat(40), true, [], {}, [1], { a: 1 }, '__proto__', '../..', '<script>', 'prayer:' + 'a'.repeat(500)];
  const mutate = (value, depth = 0) => {
    if (value && typeof value === 'object' && depth < 3 && rnd() < 0.7) {
      const copy = Array.isArray(value) ? [...value] : { ...value };
      const keys = Object.keys(copy);
      const roll = rnd();
      if (roll < 0.3 && keys.length) delete copy[pick(keys)];
      else if (roll < 0.6 && keys.length) { const key = pick(keys); copy[key] = mutate(copy[key], depth + 1); }
      else if (roll < 0.8) copy[pick(['user_id', 'ip', 'ua', 'url', '__proto__', 'x'])] = pick(junk);
      else if (keys.length) copy[pick(keys)] = pick(junk);
      return copy;
    }
    return pick(junk);
  };
  let accepted = 0;
  for (let i = 0; i < 1500; i += 1) {
    const { send, storage, logs } = setup();
    let body = mutate(packet({ cells: clone(fixture.validPacket.cells) }));
    if (rnd() < 0.1) body = (JSON.stringify(body) ?? '').slice(0, Math.floor(rnd() * 400));
    let result;
    await assert.doesNotReject(async () => { result = await send(body); });
    if (result.status === 204) {
      accepted += 1;
      assert.deepEqual(validatePacket(JSON.parse(typeof body === 'string' ? body : (JSON.stringify(body) ?? '')), { publicIds }), []);
    } else {
      assert.equal((await storage.all()).length, 0);
      assert.equal(await storage.budgetUsed('2026-10-17'), 0);
    }
    assert.ok(logs.every((entry) => CODES.includes(entry.code) && Object.keys(entry).every((k) => ['code', 'status', 'cells', 'errors'].includes(k))));
    for (const row of await storage.all()) assert.equal(JSON.parse(row.cell_key).length, 12);
  }
  assert.ok(accepted >= 0);
});

test('80 % budget near the limit: of N concurrent packets only those that fit are accepted; the budget is never overspent (memory model)', async () => {
  const { env, storage } = setup();
  storage.budget.set('2026-10-17', 79990); // charge of a 5-cell packet = 5 + 1 budget row = 6
  const body = post(packet({ cells: ['songs', 'favorites', 'prayers_all', 'prayers_home', 'hours_list'].map((catalog_id) => ({ e: 'catalog_open', catalog_id, n: 1 })) }));
  const results = await Promise.all(Array.from({ length: 10 }, () => handleIngest(body, env)));
  assert.equal(results.filter((r) => r.status === 204).length, 1);
  assert.equal(results.filter((r) => r.code === 'budget_exhausted').length, 9);
  assert.equal(await storage.budgetUsed('2026-10-17'), 79996);
  assert.equal((await storage.all()).reduce((s, r) => s + r.n, 0), 5, 'refused packets wrote nothing');
});

test('budget boundary is exact: charge == remaining passes, one more row is refused', async () => {
  for (const [seed, expected] of [[79994, 204], [79995, 503]]) {
    const { env, storage } = setup();
    storage.budget.set('2026-10-17', seed);
    const cells = ['songs', 'favorites', 'prayers_all', 'prayers_home', 'hours_list'].map((catalog_id) => ({ e: 'catalog_open', catalog_id, n: 1 }));
    assert.equal((await handleIngest(post(packet({ cells })), env)).status, expected);
  }
});

test('rate abuse: a flood of maximal packets exhausts the day budget (analytics denial for the day is a KNOWN, DOCUMENTED limit) and then writes nothing more', async () => {
  const { env, storage } = setup();
  const cells = [];
  for (const feature_id of FEATURE_IDS) for (const section of SECTIONS) cells.push({ e: 'feature_use', feature_id, section, n: 1 });
  const body = post(packet({ cells: cells.slice(0, 200) })); // 200 distinct cells, valid, charge 201
  let accepted = 0;
  for (let i = 0; i < 450; i += 1) if ((await handleIngest(body, env)).status === 204) accepted += 1;
  assert.equal(accepted, Math.floor(80000 / 201));
  const snapshot = JSON.stringify(await storage.all());
  assert.equal((await handleIngest(body, env)).code, 'budget_exhausted');
  assert.equal(JSON.stringify(await storage.all()), snapshot, 'fail closed: stored values are untouched after exhaustion');
  assert.ok(await storage.budgetUsed('2026-10-17') <= 80000);
});

test('transaction failure between steps: counter overflow on one cell rolls back the whole packet and does not leak budget (memory)', async () => {
  const { env, storage } = setup();
  const cells = [{ e: 'catalog_open', catalog_id: 'songs', n: 1 }, { e: 'catalog_open', catalog_id: 'favorites', n: 1 }];
  const [songKey] = normalizeCells(packet({ cells }));
  storage.counts.set(songKey.key, Number.MAX_SAFE_INTEGER);
  storage.counts.set(normalizeCells(packet({ cells }))[1].key, 7);
  const before = JSON.stringify(await storage.all());
  assert.deepEqual([(await handleIngest(post(packet({ cells })), env)).code], ['storage_unavailable']);
  assert.equal(JSON.stringify(await storage.all()), before);
  assert.equal(await storage.budgetUsed('2026-10-17'), 0);
});

test('idempotency: exactly-once is IMPOSSIBLE without a per-packet token (indistinguishable loss scenarios); at-most-once and at-least-once are the only options', async () => {
  // Same observation for the client — "no answer" — in two worlds that differ in server state.
  const world = async (delivered) => {
    const { env, storage } = setup();
    if (delivered) await handleIngest(post(packet({ cells: songs(3) })), env); // the response is lost afterwards
    return { clientSees: 'timeout', serverTotal: (await storage.all()).reduce((s, r) => s + r.n, 0) };
  };
  const lost = await world(false); const answerLost = await world(true);
  assert.equal(lost.clientSees, answerLost.clientSees);
  assert.notEqual(lost.serverTotal, answerLost.serverTotal);
  // retry policy A (at-least-once): in world 2 the retry double counts
  const retry = setup(); await retry.send(packet({ cells: songs(3) })); await retry.send(packet({ cells: songs(3) }));
  assert.equal((await retry.storage.all())[0].n, 6, 'overcount x2');
  // policy B (at-most-once, drop on timeout): world 1 loses the 3 opens (undercount), world 2 is exact
  assert.equal(lost.serverTotal, 0);
  assert.equal(answerLost.serverTotal, 3);
});

test('retention: the cutoff day is kept, older days go; key order == day order across month/year/leap boundaries; TTL must exceed the late window', async () => {
  const days = ['2023-12-31', '2024-02-28', '2024-02-29', '2024-03-01', '2024-12-31', '2025-01-01', '2026-10-15', '2026-10-16', '2026-10-17'];
  for (const cutoff of days) {
    const storage = createMemoryStorage();
    for (const day of days) {
      const [row] = normalizeCells({ ...packet({ cells: songs() }), day });
      storage.counts.set(row.key, 1);
    }
    const nowMs = Date.parse(`${cutoff}T00:00:00Z`) + 395 * 86400000;
    await cleanup(storage, nowMs, 395);
    const left = (await storage.all()).map((r) => JSON.parse(r.cell_key)[0]);
    assert.deepEqual(left, days.filter((d) => d >= cutoff), `cutoff ${cutoff}`);
  }
  // midnight UTC: one millisecond before the day changes the cutoff does not move
  const storage = createMemoryStorage();
  for (const day of ['2026-10-14', '2026-10-15']) storage.counts.set(normalizeCells({ ...packet({ cells: songs() }), day })[0].key, 1);
  await cleanup(storage, Date.parse('2026-10-18T23:59:59.999Z'), 3); // cutoff 10-15
  assert.deepEqual((await storage.all()).map((r) => JSON.parse(r.cell_key)[0]), ['2026-10-15']);
  await cleanup(storage, Date.parse('2026-10-19T00:00:00.000Z'), 3); // cutoff 10-16
  assert.equal((await storage.all()).length, 0);
  for (const bad of [0, 1, 2, -5, 1.5, NaN, undefined]) await assert.rejects(cleanup(storage, NOW, bad), /retentionDays/);
});

test('retention also removes old daily_budget rows (no unbounded growth)', async () => {
  const { env, storage } = setup();
  await handleIngest(post(packet({ cells: songs() })), env);
  assert.equal(await storage.budgetUsed('2026-10-17'), 2);
  await cleanup(storage, Date.parse('2027-12-01T00:00:00Z'), 395);
  assert.equal(await storage.budgetUsed('2026-10-17'), 0);
});

test('privacy of logs and errors: a hostile payload never reaches console, log entries or the result', async () => {
  const SENTINEL = 'SENTINEL-prayer-for-the-dead-8f3a';
  const seen = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = methods.map((m) => console[m]);
  methods.forEach((m) => { console[m] = (...args) => seen.push(args); });
  const { env, logs } = setup();
  const results = [];
  try {
    for (const body of [
      packet({ cells: [{ e: 'screen_view', section: 'prayers', content_id: `prayer:${SENTINEL}`, n: 1 }] }),
      { ...packet(), user_id: SENTINEL }, `{"${SENTINEL}":`, packet({ day: SENTINEL }), packet({ region: SENTINEL }),
    ]) results.push(await handleIngest(post(body), env));
  } finally { methods.forEach((m, i) => { console[m] = originals[i]; }); }
  const everything = JSON.stringify([seen, logs, results]);
  assert.ok(!everything.includes(SENTINEL));
  assert.equal(seen.length, 0, 'the core never uses console');
  assert.ok(results.every((r) => Object.keys(r).sort().join() === 'code,status'), 'no body, no error text in the response');
});

test('no network: running the full path touches neither fetch nor sockets; the prototype sources contain no network/process primitives', async () => {
  const realFetch = globalThis.fetch; const realConnect = net.Socket.prototype.connect; let attempts = 0;
  globalThis.fetch = () => { attempts += 1; throw new Error('network'); };
  net.Socket.prototype.connect = function blocked() { attempts += 1; throw new Error('network'); };
  try {
    const { send } = setup();
    await send(packet()); await send('{oops');
  } finally { globalThis.fetch = realFetch; net.Socket.prototype.connect = realConnect; }
  assert.equal(attempts, 0);
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|node:(?:http|https|http2|net|tls|dns|dgram|child_process|worker_threads)|from ['"](?:http|https|net|tls|dns|child_process)['"]|process\.env|wrangler|api\.cloudflare|firebase|navigator\./i;
  const src = path.join(HERE, '..', 'src');
  for (const file of fs.readdirSync(src)) assert.ok(!forbidden.test(fs.readFileSync(path.join(src, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), file);
});

test('no read path: the core exports no reader, GET is refused, an accepted packet is answered with an empty body', async () => {
  assert.deepEqual(Object.keys(core).sort(), ['BUDGET_ROW_OVERHEAD', 'CODES', 'DEFAULT_CONFIG', 'STATUS', 'cleanup', 'costModel', 'handleIngest', 'normalizeCells']);
  assert.deepEqual(Object.keys(reportModule).sort(), ['buildReport', 'suppressSmallCells']);
  const { env } = setup();
  assert.equal((await handleIngest({ method: 'GET', bodyText: '' }, env)).code, 'method_not_allowed');
  assert.deepEqual(await handleIngest(post(packet()), env), { status: 204, code: 'ok' });
});

// ---- report side -------------------------------------------------------------------------------------------------

const cellKey = (overrides = {}) => JSON.stringify(['2026-10-17', 'web', '4.5', 'UNKNOWN', 'text_read', 'prayers', 'prayer:abcdef', 'fv', '5_15s', '', '', ''].map((v, i) => [overrides][0][i] ?? v));

test('report: k boundary — 4 hidden, 5 shown; k < 2 refused; output carries no hidden-cell count', () => {
  const rows = [{ cell_key: cellKey({ 6: 'prayer:aaaaaa' }), n: 4 }, { cell_key: cellKey({ 6: 'prayer:bbbbbb' }), n: 5 }];
  const report = buildReport(rows);
  assert.deepEqual(report.cells.map((c) => c.n), [5]);
  assert.equal(report.totalsAreLowerBounds, true);
  assert.ok(!JSON.stringify(report).includes('suppressed'));
  assert.throws(() => buildReport(rows, { k: 1 }), /k must/);
});

test('report: NON-INTERFERENCE — changing any hidden cell (n < k, including its existence) cannot change a single published byte', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ids = Array.from({ length: 12 }, (_, i) => `prayer:item${String(i).padStart(3, '0')}`);
  for (let round = 0; round < 200; round += 1) {
    const rows = ids.map((id, i) => ({ cell_key: cellKey({ 6: id, 1: i % 2 ? 'web' : 'ios' }), n: 1 + Math.floor(rnd() * 12) }));
    const shown = JSON.stringify(buildReport(rows));
    const perturbed = rows.flatMap((row) => {
      if (row.n >= 5) return [row];
      const roll = rnd();
      return roll < 0.25 ? [] : [{ ...row, n: 1 + Math.floor(rnd() * 4) }]; // vanish or change within < k
    });
    assert.equal(JSON.stringify(buildReport(perturbed)), shown);
  }
});

test('report: totals are sums of the SHOWN cells only, so total - sum(shown slices) is always 0 and reveals nothing', () => {
  const rows = [
    { cell_key: cellKey({ 6: 'prayer:aaaaaa' }), n: 9 }, { cell_key: cellKey({ 6: 'prayer:bbbbbb' }), n: 2 }, { cell_key: cellKey({ 6: 'prayer:cccccc' }), n: 1 },
  ];
  const report = buildReport(rows);
  const slot = '2026-10-17|web|text_read';
  assert.equal(report.totals[slot], 9);
  assert.equal(report.totals[slot] - report.cells.reduce((s, c) => s + c.n, 0), 0);
});
