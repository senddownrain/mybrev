#!/usr/bin/env node
/**
 * Validate the committed Ordo data (no raw sources needed).
 *
 *   npm run ordo:check
 *
 * Checks: provenance on every item, allowed classifications and selectors,
 * no excluded (collection / clergy-personal) content anywhere, notes and
 * differences reference existing evidence items. With raw adapter output
 * present, it also rebuilds into a temp dir and requires byte-identical
 * output (determinism).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findExcludedStrings } from './lib/exclusions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, 'src', 'data', 'ordo');
export const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
export const CLASSIFICATIONS = new Set([
  'CONFIRMED_PERMANENT_RULE', 'LIKELY_PERMANENT_RULE', 'DIOCESAN_PROPER', 'YEAR_INSTANCE_ONLY', 'DISPLAY_NOTE', 'NEEDS_REVIEW',
]);
export const SELECTOR_TYPES = new Set([
  'fixed-date', 'celebration', 'period', 'period-phase', 'period-day', 'relative', 'nth-weekday-of-month', 'day-of-month', 'exact-date',
  'all', 'any', 'months',
]);
/** A composite selector is valid when every part is. */
function selectorValid(selector) {
  if (!SELECTOR_TYPES.has(selector?.type)) return false;
  if (['all', 'any'].includes(selector.type)) return Array.isArray(selector.selectors) && selector.selectors.length > 0 && selector.selectors.every(selectorValid);
  if (selector.type === 'months') return Array.isArray(selector.months) && selector.months.every((month) => month >= 1 && month <= 12);
  return true;
}
export const DIFFERENCE_TYPES = new Set(['UNIVERSAL', 'BELARUS', 'DIOCESAN', 'LOCAL', 'YEAR_SPECIFIC', 'MORE_DETAILED_SOURCE', 'REAL_CONFLICT']);

export function loadOrdoData(dir = DATA) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  return {
    evidence: Object.fromEntries(DIOCESES.map((d) => [d, read(path.join('evidence', `${d}.json`))])),
    notes: read('notes.json'),
    differences: read('diocesan-differences.json'),
    unresolved: read('unresolved.json'),
  };
}

export function validateEvidence(source) {
  const problems = [];
  const format = source.source.format;
  const checkEvidence = (ev, where) => {
    if (!ev || typeof ev !== 'object') return problems.push(`${where}: missing evidence`);
    if (!ev.file) problems.push(`${where}: evidence without file`);
    if (typeof ev.rawText !== 'string') problems.push(`${where}: evidence without rawText`);
    if (format === 'pdf' && (!Number.isInteger(ev.page) || !Array.isArray(ev.bbox))) problems.push(`${where}: PDF evidence needs page+bbox`);
    if (format === 'docx' && !Number.isInteger(ev.paragraph)) problems.push(`${where}: DOCX evidence needs paragraph`);
    return null;
  };
  const checkClass = (item, where) => {
    if (!CLASSIFICATIONS.has(item.classification)) problems.push(`${where}: bad classification ${item.classification}`);
  };
  let previous = '';
  source.days.forEach((day) => {
    const where = `${source.source.diocese}:${day.date}`;
    if (day.date <= previous) problems.push(`${where}: days not strictly increasing`);
    previous = day.date;
    if (!day.liturgical?.periodType) problems.push(`${where}: no liturgical alignment`);
    checkEvidence(day.evidence, where);
    day.celebrations.forEach((c) => { checkEvidence(c.evidence, c.id); checkClass(c, c.id); });
    day.readings.forEach((r, i) => checkEvidence(r.evidence, `${where}:r${i}`));
    day.mass.forEach((m, i) => { checkEvidence(m.evidence, `${where}:m${i}`); checkClass(m, `${where}:m${i}`); });
    (day.office?.lines || []).forEach((o, i) => checkEvidence(o.evidence, `${where}:o${i}`));
    if (day.office) checkClass(day.office, `${where}:office`);
    day.notes.forEach((n) => { checkEvidence(n.evidence, n.id); checkClass(n, n.id); });
  });
  source.rules.forEach((r) => { checkEvidence(r.evidence, r.id); checkClass(r, r.id); });
  source.announcements.forEach((a) => { checkEvidence(a.evidence, a.id); checkClass(a, a.id); });
  return problems;
}

