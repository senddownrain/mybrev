#!/usr/bin/env node

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

const ROOT = process.cwd();
const FEASTS_DIR = path.join(ROOT, 'patchs', 'feasts');
const COMMON_TEXTS_DIR = path.join(FEASTS_DIR, 'common-texts');
const OUTPUT_DIR = path.join(ROOT, 'patchs', 'db-feasts');
const FIRST_WEEK_CACHE = path.join(ROOT, 'patchs', 'json', 'ordinary-w5-d1-fixed-day.json');
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

const BASE_FIELDS = Object.freeze([
  'invitatoriumAnt',
  'feastComment',
  'officeOfReadingsHymn',
  'officeOfReadingsAnt1',
  'officeOfReadingsAnt2',
  'officeOfReadingsAnt3',
  'officeOfReadingsPs1',
  'officeOfReadingsPs2',
  'officeOfReadingsPs3',
  'officeOfReadingsVers',
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsTeDeum',
  'officeOfReadingsPr',
  'laudesHymn',
  'laudesAnt1',
  'laudesAnt2',
  'laudesAnt3',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'laudesR',
  'laudesAntBen',
  'laudesInter',
  'laudesPr',
  'sext1Hymn',
  'sext1Ant1',
  'sext1Ant2',
  'sext1Ant3',
  'sext1Ps1',
  'sext1Ps2',
  'sext1Ps3',
  'sext1R',
  'sext1Pr',
  'sext2Hymn',
  'sext2Ant1',
  'sext2Ant2',
  'sext2Ant3',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'sext2R',
  'sext2Pr',
  'sext3Hymn',
  'sext3Ant1',
  'sext3Ant2',
  'sext3Ant3',
  'sext3Ps1',
  'sext3Ps2',
  'sext3Ps3',
  'sext3R',
  'sext3Pr',
  'vesperHymn',
  'vesperAnt1',
  'vesperAnt2',
  'vesperAnt3',
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
  'vesperR',
  'vesperAntMag',
  'vesperInter',
  'vesperPr',
]);

const FIRST_VESPER_FIELDS = Object.freeze([
  'vesper1Hymn',
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
]);

const CONTENT_FIELDS = Object.freeze([...BASE_FIELDS, ...FIRST_VESPER_FIELDS]);
const CONTENT_FIELD_SET = new Set(CONTENT_FIELDS);

function isEmpty(value) {
  return value === undefined
    || value === null
    || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function containsFromReference(value) {
  return typeof value === 'string' && /\bfrom(?:-[a-z]+)+\b/i.test(value);
}

function isCurrentDayPsalmsInstruction(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => typeof item === 'string'
    && item.toLocaleLowerCase('be').includes('антыфоны і псальмы з бягучага дня'));
}

function getSingleInstruction(value) {
  const instruction = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return typeof instruction === 'string'
    ? instruction.trim().replace(/\s+/g, ' ').toLocaleLowerCase('be')
    : '';
}

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

