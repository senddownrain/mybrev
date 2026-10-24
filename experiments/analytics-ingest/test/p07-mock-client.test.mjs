/**
 * P07: offline consent / queue / mock-transport tests. Synthetic data only, in-process, no network.
 * The same scenario file runs on Flutter (test/analytics/consent_mock_test.dart).
 * `npm run test:analytics-ingest`
 */
import assert from 'node:assert/strict';
import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CONSENT_KEY, MAX_QUEUE_BYTES, QUEUE_KEY, createMemoryKv, createMockBackend, createMockClient } from '../src/mock-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const contract = readJson('tests/fixtures/analytics-contract-v2.json');
const scenarios = readJson('tests/fixtures/analytics-consent-scenarios.json');
const publicIds = new Set(readJson('src/utils/analytics/public-inventory.json').ids);
const T0 = Date.parse('2026-10-17T12:00:00Z');
const DAY = 86400000;

/** Any attempt to open a socket / resolve a name / call fetch during these tests is a failure. */
const netCalls = [];
const realFetch = globalThis.fetch;
const realConnect = net.Socket.prototype.connect;
const realLookup = dns.lookup;
globalThis.fetch = (...a) => { netCalls.push(['fetch', String(a[0])]); throw new Error('network is forbidden in P07 tests'); };
net.Socket.prototype.connect = function connect(...a) { netCalls.push(['connect', String(a[0])]); throw new Error('network is forbidden in P07 tests'); };
dns.lookup = (...a) => { netCalls.push(['dns', String(a[0])]); throw new Error('network is forbidden in P07 tests'); };
test.after(() => { globalThis.fetch = realFetch; net.Socket.prototype.connect = realConnect; dns.lookup = realLookup; });

function dayOf(token, now) {
  const offset = token === 'D0' ? 0 : Number(token.slice(1));
  return new Date(now + offset * DAY).toISOString().slice(0, 10);
}
const makePacket = (day, cells) => ({ ...JSON.parse(JSON.stringify(contract.validPacket)), day, cells: JSON.parse(JSON.stringify(contract.validPacket.cells)).slice(0, cells) });

function world({ build = true, server = true, minCells = scenarios.config.minCells, backend = {}, kv = createMemoryKv(), maxBytes } = {}) {
  const state = { now: T0, server, loseNext: false, purged: 0 };
  const be = createMockBackend({ now: () => state.now, publicIds, ingestEnabled: true, lose: () => { const v = state.loseNext; state.loseNext = false; return v; }, ...backend });
  const make = () => createMockClient({
    buildFlag: build, serverFlag: () => state.server, kv, transport: be.transport, now: () => state.now, publicIds, minCells, maxBytes,
    onPurge: () => { state.purged += 1; },
  });
  const w = { state, be, kv, client: make(), relaunch() { w.client = make(); }, offer: (day, cells) => w.client.offer(makePacket(day, cells)) };
  return w;
}
const aggregateN = async (w) => (await w.be.rows()).reduce((s, r) => s + r.n, 0);

for (const sc of scenarios.scenarios) {
  test(`scenario: ${sc.name}`, async () => {
    const w = world({ build: sc.build, server: sc.server });
    let last = {};
    for (const [i, step] of sc.steps.entries()) {
      switch (step.op) {
        case 'grant': w.client.consent.grant(); break;
        case 'revoke': w.client.consent.revoke(); break;
        case 'offer': last = w.offer(dayOf(step.day, w.state.now), step.cells); break;
        case 'flush': last = await w.client.flush(); break;
        case 'setServer': w.state.server = step.value; break;
        case 'setBackend': w.be.setIngestEnabled(step.value); break;
        case 'loseNext': w.state.loseNext = true; break;
        case 'relaunch': w.relaunch(); break;
        case 'advanceDays': w.state.now += step.days * DAY; break;
        default: assert.fail(`unknown op ${step.op}`);
      }
      const e = step.expect || {};
      const at = `${sc.name} / step ${i} (${step.op})`;
      if ('accepted' in e && step.op === 'offer') assert.equal(last.accepted, e.accepted, `${at}: accepted`);
      if ('reason' in e) assert.equal(last.reason, e.reason, `${at}: reason`);
      if ('sent' in e) assert.equal(last.sent, e.sent, `${at}: sent`);
      if ('lost' in e) assert.equal(last.lost, e.lost, `${at}: lost`);
      if ('held' in e) assert.equal(last.held, e.held, `${at}: held`);
      if ('accepted' in e && step.op === 'flush') assert.equal(w.be.received.accepted, e.accepted, `${at}: backend accepted`);
      if ('aggregateN' in e) assert.equal(await aggregateN(w), e.aggregateN, `${at}: aggregate`);
      if ('queueDays' in e) assert.deepEqual(w.client.queue().map((p) => p.day), e.queueDays.map((d) => dayOf(d, w.state.now)), `${at}: queue`);
      if ('queueKeyPresent' in e) assert.equal(w.kv.has(QUEUE_KEY), e.queueKeyPresent, `${at}: queue key`);
      if ('consent' in e) assert.equal(w.client.consent.get(), e.consent, `${at}: consent`);
      if ('hostBufferPurged' in e) assert.ok(w.state.purged > 0, `${at}: host buffer purge hook`);
    }
  });
}

