#!/usr/bin/env node
/**
 * Build the committed Ordo evidence from the raw adapter output.
 *
 *   python3 scripts/ordo/extract.py      # .ordo-sources/*  -> .ordo-sources/scratch/raw/*.json
 *   node scripts/ordo/build.mjs          # raw              -> src/data/ordo/*
 *
 * `npm run ordo:extract` runs both. Output is deterministic (no timestamps).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadFixedCatalog } from './lib/identity.mjs';
import { CLASSIFICATION, normalizeSource } from './lib/normalize.mjs';
import { DIOCESE_ORDER, buildNotes } from './lib/notes.mjs';
import { extractGeneralNotes } from './lib/general-notes.mjs';

// Raise when the published notes change (republish with ordo:import-calendar).
// 4: Grodno/Pinsk general notes recovered; volume markers → `books` (final phase §13).
const NOTES_REVISION = 4;
import { buildDifferences, properIds } from './lib/differences.mjs';
import { alignDate } from './lib/calendar.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_DIR = path.join(ROOT, '.ordo-sources', 'scratch', 'raw');
const OUT_DIR = process.env.ORDO_OUT_DIR ? path.resolve(process.env.ORDO_OUT_DIR) : path.join(ROOT, 'src', 'data', 'ordo');
const SCHEMA_VERSION = 1;

/** JSON with one array element per line: compact, diff-friendly, deterministic. */
export function stringifyCompact(value, depth = 0) {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (depth >= 1) return JSON.stringify(value);
    return `[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]`;
  }
  if (value && typeof value === 'object' && depth === 0) {
    const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${stringifyCompact(item, Array.isArray(item) ? 0 : 1)}`);
    return `{\n${entries.join(',\n')}\n}`;
  }
  return JSON.stringify(value);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${stringifyCompact(value)}\n`, 'utf8');
}

