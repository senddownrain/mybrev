/** One command: start the SQLite-fallback server OFF, probe, restart ON, probe, remove the temp DB. No network beyond 127.0.0.1. */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r02-probe-'));
const tokens = { REPORT_TOKEN: crypto.randomBytes(24).toString('hex'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') }; // random, per run, never printed
const port = 8790 + Math.floor(Math.random() * 100);
const here = (f) => new URL(f, import.meta.url).pathname;
const run = (cmd, args, env) => new Promise((resolve) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'inherit' }); p.on('exit', (code) => resolve(code)); });
async function phase(ingest, expect) {
  const server = spawn('node', [here('local-server.mjs'), '--port', String(port), '--db', path.join(dir, 'db.sqlite')], { env: { ...process.env, ...tokens, INGEST_ENABLED: ingest }, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 50; i += 1) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  console.log(`\n== INGEST_ENABLED=${ingest} ==`);
  const code = await run('node', [here('probe.mjs'), '--base', `http://127.0.0.1:${port}`, '--expect', expect], tokens);
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  return code;
}
const codes = [await phase('false', 'off'), await phase('true', 'on')];
fs.rmSync(dir, { recursive: true, force: true });
process.exit(codes.some(Boolean) ? 1 : 0);
