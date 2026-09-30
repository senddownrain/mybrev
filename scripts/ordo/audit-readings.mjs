#!/usr/bin/env node
/**
 * Readings audit of every celebration the engine yields as primary or
 * alternative in the years the four calendars cover.
 *
 *   node scripts/ordo-fetch-public-cache.mjs   # read-only cache of `readings`
 *   npm run ordo:audit-readings
 *
 * Writes reports/ordo-readings-audit.json, docs/ordo-readings-audit.md and
 * src/data/ordo/readings-status.json (content status + known citation per
 * celebration, used by the calendar definitions). Never writes to Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../../src/utils/ordo/index.js';
import { selectReadingDocuments } from '../../src/utils/ordo/runtime.js';
import { READING_STATUSES, auditCelebrationReadings, properReadingLines } from '../lib/readings-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const CACHE = path.join(ROOT, 'reports', 'ordo-firestore-cache', 'readings.json');
const STATUS_PATH = path.join(ROOT, 'src', 'data', 'ordo', 'readings-status.json');

/** Runtime content status of an audit status. */
export const CONTENT_STATUS = Object.freeze({
  MATCH: 'full', WRONG_CITATION: 'full', WRONG_LINK: 'full', AMBIGUOUS: 'full',
  WEEKDAY_DEFAULT: 'weekday', REFERENCE_ONLY: 'reference-only', MISSING_CONTENT: 'missing',
});

