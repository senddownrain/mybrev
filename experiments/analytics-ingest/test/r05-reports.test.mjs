/* global Request, TextEncoder */
/**
 * R05: private read API + dashboard (reports-worker.mjs) over the D1-shaped SQLite shim, driven through real Request/Response objects.
 * Proves routing, authorisation (401/403), headers/CSP, k-suppression with secondary suppression by construction (non-interference),
 * the independent oracle recount of the synthetic fixture, CSV, empty/off/error states and performance on a month of data.
 * It does NOT prove Cloudflare Access or real D1 behaviour (NOT TESTED, see docs/analytics-dashboard-r05.md).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

let createSqliteD1 = null; let seedSynthetic = null; let createReportsWorker = null;
try {
  ({ createSqliteD1 } = await import('../worker/src/sqlite-d1-shim.mjs'));
  ({ seedSynthetic } = await import('../dashboard/seed-synthetic.mjs'));
  ({ createReportsWorker } = await import('../worker/src/reports-worker.mjs'));
} catch { /* Node without node:sqlite */ }
const skip = createSqliteD1 ? false : 'node:sqlite is not available';
if (!createSqliteD1 && process.env.ANALYTICS_INGEST_ALLOW_SQLITE_SKIP !== '1') {
  test('R05 tests need node:sqlite (Node >= 24)', () => { assert.fail('node:sqlite is not available on this Node'); });
}
const { buildSummary, summaryToCsv, PERIODS, PLATFORMS } = await import('../src/reports-rollup.mjs');
const { createReportsReader } = await import('../worker/src/reports-storage.mjs');
const { default: ingestWorker } = await import('../worker/src/index.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8'));
const titleFile = JSON.parse(fs.readFileSync(path.join(HERE, '../dashboard/public-titles.json'), 'utf8'));
const END_DAY = '2026-11-06';
const NOW = Date.parse(`${END_DAY}T12:00:00Z`);
const TOKEN = 'dashboard-token-for-tests-0123456789';
const TEAM = 'team.cloudflareaccess.test';
const AUD = 'aud-for-tests';
const SECTIONS = ['today', 'hours', 'readings', 'ordo', 'prayers', 'mass', 'songs', 'compendium', 'bible', 'picker', 'settings', 'about'];
console.log = () => {};

// ---- fixtures -----------------------------------------------------------------------------------------------------------
const b64 = (x) => Buffer.from(x).toString('base64url');
async function keyPair(kid) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  return { pair, jwk: { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid } };
}
async function jwt(pair, kid, claims = {}) {
  const head = b64(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(NOW / 1000) + 300, email: 'owner@example.invalid', ...claims }));
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${sig.toString('base64url')}`;
}
const trusted = await keyPair('trusted'); const stranger = await keyPair('trusted'); // same kid, different key: a forged token
const JWKS = JSON.stringify({ keys: [trusted.jwk] });

const seeded = createSqliteD1();
const synthetic = await seedSynthetic(seeded, { endDay: END_DAY, days: 31 });
const allRows = () => seeded.raw.prepare('SELECT cell_key, n FROM cell_counts ORDER BY cell_key').all();
const REAL_ROWS = allRows();

function make(DB, vars = {}) {
  const env = { DB, DASHBOARD_TOKEN: TOKEN, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ACCESS_JWKS: JWKS, ...vars };
  const worker = createReportsWorker({ now: () => NOW });
  const call = (p, init = {}) => worker.fetch(new Request(`https://reports.invalid${p}`, init), env);
  const get = (p, headers = { authorization: `Bearer ${TOKEN}` }) => call(p, { headers });
  const summary = async (query = '') => (await get(`/reports/api/summary?${query}`)).json();
  return { env, call, get, summary };
}
const app = make(seeded);

