#!/usr/bin/env node
/**
 * Advent 17–24 December and Christmas 25 December – 12 January, every year of
 * a range (default 2025–2032), every diocese — the web pipeline on the local
 * snapshot (target state: liturgicalProperTexts + temporal repairs), compared
 * with the state before the migration (legacy fixed `days`).
 *
 *   node scripts/liturgy/audit-advent-christmas.mjs [--snapshot dir] [--from 2025 --to 2032]
 *
 * Output: reports/advent-christmas-content-audit.json, docs/advent-christmas-content-audit.md
 * Status per date: PASS / FIXED (was a problem before the migration) / NEEDS_REVIEW / MISSING.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import moment from '../../src/utils/moment-be.js';
import { OFFICE_TEXT_FIELDS } from '../../src/constants/officeFields.js';
import { getSeasonalDateDocumentId } from '../../src/utils/liturgicalDayResolution.js';
import { optionDescriptor } from '../../src/utils/ordo/runtime.js';
import { classifyField, NOT_RENDERABLE, plainText } from './lib/field-audit.mjs';
import { contentFor, openLiturgySource, snapshotDirectory } from './lib/snapshot-content.mjs';
import { DIOCESES } from './audit-hours-sources.mjs';
import { checkAdventProvenance } from './lib/advent-provenance.mjs';

const ROOT = process.cwd();
const JSON_OUT = path.join(ROOT, 'reports', 'advent-christmas-content-audit.json');
const MD_OUT = path.join(ROOT, 'docs', 'advent-christmas-content-audit.md');
const PROVENANCE_OUT = path.join(ROOT, 'docs', 'evidence', 'issue-200', 'advent-provenance.json.gz');
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : fallback; };

const WEEKDAYS = ['нядзеля', 'панядзелак', 'аўторак', 'серада', 'чацвер', 'пятніца', 'субота'];
const PRIVILEGED = (m) => m.month() === 11 && m.date() >= 17 && m.date() <= 24;

export function* seasonDates(fromYear, toYear) {
  for (let year = fromYear; year <= toYear; year += 1) {
    for (let day = moment(`${year}-12-17`); day.isSameOrBefore(moment(`${year + 1}-01-12`)); day = day.clone().add(1, 'day')) {
      yield day.format('YYYY-MM-DD');
    }
  }
}

/** Problems of one date and diocese. */
export function checkDate(source, date, diocese) {
  const mDate = moment(date);
  const content = contentFor(source, date, { diocese });
  const { daysResult, resolved, context } = content;
  const issues = [];
  const add = (kind, detail) => issues.push({ kind, ...detail });
  const provenance = checkAdventProvenance(source, date, diocese, content);
  if (provenance && provenance.eveningStatus !== 'PASS') {
    add('ADVENT_FIELD_SOURCE', { what: 'evening identity', expected: provenance.expectedEvening, actual: provenance.evening });
  }
  (provenance?.fields || []).filter((field) => field.status !== 'PASS').forEach((field) => {
    add('ADVENT_FIELD_SOURCE', { evening: provenance.evening, ...field });
  });
  const inSeason = ['advent', 'christmas'].includes(context.periodType);
  const dateDocId = getSeasonalDateDocumentId(mDate);
  const dateDoc = dateDocId ? source.daysById.get(dateDocId) : null;
  if (inSeason && dateDocId && !dateDoc) add('MISSING', { what: `days/${dateDocId}` });
  const temporalDoc = daysResult.seasonalException || daysResult.seasonalDateDay || daysResult.periodFallback;
  if (inSeason && !temporalDoc) add('MISSING', { what: 'temporal document' });

  const weekday = WEEKDAYS[mDate.day()];
  content.dayOptions.forEach((option) => {
    const optionId = option.ordo?.optionId || option.key;
    // Stale weekday from the source year of a date document.
    const named = WEEKDAYS.filter((name) => new RegExp(`(^|[\\s,])${name}($|[\\s,.])`, 'iu').test(option.title || ''));
    if (named.length && !named.includes(weekday)) add('STALE_TITLE', { optionId, title: option.title, weekday });
    (option.templates || []).forEach((template) => {
      const day = template.day || {};
      OFFICE_TEXT_FIELDS.forEach((field) => {
        if (NOT_RENDERABLE.has(classifyField(field, day[field]).type)) {
          add('RAW_INSTRUCTION', { optionId, template: template.id, field, value: plainText(day[field]).slice(0, 80) });
        }
      });
      (day._integrityErrors || []).forEach((error) => add('INTEGRITY', { optionId, template: template.id, ...error }));
      (day._missingFields || []).forEach((field) => add('MISSING_FIELD', { optionId, template: template.id, field }));
    });
    // The special (dated) antiphons of the day must reach the temporal Office.
    // A Sunday after Christmas (2–5 January) keeps the Sunday's own antiphons.
    const christmasSunday = mDate.month() === 0 && mDate.day() === 0;
    if (option.ordo?.role === 'primary' && resolved.primary.kind === 'temporal' && dateDoc && daysResult.seasonalException && !christmasSunday) {
      ['laudesAntBen', 'vesperAntMag'].forEach((field) => {
        if (plainText(dateDoc[field]) && plainText(option.day?.[field]) !== plainText(dateDoc[field])) {
          add('SPECIAL_ANTIPHON_LOST', { optionId, field, expected: plainText(dateDoc[field]).slice(0, 60), got: plainText(option.day?.[field]).slice(0, 60) });
        }
      });
    }
    // Feasts in the Christmas octave: Daytime Prayer of the octave day.
    if (daysResult.seasonalDateDay && option.ordo?.role === 'primary' && plainText(dateDoc?.sext1Ant1)) {
      ['sext1Ant1', 'sext2Ant1', 'sext3Ant1'].forEach((field) => {
        if (plainText(option.day?.[field]) !== plainText(dateDoc[field])) {
          add('OCTAVE_DAYTIME_LOST', { optionId, field, expected: plainText(dateDoc[field]).slice(0, 60), got: plainText(option.day?.[field]).slice(0, 60) });
        }
      });
    }
    // On the privileged weekdays the Common never replaces the day.
    if (PRIVILEGED(mDate) && option.ordo?.role === 'primary') {
      [...source.templates.values()].filter((doc) => doc._kind === 'common').forEach((common) => {
        ['laudesHymn', 'vesperHymn', 'laudesInter', 'vesperInter'].forEach((field) => {
          if (plainText(common[field]) && plainText(option.day?.[field]) === plainText(common[field])) {
            add('COMMON_OVER_SEASON', { optionId, field, common: common.id });
          }
        });
      });
    }
  });
  // 17–24 December: a memorial is a commemoration, never a separate Office.
  if (PRIVILEGED(mDate)) {
    const memorials = [resolved.primary, ...resolved.alternatives].filter((item) => ['memorial', 'optional-memorial'].includes(item.rankKind));
    memorials.forEach((item) => add('MEMORIAL_NOT_COMMEMORATION', { optionId: item.id }));
  }
  const commemorations = optionDescriptor(resolved, resolved.primary).commemorations || [];
  return {
    date,
    diocese,
    primary: { id: resolved.primary.id, title: resolved.primary.title, officeKind: resolved.primary.officeKind },
    period: { type: context.periodType, week: context.periodWeek, dayOfWeek: context.dayOfWeek },
    temporalDocument: temporalDoc?.id || null,
    dateDocument: dateDocId ? { id: dateDocId, exists: Boolean(dateDoc), used: [daysResult.seasonalException?.id, daysResult.seasonalDateDay?.id].includes(dateDocId) } : null,
    options: content.dayOptions.map((option) => ({ id: option.ordo?.optionId || option.key, title: option.title, properSource: option.ordo?.properSource || null, choices: (option.templates || []).map((item) => item.label) })),
    commemorations: commemorations.map((item) => item.id),
    ...(provenance ? { provenance } : {}),
    issues,
  };
}