function resolveField({
  field,
  source,
  template,
  apostlesTemplate,
  firstWeekDay,
  outputFile,
  currentVersion,
  report,
}) {
  const sourceValue = source[field];
  const templateHasField = Object.hasOwn(template, field);
  const origin = !isEmpty(sourceValue) ? 'feast' : templateHasField ? `common-texts/${currentVersion}` : 'empty';
  let value = !isEmpty(sourceValue) ? sourceValue : templateHasField ? template[field] : '';

  if (field === 'officeOfReadingsTeDeum') {
    if (!isEmpty(value) && value !== 0 && value !== false) {
      if (value !== true) report.teDeumNormalized.push({ file: outputFile, origin, previousType: typeof value });
      return true;
    }
    return '';
  }

  const instruction = getSingleInstruction(value);
  if (/^(?:просьбы )?з агульных тэкстаў пра найсв\. панну марыю$/.test(instruction)) {
    const replacement = template[field];
    if (!isEmpty(replacement)) {
      report.resolvedReferences.push({
        file: outputFile,
        field,
        reference: value,
        source: `common-texts/${currentVersion}`,
      });
      value = replacement;
    }
  } else if (instruction === 'з нядзелі і тыдня') {
    value = 'from-first-week';
  } else if (instruction === 'з бягучага дня' && /^sext[123]Ps[123]$/.test(field)) {
    value = 'from-day';
  } else if (instruction === 'ты гонар з нешпараў' && field === 'officeOfReadingsHymn') {
    const replacement = source.vesper1Hymn;
    if (!isEmpty(replacement)) {
      report.resolvedReferences.push({
        file: outputFile,
        field,
        reference: value,
        source: 'feast/vesper1Hymn',
      });
      value = replacement;
    }
  }

  if (isCurrentDayPsalmsInstruction(value)) {
    report.normalizedReferences.push({
      file: outputFile,
      field,
      previousValue: value,
      value: 'from-day',
      origin,
    });
    value = 'from-day';
  }

  if (value === '[from-day]') {
    report.normalizedReferences.push({
      file: outputFile,
      field,
      previousValue: value,
      value: 'from-day',
      origin,
    });
    value = 'from-day';
  }

  if (value === 'from-first-week') {
    const replacement = firstWeekDay[field];
    if (!isEmpty(replacement)) {
      report.resolvedReferences.push({
        file: outputFile,
        field,
        reference: value,
        source: 'days/ordinary-w5-d1',
      });
      return replacement;
    }
  }

  if (value === 'from-own-texts') {
    const replacement = source.laudesPr;
    if (!isEmpty(replacement) && !containsFromReference(replacement)) {
      report.resolvedReferences.push({
        file: outputFile,
        field,
        reference: value,
        source: 'feast/laudesPr',
      });
      return replacement;
    }
  }

  if (value === 'from-apostles' || value === 'from-apostels') {
    const replacement = apostlesTemplate[field];
    if (!isEmpty(replacement) && !containsFromReference(replacement)) {
      report.resolvedReferences.push({
        file: outputFile,
        field,
        reference: value,
        source: 'common-texts/apostles',
      });
      return replacement;
    }
  }

  if (containsFromReference(value)) {
    report.unresolvedReferences.push({ file: outputFile, field, value, origin });
  }
  return value;
}

function buildOutput({
  sourceFile,
  outputStem: requestedOutputStem,
  source,
  templateName,
  template,
  apostlesTemplate,
  firstWeekDay,
  report,
}) {
  const sourceStem = path.basename(sourceFile, '.json');
  const baseOutputStem = requestedOutputStem || sourceStem;
  const templates = Array.isArray(source._templates) ? source._templates : [];
  const multipleVersions = templates.length > 1;
  const outputStem = multipleVersions ? `${baseOutputStem}--${templateName}` : baseOutputStem;
  const outputFile = `${outputStem}.json`;
  const places = normalizePlaces(source._place);
  const rank = normalizeRank(source._rank);
  const date = normalizeFixedDate(source._date);

  const output = {
    _id: outputStem,
    _date: date,
    _rank: rank,
    ...(places.length === 1 ? { _place: places[0] } : {}),
    ...(places.length > 1 ? { _place: places } : {}),
    _feastName: String(source._feastName ?? '').trim(),
    ...(source.feastComment !== undefined ? { feastComment: source.feastComment } : {}),
    _templates: templates,
    ...(multipleVersions ? { _currentVersion: templateName } : {}),
  };

  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('_') && key !== 'feastComment' && !CONTENT_FIELD_SET.has(key)) {
      output[key] = value;
    }
  }

  BASE_FIELDS.forEach((field) => {
    if (field === 'officeOfReadingsTeDeum' && source._omitTeDeum) {
      output[field] = false;
      return;
    }
    output[field] = resolveField({
      field,
      source,
      template,
      apostlesTemplate,
      firstWeekDay,
      outputFile,
      currentVersion: templateName,
      report,
    });
  });

  const hasFirstVespers = !source._omitFirstVespers && FIRST_VESPER_FIELDS.some((field) => (
    !isEmpty(source[field]) || Object.hasOwn(template, field) && !isEmpty(template[field])
  ));
  if (hasFirstVespers) {
    FIRST_VESPER_FIELDS.forEach((field) => {
      output[field] = resolveField({
        field,
        source,
        template,
        apostlesTemplate,
        firstWeekDay,
        outputFile,
        currentVersion: templateName,
        report,
      });
    });
  }

  const fieldsDefaultedFromDay = [...BASE_FIELDS, ...(hasFirstVespers ? FIRST_VESPER_FIELDS : [])]
    .filter((field) => isEmpty(output[field]));
  if (fieldsDefaultedFromDay.length) {
    fieldsDefaultedFromDay.forEach((field) => {
      output[field] = 'from-day';
    });
    report.defaultedFromDay.push({ file: outputFile, fields: fieldsDefaultedFromDay });
  }

  const emptyFields = [...BASE_FIELDS, ...(hasFirstVespers ? FIRST_VESPER_FIELDS : [])]
    .filter((field) => isEmpty(output[field]));
  if (emptyFields.length) report.emptyFields.push({ file: outputFile, fields: emptyFields });

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

  return { outputFile, output };
}

