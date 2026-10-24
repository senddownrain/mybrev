/**
 * P09: cross-platform end-to-end on SYNTHETIC / QA-simulator aggregates. No network, no secrets, nothing deployed.
 *
 *   WEB      real `createCollector` driven by a scripted visit list (no browser)
 *   Android  Hive dump from the P03 emulator run (docs/analytics-evidence/p09/device-aggregates)
 *   iOS      Hive dump from the P03 simulator run (same folder)
 *     -> P07 mock client (build ∧ server ∧ consent gate, at-most-once queue)
 *     -> P07 mock transport -> P06 ingest core -> in-memory store
 *     -> P08 rollup (aggregate first, then k = 5 suppression) -> sanitised report -> dashboard.html
 *
 * Two runs of the same packets: x1 (what one session of QA really produced: almost everything is below k and hidden)
 * and x6 (each packet offered six times, a K-DEMO FIXTURE only: six copies are not six independent people).
 * Prints one JSON document; with --out <dir> also writes report.json, dashboard.html, e2e-result.json.
 */
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCollector } from '../../../src/utils/analytics/collector.js';
import { validatePacket } from '../../../src/utils/analytics/contract.js';
import { createMemoryKv, createMockBackend, createMockClient, CONSENT_KEY, QUEUE_KEY } from '../src/mock-client.mjs';
import { buildAll, renderHtml } from '../dashboard-demo/build-dashboard.mjs';
import { buildDashboardReport } from '../dashboard-demo/rollup.mjs';
import { K, loadPublicInventory } from '../dashboard-demo/synthetic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..');
const DEVICE_DIR = path.join(ROOT, 'docs/analytics-evidence/p09/device-aggregates');
export const CLOCK = Date.parse('2026-10-25T08:00:00Z');
export const MULTIPLICITY = 6;

/** Network trap: counts any attempt of any kind (fetch, sockets, DNS, http(s)). Restored by the returned function. */
export function trapNetwork() {
  const attempts = [];
  const saved = { fetch: globalThis.fetch, connect: net.Socket.prototype.connect, lookup: dns.lookup, http: http.request, https: https.request };
  const trip = (kind) => () => { attempts.push(kind); throw new Error(`network attempt: ${kind}`); };
  globalThis.fetch = trip('fetch');
  net.Socket.prototype.connect = trip('socket');
  dns.lookup = trip('dns');
  http.request = trip('http');
  https.request = trip('https');
  return { attempts, restore() { Object.assign(globalThis, { fetch: saved.fetch }); net.Socket.prototype.connect = saved.connect; dns.lookup = saved.lookup; http.request = saved.http; https.request = saved.https; } };
}

/** WEB packets from the REAL collector. Fixed script: a short hour visit, a prayer read to the end, a catalog, a feature. */
export function webPackets(publicIds) {
  let t = Date.parse('2026-10-23T10:00:00Z');
  const collector = createCollector({ platform: 'web', appVersion: '3.2.0', enabled: true, publicIds, now: () => t });
  const tick = (s) => { t += s * 1000; };
  collector.enterView({ section: 'today' }); tick(8); collector.leaveView();
  collector.enterView({ section: 'hours', contentId: 'hour:laudes', totalChars: 6000 }); tick(95); collector.reportScroll(1); collector.leaveView();
  collector.enterView({ section: 'songs', contentId: 'song:holysongs-47aac31ac301c3c2d79c', totalChars: 280, fits: true }); tick(30); collector.leaveView();
  collector.enterView({ section: 'prayers', catalogId: 'prayers_home' }); tick(4); collector.leaveView();
  collector.featureUse('favorite_add', 'songs');
  collector.enterView({ section: 'bible', contentId: 'bible:bel:gn', totalChars: 4500 }); tick(40); collector.reportScroll(0.5); collector.leaveView();
  collector.enterView({ section: 'readings', contentId: 'reading:day', totalChars: 3500 }); tick(70); collector.reportScroll(0.8); collector.leaveView();
  collector.flush();
  return collector.snapshot();
}

export const devicePackets = () => ['ios_sim_aggregates_final.json', 'android_emu_aggregates_final.json']
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DEVICE_DIR, f), 'utf8')));