test('gate matrix OFF/OFF, ON/OFF, OFF/ON, ON/ON: only build ON + server ON (+ consent) processes a synthetic packet', async () => {
  for (const g of scenarios.gates) {
    const w = world({ build: g.build, server: g.server, backend: { ingestEnabled: g.server } });
    w.client.consent.grant(); // consent given in every combination, to prove the flags alone decide
    const offered = w.offer(dayOf('D-1', T0), 9);
    const flushed = await w.client.flush();
    assert.equal(offered.accepted, g.processes, `${g.name}: offer`);
    assert.equal(flushed.sent, g.processes ? 1 : 0, `${g.name}: sent`);
    assert.equal(w.be.received.calls, g.processes ? 1 : 0, `${g.name}: transport calls`);
    assert.equal(await aggregateN(w), g.processes ? 28 : 0, `${g.name}: aggregate`);
    if (!g.build) assert.deepEqual(w.kv.ops, { get: 0, set: 0, remove: 0 }, `${g.name}: build flag OFF must not even touch storage`);
  }
  assert.deepEqual(netCalls, []);
});

test('default is OFF: a fresh install, a corrupt or non-literal consent value are all treated as no consent', () => {
  const w = world();
  assert.equal(w.client.consent.get(), false);
  for (const bad of ['', 'TRUE', '1', 'yes', '{"a":1}', 'true ']) {
    const kv = createMemoryKv({ [CONSENT_KEY]: bad });
    const w2 = world({ kv });
    assert.equal(w2.client.consent.get(), false, JSON.stringify(bad));
    assert.equal(w2.offer(dayOf('D-1', T0), 9).accepted, false);
  }
  assert.equal(w.kv.has(QUEUE_KEY), false);
});

test('consent=false never creates the queue key, even when reading continues all day', () => {
  const w = world();
  for (let i = 0; i < 50; i += 1) w.offer(dayOf('D0', T0), 9);
  assert.equal(w.kv.has(QUEUE_KEY), false);
  assert.equal(w.kv.ops.set, 0, 'not a single write while consent is OFF');
});

test('invalid packets are refused even with consent (the P06 contract validator is the client gate too)', () => {
  const w = world();
  w.client.consent.grant();
  const bad = makePacket(dayOf('D-1', T0), 9);
  bad.cells[0].content_id = 'prayer:notInInventory';
  assert.deepEqual(w.client.offer(bad), { accepted: false, reason: 'invalid_packet' });
  const extra = makePacket(dayOf('D-1', T0), 9);
  extra.user_id = 'x';
  assert.equal(w.client.offer(extra).accepted, false);
  assert.equal(w.kv.has(QUEUE_KEY), false);
});

test('queue merges the same day, stays within the byte cap (oldest day dropped first) and within 14 days', () => {
  const w = world({ maxBytes: 2500 });
  w.client.consent.grant();
  w.offer(dayOf('D-1', T0), 9); w.offer(dayOf('D-1', T0), 9);
  const queue = w.client.queue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].cells.reduce((s, c) => s + c.n, 0), 56, 'same-day packets are summed, not duplicated');
  for (let d = 2; d <= 13; d += 1) w.offer(dayOf(`D-${d}`, T0), 9);
  assert.ok(w.kv.size(QUEUE_KEY) <= 2500, 'size cap');
  assert.ok(w.client.stats.overflow > 0, 'overflow is counted, never silent');
  assert.equal(MAX_QUEUE_BYTES, 64 * 1024);
  const w2 = world();
  w2.client.consent.grant();
  w2.offer(dayOf('D-1', T0), 9);
  w2.state.now += 15 * DAY;
  w2.offer(dayOf('D0', w2.state.now), 9);
  assert.deepEqual(w2.client.queue().map((p) => p.day), [dayOf('D0', w2.state.now)], 'older than 14 days is dropped on the next write');
});

