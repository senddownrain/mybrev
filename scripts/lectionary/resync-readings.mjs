#!/usr/bin/env node
/**
 * Re-import of legacy `readings` documents from their canonical Catholic.by
 * page (flat fields only; see lib/resync-plan.mjs). DRY RUN BY DEFAULT.
 *
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir>               # plan + verdict per wave (no Firestore access)
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir> --wave 1      # plan restricted to one wave
 *   node scripts/lectionary/resync-readings.mjs --snapshot <dir> --wave 1 --apply
 *        live Firestore: refuses unless the rebuilt plan equals the reviewed
 *        reports/lectionary/resync-plan.json (before/after hashes), backs the
 *        wave up to backups/lectionary-resync/<stamp>/, aborts when a live
 *        document differs from the snapshot, writes with an update-time
 *        precondition, verifies, and prints the manifest commands.
 *   node scripts/lectionary/resync-readings.mjs --rollback backups/lectionary-resync/<stamp> --apply
 *        restores the backed-up documents (same guards).
 *
 * Waves keep every manifest publication a SAFE CONTENT PATCH (<= 300
 * documents, < 25 % of the collection replaced, < 5 MB): publish the manifest
 * after each wave, or apply all waves and ship one app release instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { documentHash, storedDocument } from '../content/lib/app-content.mjs';
import { resyncReport } from './lib/resync-plan.mjs';
import { runAudit } from './lib/audit-run.mjs';
import { ROOT } from './lib/source-pages.mjs';
import { snapshotDirFromArgs } from './lib/snapshot-docs.mjs';

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
  return { admin, app, firestore };
}

async function main() {
  if (flag('--rollback')) return rollback();
  const snapshotDir = snapshotDirFromArgs();
  const audit = await runAudit({ snapshotDir });
  const { waves, report: out } = resyncReport(audit);
  const wanted = value('--wave') ? waves.filter((change) => String(change.wave) === value('--wave')) : waves;
  const verdicts = out.verdicts;
  const file = path.join(ROOT, 'reports', 'lectionary', 'resync-plan.json');
  if (!flag('--apply')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
    console.log(JSON.stringify({ plan: path.relative(ROOT, file), changes: waves.length, skipped: audit.resync.skipped.length, verdicts }, null, 1));
    console.log('Dry run: nothing was written to Firestore. Review the plan, then repeat with --wave N --apply.');
    return;
  }
  if (!value('--wave')) throw new Error('--apply needs --wave N (one wave at a time).');
  const reviewed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expected = new Map(reviewed.changes.filter((change) => String(change.wave) === value('--wave')).map((change) => [change.id, change]));
  for (const change of wanted) {
    const planned = expected.get(change.id);
    if (!planned || planned.beforeHash !== change.beforeHash || planned.afterHash !== change.afterHash) throw new Error(`${change.id}: the rebuilt plan differs from the reviewed plan; run the dry run again and review it.`);
  }
  if (wanted.length !== expected.size) throw new Error('The rebuilt wave does not have the documents of the reviewed plan.');
  const { admin, app, firestore } = await openAdmin();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(ROOT, 'backups', 'lectionary-resync', stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  try {
    const live = [];
    for (const change of wanted) {
      const snapshot = await firestore.collection('readings').doc(change.id).get();
      if (!snapshot.exists) throw new Error(`${change.id} does not exist in Firestore`);
      const { ...data } = snapshot.data();
      fs.writeFileSync(path.join(backupDir, `${change.id}.json`), `${JSON.stringify({ id: change.id, exists: true, data: JSON.parse(JSON.stringify(data)) }, null, 1)}\n`);
      if (documentHash(storedDocument(change.id, data)) !== change.beforeHash) throw new Error(`${change.id} changed since the snapshot; take a fresh snapshot and repeat the dry run.`);
      live.push({ change, snapshot });
    }
    const FLAT = ['reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle', 'psalm', 'sequence', 'alleluia', 'gospel', 'sectionsFound'];
    for (const { change, snapshot } of live) {
      const update = Object.fromEntries(FLAT.map((field) => [field, field in change.after ? change.after[field] : admin.firestore.FieldValue.delete()]));
      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await firestore.collection('readings').doc(change.id).update(update, { lastUpdateTime: snapshot.updateTime });
      console.log(`written ${change.id}`);
    }
    for (const { change } of live) {
      const check = (await firestore.collection('readings').doc(change.id).get()).data();
      if (documentHash(storedDocument(change.id, check)) !== change.afterHash) throw new Error(`verification failed for ${change.id}`);
    }
    console.log(`Backup: ${backupDir}\nNext: npm run content:manifest   (dry run), then npm run content:manifest -- --apply   (SAFE CONTENT PATCH only)`);
  } finally {
    await app.delete();
  }
}

async function rollback() {
  const dir = path.resolve(value('--rollback'));
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  console.log(`${files.length} documents in ${dir}`);
  if (!flag('--apply')) { console.log('Dry run: nothing restored. Repeat with --apply.'); return; }
  const { app, firestore } = await openAdmin();
  try {
    for (const name of files) {
      const { id, exists, data } = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!exists) continue;
      await firestore.collection('readings').doc(id).set(data);
      console.log(`restored ${id}`);
    }
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