/** Independent expectation straight from the source packets: sum of n per (day, platform, cell). */
export function expectedTotals(packets, multiplicity) {
  const out = {};
  for (const p of packets) for (const c of p.cells) {
    const name = c.e === 'text_read' ? `text_read_${c.metric}` : c.e;
    out[name] = (out[name] || 0) + c.n * multiplicity;
    const slot = (out[`by_${p.platform}`] ||= {});
    slot[name] = (slot[name] || 0) + c.n * multiplicity;
  }
  return out;
}
const storedTotals = (rows) => {
  const FIELD = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket'];
  const out = {};
  for (const { cell_key: key, n } of rows) {
    const v = Object.fromEntries(JSON.parse(key).map((x, i) => [FIELD[i], x]));
    const name = v.e === 'text_read' ? `text_read_${v.metric}` : v.e;
    out[name] = (out[name] || 0) + n;
    const slot = (out[`by_${v.platform}`] ||= {});
    slot[name] = (slot[name] || 0) + n;
  }
  return out;
};

/** One device: client with all three locks open, offers the packet `multiplicity` times, flushes. */
async function runDevice({ packets, multiplicity, backend, publicIds }) {
  const kv = createMemoryKv();
  const client = createMockClient({ buildFlag: true, serverFlag: () => true, kv, transport: backend.transport, now: () => CLOCK, publicIds });
  client.consent.grant();
  for (const packet of packets) for (let i = 0; i < multiplicity; i += 1) {
    if (!client.offer(packet).accepted) throw new Error('offer rejected');
  }
  const flush = await client.flush();
  return { stats: { ...client.stats }, flush, queueLeft: client.queue().length };
}

export async function runPipeline({ multiplicity }) {
  const publicIds = new Set(loadPublicInventory());
  const sources = { web: webPackets(publicIds), android: devicePackets().filter((p) => p.platform === 'android'), ios: devicePackets().filter((p) => p.platform === 'ios') };
  const validation = Object.fromEntries(Object.entries(sources).map(([p, list]) => [p, list.map((packet) => validatePacket(packet, { publicIds }).length)]));
  const backend = createMockBackend({ now: () => CLOCK, publicIds });
  const devices = {};
  for (const [platform, list] of Object.entries(sources)) devices[platform] = await runDevice({ packets: list, multiplicity, backend, publicIds });
  const rows = await backend.rows();
  const all = Object.values(sources).flat();
  const expected = expectedTotals(all, multiplicity);
  const stored = storedTotals(rows);
  const report = buildDashboardReport(rows, { k: K, publicIds: [...publicIds], seed: null, generated: `P09 e2e x${multiplicity}` });
  return { multiplicity, sources, validation, devices, backend: { received: { ...backend.received } }, rows, expected, stored, report };
}

/** Gate matrix: every closed combination sends nothing and keeps nothing; revoke wipes the queue. */
export async function gateMatrix() {
  const publicIds = new Set(loadPublicInventory());
  const packet = webPackets(publicIds)[0];
  const cases = [
    { name: 'build OFF', buildFlag: false, server: true, consent: true },
    { name: 'build ON, server OFF (kill switch)', buildFlag: true, server: false, consent: true },
    { name: 'build ON, server ON, consent OFF', buildFlag: true, server: true, consent: false },
  ];
  const results = [];
  for (const c of cases) {
    const backend = createMockBackend({ now: () => CLOCK, publicIds });
    const kv = createMemoryKv();
    const client = createMockClient({ buildFlag: c.buildFlag, serverFlag: () => c.server, kv, transport: backend.transport, now: () => CLOCK, publicIds });
    if (c.consent) client.consent.grant();
    const offered = client.offer(packet);
    const flush = await client.flush();
    results.push({ ...c, offered: offered.accepted, reason: offered.reason ?? null, sent: flush.sent, transportCalls: backend.received.calls, queueKeyExists: kv.has(QUEUE_KEY), kvWrites: kv.ops.set });
  }
  // revoke after queueing: queue gone, later offers rejected, transport never called
  const backend = createMockBackend({ now: () => CLOCK, publicIds });
  const kv = createMemoryKv();
  const client = createMockClient({ buildFlag: true, serverFlag: () => true, kv, transport: backend.transport, now: () => CLOCK, publicIds });
  client.consent.grant();
  client.offer(packet);
  const before = client.queue().length;
  client.consent.revoke();
  const afterOffer = client.offer(packet);
  const flush = await client.flush();
  results.push({ name: 'revoke after queueing', queuedBefore: before, queueKeyExistsAfter: kv.has(QUEUE_KEY), consentKey: kv.get(CONSENT_KEY), offeredAfter: afterOffer.accepted, reason: afterOffer.reason, sent: flush.sent, transportCalls: backend.received.calls });
  // server kill switch flipped between queue and flush
  const b2 = createMockBackend({ now: () => CLOCK, publicIds });
  const kv2 = createMemoryKv();
  let server = true;
  const c2 = createMockClient({ buildFlag: true, serverFlag: () => server, kv: kv2, transport: b2.transport, now: () => CLOCK, publicIds });
  c2.consent.grant(); c2.offer(packet); server = false;
  const f2 = await c2.flush();
  results.push({ name: 'kill switch flipped before flush', sent: f2.sent, queueKeyExistsAfter: kv2.has(QUEUE_KEY), transportCalls: b2.received.calls });
  return results;
}

