#!/usr/bin/env node
/**
 * Master deficit report: every data-integrity gap the audits found, grouped,
 * prioritized (P0 / P1 / P2), with the recommended action.
 *
 * Reads the outputs of `npm run liturgy:audit` (reports/…) and the generated
 * data; writes docs/liturgical-data-deficits.md and
 * reports/liturgical-data-deficits.json. Never touches Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveRuntimeDay } from '../../src/utils/ordo/runtime.js';
import { readingReferencesForDay } from '../../src/utils/ordo/readingReferences.js';
import { ORDO_AMBIGUITIES } from '../../src/data/ordo/ambiguities.js';

const ROOT = process.cwd();
const readJson = (file, fallback = null) => {
  const full = path.join(ROOT, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : fallback;
};

export const SECTIONS = Object.freeze([
  'CRITICAL RUNTIME', 'RAW INSTRUCTIONS STILL VISIBLE', 'SUSPICIOUS SHORT FIELDS', 'MISSING PROPER HOURS',
  'MISSING COMMON / REUSABLE SOURCE', 'LEGACY DAYS DEPENDENCY', 'ADVENT 17–24', 'CHRISTMAS 25.12–12.01',
  'READINGS WRONG CITATION', 'READINGS MISSING', 'READINGS AMBIGUOUS', 'ORDO NOTES BAD SELECTOR',
  'FIRESTORE / BUNDLED DRIFT', 'ENGINE AMBIGUITIES', 'NEEDS MANUAL REVIEW',
]);

const row = (section, severity, fields) => ({
  section, severity,
  celebration: '', date: '', diocese: '', field: '', source: '', observed: '', expected: '', fallback: '', action: '', status: 'OPEN',
  ...fields,
});

function hoursRows(hours, repairPlan) {
  const rows = [];
  if (!hours) return rows;
  const target = hours.runtime.target;
  target.unavailableOptions.filter((item) => !item.shown).forEach((item) => rows.push(row('CRITICAL RUNTIME', 'P0', {
    celebration: item.title, date: `${item.firstDate} … ${item.lastDate} (${item.occurrences})`, source: 'days', field: 'whole Office',
    observed: 'no document: the day is not offered in Hours', expected: `days/${item.id.replace(/^temporal:/, '')}`,
    fallback: 'none', action: 'Add the period document (text from the breviary); never invent it',
  })));
  const missingByDoc = new Map();
  target.missingFields.forEach((item) => {
    const key = `${item.optionId}|${item.field}`;
    const entry = missingByDoc.get(key) || { ...item, documents: [] };
    entry.documents.push(item.documentId);
    missingByDoc.set(key, entry);
  });
  [...missingByDoc.values()].forEach((item) => rows.push(row('CRITICAL RUNTIME', 'P1', {
    celebration: item.optionId, date: `${item.firstDate} …`, field: item.field, source: 'temporal day', observed: 'empty',
    expected: 'text of the temporal day', fallback: 'empty field', action: 'Fill the week-specific reading in the temporal document',
  })));
  (repairPlan?.unfillable || []).forEach((item) => rows.push(row('CRITICAL RUNTIME', 'P1', {
    celebration: item.id, field: item.field, source: `days/${item.id}`, observed: 'empty', expected: 'week-specific text',
    fallback: 'empty', action: `Not derivable (${item.reason}): enter from the breviary`,
  })));
  target.integrityErrors.forEach((item) => rows.push(row('MISSING COMMON / REUSABLE SOURCE', 'P0', {
    celebration: item.optionId, field: item.field, source: item.source, observed: item.reason, expected: 'published template',
    fallback: 'empty (no silent day fallback)', action: 'Publish the reusable source',
  })));
  target.rawInstructionsVisible.forEach((item) => rows.push(row('RAW INSTRUCTIONS STILL VISIBLE', 'P0', {
    celebration: item.optionId, field: item.field, observed: item.value, source: item.documentId, expected: 'structured _fieldRules',
    action: 'Normalize in scripts/lib/feast-content.mjs and regenerate',
  })));
  hours.sources.forEach((source) => source.instructions
    .filter((item) => item.type === 'SUSPICIOUS_SHORT_TEXT')
    .forEach((item) => rows.push(row('SUSPICIOUS SHORT FIELDS', 'P2', {
      source: source.source, field: item.fields.join(', '), observed: item.value, celebration: item.documents.slice(0, 3).join(', '),
      expected: 'real text or a rule', action: 'Review: text or instruction?',
    }))));
  hours.sources.forEach((source) => source.instructions
    .filter((item) => item.type === 'UNRESOLVED_REFERENCE')
    .forEach((item) => rows.push(row('MISSING PROPER HOURS', 'P1', {
      source: source.source, field: item.fields.join(', '), observed: item.value, celebration: item.documents.slice(0, 3).join(', '),
      expected: 'the referenced text', fallback: 'Office descriptor fallback (day / Common)', action: 'Type the referenced text (page of the breviary) into the source',
    }))));
  rows.push(row('LEGACY DAYS DEPENDENCY', 'P2', {
    observed: `${hours.summary.target.legacyDependentCelebrations} celebrations depend on legacy fixed days in the web runtime`,
    source: 'liturgicalProperTexts', expected: '0', status: hours.summary.target.legacyDependentCelebrations ? 'OPEN' : 'DONE',
    action: 'Legacy fixed `days` stay physically for the released Flutter app; remove after its migration',
  }));
  return rows;
}

function scaffoldRows(generation) {
  return (generation?.scaffolds || []).map((item) => row(
    item.templates.length ? 'NEEDS MANUAL REVIEW' : 'MISSING PROPER HOURS',
    ['solemnitas', 'festum'].includes(item._rank) ? 'P1' : 'P2',
    {
      celebration: item._feastName, date: item._date, diocese: item._place || '', source: 'liturgicalProperTexts (scaffold)',
      observed: item.templates.length ? `no own texts; Commons inferred from the title: ${item.templates.join(', ')}` : 'no own texts, no Common',
      expected: 'own texts (patchs/feasts)', fallback: item.templates.length ? 'Common / «З дня»' : 'the day',
      action: item.templates.length ? 'Check the inferred Commons; add the proper texts' : 'Add the proper texts or name a Common',
    },
  ));
}

function seasonRows(season) {
  if (!season) return [];
  const rows = [];
  const status = season.summary.byStatus;
  ['ADVENT 17–24', 'CHRISTMAS 25.12–12.01'].forEach((section) => {
    const advent = section.startsWith('ADVENT');
    const problems = season.problems.filter((item) => (Number(item.date.slice(5, 7)) === 12 && Number(item.date.slice(8)) <= 24) === advent);
    if (!problems.length) {
      rows.push(row(section, 'P2', {
        observed: `${season.range.from}–${season.range.to}: ${JSON.stringify(status)}`, status: 'DONE',
        action: 'Re-run after data changes (npm run liturgy:audit)',
      }));
    }
    problems.forEach((item) => rows.push(row(section, item.kind === 'MISSING' ? 'P0' : 'P1', {
      date: item.date, diocese: item.diocese, observed: item.kind, expected: JSON.stringify(item.detail), action: 'Review',
    })));
  });
  return rows;
}

function readingsRows(readings) {
  if (!readings) return [];
  const rows = [];
  readings.results.forEach((item) => {
    const base = { celebration: `${item.title} (${item.id})`, date: item.dates.join(', '), diocese: item.dioceses.join(', '), source: 'readings' };
    if (item.status === 'WRONG_CITATION') rows.push(row('READINGS WRONG CITATION', 'P0', { ...base, observed: item.detail, expected: item.reference || 'calendar citation', fallback: 'the wrong text is shown', action: 'Replace the readings document text (Mass of the day, not of the vigil / another day)' }));
    if (item.status === 'MISSING_CONTENT') rows.push(row('READINGS MISSING', 'P1', { ...base, observed: 'no document, no citation', fallback: 'Ordo: «тэкст пакуль недаступны»', action: 'Add the readings or at least the citation' }));
    if (item.status === 'REFERENCE_ONLY') rows.push(row('READINGS MISSING', 'P2', { ...base, observed: 'citation only', expected: item.reference, fallback: 'citation shown, no text', action: 'Add the readings text' }));
    if (item.status === 'AMBIGUOUS') rows.push(row('READINGS AMBIGUOUS', 'P1', { ...base, observed: item.detail, expected: 'one document per celebration', action: 'Link the right document (_dayIds)' }));
  });
  return rows;
}

/** Temporal days whose readings are not in `readings` (bundled reference index). */
function temporalReadingsRows() {
  const index = readJson('src/data/ordo/reading-references.json')?.references || [];
  const missing = new Map();
  for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2028, 0, 1); time += 86_400_000) {
    const iso = new Date(time).toISOString().slice(0, 10);
    readingReferencesForDay(resolveRuntimeDay(iso, { diocese: 'minsk-mohilev' }), index)
      .filter((item) => item.optionId.startsWith('temporal:') && item.status === 'missing')
      .forEach((item) => missing.set(item.optionId, [...(missing.get(item.optionId) || []), iso]));
  }
  return [...missing.entries()].map(([id, dates]) => row('READINGS MISSING', 'P0', {
    celebration: id, date: dates.join(', '), source: 'readings', observed: 'no readings document for the weekday',
    expected: `readings for ${id.replace('temporal:', '')}`, fallback: 'nothing on the Readings screen', action: 'Import the weekday readings',
  }));
}