async function main() {
  const [firstWeekDay, rankedFixedDays] = await Promise.all([
    loadFirstWeekDay(),
    loadRankedFixedDays(),
  ]);
  const allSourceFiles = (await fs.readdir(FEASTS_DIR))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const sourceFiles = allSourceFiles.filter((name) => !EXCLUDED_SOURCE_FILES.has(name));
  const templateFiles = (await fs.readdir(COMMON_TEXTS_DIR))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .sort();
  const templates = new Map(await Promise.all(templateFiles.map(async (file) => [
    path.basename(file, '.json'),
    await readJson(path.join(COMMON_TEXTS_DIR, file)),
  ])));
  const rawSources = await Promise.all(sourceFiles.map(async (file) => ({
    file,
    raw: await readJson(path.join(FEASTS_DIR, file)),
  })));
  const sources = rawSources.map((source) => applyFixedDayFallback(source, rankedFixedDays));
  const feastSourceVariants = sources.flatMap(expandSourceVariants);

  const calendarEntries = fixedCalendar;
  const feastOnlyCalendarReport = buildCalendarReport(calendarEntries, feastSourceVariants);
  const rankedFixedDaySelection = selectMissingRankedFixedDays(
    rankedFixedDays,
    feastOnlyCalendarReport.missingInFeasts,
  );
  const sourceVariants = [...feastSourceVariants, ...rankedFixedDaySelection.selected];
  const report = {
    generatedAt: new Date().toISOString(),
    rules: {
      sourcePriority: 'feast -> selected common-text -> empty string',
      fromFirstWeek: 'resolved from days/ordinary-w5-d1 using the same field',
      fromOwnTexts: 'resolved from the feast own laudesPr when the exact field is absent',
      fromApostles: 'from-apostles and the legacy typo from-apostels are resolved from the same field in common-texts/apostles',
      currentDayPsalms: 'Belarusian instructions beginning with “Антыфоны і псальмы з бягучага дня” become from-day',
      fixedDayFallback: 'missing content fields may be copied from the days document named by _copyFromFixedDay',
      teDeum: 'every non-empty and non-zero value becomes boolean true',
      fromDay: 'every still-empty required content field becomes from-day; first-vesper fields remain conditional',
      multipleTemplates: 'one output per template with _currentVersion',
      multiplePlaces: 'one output per place; a place code is appended to the output filename',
      rankAndPlaceVariants: 'existing feast texts are copied into explicitly configured rank/place variants',
      rankedFixedDays: 'documents with _rank are used only when their date/rank/place key is still missing',
    },
    summary: {},
    ...buildCalendarReport(calendarEntries, sourceVariants),
    excludedSources: allSourceFiles
      .filter((file) => EXCLUDED_SOURCE_FILES.has(file))
      .map((file) => ({ file, reason: 'incomplete duplicate' })),
    syntheticVariants: sourceVariants
      .filter(({ kind }) => kind === 'synthetic')
      .map(({ file, outputStem, reason, raw }) => ({
        sourceFile: file,
        outputFileBase: `${outputStem}.json`,
        _date: normalizeFixedDate(raw._date),
        _rank: normalizeRank(raw._rank),
        ...(normalizePlaces(raw._place).length ? { _place: normalizePlaces(raw._place) } : {}),
        reason,
      })),
    recoveredFromFixedDays: rankedFixedDaySelection.selected.map(({ firestoreId, outputStem, raw }) => ({
      firestoreId,
      outputFileBase: `${outputStem}.json`,
      _date: normalizeFixedDate(raw._date),
      _rank: normalizeRank(raw._rank),
      ...(normalizePlaces(raw._place).length ? { _place: normalizePlaces(raw._place) } : {}),
      _feastName: raw._feastName,
    })),
    rankedFixedDaysAlreadyCovered: rankedFixedDaySelection.alreadyCovered.map(({ firestoreId, raw }) => ({
      firestoreId,
      _date: normalizeFixedDate(raw._date),
      _rank: normalizeRank(raw._rank),
      ...(normalizePlaces(raw._place).length ? { _place: normalizePlaces(raw._place) } : {}),
      _feastName: raw._feastName,
    })),
    fixedDayFallbacks: sources
      .filter(({ fallback }) => fallback)
      .map(({ file, fallback }) => ({ file, ...fallback })),
    missingTemplates: [],
    resolvedReferences: [],
    unresolvedReferences: [],
    normalizedReferences: [],
    defaultedFromDay: [],
    teDeumNormalized: [],
    emptyFields: [],
    invalidOutputs: [],
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const oldGeneratedFiles = (await fs.readdir(OUTPUT_DIR)).filter((name) => name.endsWith('.json'));
  await Promise.all(oldGeneratedFiles.map((name) => fs.unlink(path.join(OUTPUT_DIR, name))));

  const outputs = [];
  const apostlesTemplate = templates.get('apostles');
  if (!apostlesTemplate) throw new Error('Required common-texts/apostles template is missing');
  for (const { file, outputStem, raw } of sourceVariants) {
    const sourceTemplates = Array.isArray(raw._templates) ? raw._templates : [];
    const versions = sourceTemplates.length ? sourceTemplates : [null];
    for (const templateName of versions) {
      const template = templateName ? templates.get(templateName) : {};
      if (templateName && !template) {
        report.missingTemplates.push({ file, template: templateName });
        continue;
      }
      outputs.push(buildOutput({
        sourceFile: file,
        outputStem,
        source: raw,
        templateName,
        template,
        apostlesTemplate,
        firstWeekDay,
        report,
      }));
    }
  }

  const outputIds = new Map();
  outputs.forEach(({ outputFile, output }) => {
    const files = outputIds.get(output._id) || [];
    files.push(outputFile);
    outputIds.set(output._id, files);
  });
  report.duplicateIds = [...outputIds.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([_id, files]) => ({ _id, files }));

  report.unresolvedReferenceCounts = Object.fromEntries(
    [...report.unresolvedReferences.reduce((counts, { value }) => {
      counts.set(value, (counts.get(value) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
  report.emptyFieldCounts = Object.fromEntries(
    [...report.emptyFields.reduce((counts, { fields }) => {
      fields.forEach((field) => counts.set(field, (counts.get(field) || 0) + 1));
      return counts;
    }, new Map())].sort(([, left], [, right]) => right - left),
  );

  await Promise.all(outputs.map(({ outputFile, output }) => (
    fs.writeFile(path.join(OUTPUT_DIR, outputFile), `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  )));

  report.summary = {
    fixedCalendarEntries: fixedCalendar.length,
    calendarEntriesComparedIndividually: calendarEntries.length,
    availableFeastSourceFiles: allSourceFiles.length,
    feastSourceFiles: sources.length,
    excludedSourceFiles: report.excludedSources.length,
    logicalSourceVariants: sourceVariants.length,
    syntheticVariants: report.syntheticVariants.length,
    rankedFixedDaysFound: rankedFixedDays.length,
    recoveredFromFixedDays: report.recoveredFromFixedDays.length,
    rankedFixedDaysAlreadyCovered: report.rankedFixedDaysAlreadyCovered.length,
    commonTextTemplates: templates.size,
    generatedFiles: outputs.length,
    multipleTemplateSources: sources.filter(({ raw }) => (raw._templates || []).length > 1).length,
    multiplePlaceSources: sources.filter(({ raw }) => normalizePlaces(raw._place).length > 1).length,
    missingInFeasts: report.missingInFeasts.length,
    missingInFeastsKeys: new Set(report.missingInFeasts.map(({ key }) => key)).size,
    extraInFeasts: report.extraInFeasts.length,
    resolvedReferences: report.resolvedReferences.length,
    unresolvedReferences: report.unresolvedReferences.length,
    normalizedReferences: report.normalizedReferences.length,
    outputsDefaultedFromDay: report.defaultedFromDay.length,
    defaultedFromDayValues: report.defaultedFromDay.reduce((total, { fields }) => total + fields.length, 0),
    outputsWithEmptyFields: report.emptyFields.length,
    remainingEmptyValues: report.emptyFields.reduce((total, { fields }) => total + fields.length, 0),
    invalidOutputs: report.invalidOutputs.length,
    duplicateIds: report.duplicateIds.length,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputDir: OUTPUT_DIR, reportPath: REPORT_PATH, ...report.summary }, null, 2));

  if (report.missingTemplates.length || report.invalidOutputs.length || report.duplicateIds.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