export async function runE2E() {
  const trap = trapNetwork();
  try {
    const gates = await gateMatrix();
    const x1 = await runPipeline({ multiplicity: 1 });
    const x6 = await runPipeline({ multiplicity: MULTIPLICITY });
    return { gates, x1, x6, networkAttempts: [...trap.attempts] };
  } finally { trap.restore(); }
}

const FORBIDDEN = [/https?:/i, /\b\d{1,3}(\.\d{1,3}){3}\b/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, /user|device_?id|install|session|cookie|token|priest|\?[a-z]+=/i];
export const privacyScan = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return FORBIDDEN.map((re) => (re.test(text) ? re.source : null)).filter(Boolean);
};

export function summarize(result) {
  const run = (r) => ({
    multiplicity: r.multiplicity,
    packetsValid: r.validation,
    perDevice: Object.fromEntries(Object.entries(r.devices).map(([p, d]) => [p, { sent: d.stats.sent, lost: d.stats.lost, flush: d.flush, queueLeft: d.queueLeft }])),
    transport: r.backend.received,
    storedRows: r.rows.length,
    expectedTotals: r.expected,
    storedTotals: r.stored,
    storedEqualsExpected: JSON.stringify(r.expected) === JSON.stringify(r.stored),
    report: {
      k: r.report.k, days: r.report.window.days,
      publishedOpens: r.report.opens.reduce((s, c) => s + c.n, 0),
      publishedFv: r.report.text.filter((c) => c.metric === 'fv').reduce((s, c) => s + c.n, 0),
      publishedFeatures: r.report.features.reduce((s, c) => s + c.n, 0),
      publishedCells: r.report.opens.length + r.report.catalog.length + r.report.text.length + r.report.features.length + r.report.errors.length + r.report.materials.length,
      minPublishedN: Math.min(...[r.report.opens, r.report.catalog, r.report.text, r.report.features, r.report.errors, r.report.materials].flat().map((c) => c.n), Infinity),
      privacyScan: privacyScan(r.report),
    },
  });
  return { gates: result.gates, x1: run(result.x1), x6: run(result.x6), networkAttempts: result.networkAttempts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runE2E();
  const summary = summarize(result);
  const outIndex = process.argv.indexOf('--out');
  if (outIndex > 0) {
    const out = path.resolve(process.argv[outIndex + 1]);
    fs.mkdirSync(out, { recursive: true });
    const built = await buildAll();
    built.output.report = result.x6.report;
    built.output.meta = { ...built.output.meta, generated: 'P09 e2e: WEB collector + P03 iOS/Android QA aggregates, each offered x6 (k-demo fixture)', seed: null, days_generated: result.x6.report.window.days.length, days_removed_by_retention: [] };
    fs.writeFileSync(path.join(out, 'report-x6.json'), `${JSON.stringify(result.x6.report, null, 2)}\n`);
    fs.writeFileSync(path.join(out, 'report-x1.json'), `${JSON.stringify(result.x1.report, null, 2)}\n`);
    fs.writeFileSync(path.join(out, 'dashboard-e2e.html'), renderHtml(built.output));
    fs.writeFileSync(path.join(out, 'e2e-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(JSON.stringify(summary, null, 2));
  const bad = summary.networkAttempts.length || !summary.x1.storedEqualsExpected || !summary.x6.storedEqualsExpected;
  if (bad) process.exitCode = 1;
}