test('revoke during a flush stops the remaining sends and wipes the queue', async () => {
  const w = world();
  w.client.consent.grant();
  w.offer(dayOf('D-1', T0), 9); w.offer(dayOf('D-2', T0), 9);
  const inner = w.be.transport.send;
  let calls = 0;
  let client;
  const wrapped = { send: async (p) => { calls += 1; client.consent.revoke(); return inner(p); } }; // the user taps revoke while a send is in flight
  client = createMockClient({ buildFlag: true, serverFlag: () => true, kv: w.kv, transport: wrapped, now: () => T0, publicIds, minCells: 3 });
  const result = await client.flush();
  assert.equal(calls, 1, 'the in-flight send cannot be recalled (documented), the next one never starts');
  assert.equal(result.sent, 1);
  assert.equal(w.kv.has(QUEUE_KEY), false);
  assert.equal(client.consent.get(), false);
});

test('if the removal cannot be persisted nothing is sent (no duplicates)', async () => {
  const w = world();
  w.client.consent.grant();
  w.offer(dayOf('D-1', T0), 9);
  const realSet = w.kv.set; const realRemove = w.kv.remove;
  w.kv.set = () => { throw new Error('storage full'); };
  w.kv.remove = () => { throw new Error('storage full'); };
  await w.client.flush().catch(() => {});
  w.kv.set = realSet; w.kv.remove = realRemove;
  assert.equal(w.be.received.calls, 0);
  assert.equal(w.client.queue().length, 1, 'the packet is still there for a later attempt');
});

test('transport answers 4xx/5xx or throws: counted lost, never retried, queue emptied', async () => {
  const w = world();
  w.client.consent.grant();
  w.offer(dayOf('D-1', T0), 9);
  const failing = createMockClient({ buildFlag: true, serverFlag: () => true, kv: w.kv, now: () => T0, publicIds, minCells: 3, transport: { send: async () => ({ status: 429 }) } });
  assert.deepEqual(await failing.flush(), { sent: 0, lost: 1, held: 0 });
  assert.equal(failing.queue().length, 0);
  assert.deepEqual(await failing.flush(), { sent: 0, lost: 0, held: 0 });
});

test('a day older than the late-delivery window of the server is rejected by the core and counted lost', async () => {
  const w = world();
  w.client.consent.grant();
  w.offer(dayOf('D-5', T0), 9);
  const result = await w.client.flush();
  assert.deepEqual([result.sent, result.lost], [0, 1]);
  assert.equal(await aggregateN(w), 0);
});

test('mock aggregates: exact synthetic counts reach the in-memory store and the P06 report layer', async () => {
  const { buildReport } = await import('../src/report.mjs');
  const w = world();
  w.client.consent.grant();
  for (let i = 0; i < 5; i += 1) w.offer(dayOf('D-1', T0), 9);
  await w.client.flush();
  assert.equal(await aggregateN(w), 5 * 28);
  const report = buildReport(await w.be.rows(), { k: 5 });
  assert.equal(report.totalsAreLowerBounds, true);
  assert.ok(report.cells.every((c) => c.n >= 5));
});

test('no network: sockets, DNS and fetch were never touched by any test of this file', () => {
  assert.deepEqual(netCalls, []);
});

test('isolation: the app never imports the mock, and its source has no network or identifier API', () => {
  const src = fs.readFileSync(path.join(ROOT, 'experiments/analytics-ingest/src/mock-client.mjs'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const word of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /https?:\/\//, /\bnavigator\b/, /\bdocument\b/, /localStorage/, /\bcrypto\b/, /randomUUID/]) {
    assert.doesNotMatch(code, word, String(word));
  }
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.(js|vue|mjs|ts)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /mock-client|analytics-ingest|analytics_mock_/, `${file} must not know the mock`);
  }
});