export function runReadingsAudit({ readings, evidence }) {
  const docs = readings.map((item) => ({ id: item.id, ...item.data })).filter((doc) => doc._obsolete !== true);
  const byCelebration = new Map();
  DIOCESES.forEach((diocese) => {
    (evidence[diocese]?.days || []).forEach((sourceDay) => {
      const day = resolveLiturgicalDate(sourceDay.date, { diocese });
      [day.primary, ...day.alternatives].filter((option) => option.kind !== 'temporal' && option.kind !== 'votive-memorial').forEach((option) => {
        const key = option.id;
        const entry = byCelebration.get(key) || {
          id: option.id, title: option.title, rankKinds: new Set(), dioceses: new Set(), dates: new Set(),
          dayIds: new Set(), expected: new Map(), documents: new Map(), readingsRef: option.readingsRef,
        };
        entry.rankKinds.add(option.rankKind);
        entry.dioceses.add(diocese);
        entry.dates.add(sourceDay.date);
        [...(option.daysRef?.dayIds || []), ...(option.fallbackDaysRefs || []).flatMap((ref) => ref.dayIds || [])]
          .forEach((id) => entry.dayIds.add(id));
        // Movable celebrations are linked by their feast code.
        if (option.feastCode) [option.feastCode, String(option.feastCode).replace(/^feast-/, '')].forEach((id) => entry.dayIds.add(id));
        // Citations belong to the celebration only when the calendar celebrates it that day.
        const celebrated = (sourceDay.celebrations || []).some((item) => item.identity?.id === option.id);
        if (celebrated) {
          const memorial = ['memorial', 'optional-memorial'].includes(option.rankKind) || option.role !== 'primary';
          properReadingLines(sourceDay.readings, { memorial }).forEach((line) => entry.expected.set(line.replace(/\s+/g, ' '), diocese));
        }
        const resolution = [day.readingResolution.primary, ...day.readingResolution.alternatives].find((item) => item.optionId === option.id);
        (resolution?.lookup || []).filter((lookup) => lookup.purpose === 'proper').forEach((lookup) => {
          selectReadingDocuments(lookup, option, docs).forEach((doc) => entry.documents.set(doc.id, doc));
        });
        byCelebration.set(key, entry);
      });
    });
  });

  const rankOrder = ['solemnity', 'all-souls', 'feast', 'memorial', 'optional-memorial'];
  const results = [...byCelebration.values()].map((entry) => {
    const rankKind = rankOrder.find((kind) => entry.rankKinds.has(kind)) || [...entry.rankKinds][0];
    const audit = auditCelebrationReadings(
      { id: entry.id, title: entry.title, rankKind, dayIds: [...entry.dayIds] },
      [...entry.documents.values()],
      // One calendar's lines are enough as the reference (they repeat each other).
      [...entry.expected.keys()].slice(0, 4),
    );
    return {
      id: entry.id, title: entry.title, rankKind, dioceses: [...entry.dioceses], dates: [...entry.dates].sort().slice(0, 4),
      readingsRef: entry.readingsRef, ...audit,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const summary = Object.fromEntries(READING_STATUSES.map((status) => [status, results.filter((item) => item.status === status).length]));
  return { results, summary };
}

function renderMarkdown({ results, summary }, source) {
  const section = (status, title, note) => {
    const items = results.filter((item) => item.status === status);
    if (!items.length) return '';
    return `\n## ${title} (${items.length})\n\n${note}\n\n| Празднаванне | Ранг | Дэталі |\n|---|---|---|\n${items.map((item) => (
      `| ${item.title} (\`${item.id}\`) | ${item.rankKind} | ${[item.detail, item.reference ? `каляндар: ${item.reference}` : '', item.documents.length ? `дакументы: ${item.documents.join(', ')}` : ''].filter(Boolean).join('; ') || '—'} |`
    )).join('\n')}\n`;
  };
  return `# Чытанні: аўдыт спасылак і зместу

Згенеравана \`npm run ordo:audit-readings\` (крыніца: ${source}). Не рэдагаваць уручную.

Правяраецца кожнае празднаванне, якое engine выдае як primary або alternative ў гадах
чатырох календароў: чаканыя чытанні Ordo ↔ \`readingsRef\` ↔ знойдзены дакумент
\`readings\` ↔ цытаты ў дакуменце.

| Статус | Колькасць | Значэнне |
|---|---|---|
| MATCH | ${summary.MATCH} | дакумент з тэкстам; Евангелле супадае з календарамі (або каляндар цытату не друкуе) |
| WEEKDAY_DEFAULT | ${summary.WEEKDAY_DEFAULT} | успамін без уласных чытанняў: бяруцца чытанні будня — гэта норма |
| REFERENCE_ONLY | ${summary.REFERENCE_ONLY} | тэксту няма, але цытата вядомая з календароў |
| MISSING_CONTENT | ${summary.MISSING_CONTENT} | урачыстасць / свята без дакумента і без цытаты |
| WRONG_LINK | ${summary.WRONG_LINK} | дакумент звязаны (\`_dayId\`) з іншым празднаваннем |
| WRONG_CITATION | ${summary.WRONG_CITATION} | Евангелле ў дакуменце адрозніваецца ад усіх календароў |
| AMBIGUOUS | ${summary.AMBIGUOUS} | на запыт адказвае некалькі розных дакументаў |
${section('WRONG_CITATION', 'WRONG_CITATION', 'Праверыць тэкст дакумента: магчыма, імпартаваны фармуляр вігіліі або іншага дня.')}${section('WRONG_LINK', 'WRONG_LINK', 'Выправіць `_dayId` / `_dayIds` дакумента чытанняў.')}${section('AMBIGUOUS', 'AMBIGUOUS', 'Удакладніць, які дакумент належыць празднаванню.')}${section('MISSING_CONTENT', 'MISSING_CONTENT', 'Патрэбны тэкст або хаця б цытата.')}${section('REFERENCE_ONLY', 'REFERENCE_ONLY', 'На старонцы дня паказваецца цытата і «Тэкст чытанняў пакуль недаступны».')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(CACHE)) {
    console.error('No readings cache. Run: node scripts/ordo-fetch-public-cache.mjs');
    process.exit(1);
  }
  const readings = JSON.parse(fs.readFileSync(CACHE, 'utf8')).documents;
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(CACHE), 'manifest.json'), 'utf8'));
  const evidence = Object.fromEntries(DIOCESES.map((diocese) => [
    diocese, JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', 'evidence', `${diocese}.json`), 'utf8')),
  ]));
  const audit = runReadingsAudit({ readings, evidence });
  fs.writeFileSync(path.join(ROOT, 'reports', 'ordo-readings-audit.json'), `${JSON.stringify({ snapshotVersion: manifest.snapshotVersion, ...audit }, null, 1)}\n`);
  fs.writeFileSync(path.join(ROOT, 'docs', 'ordo-readings-audit.md'), renderMarkdown(audit, `public read-only cache ${manifest.snapshotVersion}`));
  const status = Object.fromEntries(audit.results.map((item) => [item.id, {
    readings: CONTENT_STATUS[item.status],
    audit: item.status,
    ...(item.reference && item.status === 'REFERENCE_ONLY' ? { reference: item.reference } : {}),
  }]));
  fs.writeFileSync(STATUS_PATH, `{\n${Object.keys(status).sort().map((key) => ` ${JSON.stringify(key)}: ${JSON.stringify(status[key])}`).join(',\n')}\n}\n`);
  console.log(JSON.stringify(audit.summary));
}