// independent oracle: recount straight from the generated packets (no storage, no rollup code)
const DAY = 86400000;
const ageOf = (day) => Math.round((Date.parse(`${END_DAY}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY);
function oracle({ days, platform = 'all', section = 'all' }) {
  const cells = (pick, keyOf) => {
    const m = new Map();
    for (const p of synthetic.packets) {
      const age = ageOf(p.day);
      if (age >= days || (platform !== 'all' && p.platform !== platform)) continue;
      for (const c of p.cells) if (pick(c)) { const k = JSON.stringify(keyOf(p, c, age)); m.set(k, (m.get(k) || 0) + c.n); }
    }
    return [...m].filter(([, n]) => n >= 5).map(([k, n]) => [JSON.parse(k), n]);
  };
  const opens = cells((c) => c.e === 'screen_view', (p, c) => [p.day, p.platform, c.section]).filter(([k]) => section === 'all' || k[2] === section);
  const grouped = (list, idx) => { const m = {}; for (const [k, n] of list) m[k[idx]] = (m[k[idx]] || 0) + n; return m; };
  return {
    opens: opens.reduce((s, [, n]) => s + n, 0),
    daily: grouped(opens, 0),
    catalog: grouped(cells((c) => c.e === 'catalog_open', (p, c, age) => [Math.floor(age / 7), p.platform, c.catalog_id]), 2),
    features: grouped(cells((c) => c.e === 'feature_use', (p, c, age) => [Math.floor(age / 7), p.platform, c.feature_id]), 2),
    fv: grouped(cells((c) => c.e === 'text_read' && c.metric === 'fv' && (section === 'all' || c.section === section), (p, c, age) => [Math.floor(age / 7), p.platform, c.section, c.bucket]), 3),
  };
}
const asMap = (list, key) => Object.fromEntries(list.map((x) => [x[key], x.n]));

// ---- 1. authorisation --------------------------------------------------------------------------------------------------
test('no credentials / wrong credentials -> 401, for the page, the JSON and the CSV; nothing leaks', { skip }, async () => {
  for (const p of ['/reports', '/reports/', '/reports/api/summary', '/reports/api/summary.csv', '/reports/anything']) {
    const res = await app.get(p, {});
    assert.equal(res.status, 401, p);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { code: 'unauthorized' });
  }
  for (const authorization of ['Bearer wrong-token-wrong-token-wrong', 'Bearer ', `bearer ${TOKEN}`, `Basic ${TOKEN}`, TOKEN]) {
    assert.equal((await app.get('/reports/api/summary', { authorization })).status, 401, authorization);
  }
  assert.equal((await app.get('/reports/api/summary', { 'cf-access-jwt-assertion': 'not.a.jwt' })).status, 401);
  assert.equal((await app.get('/reports/api/summary?days=7', { 'x-forwarded-for': '10.0.0.1', cookie: 'CF_Authorization=forged' })).status, 401);
});

test('nothing configured, or a weak token: nobody gets in (fail closed)', { skip }, async () => {
  for (const vars of [{ DASHBOARD_TOKEN: undefined, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined, ACCESS_JWKS: undefined }, { DASHBOARD_TOKEN: 'short' }, { DASHBOARD_TOKEN: '' }]) {
    const s = make(seeded, vars);
    assert.equal((await s.get('/reports/api/summary', { authorization: `Bearer ${vars.DASHBOARD_TOKEN ?? ''}` })).status, 401, JSON.stringify(vars));
  }
});

test('valid bearer token -> 200; unknown routes: 404 outside /reports, 401 inside; other methods 405 only after auth', { skip }, async () => {
  assert.equal((await app.get('/reports/api/summary')).status, 200);
  assert.equal((await app.call('/', { headers: { authorization: `Bearer ${TOKEN}` } })).status, 404);
  assert.equal((await app.call('/v2/ingest', { method: 'POST', body: '{}' })).status, 404); // the dashboard Worker has no ingest route
  assert.equal((await app.get('/reports/nope')).status, 404);
  assert.equal((await app.call('/reports/api/summary', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{}' })).status, 405);
  assert.equal((await app.call('/reports/api/summary', { method: 'POST', body: '{}' })).status, 401);
});

test('Cloudflare Access JWT: valid -> 200; forged / expired / wrong aud / wrong iss / alg none -> 401; email not on the allow-list -> 403', { skip }, async () => {
  const via = async (token, vars) => (make(seeded, { DASHBOARD_TOKEN: undefined, ...vars }).get('/reports/api/summary', { 'cf-access-jwt-assertion': token }));
  assert.equal((await via(await jwt(trusted.pair, 'trusted'))).status, 200);
  assert.equal((await via(await jwt(stranger.pair, 'trusted'))).status, 401, 'signed by another key');
  assert.equal((await via(await jwt(trusted.pair, 'unknown-kid'))).status, 401);
  assert.equal((await via(await jwt(trusted.pair, 'trusted', { exp: Math.floor(NOW / 1000) - 1 }))).status, 401, 'expired');
  assert.equal((await via(await jwt(trusted.pair, 'trusted', { aud: ['other-app'] }))).status, 401, 'audience');
  assert.equal((await via(await jwt(trusted.pair, 'trusted', { iss: 'https://evil.example' }))).status, 401, 'issuer');
  assert.equal((await via(await jwt(trusted.pair, 'trusted', { nbf: Math.floor(NOW / 1000) + 3600 }))).status, 401, 'not before');
  const [h, p] = (await jwt(trusted.pair, 'trusted')).split('.');
  assert.equal((await via(`${b64(JSON.stringify({ alg: 'none', kid: 'trusted' }))}.${p}.`)).status, 401, 'alg none');
  assert.equal((await via(`${h}.${p}.AAAA`)).status, 401, 'bad signature');
  const mine = await jwt(trusted.pair, 'trusted');
  assert.equal((await via(mine, { ACCESS_ALLOWED_EMAILS: 'owner@example.invalid' })).status, 200);
  assert.equal((await via(mine, { ACCESS_ALLOWED_EMAILS: 'someone-else@example.invalid' })).status, 403);
  assert.equal((await via(mine, { ACCESS_ALLOWED_EMAILS: 'Owner@Example.invalid, x@y.z' })).status, 200, 'case-insensitive');
  assert.equal((await make(seeded, { DASHBOARD_TOKEN: undefined, ACCESS_TEAM_DOMAIN: undefined }).get('/reports/api/summary', { 'cf-access-jwt-assertion': mine })).status, 401, 'Access not configured: header is ignored');
});

test('a JWT fetched from the team JWKS endpoint (no pinned keys) is verified; a failing JWKS endpoint -> 401', { skip }, async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`); return { ok: true, json: async () => ({ keys: [trusted.jwk] }) }; };
  const env = { DB: seeded, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const w = createReportsWorker({ now: () => NOW, fetchImpl });
  const token = await jwt(trusted.pair, 'trusted');
  const res = await w.fetch(new Request('https://r.invalid/reports/api/summary', { headers: { 'cf-access-jwt-assertion': token } }), env);
  assert.equal(res.status, 200); assert.equal(calls, 1);
  const broken = createReportsWorker({ now: () => NOW + 7 * DAY, fetchImpl: async () => ({ ok: false }) });
  const res2 = await broken.fetch(new Request('https://r.invalid/reports/api/summary', { headers: { 'cf-access-jwt-assertion': await jwt(trusted.pair, 'trusted', { exp: Math.floor((NOW + 8 * DAY) / 1000) }) } }), { ...env, ACCESS_TEAM_DOMAIN: 'other.cloudflareaccess.test', ACCESS_AUD: AUD });
  assert.equal(res2.status, 401);
});

