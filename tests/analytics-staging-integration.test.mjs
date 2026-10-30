/**
 * R03: the WEB transport against a REAL HTTP endpoint: the R02 staging Worker (worker/src/index.mjs) behind node:http on a
 * random loopback port, D1 = SQLite shim (the R02 local fallback). Proves that the server received the packet over the
 * network and that the stored counters equal the sent `n`. It does NOT prove Cloudflare D1 (R02-STAGING-BLOCKED-CREDENTIALS).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createCollector } from '../src/utils/analytics/collector.js';
import { createStagingTransport } from '../src/utils/analytics/stagingTransport.js';

let worker = null; let createSqliteD1 = null;
try { ({ default: worker } = await import('../experiments/analytics-ingest/worker/src/index.mjs')); ({ createSqliteD1 } = await import('../experiments/analytics-ingest/worker/src/sqlite-d1-shim.mjs')); } catch { /* Node without node:sqlite */ }
const skip = createSqliteD1 ? false : 'node:sqlite is not available (Node >= 22.5 needed)';

const inventory = JSON.parse(fs.readFileSync(new URL('../src/utils/analytics/public-inventory.json', import.meta.url), 'utf8'));
const publicIds = new Set(inventory.ids);
const prayerId = inventory.ids.find((id) => id.startsWith('prayer:'));
const DAY = 86400000;
const ADMIN = 'admin-token-for-tests-0123456789ab';

async function startServer(vars = {}) {
  const DB = createSqliteD1();
  const env = { DB, INGEST_ENABLED: 'true', REPORT_TOKEN: 'report-token-for-tests-0123456789', ADMIN_TOKEN: ADMIN, ALLOWED_ORIGINS: '', ...vars };
  const seen = [];
  const server = http.createServer(async (req, res) => {
    seen.push({ method: req.method, url: req.url, headers: { ...req.headers } });
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const response = await worker.fetch(new globalThis.Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rows = () => DB.raw.prepare('SELECT * FROM cell_counts').all();
  return { base, env, DB, seen, rows, close: async () => { await new Promise((resolve) => server.close(resolve)); DB.close(); } };
}

function kvStore() {
  const data = new Map();
  return { get: (k) => (data.has(k) ? data.get(k) : null), set: (k, v) => data.set(k, String(v)), remove: (k) => data.delete(k) };
}

/** Yesterday's synthetic QA traffic through the real collector with a fake clock; returns the expected sum of n. */
function synthesize(clock) {
  const collector = createCollector({ platform: 'web', appVersion: '4.5.2', enabled: true, publicIds, now: () => clock.t });
  for (let i = 0; i < 3; i += 1) {
    collector.enterView({ section: 'prayers', contentId: prayerId, totalChars: 900, fits: true });
    clock.t += 20_000;
    collector.leaveView();
  }
  collector.enterView({ catalogId: 'songs' }); clock.t += 6_000; collector.leaveView();
  collector.featureUse('theme_change', 'prayers');
  collector.flush();
  return collector;
}

function scenario(clock0 = Date.now() - DAY) {
  const clock = { t: clock0 };
  const collector = synthesize(clock);
  const expected = collector.snapshot().flatMap((p) => p.cells).reduce((sum, c) => sum + c.n, 0);
  clock.t = clock0 + DAY + 3600_000; // the next UTC day: yesterday is closed
  return { clock, collector, expected };
}

test('real HTTP: the server accepts the closed day and stored counters equal the sent n', { skip }, async () => {
  const server = await startServer();
  try {
    const { clock, collector, expected } = scenario();
    const transport = createStagingTransport({ url: server.base, kv: kvStore(), collector, publicIds, now: () => clock.t, fetchFn: (...a) => fetch(...a) });
    assert.equal(server.rows().length, 0);
    const result = await transport.flush();
    assert.equal(result.sent, 1, JSON.stringify(result));
    const rows = server.rows();
    assert.ok(rows.length >= 5);
    assert.equal(rows.reduce((s, r) => s + r.n, 0), expected, 'D1/SQLite sum(n) == client sum(n)');
    // what the server actually received on the wire: one POST, text/plain, nothing identifying
    assert.equal(server.seen.length, 1);
    const [request] = server.seen;
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v2/ingest');
    assert.equal(request.headers['content-type'], 'text/plain');
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.referer, undefined);
    assert.equal(request.headers.origin, undefined, 'node fetch sends no Origin; a browser sends its own (CORS), never stored');
    assert.ok(Number(request.headers['content-length']) <= 16 * 1024);
    // at-most-once: a second flush and a stale second copy send nothing
    const again = await transport.flush();
    assert.equal(again.sent, 0);
    assert.equal(server.seen.length, 1);
    assert.equal(server.rows().reduce((s, r) => s + r.n, 0), expected);
  } finally { await server.close(); }
});

test('real HTTP: server kill switch (admin endpoint) -> 503 -> client pauses, nothing is stored, nothing is retried', { skip }, async () => {
  const server = await startServer();
  try {
    const off = await fetch(`${server.base}/v2/admin/ingest`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: '{"enabled":false}' });
    assert.ok(off.status < 300);
    const before = server.seen.length;
    const { clock, collector } = scenario();
    const kv = kvStore();
    const transport = createStagingTransport({ url: server.base, kv, collector, publicIds, now: () => clock.t, fetchFn: (...a) => fetch(...a) });
    const result = await transport.flush();
    assert.equal(result.reason, 'ingest_disabled');
    assert.equal(result.sent, 0);
    assert.equal(server.rows().length, 0);
    assert.equal(transport.isPaused(), true);
    await transport.flush();
    assert.equal(server.seen.length - before, 1, 'exactly one request, no retry, none while paused');
  } finally { await server.close(); }
});

test('real HTTP: INGEST_ENABLED=false (default) -> 503, client loses the day and stores nothing', { skip }, async () => {
  const server = await startServer({ INGEST_ENABLED: 'false' });
  try {
    const { clock, collector } = scenario();
    const transport = createStagingTransport({ url: server.base, kv: kvStore(), collector, publicIds, now: () => clock.t, fetchFn: (...a) => fetch(...a) });
    const result = await transport.flush();
    assert.equal(result.lost, 1);
    assert.equal(server.rows().length, 0);
  } finally { await server.close(); }
});

test('real HTTP: connection refused / timeout -> lost, no retry, no throw', { skip }, async () => {
  const server = await startServer();
  const url = server.base;
  await server.close(); // nothing listens any more
  const { clock, collector } = scenario();
  const transport = createStagingTransport({ url, kv: kvStore(), collector, publicIds, now: () => clock.t, fetchFn: (...a) => fetch(...a) });
  const result = await transport.flush();
  assert.equal(result.lost, 1);
  assert.equal(result.sent, 0);
  assert.equal((await transport.flush()).lost, 0);
});

test('real HTTP: a slow server hits the client timeout (AbortController) and the day is lost', { skip }, async () => {
  const hang = http.createServer(() => { /* never answers */ });
  await new Promise((resolve) => hang.listen(0, '127.0.0.1', resolve));
  try {
    const { clock, collector } = scenario();
    const transport = createStagingTransport({ url: `http://127.0.0.1:${hang.address().port}`, kv: kvStore(), collector, publicIds, now: () => clock.t, fetchFn: (...a) => fetch(...a), timeoutMs: 150 });
    const started = Date.now();
    const result = await transport.flush();
    assert.equal(result.lost, 1);
    assert.ok(Date.now() - started < 3000);
  } finally { hang.closeAllConnections(); await new Promise((resolve) => hang.close(resolve)); }
});
