/**
 * P08: offline synthetic dashboard demo. Everything here is synthetic, in-process, no network.
 * `npm run test:analytics-ingest`
 */
import assert from 'node:assert/strict';
import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildAll, renderHtml } from '../dashboard-demo/build-dashboard.mjs';
import { buildDashboardReport, emptyReport, reportToCsv } from '../dashboard-demo/rollup.mjs';
import { runScenarios } from '../dashboard-demo/scenarios.mjs';
import {
  DEFAULT_SEED, K, loadPublicInventory, runSyntheticPipeline, tallyPackets,
} from '../dashboard-demo/synthetic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const netCalls = [];
const realFetch = globalThis.fetch;
const realConnect = net.Socket.prototype.connect;
const realLookup = dns.lookup;
globalThis.fetch = (...a) => { netCalls.push(['fetch', String(a[0])]); throw new Error('network is forbidden in P08 tests'); };
net.Socket.prototype.connect = function connect(...a) { netCalls.push(['connect', String(a[0])]); throw new Error('network is forbidden in P08 tests'); };
dns.lookup = (...a) => { netCalls.push(['dns', String(a[0])]); throw new Error('network is forbidden in P08 tests'); };

const publicIds = loadPublicInventory();
const sumN = (list) => list.reduce((s, x) => s + x.n, 0);
const run = await runSyntheticPipeline({ seed: DEFAULT_SEED, publicIds });
const rows = await run.backend.rows();
const built = await buildAll({ seed: DEFAULT_SEED });
const report = built.output.report;

/** GOLDEN values of seed 20261024 (documented in dashboard-demo/README.md). Any change of the generator must update them on purpose. */
const GOLDEN = {
  packets: 1615,
  rawAllDays: { screen_view: 8843, catalog_open: 2134, feature_use: 2068, measurement_error: 95, text_read_fv: 6768 },
  rawInWindow: { screen_view: 6535, catalog_open: 1568, feature_use: 1559, measurement_error: 70, text_read_fv: 5006 },
  published: { opens: 6112, catalog: 1256, fv: 4976, features: 1559, errors: 68 },
  windowDays: 15,
  materialRows: 40,
};

test('fixture: deterministic, 3 platforms, 21 generated days, 750 public ids, every packet accepted by the real core', () => {
  assert.equal(publicIds.length, 750);
  assert.equal(run.packets.length, GOLDEN.packets);
  assert.deepEqual(run.statuses, { 204: GOLDEN.packets });
  assert.deepEqual([...new Set(run.packets.map((p) => p.platform))].sort(), ['android', 'ios', 'web']);
  assert.equal(run.days.length, 21);
  const used = new Set(run.packets.flatMap((p) => p.cells).map((c) => c.content_id).filter(Boolean));
  assert.ok([...used].every((id) => publicIds.includes(id)));
  const features = new Set(run.packets.flatMap((p) => p.cells).filter((c) => c.e === 'feature_use').map((c) => c.feature_id));
  assert.ok(features.size >= 5 && features.size <= 10, `features ${features.size}`);
  for (const section of ['prayers', 'songs', 'compendium', 'bible', 'hours', 'readings', 'mass']) {
    assert.ok(run.packets.some((p) => p.cells.some((c) => c.e === 'screen_view' && c.section === section)), section);
  }
});

test('determinism: same seed gives byte-identical report.json, csv and html; another seed differs', async () => {
  const again = await buildAll({ seed: DEFAULT_SEED });
  assert.equal(JSON.stringify(again.output), JSON.stringify(built.output));
  assert.equal(again.csv, built.csv);
  assert.equal(renderHtml(again.output), renderHtml(built.output));
  const other = await buildAll({ seed: DEFAULT_SEED + 1 });
  assert.notEqual(JSON.stringify(other.output.report), JSON.stringify(report));
});

