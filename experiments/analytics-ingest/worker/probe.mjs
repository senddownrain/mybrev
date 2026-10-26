/**
 * HTTP probes for the staging contract (docs/analytics-staging-contract.md §5). Synthetic packets only.
 *   node worker/probe.mjs --base http://127.0.0.1:8788 --expect off|on [--report-token T --admin-token T]
 * Tokens come from the flags or REPORT_TOKEN / ADMIN_TOKEN and are never printed. Exit code 1 on any FAIL.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const base = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '');
const expect = arg('expect', 'off');
const reportToken = arg('report-token', process.env.REPORT_TOKEN);
const adminToken = arg('admin-token', process.env.ADMIN_TOKEN);
const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../tests/fixtures/analytics-contract-v2.json', import.meta.url)), 'utf8'));
const day = new Date().toISOString().slice(0, 10);
const packet = (cells) => ({ ...fixture.validPacket, day, cells });
const probeCell = (n) => [{ e: 'catalog_open', catalog_id: 'songs', n }];
const send = (body, headers = {}) => fetch(`${base}/v2/ingest`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const report = () => fetch(`${base}/v2/report`, { headers: { authorization: `Bearer ${reportToken}` } }).then((r) => r.json());
const songsTotal = (rep) => rep.cells.filter((c) => c.catalog_id === 'songs' && c.day === day).reduce((s, c) => s + c.n, 0);

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const status = async (name, promise, want) => { const r = await promise; check(name, r.status === want, `got ${r.status}, want ${want}`); return r; };

await status('GET /v2/report without credentials -> 401', fetch(`${base}/v2/report`), 401);
await status('GET /v2/report wrong token -> 401', fetch(`${base}/v2/report`, { headers: { authorization: 'Bearer wrong-wrong-wrong-wrong' } }), 401);
await status('POST /v2/admin/ingest without credentials -> 401', fetch(`${base}/v2/admin/ingest`, { method: 'POST', body: '{"enabled":false}' }), 401);
await status('GET /v2/ingest -> 405', fetch(`${base}/v2/ingest`), 405);
await status('GET / -> 404', fetch(`${base}/`), 404);
await status('GET /v2/anything -> 404', fetch(`${base}/v2/anything`), 404);

if (expect === 'off') {
  await status('OFF: valid packet -> 503', send(packet(probeCell(1))), 503);
  await status('OFF: invalid packet -> 503 (nothing is parsed)', send('{nope'), 503);
} else {
  const before = reportToken ? songsTotal(await report()) : null;
  await status('ON: valid packet -> 204', send(packet(probeCell(5))), 204);
  await status('ON: invalid JSON -> 400', send('{nope'), 400);
  await status('ON: schema_version 1 -> 426', send({ ...packet(probeCell(1)), schema_version: 1 }), 426);
  await status('ON: region BY -> 400', send({ ...packet(probeCell(1)), region: 'BY' }), 400);
  await status('ON: unknown public id -> 400', send(packet([{ e: 'screen_view', section: 'songs', content_id: 'song:not-in-inventory', n: 1 }])), 400);
  await status('ON: unknown field (user_id) -> 400', send({ ...packet(probeCell(1)), user_id: 'x' }), 400);
  await status('ON: day outside window -> 400', send({ ...packet(probeCell(1)), day: '2019-01-01' }), 400);
  await status('ON: oversize body -> 413', send('x'.repeat(17 * 1024)), 413);
  await status('ON: wrong content-type -> 415', send(packet(probeCell(1)), { 'content-type': 'application/x-www-form-urlencoded' }), 415);
  const burst = await Promise.all(Array.from({ length: 20 }, () => send(packet(probeCell(3)))));
  check('ON: 20 parallel valid packets all 204', burst.every((r) => r.status === 204), burst.map((r) => r.status).join(','));
  if (reportToken) {
    const rep = await report();
    // k = 5: only cells with n >= 5 are shown; the cell is far above k after the burst
    check('report total grew by exactly 5 + 20*3 = 65', songsTotal(rep) - before === 65, `delta ${songsTotal(rep) - before}`);
    check('report has k=5 and totalsAreLowerBounds', rep.k === 5 && rep.totalsAreLowerBounds === true);
  } else console.log('SKIP  report delta (no --report-token)');
  if (adminToken) {
    await status('admin kill switch off -> 200', fetch(`${base}/v2/admin/ingest`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: '{"enabled":false}' }), 200);
    await status('after switch OFF: valid packet -> 503 (no redeploy)', send(packet(probeCell(1))), 503);
    await status('admin switch on -> 200', fetch(`${base}/v2/admin/ingest`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: '{"enabled":true}' }), 200);
    await status('after switch ON: valid packet -> 204', send(packet(probeCell(1))), 204);
  } else console.log('SKIP  admin kill switch (no --admin-token)');
}
console.log(failed ? `\n${failed} probe(s) FAILED` : '\nall probes PASSED');
process.exit(failed ? 1 : 0);
