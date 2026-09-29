#!/usr/bin/env node
/**
 * Validate the generated Ordo against the four published calendars.
 *
 *   npm run ordo:validate            # summary + reports
 *   npm run ordo:validate -- --json  # machine-readable summary on stdout
 *
 * Writes `reports/ordo-validation.json` (full, git-ignored) and
 * `docs/ordo-validation-report.md` (summary tables + representative cases).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadOrdoData, DIOCESES } from './check.mjs';
import { validateDiocese } from './lib/validate.mjs';
import { renderValidationReport } from './lib/validation-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runValidation() {
  const data = loadOrdoData();
  const notes = data.notes.notes;
  return DIOCESES.map((diocese) => validateDiocese(data.evidence[diocese], { differences: data.differences, notes }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = runValidation();
  const summary = Object.fromEntries(results.map((item) => [item.diocese, item.summary]));
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', 'ordo-validation.json'), `${JSON.stringify(results, null, 1)}\n`);
  if (!process.argv.includes('--no-docs')) {
    fs.writeFileSync(path.join(ROOT, 'docs', 'ordo-validation-report.md'), renderValidationReport(results));
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 1));
  } else {
    results.forEach(({ diocese, summary: s }) => {
      console.log(`${diocese.padEnd(14)} days ${String(s.days).padStart(3)}  MATCH ${(100 * s.matchRate).toFixed(1)}%  explained ${(100 * s.explainedRate).toFixed(1)}%  ${JSON.stringify(s.byStatus)}`);
    });
    console.log('reports/ordo-validation.json, docs/ordo-validation-report.md written');
  }
}