const REVIEW = new Set(['ADVENT_FIELD_SOURCE', 'OCTAVE_DAYTIME_LOST', 'RAW_INSTRUCTION', 'STALE_TITLE', 'SPECIAL_ANTIPHON_LOST', 'COMMON_OVER_SEASON', 'MEMORIAL_NOT_COMMEMORATION', 'INTEGRITY', 'MISSING_FIELD']);
function statusOf(target, before) {
  if (target.issues.some((item) => item.kind === 'MISSING')) return 'MISSING';
  if (target.issues.some((item) => REVIEW.has(item.kind))) return 'NEEDS_REVIEW';
  return before.issues.length ? 'FIXED' : 'PASS';
}

function renderMarkdown(report) {
  const lines = [
    '# Advent 17–24 і Christmas 25.12–12.01: аўдыт зместу',
    '',
    `Згенеравана \`npm run liturgy:audit\` (${report.generatedAt.slice(0, 10)}), snapshot ${report.snapshot}. Гады ${report.range.from}–${report.range.to}, дыяцэзіі: ${DIOCESES.join(', ')}.`,
    `Крыніца: \`${report.snapshotScope}\`. Гэта офлайн-праверка, не live-аўдыт Firestore.`,
    '',
    'Стан «пасля»: `liturgicalProperTexts` + рамонт temporal `days`; «да»: legacy fixed `days`.',
    '',
    '| Статус | Дат×дыяцэзій |',
    '|---|---|',
    ...Object.entries(report.summary.byStatus).map(([status, count]) => `| ${status} | ${count} |`),
    '',
    '## Па гадах',
    '',
    '| Сезон | PASS | FIXED | NEEDS_REVIEW | MISSING |',
    '|---|---|---|---|---|',
    ...Object.entries(report.summary.byYear).map(([year, counts]) => `| ${year}/${Number(year) + 1} | ${counts.PASS || 0} | ${counts.FIXED || 0} | ${counts.NEEDS_REVIEW || 0} | ${counts.MISSING || 0} |`),
    '',
    '## Паходжанне палёў Адвэнту (issue #200)',
    '',
    `${report.summary.provenance.dates} дат×дыяцэзій, ${report.summary.provenance.fields} праверак палёў; памылак: ${report.summary.provenance.failures}. Правяраюцца і тэкст, і дакумент/поле-крыніца; непустое поле з няправільнай крыніцы не праходзіць.`,
    '',
    '| Вечар 2026 | Нешпары | Поле | Крыніца | Статус |',
    '|---|---|---|---|---|',
    ...report.dates.filter((row) => row.diocese === DIOCESES[0] && ['2026-12-19', '2026-12-20', '2026-12-21', '2026-12-23'].includes(row.date))
      .flatMap((row) => row.provenance.fields.filter((field) => field.field.startsWith('vesper')).map((field) =>
        `| ${row.date} | ${row.provenance.evening} | ${field.field} | ${field.actualSource?.document}.${field.actualSource?.field} | ${field.status} |`)),
    '',
    'Усе дыяцэзіі правяраюцца асобна. Захаваны per-field вынік — [advent-provenance.json.gz](evidence/issue-200/advent-provenance.json.gz); поўны лакальны справаздачны JSON — `reports/advent-christmas-content-audit.json`; крыніцы і dry-run — [advent-vespers-issue-200.md](advent-vespers-issue-200.md).',
    '',
    '## Што было выпраўлена (FIXED)',
    '',
    ...(report.summary.fixedKinds.length
      ? ['| Праблема да міграцыі | Дат×дыяцэзій |', '|---|---|', ...report.summary.fixedKinds.map(([kind, count]) => `| ${kind} | ${count} |`)]
      : ['_няма_']),
    '',
    '## NEEDS_REVIEW / MISSING',
    '',
    ...(report.problems.length
      ? ['| Дата | Дыяцэзія | Праблема | Падрабязнасці |', '|---|---|---|---|',
        ...report.problems.slice(0, 200).map((item) => `| ${item.date} | ${item.diocese} | ${item.kind} | ${JSON.stringify(item.detail).replace(/\|/g, '\\|')} |`)]
      : ['_няма_']),
    '',
    '## Як чытаць',
    '',
    '- 17–24.12: будні — уласныя тэксты даты + актуальны псалтыр; нядзелі — уласны нядзельны Office. Антыфоны Benedictus/Magnificat па даце захоўваюцца; у I Нешпарах O-антыфона адпавядае грамадзянскаму вечару. Успаміны — толькі коммемарацыя.',
    '- 24.12.2028: днём IV нядзеля, вечарам I Нешпары Нараджэння Пана (GNLYC 33, 39).',
    '- 25–28.12, 1.01, 6.01: Office — празднаванне; дакумент даты — дзень актавы, з якога дабіраецца sparse Proper.',
    '- Да 12.01: дакументы `christmas-DD-01` ужываюцца, пакуль ідзе перыяд Нараджэння (мяжа перыяду ≠ акно захоўвання).',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const snapshotDir = snapshotDirectory();
  const fromYear = Number(arg('--from', '2025'));
  const toYear = Number(arg('--to', '2032'));
  const target = await openLiturgySource({ snapshotDir, propers: 'generated', templates: 'generated', repairs: true });
  const before = await openLiturgySource({ snapshotDir, propers: 'none', templates: 'snapshot' });
  const rows = [];
  for (const date of seasonDates(fromYear, toYear)) {
    for (const diocese of DIOCESES) {
      const after = checkDate(target, date, diocese);
      const old = checkDate(before, date, diocese);
      rows.push({ ...after, status: statusOf(after, old), before: old.issues });
    }
  }
  const count = (list, key) => list.reduce((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] || 0) + 1 }), {});
  const byYear = {};
  rows.forEach((row) => {
    const year = moment(row.date).month() === 11 ? moment(row.date).year() : moment(row.date).year() - 1;
    byYear[year] = byYear[year] || {};
    byYear[year][row.status] = (byYear[year][row.status] || 0) + 1;
  });
  const fixedKinds = Object.entries(count(rows.filter((row) => row.status === 'FIXED').flatMap((row) => row.before), (item) => item.kind))
    .sort((a, b) => b[1] - a[1]);
  const problems = rows.filter((row) => ['NEEDS_REVIEW', 'MISSING'].includes(row.status))
    .flatMap((row) => row.issues.map(({ kind, ...detail }) => ({ date: row.date, diocese: row.diocese, kind, detail })));
  const report = {
    generatedAt: new Date().toISOString(),
    snapshot: target.manifest.exportedAt,
    snapshotScope: target.manifest.scope || 'local-snapshot',
    range: { from: fromYear, to: toYear },
    summary: { byStatus: count(rows, (row) => row.status), byYear, fixedKinds,
      provenance: {
        dates: rows.filter((row) => row.provenance).length,
        fields: rows.reduce((n, row) => n + (row.provenance?.fields.length || 0), 0),
        failures: rows.flatMap((row) => row.provenance?.fields || []).filter((field) => field.status !== 'PASS').length
          + rows.filter((row) => row.provenance && row.provenance.eveningStatus !== 'PASS').length,
      },
    },
    problems,
    dates: rows,
  };
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 1)}\n`);
  fs.writeFileSync(MD_OUT, renderMarkdown(report));
  fs.mkdirSync(path.dirname(PROVENANCE_OUT), { recursive: true });
  fs.writeFileSync(PROVENANCE_OUT, gzipSync(JSON.stringify({
    generatedAt: report.generatedAt, snapshot: report.snapshot, scope: report.snapshotScope,
    range: report.range, summary: report.summary.provenance,
    dates: rows.filter((row) => row.provenance).map((row) => ({
      date: row.date, diocese: row.diocese, evening: row.provenance.evening,
      expectedEvening: row.provenance.expectedEvening, eveningStatus: row.provenance.eveningStatus,
      fields: row.provenance.fields.map(({ expectedText: _expected, actualText: _actual, ...field }) => field),
    })),
  })));
  console.log(JSON.stringify({ output: [path.relative(ROOT, JSON_OUT), path.relative(ROOT, MD_OUT)], ...report.summary.byStatus }, null, 2));
  if (problems.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
