/**
 * R03: QA-only staging transport of the WEB collector. Unit tests with an injected fetch / store / clock (no network).
 * The same transport against a real HTTP endpoint is in analytics-staging-integration.test.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createCollector } from '../src/utils/analytics/collector.js';
import { LIMITS } from '../src/utils/analytics/contract.js';
import {
  MAX_PACKETS_PER_FLUSH, PAUSE_KEY, SENT_KEY, createStagingTransport, isAllowedEndpoint,
} from '../src/utils/analytics/stagingTransport.js';

const PRAYER = 'prayer:AbCdEfGhIjKlMnOpQrSt';
const PRAYER_2 = 'prayer:BbCdEfGhIjKlMnOpQrSt';
const publicIds = new Set([PRAYER, PRAYER_2, 'hour:laudes', 'reading:day']);
const T0 = Date.parse('2026-10-15T10:00:00Z');
const DAY = 86400000;

function kvStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { get: (k) => (data.has(k) ? data.get(k) : null), set: (k, v) => data.set(k, String(v)), remove: (k) => data.delete(k), data };
}

/** A day with several visits => enough cells (screen_view / fv / sd / er / catalog / feature). */
function visitDay(collector, clock, contentId = PRAYER) {
  collector.enterView({ section: 'prayers', contentId, totalChars: 900, fits: true });
  clock.t += 20_000;
  collector.leaveView();
  collector.enterView({ catalogId: 'songs' });
  clock.t += 8_000;
  collector.featureUse('theme_change', 'prayers');
  collector.flush();
}

function setup({ status = 204, code, throws = false, online = true, persist, kv = kvStore(), url = 'http://127.0.0.1:8788' } = {}) {
  const clock = { t: T0 };
  const collector = createCollector({ platform: 'web', appVersion: '4.5.2', enabled: true, publicIds, now: () => clock.t });
  const calls = [];
  const fetchFn = async (target, init) => {
    calls.push({ target, init });
    if (throws) throw new TypeError('network down');
    return { status, json: async () => (code ? { code } : {}) };
  };
  const transport = createStagingTransport({
    url, kv, collector, publicIds, fetchFn, now: () => clock.t, isOnline: () => online, persist,
  });
  const nextDay = () => { clock.t += DAY; };
  return { clock, collector, calls, transport, kv, nextDay };
}

test('endpoint gate: https or loopback http only, no credentials / query', () => {
  assert.equal(isAllowedEndpoint('http://127.0.0.1:8788'), true);
  assert.equal(isAllowedEndpoint('https://mybrev-analytics-staging.example.workers.dev'), true);
  for (const bad of ['http://example.com', 'ftp://127.0.0.1', 'https://u:p@x.dev', 'https://x.dev?k=1', '', 'not a url', 'http://127.0.0.1.evil.com']) {
    assert.equal(isAllowedEndpoint(bad), false, bad);
  }
  const { transport, calls } = setup({ url: 'http://example.com' });
  assert.equal(transport.endpoint, null);
  return transport.flush().then((r) => { assert.equal(r.reason, 'endpoint_not_allowed'); assert.equal(calls.length, 0); });
});

test('only CLOSED days are sent: today stays local, nothing is sent the same day', async () => {
  const { collector, calls, transport, nextDay, clock } = setup();
  visitDay(collector, clock);
  const r0 = await transport.flush();
  assert.equal(calls.length, 0);
  assert.equal(r0.sent, 0);
  assert.ok(collector.snapshot().length > 0, 'today is kept');
  nextDay();
  const r1 = await transport.flush();
  assert.equal(r1.sent, 1);
  assert.equal(calls.length, 1);
});

test('request shape: POST, text/plain, no credentials/referrer, body is a valid contract-v2 packet without IDs', async () => {
  const s = setup();
  visitDay(s.collector, s.clock);
  s.nextDay();
  await s.transport.flush();
  const { target, init } = s.calls[0];
  assert.equal(target, 'http://127.0.0.1:8788/v2/ingest');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'Content-Type': 'text/plain' });
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.redirect, 'error');
  assert.ok(init.body.length <= LIMITS.maxPacketBytes);
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['app_version', 'cells', 'day', 'platform', 'region', 'schema_version']);
  assert.equal(body.schema_version, 2);
  assert.equal(body.region, 'UNKNOWN');
  assert.equal(body.platform, 'web');
  assert.equal(body.day, '2026-10-15');
  // no url/path/query/referrer/text/ids anywhere in the body
  assert.doesNotMatch(init.body, /https?:|user_id|device|session|install|referrer|search|query|priest|private|\?/i);
  for (const key of Object.keys(init.headers)) assert.equal(key, 'Content-Type');
});