function countBy(list, key) {
  const result = {};
  list.forEach((item) => {
    const value = typeof key === 'function' ? key(item) : item[key];
    result[value] = (result[value] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function missingDays(days) {
  const dates = days.filter((d) => !d.preview).map((d) => d.date);
  const set = new Set(dates);
  const gaps = [];
  if (!dates.length) return gaps;
  for (let t = Date.parse(`${dates[0]}T00:00:00Z`); t <= Date.parse(`${dates.at(-1)}T00:00:00Z`); t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!set.has(iso)) gaps.push(iso);
  }
  return gaps;
}

const SELECTOR_LABEL = (selector) => {
  if (selector.type === 'all') return selector.selectors.map(SELECTOR_LABEL).join(' + ');
  if (selector.type === 'months') return `месяц ${selector.months.join(', ')}`;
  return [selector.type, ...Object.entries(selector).filter(([key]) => key !== 'type').map(([key, value]) => `${key}=${JSON.stringify(value)}`)].join(' ');
};

/** docs/ordo-notes-audit.md — what the semantic guards did to the notes. */
const dioceseIdsOf = (note) => note.scope.dioceseIds || [note.scope.dioceseId];

/** Published notes per diocese (§22.7): total, general notes, books, review. */
function coverageRows(notes, sources, generalSkipped) {
  return DIOCESE_ORDER.map((diocese) => {
    const own = notes.filter((note) => dioceseIdsOf(note).includes(diocese) || note.scope.level === 'belarus');
    const ownOnly = notes.filter((note) => dioceseIdsOf(note).includes(diocese));
    const source = sources.find((item) => item.diocese === diocese);
    const general = ownOnly.filter((note) => note.basis === 'general-notes').length;
    const skipped = generalSkipped.filter((item) => item.diocese === diocese);
    const reasons = Object.entries(skipped.reduce((acc, item) => ({ ...acc, [item.reason]: (acc[item.reason] || 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${reason} ${count}`).join(', ');
    return `| ${diocese} | ${ownOnly.length} | ${own.length} | ${general} | ${ownOnly.filter((note) => note.category === 'books').length} | ${ownOnly.filter((note) => note.classification === 'NEEDS_REVIEW').length} | ${source?.generalNotes?.length ?? 0} | ${reasons || '—'} |`;
  });
}

function renderNotesAudit({ notes, review, revision, sources = [], generalSkipped = [] }) {
  const guarded = notes.filter((note) => note.guard);
  const group = (predicate) => guarded.filter((note) => predicate(note.guard));
  const rows = (items, render) => (items.length ? items.map(render).join('\n') : '_няма_');
  const fixed = [...group((guard) => /^month|coverage/.test(guard))];
  const yearInstances = notes.filter((note) => note.selector.type === 'exact-date');
  const split = group((guard) => /per printed day/.test(guard));
  const canonical = notes.filter((note) => note.basis === 'app-normalization');
  const manual = notes.filter((note) => note.classification === 'NEEDS_REVIEW');
  const count = (items, key) => Object.entries(items.reduce((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]);
  return `# Ordo notes: semantic audit

Згенеравана \`node scripts/ordo/build.mjs\` — не рэдагаваць уручную. Рэвізія публікацыі заўваг: **${revision}**.
Правілы: \`scripts/ordo/lib/note-guards.mjs\`.

| | |
|---|---|
| Апублікаваных заўваг | ${notes.length} |
| Выпраўлена аўтаматычна (месяц / шчыльнасць) | ${fixed.length} |
| Дакладная дата / год (у т.л. ${split.length} падзеленых па днях) | ${yearInstances.length} |
| Кананічныя правілы (І чацвер / пятніца / субота) | ${canonical.length} |
| Схавана да праверкі (не публікуюцца) | ${review.length} |
| Апублікавана з пазнакай NEEDS_REVIEW | ${manual.length} |

## Coverage by diocese

«Уласныя» — заўвагі, якія назіраліся ў календары дыяцэзіі; «бачныя» — разам з агульнабеларускімі.
Агульныя заўвагі (front matter Гродна / Пінск) аднаўляюцца \`scripts/ordo/lib/general-notes.mjs\`;
прапушчаныя абзацы — з прычынай (табліцы, правілы першынства, якія лічыць engine, абавязак Імшы
«pro populo», індэксы, грошы/ахвяраванні, персанальныя даныя духавенства). Тамы Лекцыянарыя /
Літургіі гадзін — асобная катэгорыя \`books\` (метаданыя, не «Асаблівыя заўвагі»).

| Дыяцэзія | Уласныя | Бачныя | Агульныя заўвагі | Тамы (books) | NEEDS_REVIEW | Абзацаў front matter | Прапушчана front matter |
|---|---|---|---|---|---|---|---|
${coverageRows(notes, sources, generalSkipped).join('\n')}

Высокі працэнт супадзення з календарамі не лічыцца поспехам, калі «Чэрвеньскае набажэнства» паказваецца ў кастрычніку:
сэнс тэксту правяраецца асобна ад частаты.

## Fixed automatically

Месяц у тэксце («Чэрвеньскае…», «маёвыя…») або рэдкія выпадкі (чатыры чэрвеньскія нядзелі ≠ «кожная нядзеля Звычайнага перыяду»).

| Заўвага | Дыяцэзія | Селектар цяпер | Чаму |
|---|---|---|---|
${rows(fixed, (note) => `| ${note.text.slice(0, 70).replace(/\|/g, '/')} | ${note.scope.dioceseId || note.scope.dioceseIds?.join(', ')} | ${SELECTOR_LABEL(note.selector)} | ${note.guard} |`)}

## Promoted to recurring canonical rule

Першы чацвер, першая пятніца і першая субота месяца — адно правіла ўзроўню Беларусі кожнае
(\`provenance.kind: app-normalization\`), а не «Пінская дыяцэзія · 2026». Голыя дыяцэзіяльныя
копіі («І чацвер месяца.») выдалены; заўвагі з дадатковым зместам (Імша, набажэнства) засталіся.

| Правіла | Бачылі ў календарах |
|---|---|
${rows(canonical, (note) => `| ${note.text} | ${(note.provenance.observedIn || []).join(', ') || '—'} |`)}

## Kept exact-date / year-instance

Тэкст з датай («– у чацвер, 1 кастрычніка, — …», «01.I.2028») — толькі той дзень таго года.
Падобныя тэксты розных дзён, якія раней зліваліся ў адно «рэгулярнае» правіла, падзелены: ${split.length}.

| Тып | Колькасць |
|---|---|
${rows(count(yearInstances, (note) => note.guard ? 'падзелена па днях' : 'з крыніцы'), ([key, value]) => `| ${key} | ${value} |`)}

## Hidden pending review

Не публікуюцца (няма ў \`notes.json\` і Firestore).

| Тэкст | Селектар | Прычына | Даты |
|---|---|---|---|
${rows(review, (item) => `| ${String(item.text).slice(0, 70).replace(/\|/g, '/')} | ${SELECTOR_LABEL(item.selector)} | ${item.reason} | ${item.dates.slice(0, 3).join(', ')} |`)}

## Needs manual review

Апублікаваныя, але з пазнакай \`NEEDS_REVIEW\` (канкрэтны дзень, рэдкі выпадак).

| Тэкст | Селектар | Дыяцэзія |
|---|---|---|
${rows(manual, (note) => `| ${note.text.slice(0, 70).replace(/\|/g, '/')} | ${SELECTOR_LABEL(note.selector)} | ${note.scope.dioceseId || note.scope.dioceseIds?.join(', ')} |`)}
`;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Raw adapter output not found in ${path.relative(ROOT, RAW_DIR)}. Run: python3 scripts/ordo/extract.py`);
    process.exit(1);
  }
  const catalog = loadFixedCatalog(ROOT);
  const raws = DIOCESE_ORDER
    .map((diocese) => path.join(RAW_DIR, `${diocese}.json`))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

  // Diocesan proper sets need the rules first (Vitebsk proper calendar list).
  const firstPass = raws.map((raw) => normalizeSource(raw, { catalog, properSet: new Set() }));
  const properSets = Object.fromEntries(firstPass.map((source) => [source.diocese, properIds(source.rules, catalog, source.diocese)]));
  const sources = raws.map((raw) => normalizeSource(raw, { catalog, properSet: properSets[raw.source.diocese] }));
  sources.forEach((source) => properIds(source.rules, catalog, source.diocese));

  const generalSkipped = [];
  sources.forEach((source) => {
    const general = extractGeneralNotes(source);
    source.generalNotes = general.notes;
    generalSkipped.push(...general.skipped);
  });
  const { notes, allNotes, excludedParishNotes, candidates, review } = buildNotes(sources, catalog);
  const noteByItem = new Map(candidates.map((c) => [c.itemId, c.noteId]));
  const differences = buildDifferences(sources, catalog, properSets);

  const unresolved = { schemaVersion: SCHEMA_VERSION, fragments: [], missingDays: [], unmappedCelebrations: [], reviewItems: [] };
  const unmapped = new Map();

  sources.forEach((source, index) => {
    const raw = raws[index];
    const diocese = source.diocese;
    source.days.forEach((day) => day.notes.forEach((note) => {
      if (noteByItem.has(note.id)) note.noteId = noteByItem.get(note.id);
      note.classification = allNotes.find((n) => n.id === note.noteId)?.classification || CLASSIFICATION.REVIEW;
    }));
    source.announcements.forEach((item) => { if (noteByItem.has(item.id)) item.noteId = noteByItem.get(item.id); });
    source.rules.forEach((item) => { if (noteByItem.has(item.id)) item.noteId = noteByItem.get(item.id); });

    source.days.forEach((day) => day.celebrations.forEach((c) => {
      delete c.rankNormalized;
      if (c.identity) return;
      const key = `${diocese}|${c.title}`;
      if (!unmapped.has(key)) unmapped.set(key, { diocese, title: c.title, rank: c.rank, role: c.role, dates: [], itemIds: [], evidence: c.evidence });
      const entry = unmapped.get(key);
      entry.dates.push(day.date);
      entry.itemIds.push(c.id);
    }));
    raw.unresolved.forEach((item) => unresolved.fragments.push({ diocese, ...item }));
    missingDays(source.days).forEach((date) => unresolved.missingDays.push({ diocese, date, liturgical: alignDate(date).periodDayId }));
    source.days.forEach((day) => day.celebrations
      .filter((c) => c.classification === CLASSIFICATION.REVIEW && c.identity)
      .forEach((c) => unresolved.reviewItems.push({
        diocese, itemId: c.id, date: day.date, title: c.title, rank: c.rank,
        identity: c.identity.id, mybrevRank: c.identity.mybrevRank || null, reason: c.identity.dateMismatch ? 'movable-date-mismatch' : 'rank-differs-from-mybrev',
      })));

    const itemsCount = source.days.reduce((sum, d) => sum + d.celebrations.length + d.readings.length + d.mass.length + (d.office ? 1 : 0) + d.notes.length, 0);
    const classificationCounts = countBy([
      ...source.days.flatMap((d) => [...d.celebrations, ...d.notes, ...d.mass, ...(d.office ? [d.office] : [])]),
      ...source.rules, ...source.announcements,
    ], 'classification');
    const evidence = {
      schemaVersion: SCHEMA_VERSION,
      source: raw.source,
      stats: {
        days: source.days.length,
        previewDays: source.days.filter((d) => d.preview).length,
        items: itemsCount + source.rules.length + source.announcements.length,
        celebrations: source.days.reduce((s, d) => s + d.celebrations.length, 0),
        readings: source.days.reduce((s, d) => s + d.readings.length, 0),
        massDescriptors: source.days.reduce((s, d) => s + d.mass.length, 0),
        officeDescriptors: source.days.filter((d) => d.office).length,
        notes: source.days.reduce((s, d) => s + d.notes.length, 0),
        rules: source.rules.length,
        announcements: source.announcements.length,
        noteCategories: countBy(source.days.flatMap((d) => d.notes), 'category'),
        classification: classificationCounts,
        excluded: countBy(raw.excluded, 'category'),
        skipped: countBy(raw.skipped, 'reason'),
        unresolved: raw.unresolved.length,
      },
      days: source.days,
      rules: source.rules,
      announcements: source.announcements,
      excluded: raw.excluded.map((item) => ({ category: item.category, ...item.evidence })),
    };
    write(path.join(OUT_DIR, 'evidence', `${diocese}.json`), evidence);
  });

  unresolved.unmappedCelebrations = [...unmapped.values()]
    .map((entry) => ({ ...entry, dates: entry.dates.slice(0, 6), itemIds: entry.itemIds.slice(0, 6), occurrences: entry.dates.length }))
    .sort((a, b) => DIOCESE_ORDER.indexOf(a.diocese) - DIOCESE_ORDER.indexOf(b.diocese) || a.title.localeCompare(b.title));
  unresolved.summary = {
    fragments: countBy(unresolved.fragments, 'reason'),
    missingDays: unresolved.missingDays.length,
    unmappedCelebrations: countBy(unresolved.unmappedCelebrations, 'diocese'),
    reviewItems: countBy(unresolved.reviewItems, 'reason'),
  };

  write(path.join(OUT_DIR, 'notes.json'), {
    schemaVersion: SCHEMA_VERSION,
    // Publication number of `liturgicalOrdoNotes`; raise it when the notes change.
    revision: NOTES_REVISION,
    sources: raws.map((raw) => ({ diocese: raw.source.diocese, file: raw.source.file, coverage: raw.source.coverage })),
    summary: {
      notes: notes.length,
      excludedParishNotes,
      byClassification: countBy(notes, 'classification'),
      byCategory: countBy(notes, 'category'),
      bySelector: countBy(notes, (n) => n.selector.type),
      byScope: countBy(notes, (n) => n.scope.level),
      byConfidence: countBy(notes, 'confidence'),
    },
    notes,
  });
  fs.writeFileSync(path.join(ROOT, 'docs', 'ordo-notes-audit.md'), renderNotesAudit({
    notes, review, revision: NOTES_REVISION, sources, generalSkipped,
  }));
  fs.mkdirSync(path.join(ROOT, 'reports', 'liturgy'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'reports', 'liturgy', 'notes-review.json'), `${JSON.stringify({ revision: NOTES_REVISION, review }, null, 1)}\n`);
  write(path.join(OUT_DIR, 'diocesan-differences.json'), { schemaVersion: SCHEMA_VERSION, ...differences });
  write(path.join(OUT_DIR, 'unresolved.json'), unresolved);

  console.log(`catalog: ${catalog.length} fixed identities`);
  sources.forEach((source) => console.log(`${source.diocese}: ${source.days.length} days, ${source.rules.length} rules, ${source.announcements.length} announcements`));
  console.log(`notes: ${notes.length}`, countBy(notes, 'classification'));
  console.log('differences:', differences.summary);
  console.log('unresolved:', unresolved.summary);
}

main();