test('golden sums: raw fixture tally and published (k-suppressed) sums are exactly the documented numbers', () => {
  assert.deepEqual(tallyPackets(run.packets), { ...GOLDEN.rawAllDays, byPlatform: tallyPackets(run.packets).byPlatform });
  const inWindow = tallyPackets(run.packets.filter((p) => p.day >= report.window.from));
  assert.deepEqual({ ...inWindow, byPlatform: undefined }, { ...GOLDEN.rawInWindow, byPlatform: undefined });
  assert.equal(report.window.days.length, GOLDEN.windowDays);
  assert.equal(sumN(report.opens), GOLDEN.published.opens);
  assert.equal(sumN(report.catalog), GOLDEN.published.catalog);
  assert.equal(sumN(report.text.filter((c) => c.metric === 'fv')), GOLDEN.published.fv);
  assert.equal(sumN(report.features), GOLDEN.published.features);
  assert.equal(sumN(report.errors), GOLDEN.published.errors);
  assert.equal(report.materials.length, GOLDEN.materialRows);
  // published never exceeds the truth (lower bounds), and the demo says so
  for (const [published, raw] of [[GOLDEN.published.opens, inWindow.screen_view], [GOLDEN.published.catalog, inWindow.catalog_open], [GOLDEN.published.fv, inWindow.text_read_fv], [GOLDEN.published.features, inWindow.feature_use], [GOLDEN.published.errors, inWindow.measurement_error]]) assert.ok(published <= raw);
  assert.equal(report.totalsAreLowerBounds, true);
});

test('independent recount: the report equals a straight recount from the raw packets (no storage, no rollup code)', () => {
  const inWindow = run.packets.filter((p) => p.day >= report.window.from);
  const count = (pick, keyOf) => {
    const m = new Map();
    for (const p of inWindow) for (const c of p.cells) if (pick(c)) { const k = JSON.stringify(keyOf(p, c)); m.set(k, (m.get(k) || 0) + c.n); }
    return m;
  };
  const surviving = (m) => [...m].filter(([, n]) => n >= K).map(([k, n]) => [k, n]).sort();
  const fromReport = (list, keyOf) => list.map((x) => [JSON.stringify(keyOf(x)), x.n]).sort();
  assert.deepEqual(fromReport(report.opens, (x) => [x.day, x.platform, x.section]), surviving(count((c) => c.e === 'screen_view', (p, c) => [p.day, p.platform, c.section])));
  assert.deepEqual(fromReport(report.catalog, (x) => [x.day, x.platform, x.catalog_id]), surviving(count((c) => c.e === 'catalog_open', (p, c) => [p.day, p.platform, c.catalog_id])));
  assert.deepEqual(fromReport(report.text, (x) => [x.platform, x.section, x.metric, x.bucket]), surviving(count((c) => c.e === 'text_read', (p, c) => [p.platform, c.section, c.metric, c.bucket])));
  assert.deepEqual(fromReport(report.features, (x) => [x.platform, x.feature_id]), surviving(count((c) => c.e === 'feature_use', (p, c) => [p.platform, c.feature_id])));
  assert.deepEqual(fromReport(report.errors, (x) => [x.platform, x.error_id]), surviving(count((c) => c.e === 'measurement_error', (p, c) => [p.platform, c.error_id])));
});

test('k-suppression: every published cell has n >= 5; tiny slices exist in the fixture but are not published', () => {
  for (const list of [report.opens, report.catalog, report.text, report.materials, report.features, report.errors]) assert.ok(list.every((c) => c.n >= K));
  const inWindow = run.packets.filter((p) => p.day >= report.window.from);
  const aboutIos = inWindow.filter((p) => p.platform === 'ios').flatMap((p) => p.cells).filter((c) => c.e === 'screen_view' && c.section === 'about');
  assert.ok(aboutIos.length > 0);
  assert.ok(!report.opens.some((c) => c.platform === 'ios' && c.section === 'about' && c.n < K));
  // the long tail of songs (447 ids) is hidden: far fewer than 10 per section can pass k except the head
  assert.ok(report.materials.filter((c) => c.section === 'songs').length <= 10);
});