test('at-most-once: the day is removed BEFORE the request; a repeat flush and a second tab send nothing', async () => {
  const s = setup();
  visitDay(s.collector, s.clock);
  s.nextDay();
  let present = null;
  s.transport = createStagingTransport({
    url: 'http://127.0.0.1:8788', kv: s.kv, collector: s.collector, publicIds, now: () => s.clock.t,
    fetchFn: async () => { present = s.collector.snapshot().some((p) => p.day === '2026-10-15'); return { status: 204, json: async () => ({}) }; },
  });
  await s.transport.flush();
  assert.equal(present, false, 'marked (removed) before send');
  const again = await s.transport.flush();
  assert.equal(again.sent, 0);
  // another tab restores a stale copy of the same day: the ledger knows it was handed over
  const clock2 = { t: T0 };
  const tab2 = createCollector({ platform: 'web', appVersion: '4.5.2', enabled: true, publicIds, now: () => clock2.t });
  visitDay(tab2, clock2);
  const stale = tab2.snapshot()[0];
  const t2 = createStagingTransport({ url: 'http://127.0.0.1:8788', kv: s.kv, collector: tab2, publicIds, now: () => s.clock.t, fetchFn: async () => { throw new Error('must not send'); } });
  assert.equal(t2.wasSent(stale), true);
  const r2 = await t2.flush();
  assert.equal(r2.sent, 0);
  assert.equal(r2.suppressed, 1);
});

test('no retry on any failure; the day is lost, not re-queued (timeout / 5xx / 4xx / thrown)', async () => {
  for (const variant of [{ throws: true }, { status: 500 }, { status: 400, code: 'invalid_packet' }, { status: 413, code: 'payload_too_large' }, { status: 426, code: 'unsupported_schema' }]) {
    const s = setup(variant);
    visitDay(s.collector, s.clock);
    s.nextDay();
    const first = await s.transport.flush();
    assert.equal(first.lost, 1, JSON.stringify(variant));
    assert.equal(s.calls.length, 1);
    const second = await s.transport.flush();
    assert.equal(s.calls.length, 1, 'no retry');
    assert.equal(second.sent + second.lost, 0);
    assert.deepEqual(s.collector.snapshot().filter((p) => p.day < '2026-10-16'), []);
  }
});

test('kill switch: 503 ingest_disabled pauses 24 h, nothing more is sent or queued', async () => {
  const s = setup({ status: 503, code: 'ingest_disabled' });
  visitDay(s.collector, s.clock);
  s.nextDay();
  const r = await s.transport.flush();
  assert.equal(r.reason, 'ingest_disabled');
  assert.ok(Number(s.kv.get(PAUSE_KEY)) > s.clock.t);
  assert.equal(s.transport.isPaused(), true);
  visitDay(s.collector, s.clock);
  s.clock.t += 3600_000;
  const r2 = await s.transport.flush();
  assert.equal(r2.reason, 'paused');
  assert.equal(s.calls.length, 1);
  s.clock.t += 25 * 3600 * 1000;
  assert.equal(s.transport.isPaused(), false);
});

test('offline: nothing is taken or sent, the data is kept for the next trigger', async () => {
  const s = setup({ online: false });
  visitDay(s.collector, s.clock);
  s.nextDay();
  const r = await s.transport.flush();
  assert.equal(r.reason, 'offline');
  assert.equal(s.calls.length, 0);
  assert.ok(s.collector.snapshot().some((p) => p.day === '2026-10-15'));
});

test('persisting the removal fails => nothing is sent (no replay possible)', async () => {
  const s = setup({ persist: () => { throw new Error('quota'); } });
  visitDay(s.collector, s.clock);
  s.nextDay();
  const r = await s.transport.flush();
  assert.equal(r.reason, 'persist_failed');
  assert.equal(s.calls.length, 0);
});

