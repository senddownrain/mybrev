#!/usr/bin/env node
/**
 * Fixed feasts → sparse import artifacts.
 *
 *   patchs/feasts               proper texts (source of truth, never generated)
 *   patchs/feasts/common-texts  reusable Common texts (source of truth)
 *   calendar definitions        identity of every celebration
 *        ↓
 *   patchs/db-feasts            one sparse `days` document per celebration  (GENERATED)
 *   patchs/db-templates         `liturgicalTemplates` documents             (GENERATED)
 *   reports/db-feasts-generation-report.json, docs/ordo-feast-content-report.md
 *
 * A feast document keeps only its own texts and structured `_fieldRules`;
 * the Common is not copied into it and no `from-day` placeholder is written.
 * Several `_templates` do not create several documents: `_defaultTemplate`
 * names the default and the runtime assembles the Office
 * (`src/utils/ordo/officeAssembly.js`). Do not edit the generated folders.
 *
 *   npm run generate:fixed-feasts                          # from the cached Firestore reads
 *   npm run generate:fixed-feasts -- --refresh-first-week  # re-read days/ordinary-w5-d1
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import {
  buildFixedComparisonKey,
  normalizeFixedDate,
  normalizePlaces,
  normalizeRank,
} from '../src/utils/fixedFeasts.js';
import {
  COMPLEMENTARY_PSALMODY_TEMPLATE, FIRST_VESPER_FIELDS, OFFICE_CONTENT_FIELDS, OFFICE_TEXT_FIELDS, SPARSE_DAY_SCHEMA,
  SUNDAY_WEEK_1_TEMPLATE, TE_DEUM_FIELD,
} from '../src/constants/officeFields.js';
import { hasFirstVespers, inferTemplates, isEmptyValue, splitSource } from '../scripts/lib/feast-content.mjs';
import { scaffoldDecision } from '../scripts/lib/scaffold-commons.mjs';
import { SEASONAL_VARIANTS_FIELD, validateSeasonalVariants } from '../src/utils/ordo/commonSeasons.js';

const CONTENT_FIELDS = OFFICE_CONTENT_FIELDS;
/** Prayers that are the Office of Readings prayer when the Proper has only that one (final phase recheck §19). */
const PRAYER_FOLLOWS_OFFICE_OF_READINGS = ['laudesPr', 'vesperPr'];
const CONTENT_FIELD_SET = new Set(CONTENT_FIELDS);
const isEmpty = isEmptyValue;

