/**
 * The R05 dashboard Worker in the REAL workerd runtime with a LOCAL D1 (`wrangler dev --local`; no Cloudflare account, no network to Cloudflare):
 * checks the bundle, the D1 binding (read-only SELECTs, keyset pagination), WebCrypto RS256 verification of an Access-style JWT (own key, pinned
 * JWKS), 401/200, no-store and CSP headers. Real Cloudflare Access and remote D1 remain NOT TESTED.
 *   node worker/run-reports-wrangler.mjs        (downloads wrangler@4.153.0 through npx; exit code 1 on any FAIL)
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteD1 } from './src/sqlite-d1-shim.mjs';
import { seedSynthetic } from '../dashboard/seed-synthetic.mjs';

const WRANGLER = 'wrangler@4.153.0';
const root = new URL('..', import.meta.url).pathname;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r05-wrangler-'));
const token = crypto.randomBytes(24).toString('hex');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
const port = 8890 + Math.floor(Math.random() * 90);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const wr = (args) => spawnSync('npx', ['--yes', WRANGLER, ...args], { cwd: root, env, encoding: 'utf8' });

// 1) schema + data in the local D1 (data through the same seeding code, exported as SQL)
if (wr(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', dir, '-c', 'wrangler.reports.toml']).status !== 0) { console.error('local migration failed'); process.exit(1); }
const src = createSqliteD1();
const today = new Date().toISOString().slice(0, 10);
await seedSynthetic(src, { endDay: today, days: 10 });
const rows = src.raw.prepare('SELECT cell_key, n FROM cell_counts').all();
const esc = (s) => `'${s.replace(/'/g, "''")}'`;
const sql = [];
for (let i = 0; i < rows.length; i += 50) sql.push(`INSERT INTO cell_counts (cell_key, n) VALUES ${rows.slice(i, i + 50).map((r) => `(${esc(r.cell_key)}, ${r.n})`).join(', ')};`);
fs.writeFileSync(path.join(dir, 'seed.sql'), sql.join('\n'));
if (wr(['d1', 'execute', 'DB', '--local', '--persist-to', dir, '-c', 'wrangler.reports.toml', '--file', path.join(dir, 'seed.sql'), '-y']).status !== 0) { console.error('local seed failed'); process.exit(1); }

// 2) a throw-away Access-style key + JWT
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'wr-test', alg: 'RS256', use: 'sig' };
const b64 = (x) => Buffer.from(x).toString('base64url');
const head = b64(JSON.stringify({ alg: 'RS256', kid: 'wr-test', typ: 'JWT' }));
const body = (over = {}) => b64(JSON.stringify({ iss: 'https://wr.cloudflareaccess.test', aud: ['wr-aud'], exp: Math.floor(Date.now() / 1000) + 300, email: 'owner@example.invalid', ...over }));
const sign = (b) => `${head}.${b}.${crypto.sign('RSA-SHA256', Buffer.from(`${head}.${b}`), privateKey).toString('base64url')}`;

const logFile = path.join(dir, 'dev.log');
const out = fs.openSync(logFile, 'w');
const dev = spawn('npx', ['--yes', WRANGLER, 'dev', '--local', '-c', 'wrangler.reports.toml', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', dir,
  '--var', `DASHBOARD_TOKEN:${token}`, '--var', 'ACCESS_TEAM_DOMAIN:wr.cloudflareaccess.test', '--var', 'ACCESS_AUD:wr-aud', '--var', `ACCESS_JWKS:${JSON.stringify({ keys: [jwk] })}`],
{ cwd: root, env, stdio: ['ignore', out, out], detached: true });
const get = (p, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { headers });
try {
  let up = false;
  for (let i = 0; i < 300 && !up; i += 1) { try { await get('/'); up = true; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  check('wrangler dev --local started (workerd)', up);
  if (up) {
    for (const p of ['/reports', '/reports/api/summary', '/reports/api/summary.csv']) check(`no credentials ${p} -> 401`, (await get(p)).status === 401);
    check('/ -> 404', (await get('/')).status === 404);
    const api = await get('/reports/api/summary?days=7', { authorization: `Bearer ${token}` });
    const s = await api.json();
    check('bearer -> 200 with no-store', api.status === 200 && api.headers.get('cache-control') === 'no-store', `state=${s.state} opens_shown>=${s.kpi?.opens_shown}`);
    check('Access-style JWT (RS256, WebCrypto in workerd) -> 200', (await get('/reports/api/summary?days=28', { 'cf-access-jwt-assertion': sign(body()) })).status === 200);
    check('JWT signed by another key -> 401', (await get('/reports/api/summary', { 'cf-access-jwt-assertion': `${head}.${body()}.${b64('x'.repeat(256))}` })).status === 401);
    check('expired JWT -> 401', (await get('/reports/api/summary', { 'cf-access-jwt-assertion': sign(body({ exp: 1 })) })).status === 401);
    const page = await get('/reports', { authorization: `Bearer ${token}` });
    check('page: strict CSP with nonce, no-store', page.status === 200 && /script-src 'nonce-/.test(page.headers.get('content-security-policy') || '') && page.headers.get('cache-control') === 'no-store');
    const csv = await (await get('/reports/api/summary.csv?days=7', { authorization: `Bearer ${token}` })).text();
    check('CSV: every n >= 5', csv.trim().split('\n').slice(1).every((l) => Number(l.split(',').at(-1)) >= 5));
  }
} finally {
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* already gone */ }
  await new Promise((r) => setTimeout(r, 1500));
  const log = fs.readFileSync(logFile, 'utf8');
  check('no token in the wrangler log', !log.includes(token));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAIL` : 'all PASS');
process.exit(failed ? 1 : 0);
