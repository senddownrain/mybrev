#!/usr/bin/env node
/**
 * Hours texts from the checked-in lh.catholic.by source pages
 * (`scripts/liturgy/lib/hours-source-imports.mjs`).
 *
 *   node scripts/liturgy/import-hours-sources.mjs [--snapshot dir]     # dry run (default): plan only
 *   node scripts/liturgy/import-hours-sources.mjs --write-sources       # patchs/feasts + common-texts
 *                                                                      #  (then npm run generate:fixed-feasts
 *                                                                      #   and ordo:import-feasts)
 *   node scripts/liturgy/import-hours-sources.mjs --apply [--service-account f]   # Firestore `days`
 *
 * `--apply` writes only the temporal documents of the plan (ordinary-w21-d3,
 * ordinary-w21-d4 Office of Readings; lent-w5-d1 created; ordinary-w9-d4
 * Vespers), re-reads them live first, backs them up to
 * `backups/hours-sources-import/`, never touches a field that changed since
 * the plan, and records the run in reports/liturgical-firestore-migration.json.
 *
 * Plan: reports/liturgy/hours-sources-import-plan.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { snapshotDirectory } from './lib/snapshot-content.mjs';
import { recordMigration } from './lib/migration-report.mjs';
import { planProperImports, planTemporalImports, writeProperImports } from './lib/hours-source-imports.mjs';
import { plain } from './lib/lh-catholic-by.mjs';

const ROOT = process.cwd();
const PLAN = path.join(ROOT, 'reports', 'liturgy', 'hours-sources-import-plan.json');

async function apply(plan, serviceAccountPath) {
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, `hours-sources-${Date.now()}`);
  const db = app.firestore();
  const result = { create: 0, update: 0, unchanged: 0, conflicts: [], failures: [] };
  try {
    const items = plan.filter((item) => item.action === 'create' || item.action === 'update');
    const refs = items.map((item) => db.collection('days').doc(item.id));
    const snapshots = refs.length ? await db.getAll(...refs) : [];
    const backupDir = path.join(ROOT, 'backups', 'hours-sources-import');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, `${JSON.stringify(snapshots.map((snap) => ({ id: snap.id, exists: snap.exists, data: snap.data() || null })), null, 2)}\n`);
    result.backup = path.relative(ROOT, backup);
    const batch = db.batch();
    items.forEach((item, index) => {
      const live = snapshots[index];
      if (item.action === 'create') {
        if (live.exists) { result.conflicts.push({ id: item.id, reason: 'exists live; not overwritten' }); return; }
        batch.set(refs[index], item.fields);
        result.create += 1;
        return;
      }
      const data = live.data() || {};
      // A field edited since the plan (live ≠ planned previous value) is left alone.
      const fields = Object.fromEntries(Object.entries(item.fields)
        .filter(([field]) => plain(data[field] ?? '') === plain(item.previous[field] ?? '')));
      const skipped = Object.keys(item.fields).filter((field) => !(field in fields));
      if (skipped.length) result.conflicts.push({ id: item.id, fields: skipped, reason: 'changed since the plan' });
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
  const proper = planProperImports(ROOT);
  const temporal = planTemporalImports(days, ROOT);
  fs.mkdirSync(path.dirname(PLAN), { recursive: true });
  const brief = (value) => (value === null || value === undefined ? null : plain(value).slice(0, 80));
  fs.writeFileSync(PLAN, `${JSON.stringify({
    snapshot: snapshot.manifest.exportedAt,
    proper: proper.map(({ value, from, ...rest }) => ({ ...rest, value: brief(value), from: brief(from) })),
    temporal,
  }, null, 2)}\n`);
  const summary = {
    plan: path.relative(ROOT, PLAN),
    properSourceChanges: proper.length,
    properTextChanges: proper.filter((item) => item.textChanged).length,
    temporal: temporal.map((item) => ({ id: item.id, action: item.action, fields: Object.keys(item.fields).filter((key) => !key.startsWith('_')).length, skipped: item.skipped?.length || 0 })),
  };
  if (process.argv.includes('--write-sources')) {
    summary.writtenSources = writeProperImports(proper, ROOT);
  }
  if (!process.argv.includes('--apply')) {
    recordMigration(ROOT, {
      collection: 'days (hours sources import)', mode: 'dry-run',
      create: temporal.filter((item) => item.action === 'create').length,
      update: temporal.filter((item) => item.action === 'update').length,
      unchanged: temporal.filter((item) => item.action === 'unchanged').length,
      notes: 'lh.catholic.by source pages: w21-d3/d4 OOR, lent-w5-d1, w9-d4 Vespers',
    });
    console.log(JSON.stringify({ ...summary, mode: 'dry-run' }, null, 2));
    return;
  }
  const index = process.argv.indexOf('--service-account');
  const result = await apply(temporal, index > 0 ? process.argv[index + 1] : path.join(ROOT, 'patchs', 'serviceAccountKey.json'));
  recordMigration(ROOT, { collection: 'days (hours sources import)', mode: 'apply', ...result });
  console.log(JSON.stringify({ ...summary, mode: 'apply', ...result }, null, 2));
  if (result.failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