const ROOT = process.cwd();
const FEASTS_DIR = path.join(ROOT, 'patchs', 'feasts');
const COMMON_TEXTS_DIR = path.join(FEASTS_DIR, 'common-texts');
const OUTPUT_DIR = path.join(ROOT, 'patchs', 'db-feasts');
const TEMPLATES_OUTPUT_DIR = path.join(ROOT, 'patchs', 'db-templates');
const DEFINITIONS_PATH = path.join(ROOT, 'src', 'data', 'ordo', 'calendar-definitions.json');
const MARKDOWN_REPORT_PATH = path.join(ROOT, 'docs', 'ordo-feast-content-report.md');
const CONTENT_INDEX_PATH = path.join(ROOT, 'src', 'data', 'ordo', 'feast-content-index.json');
const FIRST_WEEK_CACHE = path.join(ROOT, 'patchs', 'json', 'ordinary-w5-d1-fixed-day.json');
// Verified Ps 120–128 (`scripts/liturgy/extract-complementary-psalmody.mjs`).
const COMPLEMENTARY_SOURCE = path.join(ROOT, 'patchs', 'json', 'complementary-psalmody.json');
const RANKED_FIXED_DAYS_CACHE = path.join(ROOT, 'patchs', 'json', 'ranked-fixed-days.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'db-feasts-generation-report.json');

const EXCLUDED_SOURCE_FILES = new Set([
  // Няпоўны дубль; поўны файл з уласнымі тэкстамі застаецца ў генерацыі.
  '20-09-sv-andrew-kim-paul-chong-companions.json',
]);

const SYNTHETIC_VARIANTS = Object.freeze({
  '05-06-sv-boniface.json': [
    {
      outputStem: '06-06-sv-boniface-vitebsk',
      overrides: { _date: '06.06', _rank: 'memoria-ad-libitum', _place: 'vitebsk' },
      reason: 'Віцебскі варыянт з fixedCalendar; тэксты агульнага ўспаміну св. Баніфацыя',
    },
  ],
  '02-07-our-lady-budslav-minsk.json': [
    {
      outputStem: '02-07-our-lady-budslav',
      overrides: { _rank: 'memoria-ad-libitum', _place: undefined },
      reason: 'Агульны варыянт з fixedCalendar; тэксты мінскага варыянта',
    },
  ],
  '05-07-our-lady-trakai-grodno.json': [
    {
      outputStem: '05-07-our-lady-trakai-grodno-memoria-ad-libitum',
      overrides: { _rank: 'memoria-ad-libitum' },
      reason: 'Дадатковы ранг з fixedCalendar; тэксты гродзенскага ўспаміну',
    },
  ],
  '16-07-our-lady-mount-carmel.json': [
    {
      outputStem: '16-07-our-lady-mount-carmel',
      overrides: { _rank: 'memoria-ad-libitum', _place: undefined },
      reason: 'Агульны варыянт з fixedCalendar; тэксты мясцовага ўспаміну',
    },
  ],
});

const FIXED_DAY_SLUGS = Object.freeze({
  '01.01-solemnity-none': 'holy-mary-mother-of-god',
  '01.11-solemnity-none': 'all-saints',
  '02.02-feast-none': 'presentation-lord',
  '03.05-festum-none': 'sv-philip-james-apostles',
  '06.01-solemnitas-none': 'epiphany-lord',
  '06.08-feast-none': 'transfiguration-lord',
  '14.09-feast-none': 'exaltation-holy-cross',
  '15.08-solemnitas-none': 'assumption-blessed-virgin-mary',
  '19.03-solemnitas-none': 'sv-joseph',
  '24.06-solemnity-none': 'nativity-john-baptist',
  '25.03-solemnitas-none': 'annunciation-lord',
  '25.04-festum-none': 'sv-mark-evangelist',
  '29.06-solemnity-none': 'sv-peter-paul-apostles',
  '31.05-feast-none': 'visitation-blessed-virgin-mary',
});

function applyFixedDayFallback(source, rankedFixedDays) {
  const firestoreId = source.raw._copyFromFixedDay;
  if (!firestoreId) return { ...source, fallback: null };

  const fixedDay = rankedFixedDays.find((item) => item._firestoreId === firestoreId);
  if (!fixedDay) {
    return { ...source, fallback: { firestoreId, missing: true, fields: [] } };
  }

  const raw = { ...source.raw };
  const fields = [];
  CONTENT_FIELDS.forEach((field) => {
    if (isEmpty(raw[field]) && !isEmpty(fixedDay[field])) {
      raw[field] = fixedDay[field];
      fields.push(field);
    }
  });
  return { ...source, raw, fallback: { firestoreId, missing: false, fields } };
}

function slugifyFeastName(value) {
  const transliteration = {
    а: 'a', б: 'b', в: 'v', г: 'h', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
    і: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ў: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ъ: '', щ: 'shch', и: 'i',
  };
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .split('')
    .map((character) => transliteration[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function fetchFirstWeekDay() {
  const [{ default: admin }, serviceAccount] = await Promise.all([
    import('firebase-admin'),
    readJson(path.join(ROOT, 'patchs', 'serviceAccountKey.json')),
  ]);
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  try {
    const snapshot = await app.firestore().collection('days').doc('ordinary-w5-d1').get();
    if (!snapshot.exists) throw new Error('days/ordinary-w5-d1 does not exist');
    return { _id: snapshot.id, ...snapshot.data() };
  } finally {
    await app.delete();
  }
}

async function loadFirstWeekDay() {
  const refresh = process.argv.includes('--refresh-first-week');
  if (!refresh) {
    try {
      return await readJson(FIRST_WEEK_CACHE);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const day = await fetchFirstWeekDay();
  await fs.mkdir(path.dirname(FIRST_WEEK_CACHE), { recursive: true });
  await fs.writeFile(FIRST_WEEK_CACHE, `${JSON.stringify(day, null, 2)}\n`, 'utf8');
  return day;
}

async function fetchRankedFixedDays() {
  const [{ default: admin }, serviceAccount] = await Promise.all([
    import('firebase-admin'),
    readJson(path.join(ROOT, 'patchs', 'serviceAccountKey.json')),
  ]);
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  try {
    const snapshot = await app.firestore().collection('days').where('_rank', '!=', null).get();
    return snapshot.docs
      .map((doc) => ({ _firestoreId: doc.id, ...doc.data() }))
      .sort((left, right) => left._firestoreId.localeCompare(right._firestoreId));
  } finally {
    await app.delete();
  }
}

async function loadRankedFixedDays() {
  const refresh = process.argv.includes('--refresh-ranked-fixed-days');
  if (!refresh) {
    try {
      const cache = await readJson(RANKED_FIXED_DAYS_CACHE);
      return Array.isArray(cache) ? cache : cache.documents;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const documents = await fetchRankedFixedDays();
  await fs.mkdir(path.dirname(RANKED_FIXED_DAYS_CACHE), { recursive: true });
  await fs.writeFile(RANKED_FIXED_DAYS_CACHE, `${JSON.stringify({
    collection: 'days',
    query: '_rank != null',
    documents,
  }, null, 2)}\n`, 'utf8');
  return documents;
}

function expandSourceVariants({ file, raw }) {
  const sourceStem = path.basename(file, '.json');
  const places = normalizePlaces(raw._place);
  const baseVariants = places.length > 1
    ? places.map((place) => ({
      file,
      outputStem: `${sourceStem}--${place}`,
      raw: { ...raw, _place: place },
      kind: 'place',
    }))
    : [{ file, outputStem: sourceStem, raw, kind: 'source' }];
  const syntheticVariants = (SYNTHETIC_VARIANTS[file] || []).map((variant) => ({
    file,
    outputStem: variant.outputStem,
    raw: { ...raw, ...variant.overrides },
    kind: 'synthetic',
    reason: variant.reason,
  }));
  return [...baseVariants, ...syntheticVariants];
}

function selectMissingRankedFixedDays(documents, missingEntries) {
  const missingCounts = new Map();
  missingEntries.forEach((item) => {
    const key = item.key || buildFixedComparisonKey(item);
    missingCounts.set(key, (missingCounts.get(key) || 0) + 1);
  });

  const selected = [];
  const alreadyCovered = [];
  documents.forEach((document) => {
    const key = buildFixedComparisonKey(document);
    const count = missingCounts.get(key) || 0;
    const datePart = normalizeFixedDate(document._date).replace('.', '-');
    const placePart = normalizePlaces(document._place).join('-');
    const feastSlug = FIXED_DAY_SLUGS[document._firestoreId]
      || slugifyFeastName(document._feastName)
      || normalizeRank(document._rank);
    const outputStem = [datePart, feastSlug, placePart].filter(Boolean).join('-');
    const variant = {
      file: `days/${document._firestoreId}`,
      outputStem,
      raw: document,
      kind: 'days',
      firestoreId: document._firestoreId,
    };
    if (count > 0) {
      selected.push(variant);
      missingCounts.set(key, count - 1);
    } else {
      alreadyCovered.push(variant);
    }
  });
  return { selected, alreadyCovered };
}

function dimensionalDifference(left, right, mapEntry) {
  const rightCounts = new Map();
  right.forEach((item) => {
    const key = buildFixedComparisonKey(item);
    rightCounts.set(key, (rightCounts.get(key) || 0) + 1);
  });

  return left.flatMap((item) => {
    const key = buildFixedComparisonKey(item);
    const count = rightCounts.get(key) || 0;
    if (count > 0) {
      rightCounts.set(key, count - 1);
      return [];
    }
    return [mapEntry(item, key)];
  });
}

function buildCalendarReport(calendarEntries, sourceVariants) {
  const sourceRows = sourceVariants.map(({ file, outputStem, raw }) => ({
    ...raw,
    file: `${outputStem}.json`,
    sourceFile: file,
    raw,
  }));
  const missingInFeasts = dimensionalDifference(
    calendarEntries,
    sourceRows,
    (item, key) => ({
      key,
      _date: normalizeFixedDate(item.date),
      _rank: normalizeRank(item.rank),
      ...(normalizePlaces(item.place).length ? { _place: normalizePlaces(item.place) } : {}),
      _feastName: item.title,
    }),
  );
  const extraInFeasts = dimensionalDifference(
    sourceRows,
    calendarEntries,
    (item, key) => ({
      key,
      file: item.file,
      sourceFile: item.sourceFile,
      _date: normalizeFixedDate(item.raw._date),
      _rank: normalizeRank(item.raw._rank),
      ...(normalizePlaces(item.raw._place).length ? { _place: normalizePlaces(item.raw._place) } : {}),
      _feastName: item.raw._feastName,
    }),
  );
  return { missingInFeasts, extraInFeasts };
}


const TEMPLATE_TITLES = Object.freeze({
  'sunday-week-1': 'Нядзеля І тыдня псалтыра',
  'complementary-psalmody': 'Дадатковая псалмодыя (Пс 120–128)',
  'office-for-dead': 'Афіцый за памерлых',
});

const PLACE_IN_STEM = /-(?:minsk-mohilev|minsk|vitebsk|grodno|pinsk|diocese)(?=$|-)/g;

/** Celebration id shared with the Ordo identities (`scripts/ordo/lib/identity.mjs`). */
function celebrationIdOf(stem) {
  return String(stem)
    .replace(/^\d{2}-\d{2}-/, '')
    .replace(/--.*$/, '')
    .replace(/-memoria-ad-libitum$/, '')
    .replace(PLACE_IN_STEM, '')
    .replace(/-+$/, '');
}

function mergeReports(target, source) {
  ['normalized', 'unresolved', 'invalidRules'].forEach((key) => target[key].push(...(source[key] || [])));
}

/** One sparse document of a celebration. */
function buildSparseOutput({ sourceFile, outputStem, source, kind, templates, report }) {
  const outputFile = `${outputStem}.json`;
  const places = normalizePlaces(source._place);
  const rank = normalizeRank(source._rank);
  const date = normalizeFixedDate(source._date);
  const sourceTemplates = (Array.isArray(source._templates) ? source._templates : []).filter(Boolean);
  sourceTemplates.filter((name) => !templates.has(name)).forEach((name) => report.missingTemplates.push({ file: sourceFile, template: name }));
  const knownTemplates = sourceTemplates.filter((name) => templates.has(name));

  // Documents recovered from `days` already carry their Common and legacy
  // `from-day` markers: the markers are dropped, the texts stay as they are.
  const { texts, rules, report: fieldReport } = splitSource(source, { file: outputFile });
  mergeReports(report, fieldReport);
  if (kind === 'days') {
    const dropped = Object.entries(rules).filter(([, rule]) => rule.source === 'current-day').map(([field]) => field);
    dropped.forEach((field) => delete rules[field]);
    if (dropped.length) report.droppedPlaceholders.push({ file: outputFile, fields: dropped });
  }
  // The saint's prayer is ONE prayer of the Office: in every Belarusian source page the Office of
  // Readings prayer is the Lauds prayer (and, outside a feast's own Vespers, the Vespers prayer). A
  // Proper that carries it only under the Office of Readings therefore has it at Lauds and Vespers
  // too — otherwise the Common's «Калі няма ўласнай малітвы…» would replace the own prayer there.
  PRAYER_FOLLOWS_OFFICE_OF_READINGS.forEach((field) => {
    if ('officeOfReadingsPr' in texts && !(field in texts) && !(field in rules)) rules[field] = { ref: 'officeOfReadingsPr' };
  });
  if (source._omitFirstVespers) FIRST_VESPER_FIELDS.forEach((field) => { delete texts[field]; delete rules[field]; });
  if (source._omitTeDeum) delete texts[TE_DEUM_FIELD];

  const ownTextFields = OFFICE_TEXT_FIELDS.filter((field) => field in texts);
  const legacyIds = kind === 'days'
    ? [source._firestoreId]
    : (knownTemplates.length > 1 ? knownTemplates.map((name) => `${outputStem}--${name}`) : [outputStem]);
  const defaultTemplate = knownTemplates.includes(source._currentVersion) ? source._currentVersion : knownTemplates[0];

  const output = {
    _id: outputStem,
    _schema: SPARSE_DAY_SCHEMA,
    _celebrationId: celebrationIdOf(outputStem),
    _date: date,
    _rank: rank,
    ...(places.length === 1 ? { _place: places[0] } : {}),
    ...(places.length > 1 ? { _place: places } : {}),
    _feastName: String(source._feastName ?? '').trim(),
    _templates: knownTemplates,
    ...(defaultTemplate ? { _defaultTemplate: defaultTemplate } : {}),
    ...(legacyIds.some((id) => id !== outputStem) ? { _legacyIds: legacyIds.filter((id) => id !== outputStem) } : {}),
    ...(source._omitFirstVespers ? { _omitFirstVespers: true } : {}),
    ...(source._omitTeDeum ? { _omitTeDeum: true } : {}),
    _contentStatus: {
      hours: ownTextFields.length ? 'proper' : (knownTemplates.length ? 'common-only' : 'day-fallback'),
    },
    ...(source.feastComment !== undefined ? { feastComment: source.feastComment } : {}),
  };
  Object.entries(source).forEach(([key, value]) => {
    if (!key.startsWith('_') && key !== 'feastComment' && !CONTENT_FIELD_SET.has(key)) output[key] = value;
  });
  CONTENT_FIELDS.forEach((field) => { if (field in texts) output[field] = texts[field]; });
  if (Object.keys(rules).length) {
    output._fieldRules = Object.fromEntries(CONTENT_FIELDS.filter((field) => field in rules).map((field) => [field, rules[field]]));
  }

  if (!date || !rank || !output._feastName) {
    report.invalidOutputs.push({
      file: outputFile,
      problems: [
        ...(!date ? ['invalid _date'] : []),
        ...(!rank ? ['invalid _rank'] : []),
        ...(!output._feastName ? ['missing _feastName'] : []),
      ],
    });
  }
  report.documents.push({
    file: outputFile,
    source: kind,
    celebrationId: output._celebrationId,
    templates: knownTemplates,
    ownFields: ownTextFields.length,
    rules: Object.keys(rules).length,
    firstVespers: hasFirstVespers(texts, rules),
    hours: output._contentStatus.hours,
  });
  return { outputFile, output };
}

/**
 * Sparse seasonal deltas of a Common (`_seasonalVariants`, see
 * src/utils/ordo/commonSeasons.js). Copied as they are written in the source
 * (field order of OFFICE_CONTENT_FIELDS), validated; the flat base fields are untouched.
 */
function seasonalVariantsOf(id, raw, report) {
  const variants = raw[SEASONAL_VARIANTS_FIELD];
  if (variants === undefined) return {};
  const issues = validateSeasonalVariants({ _id: id, [SEASONAL_VARIANTS_FIELD]: variants });
  issues.forEach((issue) => report.invalidOutputs.push({ file: `common-texts/${id}.json`, ...issue }));
  const ordered = {};
  ['advent', 'christmas', 'lent', 'easter'].forEach((season) => {
    const delta = variants[season];
    if (!delta || typeof delta !== 'object') return;
    const fields = CONTENT_FIELDS.filter((field) => field in delta);
    if (fields.length) ordered[season] = Object.fromEntries(fields.map((field) => [field, delta[field]]));
  });
  report.seasonalVariants = (report.seasonalVariants || 0) + Object.values(ordered).reduce((total, delta) => total + Object.keys(delta).length, 0);
  return Object.keys(ordered).length ? { [SEASONAL_VARIANTS_FIELD]: ordered } : {};
}

/** `liturgicalTemplates` documents: the Commons and the Sunday, week I psalter. */
function buildTemplateOutputs({ templates, firstWeekDay, complementary, manifest, report }) {
  const titles = new Map((manifest.sections || []).map((item) => [item.file.replace(/\.json$/, ''), item.title]));
  const outputs = [...templates.entries()].map(([id, raw]) => {
    const { texts, rules, report: fieldReport } = splitSource(raw, { file: `common-texts/${id}.json` });
    mergeReports(report, fieldReport);
    return {
      outputFile: `${id}.json`,
      output: {
        _id: id,
        _schema: SPARSE_DAY_SCHEMA,
        _kind: 'common',
        title: titles.get(id) || TEMPLATE_TITLES[id] || id,
        ...Object.fromEntries(CONTENT_FIELDS.filter((field) => field in texts).map((field) => [field, texts[field]])),
        ...(Object.keys(rules).length ? { _fieldRules: Object.fromEntries(CONTENT_FIELDS.filter((field) => field in rules).map((field) => [field, rules[field]])) } : {}),
        ...seasonalVariantsOf(id, raw, report),
      },
    };
  });
  // «з нядзелі І тыдня»: an explicit reusable source, filled from the
  // verified `days/ordinary-w5-d1` (the same slot of the four-week psalter).
  const sunday = Object.fromEntries(CONTENT_FIELDS
    .filter((field) => !isEmpty(firstWeekDay[field]) && splitSource({ [field]: firstWeekDay[field] }).texts[field] !== undefined)
    .map((field) => [field, firstWeekDay[field]]));
  outputs.push({
    outputFile: `${SUNDAY_WEEK_1_TEMPLATE}.json`,
    output: {
      _id: SUNDAY_WEEK_1_TEMPLATE, _schema: SPARSE_DAY_SCHEMA, _kind: 'psalter', title: TEMPLATE_TITLES[SUNDAY_WEEK_1_TEMPLATE],
      _source: { collection: 'days', id: firstWeekDay._id || 'ordinary-w5-d1' },
      ...sunday,
    },
  });
  // Complementary psalmody of Daytime Prayer: Ps 120–128 only (the antiphons
  // stay with the celebration). Required wherever the Office descriptor names
  // `complementary`; the assembler never replaces it with the day.
  const { _id: complementaryId, _source: complementarySource, ...complementaryFields } = complementary;
  void complementaryId;
  outputs.push({
    outputFile: `${COMPLEMENTARY_PSALMODY_TEMPLATE}.json`,
    output: {
      _id: COMPLEMENTARY_PSALMODY_TEMPLATE, _schema: SPARSE_DAY_SCHEMA, _kind: 'psalter',
      title: TEMPLATE_TITLES[COMPLEMENTARY_PSALMODY_TEMPLATE],
      _source: complementarySource,
      ...complementaryFields,
    },
  });
  return outputs;
}

/** Fixed-date days whose Office is the Proper of Seasons (no fixed feast document). */
const PROPER_OF_SEASONS = new Set(['nativity-lord']);

const ddmm = (rule) => `${String(rule.day).padStart(2, '0')}.${String(rule.month).padStart(2, '0')}`;

/**
 * Celebrations of the calendar without any source text get a scaffold:
 * identity, date, rank, diocese, inferred Commons and `contentStatus` —
 * never invented proper texts.
 */
function buildScaffolds({ definitions, outputs, report }) {
  const covered = new Set();
  const key = (date, place, id) => `${date}|${place || '-'}|${id}`;
  outputs.forEach(({ output }) => {
    const places = normalizePlaces(output._place);
    (places.length ? places : ['']).forEach((place) => covered.add(key(output._date, place, output._celebrationId)));
  });
  // Texts kept under another date of the same diocese (a diocesan date change).
  const coveredAnyDate = new Set(outputs.flatMap(({ output }) => {
    const places = normalizePlaces(output._place);
    return (places.length ? places : ['']).map((place) => `${place || '-'}|${output._celebrationId}`);
  }));
  const scaffolds = [];
  const add = ({ id, title, rank, dateRule, place }) => {
    if (dateRule?.type !== 'fixed' || PROPER_OF_SEASONS.has(id)) return;
    const date = ddmm(dateRule);
    if (covered.has(key(date, place, id)) || (place && coveredAnyDate.has(`${place}|${id}`))) return;
    // A confirmed decision (scripts/lib/scaffold-commons.mjs) replaces the
    // inference from the title; it never adds texts.
    const decision = scaffoldDecision(id);
    const templates = decision ? [...decision.templates] : inferTemplates(title);
    const stem = [date.replace('.', '-'), id, place].filter(Boolean).join('-');
    covered.add(key(date, place, id));
    scaffolds.push({
      outputFile: `${stem}.json`,
      output: {
        _id: stem,
        _schema: SPARSE_DAY_SCHEMA,
        _celebrationId: id,
        _date: date,
        _rank: normalizeRank(rank),
        ...(place ? { _place: place } : {}),
        _feastName: title,
        _templates: templates,
        ...(templates.length ? { _defaultTemplate: templates[0] } : {}),
        ...(templates.length && !decision ? { _templatesInferred: true } : {}),
        ...(decision ? { _templatesConfirmed: true } : {}),
        ...(decision?.officeSource ? { _officeSource: decision.officeSource } : {}),
        _scaffold: true,
        _contentStatus: { hours: templates.length ? 'common-only' : 'day-fallback' },
      },
    });
    report.scaffolds.push({
      file: `${stem}.json`, celebrationId: id, _date: date, _rank: normalizeRank(rank), ...(place ? { _place: place } : {}), _feastName: title, templates,
      ...(decision ? { confirmed: true, officeSource: decision.officeSource || null, basis: decision.basis } : {}),
    });
  };
  // Coverage is decided by the source material only (never by `dayIds`, which
  // are derived from this output).
  definitions.celebrations.filter((doc) => doc.daysRef?.source === 'fixed')
    .forEach((doc) => add({ id: doc.id, title: doc.title, rank: doc.rank, dateRule: doc.dateRule, place: '' }));
  definitions.dioceseOverrides.filter((doc) => doc.action === 'add' && doc.daysRef?.source === 'fixed')
    .forEach((doc) => add({ id: doc.celebrationId, title: doc.title, rank: doc.rank, dateRule: doc.dateRule, place: doc.dioceseId }));
  return scaffolds;
}

function renderMarkdownReport(report) {
  const rows = (items, render) => (items.length ? items.map(render).join('\n') : '_няма_');
  const statusOf = (item) => (item.templates.length ? 'common-only' : 'day-fallback');
  const count = (status) => report.documents.filter((item) => item.hours === status).length
    + report.scaffolds.filter((item) => statusOf(item) === status).length;
  return `# Фіксаваныя святы: змест і прагалы

Згенеравана \`npm run generate:fixed-feasts\` — не рэдагаваць уручную.

| | |
|---|---|
| Крыніц у \`patchs/feasts\` | ${report.summary.feastSourceFiles} |
| Sparse-дакументаў у \`patchs/db-feasts\` | ${report.summary.generatedFiles} |
| з іх scaffolds (без уласных тэкстаў) | ${report.summary.scaffolds} |
| Templates у \`patchs/db-templates\` | ${report.summary.templateDocuments} |
| Дакументаў з некалькімі Commons (раней N копій) | ${report.summary.multipleTemplateSources} |
| Старых копій, якія замяняюцца (\`_legacyIds\`) | ${report.summary.legacyIdsReplaced} |
| Тэкставых указанняў → \`_fieldRules\` | ${report.summary.normalizedInstructions} |
| \`from-day\` placeholders, якіх больш няма | ${report.summary.droppedPlaceholderValues} |
| Нявырашаных спасылак | ${report.summary.unresolvedReferences} |

## Наяўнасць тэкстаў Hours

| Статус | Колькасць |
|---|---|
| \`proper\` — ёсць уласныя тэксты | ${count('proper')} |
| \`common-only\` — толькі агульныя тэксты | ${count('common-only')} |
| \`day-fallback\` — тэксты дня | ${count('day-fallback')} |

## Трэба дапісаць уручную (scaffolds)

Празднаванні, якія ёсць у календары, але не маюць файла ў \`patchs/feasts\`.
Яны паказваюцца ў Ordo і ў спісе варыянтаў дня; Афіцый збіраецца з агульных тэкстаў
або з дня.

| Дата | Празднаванне | Ранг | Дыяцэзія | Commons | Крыніца рашэння |
|---|---|---|---|---|---|
${rows(report.scaffolds, (item) => `| ${item._date} | ${item._feastName} | ${item._rank} | ${item._place || '—'} | ${item.templates.join(', ') || (item.officeSource === 'current-day' ? 'няма: Афіцый дня' : '—')} | ${item.confirmed ? 'пацверджана' : 'выведзена з назвы'} |`)}

## Нявырашаныя спасылкі ў крыніцах

Значэнне не з'яўляецца тэкстам і не распазнана як структураванае ўказанне; поле
лічыцца адсутным (дазволены fallback па Office descriptor).

| Файл | Поле | Значэнне |
|---|---|---|
${rows(report.unresolved, (item) => `| ${item.file} | ${item.field} | ${JSON.stringify(item.value)} |`)}

## Нармалізаваныя ўказанні

| Указанне | Правіла | Разоў |
|---|---|---|
${rows(report.normalizedSummary, (item) => `| ${item.from} | \`${item.rule}\` | ${item.count} |`)}
`;
}

async function main() {
  const [firstWeekDay, rankedFixedDays, complementary] = await Promise.all([
    loadFirstWeekDay(),
    loadRankedFixedDays(),
    readJson(COMPLEMENTARY_SOURCE),
  ]);
  const definitions = await readJson(DEFINITIONS_PATH);
  const allSourceFiles = (await fs.readdir(FEASTS_DIR)).filter((name) => name.endsWith('.json')).sort();
  const sourceFiles = allSourceFiles.filter((name) => !EXCLUDED_SOURCE_FILES.has(name));
  const templateFiles = (await fs.readdir(COMMON_TEXTS_DIR))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .sort();
  const templates = new Map(await Promise.all(templateFiles.map(async (file) => [
    path.basename(file, '.json'),
    await readJson(path.join(COMMON_TEXTS_DIR, file)),
  ])));
  const manifest = await readJson(path.join(COMMON_TEXTS_DIR, 'manifest.json'));
  const rawSources = await Promise.all(sourceFiles.map(async (file) => ({
    file,
    raw: await readJson(path.join(FEASTS_DIR, file)),
  })));
  const sources = rawSources.map((source) => applyFixedDayFallback(source, rankedFixedDays));
  const feastSourceVariants = sources.flatMap(expandSourceVariants);

  const calendarEntries = fixedCalendar;
  const feastOnlyCalendarReport = buildCalendarReport(calendarEntries, feastSourceVariants);
  const rankedFixedDaySelection = selectMissingRankedFixedDays(rankedFixedDays, feastOnlyCalendarReport.missingInFeasts);
  const sourceVariants = [...feastSourceVariants, ...rankedFixedDaySelection.selected];
  const report = {
    generatedAt: new Date().toISOString(),
    rules: {
      model: 'one sparse document per celebration (_schema 2): own texts + _fieldRules; the Common is never copied in',
      templates: 'common-texts and the Sunday week I psalter are separate liturgicalTemplates documents',
      multipleTemplates: 'one document with _templates and _defaultTemplate; former per-template copies are listed in _legacyIds',
      instructions: 'Belarusian and legacy textual instructions become structured _fieldRules (ref / source / template)',
      fromDay: 'no from-day placeholder is written: an absent field falls back through the Office descriptor',
      teDeum: 'every non-empty value becomes boolean true; _omitTeDeum keeps the hymn away',
      multiplePlaces: 'one output per place; a place code is appended to the output filename',
      rankAndPlaceVariants: 'existing feast texts are copied into explicitly configured rank/place variants',
      rankedFixedDays: 'days documents with _rank are used only when their date/rank/place key has no feast source; their texts are kept as stored',
      scaffolds: 'calendar celebrations without any source get identity + contentStatus, never invented texts',
    },
    summary: {},
    ...buildCalendarReport(calendarEntries, sourceVariants),
    excludedSources: allSourceFiles.filter((file) => EXCLUDED_SOURCE_FILES.has(file)).map((file) => ({ file, reason: 'incomplete duplicate' })),
    syntheticVariants: sourceVariants.filter(({ kind }) => kind === 'synthetic').map(({ file, outputStem, reason }) => ({ sourceFile: file, outputFileBase: `${outputStem}.json`, reason })),
    recoveredFromFixedDays: rankedFixedDaySelection.selected.map(({ firestoreId, outputStem }) => ({ firestoreId, outputFileBase: `${outputStem}.json` })),
    fixedDayFallbacks: sources.filter(({ fallback }) => fallback).map(({ file, fallback }) => ({ file, ...fallback })),
    missingTemplates: [],
    normalized: [],
    unresolved: [],
    invalidRules: [],
    droppedPlaceholders: [],
    invalidOutputs: [],
    documents: [],
    scaffolds: [],
  };

  const outputs = sourceVariants.map(({ file, outputStem, raw, kind }) => buildSparseOutput({
    sourceFile: file, outputStem, source: raw, kind, templates, report,
  }));
  const scaffolds = buildScaffolds({ definitions, outputs, report });
  const templateOutputs = buildTemplateOutputs({ templates, firstWeekDay, complementary, manifest, report });
  const allOutputs = [...outputs, ...scaffolds];

  const outputIds = new Map();
  allOutputs.forEach(({ outputFile, output }) => outputIds.set(output._id, [...(outputIds.get(output._id) || []), outputFile]));
  report.duplicateIds = [...outputIds.entries()].filter(([, files]) => files.length > 1).map(([_id, files]) => ({ _id, files }));

  for (const [dir, list] of [[OUTPUT_DIR, allOutputs], [TEMPLATES_OUTPUT_DIR, templateOutputs]]) {
    await fs.mkdir(dir, { recursive: true });
    const old = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
    await Promise.all(old.map((name) => fs.unlink(path.join(dir, name))));
    await Promise.all(list.map(({ outputFile, output }) => (
      fs.writeFile(path.join(dir, outputFile), `${JSON.stringify(output, null, 2)}\n`, 'utf8')
    )));
  }

  // Placeholders of the legacy model that no longer exist: every content
  // field a document does not carry itself.
  const legacyPlaceholders = outputs.reduce((total, { output }) => total
    + OFFICE_TEXT_FIELDS.filter((field) => !(field in output) && !(output._fieldRules && field in output._fieldRules)).length, 0);
  const normalizedCounts = new Map();
  report.normalized.forEach(({ from, rule }) => {
    const key = `${Array.isArray(from) ? from.join(' | ') : from}\u0000${JSON.stringify(rule)}`;
    normalizedCounts.set(key, (normalizedCounts.get(key) || 0) + 1);
  });
  report.normalizedSummary = [...normalizedCounts.entries()]
    .map(([key, count]) => ({ from: key.split('\u0000')[0], rule: key.split('\u0000')[1], count }))
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  report.summary = {
    fixedCalendarEntries: fixedCalendar.length,
    availableFeastSourceFiles: allSourceFiles.length,
    feastSourceFiles: sources.length,
    logicalSourceVariants: sourceVariants.length,
    syntheticVariants: report.syntheticVariants.length,
    recoveredFromFixedDays: report.recoveredFromFixedDays.length,
    commonTextTemplates: templates.size,
    templateDocuments: templateOutputs.length,
    seasonalVariantFields: report.seasonalVariants || 0,
    generatedFiles: allOutputs.length,
    scaffolds: scaffolds.length,
    multipleTemplateSources: outputs.filter(({ output }) => output._templates.length > 1).length,
    legacyIdsReplaced: outputs.reduce((total, { output }) => total + (output._legacyIds?.length || 0), 0),
    missingInFeasts: report.missingInFeasts.length,
    extraInFeasts: report.extraInFeasts.length,
    normalizedInstructions: report.normalized.length,
    unresolvedReferences: report.unresolved.length,
    invalidRules: report.invalidRules.length,
    droppedPlaceholderValues: legacyPlaceholders,
    invalidOutputs: report.invalidOutputs.length,
    duplicateIds: report.duplicateIds.length,
  };

  // Identity index for the calendar definitions: which document carries a
  // celebration, its Commons and how much own content it has.
  const index = {};
  allOutputs.forEach(({ output }) => {
    const places = normalizePlaces(output._place);
    const record = {
      dayId: output._id,
      ...(output._legacyIds ? { legacyIds: output._legacyIds } : {}),
      templates: output._templates,
      ...(output._defaultTemplate ? { defaultTemplate: output._defaultTemplate } : {}),
      hours: output._contentStatus.hours,
      ...(output._scaffold ? { scaffold: true } : {}),
    };
    (places.length ? places : ['-']).forEach((place) => {
      index[`${output._date}|${place}|${output._celebrationId}|${output._rank}`] = record;
    });
  });
  const indexText = `{\n${Object.keys(index).sort().map((key) => ` ${JSON.stringify(key)}: ${JSON.stringify(index[key])}`).join(',\n')}\n}\n`;
  await fs.writeFile(CONTENT_INDEX_PATH, indexText, 'utf8');

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(MARKDOWN_REPORT_PATH, renderMarkdownReport(report), 'utf8');
  console.log(JSON.stringify({ outputDir: OUTPUT_DIR, templatesDir: TEMPLATES_OUTPUT_DIR, reportPath: REPORT_PATH, ...report.summary }, null, 2));

  if (report.missingTemplates.length || report.invalidOutputs.length || report.duplicateIds.length || report.invalidRules.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