// ---- 2. headers / page -------------------------------------------------------------------------------------------------
test('every response is no-store with security headers; the page has a strict per-response CSP and no external resource', { skip }, async () => {
  const [a, b] = [await app.get('/reports'), await app.get('/reports')];
  for (const res of [a, await app.get('/reports/api/summary'), await app.get('/reports/api/summary.csv'), await app.get('/reports/api/summary?days=9')]) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('access-control-allow-origin'), null, 'no CORS: no other origin may read it');
  }
  const csp = a.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/); assert.match(csp, /connect-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/);
  const nonce = /nonce-([A-Za-z0-9+/=]+)/.exec(csp)[1];
  const html = await a.text();
  assert.equal(html.split(`nonce="${nonce}"`).length - 1, 2, 'one style and one script, both with the nonce');
  assert.notEqual(nonce, /nonce-([A-Za-z0-9+/=]+)/.exec(b.headers.get('content-security-policy'))[1], 'fresh nonce per response');
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<link|<img|<iframe|\ssrc=|https?:\/\//i, 'no inline handlers, no external or embedded resource');
  assert.doesNotMatch(html, /style="/, 'inline style attributes would be blocked by the CSP');
  assert.ok(html.includes('ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ'));
  assert.ok(!html.includes(TOKEN) && !html.includes('DASHBOARD_TOKEN'));
});

