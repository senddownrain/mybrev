/* R06 negative probes + kill switch timing against a RUNNING local R02 ingest and R05 reports server (loopback only).
 *   INGEST=http://127.0.0.1:8788 REPORTS=http://127.0.0.1:8790 REPORT_TOKEN=… ADMIN_TOKEN=… DASHBOARD_TOKEN=… \
 *   DB=/path/to.sqlite node r06-probes.mjs
 * Synthetic packets only. Tokens come from the environment and are never printed. Exit code 1 on any FAIL.
 * Re-enables ingest at the end (so the next run starts from the same state). Touches no network other than loopback. */
import { DatabaseSync } from 'node:sqlite';

const env = process.env;
const INGEST = (env.INGEST ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const REPORTS = (env.REPORTS ?? 'http://127.0.0.1:8790').replace(/\/$/, '');
const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const base = { schema_version: 2, day, platform: 'web', app_version: '4.5', region: 'UNKNOWN' };
const ok = (cells, extra = {}) => ({ ...base, ...extra, cells });
const songs = (n = 1) => [{ e: 'catalog_open', catalog_id: 'songs', n }];
const post = (body, headers = {}) => fetch(`${INGEST}/v2/ingest`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const dbCount = () => { const db = new DatabaseSync(env.DB, { readOnly: true }); const r = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(n),0) s FROM cell_counts').get(); db.close(); return `${r.c}/${r.s}`; };

let failed = 0;
const check = (name, pass, detail = '') => { if (!pass) failed += 1; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const want = async (name, promise, status) => { const r = await promise; check(name, r.status === status, `got ${r.status}, want ${status}`); return r; };

console.log(`# R06 probes ${new Date().toISOString()}  day=${day}`);
const before = dbCount();
console.log(`# db cells/sum before invalid probes: ${before}`);

// ---- ingest: invalid packets must change nothing
await want('invalid JSON -> 400', post('{nope'), 400);
await want('unknown top-level field user_id -> 400', post(ok(songs(), { user_id: 'u1' })), 400);
await want('unknown top-level field session_id -> 400', post(ok(songs(), { session_id: 's1' })), 400);
await want('unknown cell field (device) -> 400', post(ok([{ e: 'catalog_open', catalog_id: 'songs', n: 1, device: 'x' }])), 400);
await want('region != UNKNOWN (PL) -> 400', post(ok(songs(), { region: 'PL' })), 400);
await want('content_id is a URL -> 400', post(ok([{ e: 'screen_view', section: 'prayers', content_id: 'https://example.com/prayer?q=1', n: 1 }])), 400);
await want('content_id outside the public inventory -> 400', post(ok([{ e: 'screen_view', section: 'prayers', content_id: 'prayer:NOT_IN_INVENTORY_0000', n: 1 }])), 400);
await want('free text in a bucket field -> 400', post(ok([{ e: 'text_read', section: 'prayers', content_id: 'prayer:0AAlyUXOjOtzbPdt3Gql', metric: 'fv', bucket: 'Ojcze nasz, ktory jestes w niebie', n: 1 }])), 400);
await want('search query as feature_id -> 400', post(ok([{ e: 'feature_use', feature_id: 'search:Maryja', section: 'prayers', n: 1 }])), 400);
await want('negative n -> 400', post(ok(songs(-1))), 400);
await want('fractional n -> 400', post(ok(songs(1.5))), 400);
await want('day 10 days old -> 400', post({ ...ok(songs()), day: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10) }), 400);
await want('day in the future -> 400', post({ ...ok(songs()), day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }), 400);
await want('schema_version 1 -> 426', post({ ...ok(songs()), schema_version: 1 }), 426);
await want('wrong platform (desktop) -> 400', post(ok(songs(), { platform: 'desktop' })), 400);
await want('oversize body (20 KiB) -> 413', post(JSON.stringify({ ...ok(songs()), pad: 'x'.repeat(20 * 1024) })), 413);
await want('wrong content-type -> 415', fetch(`${INGEST}/v2/ingest`, { method: 'POST', headers: { 'content-type': 'application/xml' }, body: '<a/>' }), 415);
await want('GET /v2/ingest -> 405', fetch(`${INGEST}/v2/ingest`), 405);
check('invalid probes changed no stored row', dbCount() === before, `before ${before}, after ${dbCount()}`);

// ---- auth: ingest worker
await want('GET /v2/report without credentials -> 401', fetch(`${INGEST}/v2/report`), 401);
await want('GET /v2/report wrong bearer -> 401', fetch(`${INGEST}/v2/report`, { headers: { authorization: 'Bearer wrong-wrong-wrong-wrong-wrong' } }), 401);
await want('POST /v2/admin/ingest without credentials -> 401', fetch(`${INGEST}/v2/admin/ingest`, { method: 'POST', body: '{"enabled":false}' }), 401);
await want('POST /v2/admin/ingest with the REPORT token (wrong role) -> 401', fetch(`${INGEST}/v2/admin/ingest`, { method: 'POST', headers: { authorization: `Bearer ${env.REPORT_TOKEN}` }, body: '{"enabled":false}' }), 401);

// ---- auth: dashboard (reports Worker)
const R = (path, headers = {}) => fetch(`${REPORTS}${path}`, { headers });
await want('dashboard page without credentials -> 401 (incognito)', R('/reports'), 401);
await want('dashboard API without credentials -> 401', R('/reports/api/summary'), 401);
await want('dashboard CSV without credentials -> 401', R('/reports/api/summary.csv'), 401);
await want('dashboard API wrong bearer -> 401', R('/reports/api/summary', { authorization: 'Bearer wrong-wrong-wrong-wrong-wrong' }), 401);
await want('dashboard API forged Cf-Access-Jwt-Assertion -> 401/403', R('/reports/api/summary', { 'cf-access-jwt-assertion': 'aaa.bbb.ccc' }), 401);
await want('dashboard API with INGEST tokens (REPORT/ADMIN) -> 401', R('/reports/api/summary', { authorization: `Bearer ${env.ADMIN_TOKEN}` }), 401);
await want('dashboard API with the dashboard token -> 200', R('/reports/api/summary?days=7&platform=all', { authorization: `Bearer ${env.DASHBOARD_TOKEN}` }), 200);
await want('dashboard rejects unknown filter -> 400', R('/reports/api/summary?days=7&user=1', { authorization: `Bearer ${env.DASHBOARD_TOKEN}` }), 400);
await want('dashboard is read-only (POST) -> 405/404', fetch(`${REPORTS}/reports/api/summary`, { method: 'POST', headers: { authorization: `Bearer ${env.DASHBOARD_TOKEN}` }, body: '{}' }), 405).catch(() => {});

// ---- kill switch ON -> OFF (no redeploy), timing
const sinkBefore = dbCount();
const ctl = (enabled) => fetch(`${INGEST}/v2/admin/ingest`, { method: 'POST', headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
await want('kill switch ON: valid synthetic packet -> 204', post(ok(songs(5), { app_version: '4.5' })), 204);
const afterOn = dbCount();
const t0 = performance.now();
const off = await ctl(false);
check('admin OFF accepted (200)', off.status === 200);
const rejected = await post(ok(songs(5)));
const dt = Math.round(performance.now() - t0);
check('after OFF: valid packet -> 503 ingest_disabled', rejected.status === 503, `got ${rejected.status}; ${dt} ms from the admin call to the first rejected packet (limit 60000 ms)`);
check('after OFF: malformed body is not parsed -> 503', (await post('{nope')).status === 503);
check('after OFF: nothing was stored', dbCount() === afterOn, `${afterOn} -> ${dbCount()}`);
const sum = await R('/reports/api/summary?days=7&platform=all', { authorization: `Bearer ${env.DASHBOARD_TOKEN}` });
const summary = await sum.json();
check('after OFF: dashboard is still readable and says intake=switched_off', sum.status === 200 && /off|disabled/i.test(summary.intake), `intake=${summary.intake}`);
const on = await ctl(true);
check('admin ON accepted (200)', on.status === 200);
await want('after ON: valid packet -> 204 again', post(ok(songs(5))), 204);
console.log(`# db cells/sum: start ${sinkBefore}, end ${dbCount()}`);

// ---- privacy scan of storage: schema and values
const db = new DatabaseSync(env.DB, { readOnly: true });
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
const cols = tables.flatMap((t) => db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => `${t.name}.${c.name}`));
console.log(`# tables/columns: ${cols.join(', ')}`);
check('schema has no ip/ua/url/user/device/session/cookie/origin/referer column', !cols.some((c) => /ip|agent|ua$|url|user|device|session|cookie|origin|refer|install|email/i.test(c.split('.')[1])), cols.join(' '));
const keys = db.prepare('SELECT cell_key FROM cell_counts').all().map((r) => r.cell_key);
const bad = keys.filter((k) => /https?:|www\.|@|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|Mozilla|Safari|CFNetwork|Dart\/|127\.0\.0\.1|localhost|[?&]=|\/v2\//.test(k));
check('privacy scan: no URL / IP / UA / e-mail / query in any stored key', bad.length === 0, `${keys.length} keys scanned`);
check('stored keys: platform values are only web|android|ios', keys.every((k) => ['web', 'android', 'ios'].includes(JSON.parse(k)[1])));
db.close();

console.log(failed ? `# FAILED ${failed}` : '# ALL PASS');
process.exit(failed ? 1 : 0);
