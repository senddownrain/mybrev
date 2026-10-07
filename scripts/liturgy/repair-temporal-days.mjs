#!/usr/bin/env node
/**
 * Fill EMPTY fields of Ordinary Time period documents (`days/ordinary-wN-dD`)
 * from verified equivalents — never typed text, never a non-empty field.
 *
 *   psalter fields   the same weekday of every week with the same psalter week
 *                    (N ≡ M mod 4); used only when the non-empty peers agree
 *                    (unanimous, or ≥ 75 % and at least 3 documents)
 *   week fields      `officeOfReadingsPr` = the week's collect: the other days
 *                    of the same week, unanimous
 *   week-specific    `officeOfReadingsR1/R2` cannot be derived → reported missing
 *
 *   node scripts/liturgy/repair-temporal-days.mjs [--snapshot dir]          # dry run
 *   node scripts/liturgy/repair-temporal-days.mjs --apply [--service-account f]
 *
 * Plan: reports/liturgy/temporal-days-repair-plan.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isEmpty, planTemporalRepairs } from './lib/temporal-repairs.mjs';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { snapshotDirectory } from './lib/snapshot-content.mjs';
import { recordMigration } from './lib/migration-report.mjs';
import { withTemporalImports } from './lib/hours-source-imports.mjs';

const ROOT = process.cwd();
const PLAN = path.join(ROOT, 'reports', 'liturgy', 'temporal-days-repair-plan.json');
async function apply(plan, serviceAccountPath) {
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, `repair-${Date.now()}`);
  const db = app.firestore();
  const backupDir = path.join(ROOT, 'backups', 'temporal-days-repair');
  fs.mkdirSync(backupDir, { recursive: true });
  const result = { update: 0, unchanged: 0, conflicts: [], failures: [] };
  try {
    const refs = plan.repairs.map((item) => db.collection('days').doc(item.id));
    const snapshots = await db.getAll(...refs);
    const backupFile = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupFile, `${JSON.stringify(snapshots.map((snap) => ({ id: snap.id, data: snap.data() })), null, 2)}\n`);
    result.backup = path.relative(ROOT, backupFile);
    const batch = db.batch();
    plan.repairs.forEach((item, index) => {
      const live = snapshots[index].data() || {};
      // Only fields that are still empty in Firestore (somebody may have edited since).
      const fields = Object.fromEntries(Object.entries(item.fields).filter(([field]) => isEmpty(live[field])));
      const skipped = Object.keys(item.fields).filter((field) => !(field in fields));
      if (skipped.length) result.conflicts.push({ id: item.id, fields: skipped, reason: 'no longer empty' });
      if (!Object.keys(fields).length) { result.unchanged += 1; return; }
      batch.update(refs[index], fields);
      result.update += 1;
    });
    await batch.commit();
  } catch (error) {
    result.failures.push(String(error.message || error));
  } finally {
    await app.delete();
  }
  return result;
}

async function main() {
  const snapshot = await openFirestoreSnapshot(snapshotDirectory());
  const days = await snapshot.collection('days');
  // Planned after the source imports (import-hours-sources): a field the
  // breviary source fills is no longer «unfillable».
  const plan = planTemporalRepairs(withTemporalImports(days, ROOT));
  fs.mkdirSync(path.dirname(PLAN), { recursive: true });
  fs.writeFileSync(PLAN, `${JSON.stringify({ snapshot: snapshot.manifest.exportedAt, ...plan }, null, 2)}\n`);
  const summary = {
    plan: path.relative(ROOT, PLAN),
    documents: plan.repairs.length,
    fields: plan.repairs.reduce((total, item) => total + Object.keys(item.fields).length, 0),
    unfillable: plan.unfillable.length,
  };
  if (!process.argv.includes('--apply')) {
    recordMigration(ROOT, { collection: 'days (temporal repair)', mode: 'dry-run', update: summary.documents, skipped: plan.unfillable.length, notes: 'fills empty psalter/week fields only' });
    console.log(JSON.stringify({ ...summary, mode: 'dry-run' }, null, 2));
    return;
  }
  const index = process.argv.indexOf('--service-account');
  const result = await apply(plan, index > 0 ? process.argv[index + 1] : path.join(ROOT, 'patchs', 'serviceAccountKey.json'));
  recordMigration(ROOT, { collection: 'days (temporal repair)', mode: 'apply', skipped: plan.unfillable.length, ...result });
  console.log(JSON.stringify({ ...summary, mode: 'apply', ...result }, null, 2));
  if (result.failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