test('a ledger that cannot be written => nothing is sent', async () => {
  const kv = kvStore();
  const failing = { ...kv, set: (k, v) => { if (k === SENT_KEY) throw new Error('quota'); kv.set(k, v); } };
  const s = setup({ kv: failing });
  visitDay(s.collector, s.clock);
  s.nextDay();
  const r = await s.transport.flush();
  assert.equal(s.calls.length, 0);
  assert.equal(r.reason, 'ledger_failed');
});

test('a day older than the server window is dropped, not sent; a tiny day (< 3 cells) is held back and dropped', async () => {
  const old = setup();
  visitDay(old.collector, old.clock);
  old.clock.t += 4 * DAY;
  const r = await old.transport.flush();
  assert.equal(old.calls.length, 0);
  assert.equal(r.expired, 1);

  const tiny = setup();
  tiny.collector.featureUse('theme_change', 'prayers'); // one cell
  tiny.nextDay();
  const r2 = await tiny.transport.flush();
  assert.equal(tiny.calls.length, 0);
  assert.equal(r2.suppressed, 1);
});

test('days outside the server window are not sent; eligible closed days go out oldest first (<= MAX_PACKETS_PER_FLUSH)', async () => {
  const s = setup();
  for (let i = 0; i < 4; i += 1) { s.clock.t = T0 + i * DAY; visitDay(s.collector, s.clock); }
  s.clock.t = T0 + 4 * DAY + 3600_000; // today = 10-19; closed: 10-15 .. 10-18; window today-2 => 10-17, 10-18
  const sent = [];
  const t = createStagingTransport({ url: 'http://127.0.0.1:8788', kv: kvStore(), collector: s.collector, publicIds, now: () => s.clock.t, fetchFn: async (u, i) => { sent.push(JSON.parse(i.body).day); return { status: 204, json: async () => ({}) }; } });
  const r = await t.flush();
  assert.deepEqual(sent, ['2026-10-17', '2026-10-18']);
  assert.equal(r.expired, 2);
  assert.ok(sent.length <= MAX_PACKETS_PER_FLUSH);
});

test('private / priest-only / unknown ids never leave: the collector drops them and the packet is re-validated', async () => {
  const s = setup();
  s.collector.enterView({ section: 'prayers', contentId: 'prayer:ZZZZZZZZZZZZZZZZZZZZ' }); // not in the public inventory
  s.clock.t += 30_000;
  s.collector.leaveView();
  visitDay(s.collector, s.clock);
  s.nextDay();
  await s.transport.flush();
  const body = s.calls.map((c) => c.init.body).join('');
  assert.doesNotMatch(body, /ZZZZ|priest|private/);
  // a hand-forged packet that bypasses the collector is refused by validatePacket before fetch
  const forged = createCollector({ platform: 'web', appVersion: '4.5.2', enabled: true, publicIds, now: () => s.clock.t });
  forged.takeDays = () => [{ schema_version: 2, day: '2026-10-15', platform: 'web', app_version: '4.5', region: 'UNKNOWN', cells: [{ e: 'screen_view', section: 'prayers', content_id: 'prayer:ZZZZZZZZZZZZZZZZZZZZ', n: 1, user_id: 'x' }, { e: 'catalog_open', catalog_id: 'songs', n: 1 }, { e: 'catalog_open', catalog_id: 'favorites', n: 1 }] }];
  forged.snapshot = () => [{ day: '2026-10-15' }];
  const calls = [];
  const t = createStagingTransport({ url: 'http://127.0.0.1:8788', kv: kvStore(), collector: forged, publicIds, now: () => s.clock.t, fetchFn: async (u, i) => { calls.push(i); return { status: 204, json: async () => ({}) }; } });
  const r = await t.flush();
  assert.equal(calls.length, 0);
  assert.equal(r.suppressed, 1);
});

test('the transport source has no ID, URL-of-page, referrer, cookie, storage-of-ids or SDK references', () => {
  const src = fs.readFileSync(new URL('../src/utils/analytics/stagingTransport.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of ['location', 'document.cookie', 'userAgent', 'randomUUID', 'getRandomValues', 'sendBeacon', 'navigator.language', 'gtag', 'firebase', 'sentry']) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
});
