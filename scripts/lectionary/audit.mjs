#!/usr/bin/env node
/**
 * Full Lectionary audit (read-only). Inputs: the crawl snapshots
 * (reports/lectionary/snapshots) and a production Firestore snapshot.
 *
 *   node scripts/lectionary/audit.mjs [--snapshot dir]
 *
 * Writes reports/lectionary/{source-inventory,coverage,discrepancies,
 * publication-drift,flutter-export-contract,planned-options,resync-plan}.json
 * and docs/lectionary-full-audit.md. Never writes to Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { daysOfYear } from '../../src/utils/ordo/dates.js';
import { resolveLiturgicalDate } from '../../src/utils/ordo/index.js';
import { runAudit, REPORT_DIR, DIOCESES } from './lib/audit-run.mjs';
import { buildCoverage, buildDiscrepancies, buildFlutterContract, buildMemorials, buildSourceInventory } from './lib/reports.mjs';
import { buildPendingPlans } from './lib/pending-plans.mjs';
import { fullPlan } from './lib/wave4-plan.mjs';
import { buildPublicationDrift } from './lib/publication-drift.mjs';
import { renderAuditDoc } from './lib/render-doc.mjs';
import { ROOT } from './lib/source-pages.mjs';
import { snapshotDirFromArgs } from './lib/snapshot-docs.mjs';

/** Evidence of the engine fixes of this audit (counted with the fixed engine). */
function engineFixItems(from, to) {
  const sundays = new Set();
  const christmasEve = new Set();
  for (const diocese of DIOCESES) {
    for (let year = from; year <= to; year += 1) {
      for (const date of daysOfYear(year)) {
        const month = date.slice(5, 7); const day = Number(date.slice(8, 10));
        if (!(month === '12' && day >= 17) && !(month === '01' && day <= 5)) continue;
        const resolved = resolveLiturgicalDate(date, { country: 'BY', diocese });
        if (resolved.primary.kind === 'temporal' && Number(resolved.dayOfWeek) === 1 && ['advent', 'christmas'].includes(resolved.period)) {
          sundays.add(`${date}|${diocese}`);
          if (date.endsWith('-12-24')) christmasEve.add(date);
        }
      }
    }
  }
  const dates = [...new Set([...sundays].map((key) => key.split('|')[0]))].sort();
  return [
    {
      scope: 'plan', class: 'WRONG_CONTEXT', severity: 'high', docId: null, identity: 'period:advent:w3|w4:d1, period:christmas:w2:d1', section: null, field: null,
      sourcePageId: null, sourceUrl: null, expected: 'Sunday lectionary documents (advent-w3-d1--A/B/C, advent-w4-d1--A/B/C, christmas-w2-d1)', actual: 'weekday documents of that date (advent-17-12 … advent-24-12, christmas-02-01 … christmas-05-01)',
      evidence: { detail: `Sundays in the date-keyed windows of Advent/Christmas read the weekday readings of the date; ${dates.length} dates × dioceses = ${sundays.size} date/diocese pairs in ${from}–${to}`, dates },
      planned: [], resolution: { status: 'FIXED_IN_REPO', by: 'src/utils/ordo/candidates.js temporalReadingsRef', reason: 'Sunday keeps the period lookup; test tests/lectionary-audit.test.mjs; Flutter must port the same lookup' },
    },
    {
      scope: 'plan', class: 'MISSING_SET', severity: 'medium', docId: 'advent-24-12--christmas-vigil', identity: 'date:24.12 (Sunday)', section: null, field: null,
      sourcePageId: '5023', sourceUrl: null, expected: 'Christmas Vigil Mass offered on a Sunday 24.12', actual: 'only the Sunday (after the Sunday fix) / only the weekday document (before)',
      evidence: { detail: 'On a Sunday 24 December the evening Mass is the Christmas Vigil; the engine now adds the lookup {_date: 24.12, _variant: christmas-vigil}', dates: [...christmasEve].sort() },
      planned: [], resolution: { status: 'FIXED_IN_REPO', by: 'src/utils/ordo/readings.js + runtime.js (_variant filter)', reason: 'default = the vigil group (evening); Flutter must port the lookup' },
    },
  ];
}

async function main() {
  const snapshotDir = snapshotDirFromArgs();
  const audit = await runAudit({ snapshotDir });
  const extra = engineFixItems(audit.planned.years[0], audit.planned.years[1]);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(REPORT_DIR, name), `${JSON.stringify(value, null, 1)}\n`);
  const inventory = buildSourceInventory(audit);
  const coverage = buildCoverage(audit);
  const discrepancies = buildDiscrepancies(audit, extra);
  const drift = await buildPublicationDrift({ audit });
  const contract = buildFlutterContract(audit, { drift });
  write('source-inventory.json', inventory);
  write('coverage.json', coverage);
  write('discrepancies.json', discrepancies);
  write('publication-drift.json', drift);
  write('flutter-export-contract.json', contract);
  write('planned-options.json', { ...audit.planned, scenarios: audit.planned.scenarios });
  const memorials = buildMemorials(audit);
  const pending = buildPendingPlans({ docs: audit.docs, pages: audit.pages });
  write('memorials.json', memorials);
  write('pending-authorization.json', { schema: 1, generatedAt: audit.generatedAt, note: 'NOT written to Firestore: each item needs an explicit authorization of the owner', plans: pending });
  write('resync-plan.json', fullPlan(audit).report);
  const applyRecord = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'apply-record.json'), 'utf8'));
  fs.writeFileSync(path.join(ROOT, 'docs', 'lectionary-full-audit.md'), renderAuditDoc({ audit, inventory, coverage, discrepancies, drift, contract, memorials, pending, applyRecord }));
  console.log(JSON.stringify({
    articles: inventory.totals.articles, readingPages: coverage.sources.readingPages, documents: coverage.documents.total,
    plannedOptions: coverage.planned.legalMassOptions, identities: coverage.planned.normalizedIdentities,
    discrepancies: discrepancies.summary.byClass, resolution: discrepancies.summary.byResolution, complete: coverage.complete,
  }, null, 1));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
