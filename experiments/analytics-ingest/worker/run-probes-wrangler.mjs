/**
 * Same probes against the REAL workerd runtime + miniflare LOCAL D1 (`wrangler dev --local`; no Cloudflare account, no network
 * to Cloudflare). Verifies the Worker bundle, `batch()` semantics of the workerd D1 binding and `meta.rows_written` as reported
 * by the local engine (NOT billing). Output: probe results + the `rowsWritten` values the Worker logged.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WRANGLER = 'wrangler@4.153.0';
const root = new URL('..', import.meta.url).pathname; // experiments/analytics-ingest (wrangler.toml lives here)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r02-wrangler-'));
const tokens = { REPORT_TOKEN: crypto.randomBytes(24).toString('hex'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') };
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1', ...tokens };
const port = 8890 + Math.floor(Math.random() * 90);

const migrate = spawnSync('npx', ['--yes', WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', dir], { cwd: root, env, encoding: 'utf8' });
if (migrate.status !== 0) { console.error('local migration failed'); process.exit(1); }

async function phase(ingest, expect) {
  const logFile = path.join(dir, `dev-${ingest}.log`);
  const out = fs.openSync(logFile, 'w');
  const dev = spawn('npx', ['--yes', WRANGLER, 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', dir,
    '--var', `INGEST_ENABLED:${ingest}`, '--var', `REPORT_TOKEN:${tokens.REPORT_TOKEN}`, '--var', `ADMIN_TOKEN:${tokens.ADMIN_TOKEN}`],
  { cwd: root, env, stdio: ['ignore', out, out], detached: true });
  let up = false;
  for (let i = 0; i < 300 && !up; i += 1) { try { await fetch(`http://127.0.0.1:${port}/`); up = true; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  console.log(`\n== wrangler dev --local, INGEST_ENABLED=${ingest} ==`);
  let code = 1;
  if (up) code = await new Promise((resolve) => { const p = spawn('node', [new URL('probe.mjs', import.meta.url).pathname, '--base', `http://127.0.0.1:${port}`, '--expect', expect], { env, stdio: 'inherit' }); p.on('exit', resolve); });
  else console.log('FAIL  wrangler dev did not start');
  process.kill(-dev.pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter((l) => l.includes('"rowsWritten"'));
  if (lines.length) {
    const rows = lines.map((l) => JSON.parse(l.slice(l.indexOf('{')))).map((o) => o.rowsWritten);
    console.log(`logged rowsWritten per accepted packet (local engine, not billing): min ${Math.min(...rows)}, max ${Math.max(...rows)}, packets ${rows.length}`);
  }
  const leak = [tokens.REPORT_TOKEN, tokens.ADMIN_TOKEN].some((t) => fs.readFileSync(logFile, 'utf8').includes(t));
  console.log(leak ? 'FAIL  a token appears in the wrangler log' : 'PASS  no token in the wrangler log');
  return code || (leak ? 1 : 0);
}
const codes = [await phase('false', 'off'), await phase('true', 'on')];
fs.rmSync(dir, { recursive: true, force: true });
process.exit(codes.some(Boolean) ? 1 : 0);