function notesRows(notesAudit, notesReview, notesData) {
  const rows = [];
  (notesAudit?.violations || []).forEach((item) => rows.push(row('ORDO NOTES BAD SELECTOR', 'P1', {
    celebration: item.noteId, date: item.dates.join(', '), observed: `${item.kind}: ${item.text}`, expected: String(item.expected),
    action: 'Fix the selector guard (scripts/ordo/lib/note-guards.mjs)',
  })));
  if (!notesAudit?.violations?.length) {
    rows.push(row('ORDO NOTES BAD SELECTOR', 'P2', { observed: `0 semantic violations in ${notesAudit?.shown ?? '?'} shown notes (${notesAudit?.range?.from}–${notesAudit?.range?.to})`, status: 'DONE', action: '—' }));
  }
  const groups = new Map();
  (notesReview?.review || []).forEach((item) => groups.set(item.reason, [...(groups.get(item.reason) || []), item]));
  groups.forEach((items, reason) => rows.push(row('NEEDS MANUAL REVIEW', 'P2', {
    source: 'Ordo notes (hidden, not published)', observed: `${items.length} × ${reason}`, celebration: items.slice(0, 3).map((item) => String(item.text).slice(0, 40)).join(' | '),
    action: 'Decide: exact date, recurring rule or drop',
  })));
  const flagged = (notesData?.notes || []).filter((note) => note.classification === 'NEEDS_REVIEW');
  if (flagged.length) rows.push(row('NEEDS MANUAL REVIEW', 'P2', { source: 'Ordo notes (published)', observed: `${flagged.length} notes flagged NEEDS_REVIEW`, action: 'docs/ordo-notes-audit.md → «Needs manual review»' }));
  return rows;
}