export function validateNotes(notes, evidence) {
  const problems = [];
  const itemIds = new Set();
  Object.values(evidence).forEach((source) => {
    source.days.forEach((day) => day.notes.forEach((n) => itemIds.add(n.id)));
    source.rules.forEach((r) => itemIds.add(r.id));
    source.announcements.forEach((a) => itemIds.add(a.id));
  });
  notes.notes.forEach((note) => {
    if (!selectorValid(note.selector)) problems.push(`${note.id}: bad selector ${note.selector?.type}`);
    if (!CLASSIFICATIONS.has(note.classification)) problems.push(`${note.id}: bad classification`);
    if (!['universal', 'belarus', 'diocese'].includes(note.scope?.level)) problems.push(`${note.id}: bad scope`);
    // An app-level normalization (first Thursday …) cites the dioceses it was seen in instead.
    // Period volumes cite the calendar paragraphs / pages they were read from instead.
    if (note.provenance?.kind === 'period-volumes') {
      if (!note.provenance.evidence?.length) problems.push(`${note.id}: period volumes without evidence`);
    } else if (!note.observed?.length && note.provenance?.kind !== 'app-normalization') problems.push(`${note.id}: no observations`);
    if (note.provenance?.kind === 'app-normalization' && !note.provenance.observedIn?.length) problems.push(`${note.id}: normalization without sources`);
    note.observed?.forEach((o) => {
      if (!o.evidence?.rawText && o.evidence?.rawText !== '') problems.push(`${note.id}: observation without evidence`);
      o.itemIds.forEach((id) => { if (!itemIds.has(id)) problems.push(`${note.id}: unknown item ${id}`); });
    });
    const onlyDates = note.selector?.type === 'exact-date'
      || (note.selector?.type === 'any' && note.selector.selectors.every((item) => item.type === 'exact-date'));
    if (onlyDates && note.classification !== 'YEAR_INSTANCE_ONLY') {
      problems.push(`${note.id}: exact-date selector must be YEAR_INSTANCE_ONLY`);
    }
  });
  return problems;
}

export function validateDifferences(differences) {
  const problems = [];
  differences.entries.forEach((entry) => entry.differences.forEach((d) => {
    if (!DIFFERENCE_TYPES.has(d.type)) problems.push(`${entry.celebrationId}: bad difference type ${d.type}`);
  }));
  differences.missingInMyBrev.forEach((entry) => {
    if (!DIFFERENCE_TYPES.has(entry.type)) problems.push(`${entry.title}: bad type ${entry.type}`);
  });
  return problems;
}

function checkDeterminism() {
  const raw = path.join(ROOT, '.ordo-sources', 'scratch', 'raw');
  if (!fs.existsSync(raw)) return { skipped: true };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ordo-check-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'ordo', 'build.mjs')], { env: { ...process.env, ORDO_OUT_DIR: tmp }, stdio: 'ignore' });
    const files = ['notes.json', 'diocesan-differences.json', 'unresolved.json', ...DIOCESES.map((d) => path.join('evidence', `${d}.json`))];
    const differing = files.filter((file) => fs.readFileSync(path.join(tmp, file), 'utf8') !== fs.readFileSync(path.join(DATA, file), 'utf8'));
    return { skipped: false, differing };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const data = loadOrdoData();
  const problems = [
    ...Object.values(data.evidence).flatMap(validateEvidence),
    ...validateNotes(data.notes, data.evidence),
    ...validateDifferences(data.differences),
  ];
  const leaks = findExcludedStrings(data);
  leaks.forEach((leak) => problems.push(`excluded content (${leak.category}) at ${leak.path}: ${leak.text}`));
  const determinism = checkDeterminism();
  if (!determinism.skipped && determinism.differing.length) {
    problems.push(`build is not reproducible / committed data is stale: ${determinism.differing.join(', ')}`);
  }
  Object.entries(data.evidence).forEach(([diocese, source]) => {
    console.log(`${diocese}: ${source.stats.days} days, ${source.stats.items} items, excluded ${JSON.stringify(source.stats.excluded)}`);
  });
  console.log(`notes: ${data.notes.notes.length}; differences: ${data.differences.entries.length}; determinism: ${determinism.skipped ? 'skipped (no raw sources)' : 'checked'}`);
  if (problems.length) {
    problems.slice(0, 50).forEach((problem) => console.error(`✗ ${problem}`));
    console.error(`${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('ordo:check OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
