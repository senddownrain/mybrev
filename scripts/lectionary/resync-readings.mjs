#!/usr/bin/env node
/**
 * Production change set of the Lectionary audit: waves 1-3 re-import the flat
 * fields of 321 legacy `readings` documents from their canonical Catholic.by
 * page (lib/resync-plan.mjs); wave 4 holds the three documents the resync cannot
 * express (24.06 and 06.08 as structured sets, the «Мк 22» → «Мц 22» citation;
 * lib/wave4-plan.mjs). DRY RUN BY DEFAULT. Guards: lib/apply-wave.mjs.
 *
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir>                 # plan + verdict per wave (no Firestore access)
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir> --preflight     # + read-only classification of the live documents
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir> --wave 1 --apply
 *        live Firestore: refuses unless the rebuilt plan equals the reviewed
 *        reports/lectionary/resync-plan.json (before/after hashes), every live
 *        document is still exactly the reviewed «before», writes a verifiable
 *        backup (backups/lectionary-apply/<stamp>-wave<N>/), writes with an
 *        update-time precondition and reads everything back.
 *   … --wave 1 --apply --resume <backup dir>   # finishes an interrupted wave
 *   node scripts/lectionary/resync-readings.mjs --rollback <backup dir> [--apply]
 *
 * Waves keep every manifest publication a SAFE CONTENT PATCH (<= 300 documents,
 * < 25 % of the collection replaced, < 5 MB): publish the manifest after each wave.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fullPlan } from './lib/wave4-plan.mjs';
import { runAudit } from './lib/audit-run.mjs';
import { ROOT } from './lib/source-pages.mjs';
import { snapshotDirFromArgs } from './lib/snapshot-docs.mjs';
import { applyWave, rollbackWave, readWave, verifyBackup } from './lib/apply-wave.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

async function openAdmin() {
  const { default: admin } = await import('firebase-admin');
  const keyPath = value('--service-account') || path.join(ROOT, 'patchs', 'serviceAccountKey.json');
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, 'lectionary-resync');
  const firestore = admin.firestore(app);
  firestore.settings({ preferRest: true });
  return { admin, app, firestore, projectId: serviceAccount.project_id };
}

/** Repeats a Firestore call that dropped on the local proxy (read-only phases only). */
async function retry(label, fn, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fn(); } catch (error) {
      if (attempt >= attempts || !/UNAVAILABLE|ECONNRESET|ETIMEDOUT|DEADLINE|socket|fetch failed/i.test(String(error.message || error))) throw error;
      console.error(`${label}: ${error.message}; retry ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

async function main() {
  if (flag('--rollback')) return rollback();
  const snapshotDir = snapshotDirFromArgs();
  const audit = await runAudit({ snapshotDir });
  const { waves, report: out } = fullPlan(audit);
  const file = path.join(ROOT, 'reports', 'lectionary', 'resync-plan.json');
  if (!flag('--apply')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
    console.log(JSON.stringify({ plan: path.relative(ROOT, file), changes: waves.length, skipped: audit.resync.skipped.length, deferred: out.deferred.length, verdicts: out.verdicts }, null, 1));
    if (flag('--preflight')) await preflight(waves);
    console.log('Dry run: nothing was written to Firestore. Review the plan, then repeat with --wave N --apply.');
    return;
  }
  const waveNumber = value('--wave');
  if (!waveNumber) throw new Error('--apply needs --wave N (one wave at a time).');
  const wanted = waves.filter((change) => String(change.wave) === waveNumber);
  if (!wanted.length) throw new Error(`wave ${waveNumber} has no documents`);
  const reviewed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expected = new Map(reviewed.changes.filter((change) => String(change.wave) === waveNumber).map((change) => [change.id, change]));
  for (const change of wanted) {
    const planned = expected.get(change.id);
    if (!planned || planned.beforeHash !== change.beforeHash || planned.afterHash !== change.afterHash) throw new Error(`${change.id}: the rebuilt plan differs from the reviewed plan; run the dry run again and review it.`);
  }
  if (wanted.length !== expected.size) throw new Error('The rebuilt wave does not have the documents of the reviewed plan.');
  const verdict = out.verdicts.find((item) => String(item.wave) === waveNumber);
  if (verdict?.verdict !== 'SAFE CONTENT PATCH') throw new Error(`wave ${waveNumber} is ${verdict?.verdict}: not a safe content patch`);
  const { admin, app, firestore, projectId } = await openAdmin();
  try {
    const stampText = new Date().toISOString().replace(/[:.]/g, '-');
    const resume = value('--resume');
    const backupDir = resume ? path.resolve(resume) : path.join(ROOT, 'backups', 'lectionary-apply', `${stampText}-wave${waveNumber}`);
    const result = await applyWave({
      firestore, admin, changes: wanted, backupDir, resume: Boolean(resume),
      meta: { wave: Number(waveNumber), projectId, planGeneratedAt: reviewed.generatedAt, planSource: reviewed.source, snapshotDir: path.relative(ROOT, snapshotDir) },
    });
    console.log(JSON.stringify(result, null, 1));
    console.log('Next: npm run content:manifest   (dry run: expect SAFE CONTENT PATCH), then npm run content:manifest -- --apply');
  } finally {
    await app.delete();
  }
}

async function preflight(waves) {
  const { app, firestore } = await openAdmin();
  try {
    for (let wave = 1; wave <= Math.max(...waves.map((change) => change.wave)); wave += 1) {
      const rows = await retry(`wave ${wave}`, () => readWave({ firestore, changes: waves.filter((change) => change.wave === wave) }));
      const states = rows.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] || 0) + 1 }), {});
      console.log(`preflight wave ${wave}: ${JSON.stringify(states)}${rows.some((row) => row.state !== 'pending') ? `  NOT PENDING: ${rows.filter((row) => row.state !== 'pending').map((row) => `${row.change.id}=${row.state}`).join(', ')}` : ''}`);
    }
  } finally {
    await app.delete();
  }
}

async function rollback() {
  const dir = path.resolve(value('--rollback'));
  const check = verifyBackup(dir);
  console.log(`${check.manifest.count} documents in ${dir}; backup integrity: ${check.ok ? 'OK' : `BROKEN: ${check.problems.join('; ')}`}`);
  if (!check.ok) throw new Error('The backup is not intact.');
  const { admin, app, firestore } = await openAdmin();
  try {
    const result = await rollbackWave({ firestore, admin, backupDir: dir, apply: flag('--apply') });
    console.log(JSON.stringify(result));
    if (!flag('--apply')) console.log('Dry run: nothing restored. Repeat with --apply.');
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