function driftRows(drift) {
  if (!drift) return [row('FIRESTORE / BUNDLED DRIFT', 'P2', { observed: 'no drift report (run audit-drift)', action: 'npm run liturgy:audit' })];
  const rows = Object.entries(drift.collections).map(([name, item]) => row('FIRESTORE / BUNDLED DRIFT', item.inSync ? 'P2' : 'P1', {
    source: name, observed: item.inSync ? 'in sync' : `onlyFirestore ${item.onlyLive.length}, onlyBundled ${item.onlyBundled.length}, different ${item.different.length}`,
    expected: 'in sync', status: item.inSync ? 'DONE' : 'OPEN', action: item.inSync ? '—' : 'Republish (ordo:import-calendar / ordo:import-feasts) or regenerate',
    celebration: [...item.different, ...item.onlyBundled, ...item.onlyLive].slice(0, 5).join(', '),
  }));
  Object.entries(drift.revisions).filter(([, value]) => value.bundled !== undefined).forEach(([name, value]) => {
    if (value.firestore !== value.bundled) {
      rows.push(row('FIRESTORE / BUNDLED DRIFT', 'P1', { source: `${name} revision`, observed: `firestore ${value.firestore}, bundled ${value.bundled}`, expected: 'equal', action: 'Publish the bundled revision' }));
    }
  });
  return rows;
}

function ambiguityRows() {
  return ORDO_AMBIGUITIES.map((item) => row('ENGINE AMBIGUITIES', 'P2', {
    celebration: item.celebrationId || item.id, observed: `${item.title}: ${item.description}`,
    expected: item.decisionLabel, status: item.status === 'decided' ? 'DONE' : 'OPEN',
    action: 'Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md',
  }));
}

