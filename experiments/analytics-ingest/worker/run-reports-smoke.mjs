/**
 * R05 e2e smoke over REAL HTTP on loopback (no Cloudflare): seeds a temporary SQLite file with the synthetic month, starts
 * reports-local-server.mjs, and checks what an unauthenticated CLI, a bearer-token CLI and the logged-in owner (Access simulator) see.
 *   node worker/run-reports-smoke.mjs        exit code 1 on any FAIL. Tokens are generated per run and never printed.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteD1 } from './src/sqlite-d1-shim.mjs';
import { seedSynthetic } from '../dashboard/seed-synthetic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r05-smoke-'));
const file = path.join(dir, 'staging.sqlite');
const db = createSqliteD1({ file });
await seedSynthetic(db, { endDay: '2026-11-06', days: 31 });
db.close();
const token = crypto.randomBytes(24).toString('hex');
const [direct, simulated] = [18790, 18791];
const server = spawn(process.execPath, ['--no-warnings', path.join(here, 'reports-local-server.mjs'), '--db', file, '--port', String(direct), '--access-port', String(simulated), '--now', '2026-11-06'], { env: { ...process.env, DASHBOARD_TOKEN: token }, stdio: 'ignore' });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };
const get = async (port, p, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { headers });
try {
  for (let i = 0; i < 50; i += 1) { try { await get(direct, '/reports'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  for (const p of ['/reports', '/reports/api/summary', '/reports/api/summary.csv']) {
    const res = await get(direct, p);
    check(`no token ${p} -> 401`, res.status === 401 && res.headers.get('cache-control') === 'no-store');
  }
  check('wrong token -> 401', (await get(direct, '/reports/api/summary', { authorization: 'Bearer nope-nope-nope-nope-nope-nope' })).status === 401);
  const api = await get(direct, '/reports/api/summary?days=28', { authorization: `Bearer ${token}` });
  const body = await api.json();
  check('bearer token -> 200 JSON, k=5, QA banner, lower bounds', api.status === 200 && body.k === 5 && body.synthetic === true && body.totalsAreLowerBounds === true, `opens_shown=${body.kpi?.opens_shown}`);
  const csv = await (await get(direct, '/reports/api/summary.csv?days=7', { authorization: `Bearer ${token}` })).text();
  check('CSV: every n >= 5', csv.trim().split('\n').slice(1).every((l) => Number(l.split(',').at(-1)) >= 5), `${csv.trim().split('\n').length - 1} rows`);
  const page = await get(simulated, '/reports');
  const csp = page.headers.get('content-security-policy') || '';
  check('owner via Access simulator -> page 200 with strict CSP', page.status === 200 && /script-src 'nonce-/.test(csp) && !/unsafe-/.test(csp));
  const viaAccess = await (await get(simulated, '/reports/api/summary?days=7&platform=ios')).json();
  check('owner via Access simulator -> platform filter works', viaAccess.filter.platform === 'ios' && viaAccess.kpi.opens_shown > 0, `ios 7d opens>=${viaAccess.kpi.opens_shown}`);
  const forged = await get(direct, '/reports/api/summary', { 'cf-access-jwt-assertion': `${Buffer.from('{"alg":"RS256","kid":"local-sim"}').toString('base64url')}.${Buffer.from('{"iss":"x"}').toString('base64url')}.AAAA` });
  check('forged Access JWT straight to the Worker -> 401', forged.status === 401);
} finally {
  server.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAIL` : 'all PASS');
process.exit(failed ? 1 : 0);
