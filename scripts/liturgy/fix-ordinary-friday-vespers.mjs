#!/usr/bin/env node
/** Issue #198. Default: local snapshot dry-run. --live reads exactly three days.
 * --live --apply --plan <reviewed.json> is a SEPARATE, owner-approved operation.
 * No manifest publication, deployment or cache deletion is performed here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { TARGET, SOURCE, FEAST, planFridayVespers, applyFridayVespers, fridayCommit } from './lib/ordinary-friday-vespers.mjs';

const IDS = [TARGET, SOURCE, FEAST];

// Self-signed service JWT: credentials never leave the process except for the
// Authorization header to the fixed Firestore host. No key file or OAuth hop.
export function liveClient() {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 || '', 'base64').toString('utf8'));
  if (process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_PROJECT_ID !== sa.project_id) {
    throw new Error('Service account project differs from the configured app.');
  }
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/databases/(default)/documents`;
  const request = (suffix, body) => {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id })}.${b64({
      iss: sa.client_email, sub: sa.client_email, aud: 'https://firestore.googleapis.com/', iat: now, exp: now + 600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    // curl uses the inherited proxy and CA settings. Pass secrets on stdin,
    // never in argv; do not print subprocess errors (they can contain headers).
    const config = `header = ${JSON.stringify(`Authorization: Bearer ${unsigned}.${signature}`)}\nheader = "Content-Type: application/json"\n`
      + (body ? `data = ${JSON.stringify(JSON.stringify(body))}\n` : '');
    try {
      return JSON.parse(execFileSync('curl', ['--silent', '--show-error', '--fail-with-body', '--max-time', '30',
        '--request', body ? 'POST' : 'GET', '--url', base + suffix, '--config', '-'],
      { input: config, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }));
    } catch { throw new Error('Firestore request failed; no credential details logged.'); }
  };
  const decode = (value) => {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
    return value; // Preserve timestamps, references and bytes in the private backup.
  };
  return {
    project: sa.project_id,
    read: async () => IDS.map((id) => {
      const raw = request(`/days/${id}`);
      return { id, updateTime: raw.updateTime, raw,
        data: Object.fromEntries(Object.entries(raw.fields).map(([k, v]) => [k, decode(v)])) };
    }),
    commit: async (plan) => request(':commit', fridayCommit(plan, sa.project_id)),
  };
}

async function privateJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

async function main(argv) {
  const allowed = new Set(['--snapshot', '--out', '--live', '--apply', '--plan']);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (arg === '--live' || arg === '--apply') options[arg] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${arg}`);
      options[arg] = value;
    }
  }
  if (options['--live'] && options['--snapshot']) throw new Error('Choose --snapshot or --live.');
  if (options['--apply'] && (!options['--live'] || !options['--plan'])) throw new Error('--apply requires --live and a reviewed --plan.');
  const client = options['--live'] ? liveClient() : null;
  const read = client?.read || (async () => {
    const snapshot = await openFirestoreSnapshot(options['--snapshot'] || 'backups/firestore-snapshot');
    return (await snapshot.collectionEntries('days') || []).filter((entry) => IDS.includes(entry.id));
  });
  if (options['--apply']) {
    const plan = JSON.parse(await fs.readFile(options['--plan'], 'utf8'));
    const backup = `backups/issue-198/${Date.now()}-before.json`;
    const result = await applyFridayVespers(plan, { read, commit: client.commit,
      backup: (entries) => privateJson(backup, { project: client.project, entries }) });
    console.log(JSON.stringify({ mode: 'apply', backup, ...result }));
    return;
  }
  const entries = await read();
  const plan = planFridayVespers(entries);
  const out = options['--out'] || `reports/liturgy/issue-198-${Date.now()}.json`;
  await privateJson(out, plan);
  // Retain the bounded read as a private, reusable snapshot; not a full DB export.
  const backup = `${out}.documents.json`;
  await privateJson(backup, { project: client?.project || null, entries });
  console.log(JSON.stringify({ mode: 'dry-run', writes: 0, target: TARGET,
    changedFields: Object.keys(plan.fields), comparison: plan.comparison, plan: out, documents: backup }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
