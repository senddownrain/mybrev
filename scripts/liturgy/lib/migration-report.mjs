/**
 * `reports/liturgical-firestore-migration.json`: one entry per collection and
 * run (dry-run or apply). Every import of this phase records here what it
 * created, updated, left unchanged or skipped, conflicts, failures and the
 * publication revision before/after.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MIGRATION_REPORT = path.join('reports', 'liturgical-firestore-migration.json');

export function recordMigration(root, entry) {
  const file = path.join(root, MIGRATION_REPORT);
  const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { runs: [] };
  const run = {
    at: new Date().toISOString(),
    collection: entry.collection,
    mode: entry.mode,
    create: entry.create ?? 0,
    update: entry.update ?? 0,
    unchanged: entry.unchanged ?? 0,
    skipped: entry.skipped ?? 0,
    conflicts: entry.conflicts || [],
    failures: entry.failures || [],
    revisionBefore: entry.revisionBefore ?? null,
    revisionAfter: entry.revisionAfter ?? null,
    ...(entry.backup ? { backup: entry.backup } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
  report.runs.push(run);
  // Latest state per collection for a quick read.
  report.latest = Object.fromEntries(Object.entries({
    ...(report.latest || {}),
    [`${entry.collection}:${entry.mode}`]: run,
  }).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return run;
}