test('non-interference: hidden cells cannot be learned from the report (perturb / delete every sub-k published cell)', async () => {
  const FIELD = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket', 'feature_id', 'catalog_id', 'error_id'];
  const parsed = rows.map((r, idx) => ({ idx, f: Object.fromEntries(JSON.parse(r.cell_key).map((v, i) => [FIELD[i], v])) }));
  // the material views and the section-by-day family are built from the same screen_view rows: a family is compared with the other one left out
  const families = {
    opens: [(f) => f.e === 'screen_view' && f.section !== 'songs' && f.section !== 'prayers' && [f.day, f.platform, f.section], null],
    catalog: [(f) => f.e === 'catalog_open' && [f.day, f.platform, f.catalog_id], null],
    text: [(f) => f.e === 'text_read' && [f.platform, f.section, f.metric, f.bucket], null],
    features: [(f) => f.e === 'feature_use' && [f.platform, f.feature_id], null],
    errors: [(f) => f.e === 'measurement_error' && [f.platform, f.error_id], null],
    songs: [(f) => f.e === 'screen_view' && f.section === 'songs' && [f.content_id], 'materials'],
    prayers: [(f) => f.e === 'screen_view' && f.section === 'prayers' && [f.content_id], 'materials'],
  };
  const options = { k: K, publicIds, seed: DEFAULT_SEED, generated: built.output.meta.generated };
  const view = (r, only) => JSON.stringify(only ? r[only] : { ...r, materials: undefined });
  const baseReport = buildDashboardReport(rows, options);
  let checked = 0;
  for (const [keyOf, only] of Object.values(families)) {
    const groups = new Map();
    for (const r of parsed) { const key = keyOf(r.f); if (key) { const id = JSON.stringify(key); groups.set(id, [...(groups.get(id) || []), r.idx]); } }
    const hiddenGroups = [...groups.values()].filter((g) => g.reduce((t, i) => t + rows[i].n, 0) < K);
    const stride = Math.max(1, Math.ceil(hiddenGroups.length / 12)); // deterministic sample: every cell of small families, ~12 of large ones
    for (const group of hiddenGroups.filter((_, i) => i % stride === 0)) {
      const total = group.reduce((s, i) => s + rows[i].n, 0);
      if (total >= K) continue;
      checked += 1;
      const without = rows.filter((_, i) => !group.includes(i));
      assert.equal(view(buildDashboardReport(without, options), only), view(baseReport, only), 'deleting a hidden cell changes the report');
      const bumped = rows.map((r, i) => (i === group[0] ? { ...r, n: r.n + (K - 1 - total) } : r));
      assert.equal(view(buildDashboardReport(bumped, options), only), view(baseReport, only), 'changing a hidden cell (still < k) changes the report');
    }
  }
  assert.ok(checked > 20, `perturbation covered ${checked} hidden cells`);
});

test('privacy: no people counter, no hidden-cell count, no forbidden keys or values anywhere in report.json/csv/html', () => {
  const keys = new Set();
  const walk = (v) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); } };
  walk(built.output);
  for (const key of keys) assert.doesNotMatch(key, /user|people|person|unique|visitor|device|session|install|ip$|suppress|hidden|app_version|region|timestamp|query|search_text/i, `key ${key}`);
  const json = JSON.stringify(built.output) + built.csv;
  assert.doesNotMatch(json, /priest/i);
  assert.doesNotMatch(json, /\d{4}-\d{2}-\d{2}T\d{2}:/); // no exact timestamps, days only
  assert.doesNotMatch(json, /https?:\/\//);
  const reportIds = [...report.materials.map((m) => m.content_id)];
  assert.ok(reportIds.every((id) => publicIds.includes(id)));
  const sections = new Set(report.materials.map((m) => m.section));
  assert.deepEqual([...sections].sort(), ['bible', 'compendium', 'prayers', 'songs']);
  assert.deepEqual(report.text.filter((c) => c.metric === 'er').map((c) => c.bucket).filter((b, i, a) => a.indexOf(b) === i).every((b) => ['lt5s', '5_15s', '15_60s', '60_180s', '180_600s', 'gte600s'].includes(b)), true);
});

