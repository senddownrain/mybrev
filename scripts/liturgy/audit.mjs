#!/usr/bin/env node
/**
 * `npm run liturgy:audit` — every liturgical data audit, read-only (local
 * snapshot + generated/bundled data; never writes to Firestore):
 *
 *   0. Plans: breviary source imports, temporal repair (dry runs)
 *   1. Hours sources + Proper/Common + runtime     audit-hours-sources
 *   2. Advent 17–24 / Christmas 25.12–12.01         audit-advent-christmas
 *   3. Readings citations ↔ calendars ↔ readings    ordo/audit-readings --report-only
 *   4. Ordo notes: semantics                        audit-notes
 *   5. Ordo: the four published calendars          ordo/validate
 *   6. Firestore ↔ bundled consistency              audit-drift
 *   7. Master deficit report                        build-deficits
 *
 *   npm run liturgy:audit -- [--snapshot dir]
 *
 * Migrations are separate commands (ordo:import-*, liturgy:repair-temporal).
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const passThrough = (() => {
  const index = process.argv.indexOf('--snapshot');
  return index > 0 ? ['--snapshot', process.argv[index + 1]] : [];
})();

const STEPS = [
  // Dry-run plans (write only reports/): breviary-source imports and the
  // temporal repair, both part of the audited target state.
  ['Hours source imports (plan)', 'scripts/liturgy/import-hours-sources.mjs', passThrough],
  ['Temporal repair (plan)', 'scripts/liturgy/repair-temporal-days.mjs', passThrough],
  ['Hours sources', 'scripts/liturgy/audit-hours-sources.mjs', passThrough],
  ['Advent / Christmas', 'scripts/liturgy/audit-advent-christmas.mjs', passThrough],
  ['Readings citations', 'scripts/ordo/audit-readings.mjs', ['--report-only', ...passThrough]],
  ['Ordo notes semantics', 'scripts/liturgy/audit-notes.mjs', []],
  ['Four calendars', 'scripts/ordo/validate.mjs', []],
  ['Firestore ↔ bundled', 'scripts/liturgy/audit-drift.mjs', passThrough],
  ['Deficit report', 'scripts/liturgy/build-deficits.mjs', []],
];

let failed = 0;
for (const [title, script, args] of STEPS) {
  console.log(`\n▶ ${title}`);
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗ ${title} failed (${result.status})`);
  }
}
if (failed) process.exitCode = 1;
console.log(failed ? `\n${failed} step(s) failed.` : '\nAll audits written: docs/liturgical-data-deficits.md');