// ---- 3. golden / oracle ------------------------------------------------------------------------------------------------
test('QA mode: the read API equals an independent recount of the synthetic packets for every period x platform x section', { skip }, async () => {
  for (const days of PERIODS) {
    for (const platform of ['all', ...PLATFORMS]) {
      for (const section of ['all', 'hours', 'songs', 'bible']) {
        const s = await app.summary(`days=${days}&platform=${platform}&section=${section}`);
        const want = oracle({ days, platform, section });
        const label = `${days}/${platform}/${section}`;
        assert.equal(s.kpi.opens_shown, want.opens, `opens ${label}`);
        assert.deepEqual(Object.fromEntries(s.daily.filter((d) => d.total).map((d) => [d.day, d.total])), want.daily, `daily ${label}`);
        assert.deepEqual(asMap(s.catalog, 'catalog_id'), want.catalog, `catalog ${label}`);
        assert.deepEqual(asMap(s.features, 'feature_id'), want.features, `features ${label}`);
        assert.deepEqual(asMap(s.text.fv, 'bucket'), want.fv, `fv ${label}`);
      }
    }
  }
});

test('golden numbers of seed 20261024, 31 days ending 2026-11-06 (regenerate with the oracle if the generator changes)', { skip }, async () => {
  const s7 = await app.summary('days=7'); const s28 = await app.summary('days=28'); const s91 = await app.summary('days=91');
  assert.equal(synthetic.packets.length, 2464);
  assert.deepEqual([s7.kpi.opens_shown, s28.kpi.opens_shown, s91.kpi.opens_shown], GOLDEN.opens);
  assert.deepEqual(asMap(s28.catalog, 'catalog_id'), GOLDEN.catalog28);
  assert.equal(s28.synthetic, true); assert.equal(s28.mode, 'qa');
  assert.ok(s7.kpi.opens_shown <= s28.kpi.opens_shown && s28.kpi.opens_shown <= s91.kpi.opens_shown, 'longer period never shows less');
  // raw tally is an upper bound of what is published
  const raw = synthetic.packets.flatMap((p) => p.cells).filter((c) => c.e === 'screen_view').reduce((a, c) => a + c.n, 0);
  assert.ok(s91.kpi.opens_shown <= raw);
});

test('top-10 materials: sorted, <= 10, only published inventory, titles only from the published title file, and consistent with the period', { skip }, async () => {
  const ids = new Set(inventory.ids);
  const s7 = await app.summary('days=7'); const s91 = await app.summary('days=91');
  for (const m of s91.materials) {
    assert.ok(m.top.length <= 10);
    assert.deepEqual(m.top.map((c) => c.n), [...m.top.map((c) => c.n)].sort((a, b) => b - a));
    for (const c of m.top) {
      assert.ok(ids.has(c.content_id), c.content_id); assert.ok(c.n >= 5);
      assert.equal(c.title, titleFile.titles[c.content_id]);
    }
  }
  for (const m of s7.materials) for (const c of m.top) { const wide = s91.materials.find((x) => x.section === m.section).top; if (wide.length < 10) assert.ok(wide.some((x) => x.content_id === c.content_id), 'a week-block cell is also in the wider view'); }
  assert.ok(s91.materials.some((m) => m.top.some((c) => c.title)), 'at least some titles resolved');
});