test('complementary suppression: a section with exactly one hidden material loses one more (no recoverable single cell)', () => {
  const ids = Array.from({ length: 4 }, (_, i) => `comp:c${i}`);
  const row = (id, n) => ({ cell_key: JSON.stringify(['2026-11-06', 'web', '3.2', 'UNKNOWN', 'screen_view', 'compendium', id, '', '', '', '', '']), n });
  const out = buildDashboardReport([row(ids[0], 50), row(ids[1], 40), row(ids[2], 30), row(ids[3], 2)], { k: 5, publicIds: ids });
  assert.deepEqual(out.materials.map((m) => m.content_id), [ids[0], ids[1]]);
});

test('states: kill switch off stores nothing and the report is empty; the scenarios all match the real core', async () => {
  const off = await runSyntheticPipeline({ seed: DEFAULT_SEED, publicIds, ingestEnabled: false });
  assert.deepEqual(off.statuses, { 503: GOLDEN.packets });
  assert.equal((await off.backend.rows()).length, 0);
  const empty = emptyReport({ k: K });
  assert.deepEqual([empty.opens, empty.catalog, empty.materials, empty.text, empty.features, empty.errors], [[], [], [], [], [], []]);
  assert.equal(empty.window.from, null);
  const scenarios = await runScenarios();
  assert.ok(scenarios.length >= 14);
  assert.deepEqual(scenarios.filter((s) => !s.pass).map((s) => s.id), []);
  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
  assert.equal(byId.kill_switch_off.rowsStored, 0);
  assert.equal(byId.duplicate_post.counterAfterTwoPosts, 2, 'the server does not deduplicate: it must be documented, not hidden');
  for (const s of scenarios.filter((x) => x.expected.status >= 400)) assert.equal(s.rowsStored, 0, s.id);
  assert.deepEqual(built.output.meta.days_removed_by_retention, ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.ok(report.window.days.every((d) => d >= '2026-10-23'));
});

test('html: banner, CSP connect-src none, no external reference, the embedded data is exactly report.json', () => {
  const html = renderHtml(built.output);
  assert.match(html, /SYNTHETIC DATA — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ/);
  assert.match(html, /ОТКРЫТИЯ ≠ ЛЮДИ/);
  assert.match(html, /Content-Security-Policy[^>]*connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  const code = html.replace(/<script type="application\/json" id="data">[\s\S]*?<\/script>/, '');
  assert.doesNotMatch(code, /https?:\/\//);
  assert.doesNotMatch(code, /<(?:link|img|iframe|script)[^>]+(?:src|href)=/i);
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|navigator)\b/);
  const embedded = JSON.parse(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(embedded, built.output);
});

test('evidence: the committed report.json / report.csv are exactly what the one-button command generates today', () => {
  const dir = path.join(ROOT, 'docs/analytics-evidence/p08');
  assert.equal(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'), `${JSON.stringify(built.output, null, 2)}\n`, 'regenerate: npm run analytics:dashboard-demo -- docs/analytics-evidence/p08');
  assert.equal(fs.readFileSync(path.join(dir, 'report.csv'), 'utf8'), built.csv);
  assert.equal(reportToCsv(report), built.csv);
});

test('isolation: nothing in src/ knows the dashboard; the demo sources have no network or identifier API', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.(js|vue|mjs|ts)$/.test(f))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /dashboard-demo|analytics-ingest/, file);
  }
  const demo = path.join(ROOT, 'experiments/analytics-ingest/dashboard-demo');
  for (const file of fs.readdirSync(demo).filter((f) => f.endsWith('.mjs'))) {
    const code = fs.readFileSync(path.join(demo, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /node:(?:http|https|net|dgram|dns|tls|child_process)/, /\bprocess\.env\b/, /randomUUID/, /Math\.random/, /Date\.now\(/, /new Date\(\)/]) assert.doesNotMatch(code, word, `${file} ${word}`);
  }
});

test('no network: sockets, DNS and fetch were never touched', () => {
  assert.deepEqual(netCalls, []);
  assert.equal(typeof realFetch, typeof globalThis.fetch);
  void realConnect; void realLookup;
});