function manualRows(hours, repairPlan) {
  const rows = [];
  (repairPlan?.repairs || []).forEach((item) => Object.entries(item.evidence)
    .filter(([, evidence]) => evidence.disagree.length)
    .slice(0, 1)
    .forEach(([field, evidence]) => rows.push(row('NEEDS MANUAL REVIEW', 'P2', {
      celebration: evidence.disagree.join(', '), field, source: 'days (psalter week)', observed: `differs from ${evidence.agree.length} equivalent documents`,
      expected: 'same psalter texts', action: 'Compare with the breviary',
    }))));
  const unexplained = hours?.legacyComparison?.unexplained || [];
  if (unexplained.length) {
    rows.push(row('NEEDS MANUAL REVIEW', 'P2', {
      source: 'assembled Office ↔ legacy copy', observed: `${unexplained.length} field differences not explained by the rubrics`,
      celebration: [...new Set(unexplained.map((item) => item.optionId))].slice(0, 6).join(', '),
      action: 'reports/liturgy/hours-sources-audit.json → legacyComparison.unexplained',
    }));
  }
  return rows;
}

function render(report) {
  const esc = (value) => String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const lines = [
    '# Літургічныя даныя: дэфіцыты',
    '',
    `Згенеравана \`npm run liturgy:audit\` (${report.generatedAt.slice(0, 10)}). Не рэдагаваць уручную.`,
    '',
    '| Прыярытэт | Адкрыта | Наступнае дзеянне |',
    '|---|---|---|',
    ...['P0', 'P1', 'P2'].map((priority) => `| **${priority}** | ${report.summary[priority].open} | ${esc(report.summary[priority].next)} |`),
    '',
  ];
  SECTIONS.forEach((section) => {
    const items = report.rows.filter((item) => item.section === section);
    lines.push(`## ${section}`, '');
    if (!items.length) { lines.push('_няма_', ''); return; }
    lines.push('| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    items.slice(0, 60).forEach((item) => lines.push(`| ${item.severity} | ${esc(item.celebration)} | ${esc(item.date).slice(0, 60)} | ${esc(item.diocese)} | ${esc(item.field)} | ${esc(item.source)} | ${esc(item.observed).slice(0, 160)} | ${esc(item.expected).slice(0, 100)} | ${esc(item.fallback)} | ${esc(item.action)} | ${item.status} |`));
    if (items.length > 60) lines.push('', `… яшчэ ${items.length - 60} — \`reports/liturgical-data-deficits.json\``);
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

export function buildDeficits() {
  const hours = readJson('reports/liturgy/hours-sources-audit.json');
  const repairPlan = readJson('reports/liturgy/temporal-days-repair-plan.json');
  const rows = [
    ...hoursRows(hours, repairPlan),
    ...scaffoldRows(readJson('reports/db-feasts-generation-report.json')),
    ...seasonRows(readJson('reports/advent-christmas-content-audit.json')),
    ...readingsRows(readJson('reports/ordo-readings-audit.json')),
    ...temporalReadingsRows(),
    ...notesRows(readJson('reports/liturgy/notes-semantic-audit.json'), readJson('reports/liturgy/notes-review.json'), readJson('src/data/ordo/notes.json')),
    ...driftRows(readJson('reports/liturgy/firestore-drift.json')),
    ...ambiguityRows(),
    ...manualRows(hours, repairPlan),
  ];
  const open = (priority) => rows.filter((item) => item.severity === priority && item.status === 'OPEN');
  const next = (priority) => {
    const first = open(priority)[0];
    return first ? `${first.section}: ${first.action}` : '—';
  };
  return {
    generatedAt: new Date().toISOString(),
    summary: Object.fromEntries(['P0', 'P1', 'P2'].map((priority) => [priority, { open: open(priority).length, next: next(priority) }])),
    bySection: Object.fromEntries(SECTIONS.map((section) => [section, rows.filter((item) => item.section === section).length])),
    rows,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildDeficits();
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', 'liturgical-data-deficits.json'), `${JSON.stringify(report, null, 1)}\n`);
  fs.writeFileSync(path.join(ROOT, 'docs', 'liturgical-data-deficits.md'), render(report));
  console.log(JSON.stringify({ summary: report.summary, bySection: report.bySection }, null, 2));
}