// ---- 4. suppression: no raw / low-n / ids, non-interference ------------------------------------------------------------
const FORBIDDEN_KEY = /app_version|region|cell_key|suppress|hidden|user|device|install|session|\bip\b|agent|cookie|people|unique/i;
function walk(value, visit, trail = '') {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, `${trail}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { visit(k, v, trail); walk(v, visit, `${trail}.${k}`); }
}
test('JSON and CSV carry no raw cell, no n < k, no identifier-like field, no id outside the published inventory', { skip }, async () => {
  const ids = new Set(inventory.ids);
  for (const q of ['days=7', 'days=28&platform=ios', 'days=91&section=prayers']) {
    const s = await app.summary(q);
    assert.deepEqual(Object.keys(s).sort(), ['banner', 'banner_sub', 'catalog', 'daily', 'errors', 'features', 'filter', 'intake', 'k', 'kpi', 'materials', 'mode', 'schema', 'sections', 'state', 'synthetic', 'text', 'totalsAreLowerBounds', 'truncated', 'unit', 'window']);
    walk(s, (key, value) => {
      assert.doesNotMatch(key, FORBIDDEN_KEY, key);
      if (key === 'n') assert.ok(Number.isInteger(value) && value >= 5, `n=${value}`);
      if (key === 'content_id') assert.ok(ids.has(value), value);
    });
    for (const d of s.daily) for (const p of PLATFORMS) assert.ok(d[p] === 0 || d[p] >= 5, `daily ${d.day} ${p}=${d[p]}`);
    assert.ok(!/@|bearer|token/i.test(JSON.stringify(s)));
    const csv = summaryToCsv(s);
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'mode,k,window_from,window_to,platform_filter,view,day,dimension_1,dimension_2,n');
    for (const line of lines.slice(1)) { const cols = line.split(','); assert.equal(cols.length, 10); assert.ok(Number(cols.at(-1)) >= 5, line); }
  }
  const res = await app.get('/reports/api/summary.csv?days=28');
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="[\w.-]+\.csv"$/);
  assert.equal(await res.text(), summaryToCsv(await app.summary('days=28')), 'CSV = the same numbers as the JSON');
});

test('CSV cells that start like a formula are neutralised', () => {
  const s = buildSummary([], { now: NOW });
  s.features = [{ feature_id: '=HYPERLINK("x")', n: 9 }, { feature_id: '+1', n: 8 }, { feature_id: 'a,b', n: 7 }];
  const csv = summaryToCsv(s);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"')); assert.ok(csv.includes('"\'+1"')); assert.ok(csv.includes('"a,b"'));
});

const row = (cell, n) => ({ cell_key: JSON.stringify(['2026-11-05', ...cell]), n });
const without = (rows, drop) => rows.filter((r) => !drop(JSON.parse(r.cell_key)));
const FIELDS = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket', 'feature_id', 'catalog_id', 'error_id'];
const asObj = (parts) => Object.fromEntries(parts.map((v, i) => [FIELDS[i], v]));

test('secondary suppression by construction: planting or changing hidden cells (n < k) changes NOT ONE BYTE of any filtered view', { skip }, () => {
  // Start from the real month, then clear one slice per family so the planted cell is genuinely a lone, hidden base cell.
  const cleared = without(REAL_ROWS, (p) => { const c = asObj(p); return c.content_id === 'bible:ru:3jn' || (c.platform === 'ios' && (c.section === 'about' || c.feature_id === 'install_prompt_open' || c.catalog_id === 'favorites' || c.error_id === 'queue_overflow' || (c.section === 'settings' && c.e === 'text_read') || (c.day === '2026-11-05' && c.section === 'bible' && c.e === 'screen_view'))); });
  const plant = [
    row(['ios', '1.4', 'UNKNOWN', 'screen_view', 'about', '', '', '', '', '', ''], 3),
    row(['ios', '1.4', 'UNKNOWN', 'feature_use', 'settings', '', '', '', 'install_prompt_open', '', ''], 4),
    row(['ios', '1.4', 'UNKNOWN', 'catalog_open', '', '', '', '', '', 'favorites', ''], 4),
    row(['ios', '1.4', 'UNKNOWN', 'measurement_error', '', '', '', '', '', '', 'queue_overflow'], 3),
    row(['ios', '1.4', 'UNKNOWN', 'screen_view', 'bible', 'bible:ru:3jn', '', '', '', '', ''], 2),
    row(['ios', '1.4', 'UNKNOWN', 'text_read', 'settings', '', 'fv', '15_60s', '', '', ''], 4),
    row(['ios', '1.5', 'BY', 'screen_view', 'about', '', '', '', '', '', ''], 1), // a second raw row of the same base cell: still < k after the merge
  ];
  const opts = { now: NOW, publicIds: inventory.ids, titles: titleFile.titles };
  let compared = 0;
  for (const days of PERIODS) for (const platform of ['all', ...PLATFORMS]) for (const section of ['all', ...SECTIONS]) {
    const a = JSON.stringify(buildSummary(cleared, { ...opts, days, platform, section }));
    const b = JSON.stringify(buildSummary([...cleared, ...plant], { ...opts, days, platform, section }));
    assert.equal(b, a, `${days}/${platform}/${section}`); compared += 1;
  }
  assert.equal(compared, 3 * 4 * 13);
  // ... while the same cells at n = k DO appear (the planted cells were not ignored for another reason)
  const shown = buildSummary([...cleared, ...plant.map((r) => ({ ...r, n: 5 }))], { ...opts, days: 7, platform: 'ios' });
  assert.ok(shown.sections.some((s) => s.section === 'about'));
  assert.ok(shown.features.some((f) => f.feature_id === 'install_prompt_open'));
  assert.ok(shown.errors.some((e) => e.error_id === 'queue_overflow'));
});

test('differencing across filters cannot expose a hidden cell: every platform/section/period view is a sum of surviving cells only', { skip }, async () => {
  // opens(all platforms) == sum of the per-platform views, for every period and section: no residue that could belong to a hidden cell
  for (const days of PERIODS) for (const section of ['all', 'hours', 'prayers']) {
    const all = await app.summary(`days=${days}&section=${section}`);
    const parts = await Promise.all(PLATFORMS.map((p) => app.summary(`days=${days}&platform=${p}&section=${section}`)));
    assert.equal(all.kpi.opens_shown, parts.reduce((s, p) => s + p.kpi.opens_shown, 0), `${days}/${section}`);
  }
  // period views nest exactly from the same base cells: 28 = four 7-day blocks of base cells, never a re-aggregation of raw rows
  const f7 = await app.summary('days=7'); const f28 = await app.summary('days=28');
  assert.ok(f28.catalog.every((c) => c.n >= 5));
  for (const d of f7.daily) assert.deepEqual(d, f28.daily.find((x) => x.day === d.day));
});

test('perturbation on the real month: removing or lowering every raw row of a never-published error id changes nothing', { skip }, () => {
  const opts = { now: NOW, publicIds: inventory.ids, titles: titleFile.titles, days: 28 };
  const baseSummary = buildSummary(REAL_ROWS, opts);
  const base = JSON.stringify(baseSummary);
  const published = new Set(baseSummary.errors.map((e) => e.error_id));
  const isHiddenRow = (r) => { const c = asObj(JSON.parse(r.cell_key)); return c.e === 'measurement_error' && !published.has(c.error_id); };
  const hidden = REAL_ROWS.filter(isHiddenRow);
  assert.ok(hidden.length > 0, 'the fixture has an error id that is never published (all its cells are < k)');
  assert.equal(JSON.stringify(buildSummary(REAL_ROWS.filter((r) => !isHiddenRow(r)), opts)), base, 'removed');
  assert.equal(JSON.stringify(buildSummary(REAL_ROWS.map((r) => (isHiddenRow(r) ? { ...r, n: 1 } : r)), opts)), base, 'lowered to 1');
  assert.equal(JSON.stringify(buildSummary(REAL_ROWS.slice().reverse(), opts)), base, 'row order is irrelevant');
});

// ---- 5. states --------------------------------------------------------------------------------------------------------
test('empty database: 200 + state "empty", not zeros presented as fact; the page logic keys on state', { skip }, async () => {
  const empty = make(createSqliteD1());
  const res = await empty.get('/reports/api/summary?days=28');
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(s.state, 'empty'); assert.equal(s.kpi.opens_shown, 0); assert.deepEqual(s.catalog, []);
  assert.equal(s.intake, 'not_switched_off');
  assert.equal((await empty.get('/reports/api/summary.csv')).status, 200);
  assert.equal((await empty.get('/reports')).status, 200);
});

test('only small cells: state "no_published_cells" and nothing is published', { skip }, () => {
  const s = buildSummary([row(['web', '3.2', 'UNKNOWN', 'screen_view', 'today', '', '', '', '', '', ''], 4)], { now: NOW });
  assert.equal(s.state, 'no_published_cells'); assert.equal(s.kpi.opens_shown, 0);
});

test('kill switch: the ingest Worker admin route flips `control`; the dashboard shows intake "switched_off" and keeps the data', { skip }, async () => {
  const DB = createSqliteD1();
  await seedSynthetic(DB, { endDay: END_DAY, days: 10 });
  const ADMIN = 'admin-token-for-tests-0123456789ab';
  const ingestEnv = { DB, INGEST_ENABLED: 'true', ADMIN_TOKEN: ADMIN };
  const dash = make(DB);
  assert.equal((await dash.summary('days=7')).intake, 'not_switched_off');
  const off = await ingestWorker.fetch(new Request('https://i.invalid/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: '{"enabled":false}' }), ingestEnv);
  assert.equal(off.status, 200);
  const s = await dash.summary('days=7');
  assert.equal(s.intake, 'switched_off'); assert.equal(s.state, 'ok'); assert.ok(s.kpi.opens_shown > 0);
  await ingestWorker.fetch(new Request('https://i.invalid/v2/admin/ingest', { method: 'POST', headers: { authorization: `Bearer ${ADMIN}` }, body: '{"enabled":true}' }), ingestEnv);
  assert.equal((await dash.summary('days=7')).intake, 'not_switched_off');
  DB.close();
});

test('storage error: 503 storage_unavailable, no partial data; bad filters: 400; live mode needs a release card', { skip }, async () => {
  const broken = make({ prepare() { throw new Error('d1 down'); } });
  const res = await broken.get('/reports/api/summary');
  assert.equal(res.status, 503); assert.deepEqual(await res.json(), { code: 'storage_unavailable' });
  for (const q of ['days=3', 'days=7&platform=windows', 'days=7&section=admin', 'days=7&x=1', 'days=7&platform=web%27--', 'days=abc']) {
    const r = await app.get(`/reports/api/summary?${q}`);
    assert.equal(r.status, 400, q); assert.deepEqual(await r.json(), { code: 'invalid_filter' });
  }
  const notCleared = make(seeded, { DASHBOARD_MODE: 'live' });
  assert.equal((await notCleared.get('/reports/api/summary')).status, 503);
  assert.equal((await notCleared.get('/reports')).status, 503);
  const live = make(seeded, { DASHBOARD_MODE: 'live', LIVE_RELEASE_CARD: 'RC-1' });
  const s = await live.summary('days=7');
  assert.equal(s.mode, 'live'); assert.equal(s.synthetic, false); assert.equal(s.banner, null); assert.equal(s.banner_sub, 'ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ');
  assert.equal((await app.summary('days=7')).mode, 'qa');
});

test('reader cap: a huge table is flagged truncated and stays a k-suppressed lower bound', { skip }, async () => {
  const reader = createReportsReader(seeded, { maxCells: 6000 });
  const { rows, truncated } = await reader.cellsFrom('2026-10-01');
  assert.equal(truncated, true); assert.ok(rows.length < REAL_ROWS.length);
  const s = buildSummary(rows, { now: NOW, truncated });
  assert.equal(s.truncated, true);
  const full = await createReportsReader(seeded).cellsFrom('2026-10-01');
  assert.equal(full.truncated, false); assert.equal(full.rows.length, REAL_ROWS.length);
});

// ---- 6. read-only / separation / titles --------------------------------------------------------------------------------
test('the dashboard Worker is read-only and separate from ingest: SELECT only, no ingest imports, no table changes after requests', { skip }, async () => {
  const src = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
  for (const file of ['../worker/src/reports-storage.mjs', '../worker/src/reports-worker.mjs', '../worker/src/reports-auth.mjs', '../src/reports-rollup.mjs']) {
    assert.doesNotMatch(src(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\b|\.batch\(|\.run\(/, file);
  }
  const w = src('../worker/src/reports-worker.mjs');
  assert.doesNotMatch(w, /from '\.\/(index|d1-storage)\.mjs'|core\.mjs|handleIngest|ADMIN_TOKEN|REPORT_TOKEN/);
  const before = JSON.stringify(allRows());
  for (const p of ['/reports', '/reports/api/summary?days=91', '/reports/api/summary.csv']) await app.get(p);
  assert.equal(JSON.stringify(allRows()), before);
});

test('title file: only inventory ids, bound to the inventory hash, no control characters', () => {
  const ids = new Set(inventory.ids);
  assert.equal(titleFile.inventory_sha256, inventory.sha256, 'rebuild public-titles.json after the inventory changes');
  for (const [id, title] of Object.entries(titleFile.titles)) { assert.ok(ids.has(id), id); assert.ok(title.length > 0 && ![...title].some((ch) => ch.charCodeAt(0) < 32), id); }
  assert.ok(Object.keys(titleFile.titles).length > 500);
});

// ---- 7. performance ----------------------------------------------------------------------------------------------------
test('performance: one month and the whole 90-day retention of synthetic data, every filter, within budget', { skip, timeout: 120000 }, async () => {
  const DB = createSqliteD1();
  const seedStart = performance.now();
  const full = await seedSynthetic(DB, { endDay: END_DAY, days: 91 });
  const seedMs = performance.now() - seedStart;
  const perf = make(DB);
  const timings = [];
  for (const [days, label] of [[28, 'month'], [91, 'retention']]) {
    for (const platform of ['all', 'web']) {
      const t0 = performance.now();
      const res = await perf.get(`/reports/api/summary?days=${days}&platform=${platform}`);
      const ms = performance.now() - t0;
      assert.equal(res.status, 200); await res.json();
      timings.push({ label, platform, ms: Math.round(ms) });
      assert.ok(ms < 2000, `${label}/${platform} took ${ms} ms`); // budget: generous for shared CI runners, local is ~0.1-0.4 s
    }
  }
  const cells = DB.raw.prepare('SELECT COUNT(*) c FROM cell_counts').get().c;
  process.stderr.write(`# R05 perf: ${cells} cells (${full.packets.length} packets, 91 days), seed ${Math.round(seedMs)} ms, reads ${JSON.stringify(timings)}\n`);
  DB.close();
});

const GOLDEN = JSON.parse(fs.readFileSync(path.join(HERE, '../dashboard/golden-r05.json'), 'utf8'));
test.after(() => seeded.close());
