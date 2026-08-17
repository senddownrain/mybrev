#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'reports', 'completorium-variations.json');
const DEFAULT_SERVICE_ACCOUNT = path.join(PROJECT_ROOT, 'patchs', 'serviceAccountKey.json');

const SELECTOR_FIELDS = ['_periodType', '_date', '_feast'];
const COMPLETORIUM_CONTENT_FIELDS = [
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
  'compAntM',
];
const COMPLETORIUM_FIELDS = ['_dayOfWeek', ...COMPLETORIUM_CONTENT_FIELDS];
const WEEKDAY_LABELS = {
  1: 'Sunday',
  2: 'Monday',
  3: 'Tuesday',
  4: 'Wednesday',
  5: 'Thursday',
  6: 'Friday',
  7: 'Saturday',
};

function parseArgs(argv) {
  const options = {
    input: '',
    output: DEFAULT_OUTPUT,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = path.resolve(argv[++index]);
    else if (arg === '--out') options.output = path.resolve(argv[++index]);
    else if (arg === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalize(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizedNumber(value) {
  const normalized = normalize(value);
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : normalized;
}

function normalizedValues(day, fields) {
  return Object.fromEntries(fields.map((field) => [
    field,
    field === '_dayOfWeek' ? normalizedNumber(day[field]) : normalize(day[field]),
  ]));
}

function signature(values) {
  return JSON.stringify(values);
}

function stableId(prefix, values) {
  const hash = crypto.createHash('sha256').update(signature(values)).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

function selectorKind(day) {
  const populated = SELECTOR_FIELDS.filter((field) => normalize(day[field]));
  if (populated.length === 0) return 'unclassified';
  if (populated.length > 1) return 'mixed';
  return populated[0] === '_periodType' ? 'period' : populated[0] === '_date' ? 'date' : 'feast';
}

function compareValues(left, right) {
  return String(left).localeCompare(String(right), 'en', { numeric: true });
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== '' && value !== null))].sort(compareValues);
}

function buildVariationGroups(days) {
  const groups = new Map();

  for (const day of days) {
    const values = normalizedValues(day, COMPLETORIUM_FIELDS);
    const key = signature(values);
    if (!groups.has(key)) {
      const contentValues = normalizedValues(day, COMPLETORIUM_CONTENT_FIELDS);
      groups.set(key, {
        id: stableId('comp', values),
        contentPatternId: stableId('comp_content', contentValues),
        values,
        documents: [],
      });
    }

    groups.get(key).documents.push({
      id: normalize(day.id),
      selectorKind: selectorKind(day),
      _periodType: normalize(day._periodType),
      _periodWeekNumber: normalizedNumber(day._periodWeekNumber),
      _date: normalize(day._date),
      _feast: normalize(day._feast),
      _feastName: normalize(day._feastName),
      _dayOfWeek: normalizedNumber(day._dayOfWeek),
    });
  }

  return [...groups.values()]
    .map((group) => ({
      id: group.id,
      contentPatternId: group.contentPatternId,
      count: group.documents.length,
      selectors: {
        kinds: uniqueSorted(group.documents.map((item) => item.selectorKind)),
        periodTypes: uniqueSorted(group.documents.map((item) => item._periodType)),
        dates: uniqueSorted(group.documents.map((item) => item._date)),
        feasts: uniqueSorted(group.documents.map((item) => item._feast)),
        feastNames: uniqueSorted(group.documents.map((item) => item._feastName)),
      },
      values: group.values,
      documents: group.documents.sort((left, right) => compareValues(left.id, right.id)),
    }))
    .sort((left, right) => right.count - left.count || compareValues(left.id, right.id));
}

function buildSelectorIndex(variations) {
  const index = { period: {}, date: {}, feast: {}, mixed: [], unclassified: [] };

  for (const variation of variations) {
    for (const document of variation.documents) {
      const entry = {
        documentId: document.id,
        variationId: variation.id,
        contentPatternId: variation.contentPatternId,
        _dayOfWeek: document._dayOfWeek,
      };

      if (document.selectorKind === 'period') {
        const period = document._periodType;
        const weekday = String(document._dayOfWeek ?? 'missing');
        index.period[period] ??= {};
        index.period[period][weekday] ??= [];
        index.period[period][weekday].push({ ...entry, _periodWeekNumber: document._periodWeekNumber });
      } else if (document.selectorKind === 'date') {
        index.date[document._date] ??= [];
        index.date[document._date].push(entry);
      } else if (document.selectorKind === 'feast') {
        index.feast[document._feast] ??= [];
        index.feast[document._feast].push({ ...entry, _feastName: document._feastName });
      } else {
        index[document.selectorKind].push({
          ...entry,
          _periodType: document._periodType,
          _date: document._date,
          _feast: document._feast,
        });
      }
    }
  }

  return index;
}

function buildSundayComparison(variations) {
  const sundayPatterns = new Set();
  for (const variation of variations) {
    if (variation.values._dayOfWeek !== 1) continue;
    if (variation.documents.some((document) => document.selectorKind === 'period')) {
      sundayPatterns.add(variation.contentPatternId);
    }
  }
  const feastDocuments = variations.flatMap((variation) => variation.documents
    .filter((document) => document.selectorKind === 'feast')
    .map((document) => ({
      documentId: document.id,
      feast: document._feast,
      feastName: document._feastName,
      dayOfWeek: document._dayOfWeek,
      variationId: variation.id,
      contentPatternId: variation.contentPatternId,
      matchesAnySundayContent: sundayPatterns.has(variation.contentPatternId),
    })));
  const matching = feastDocuments.filter((item) => item.matchesAnySundayContent).length;

  return {
    definition: 'Exact equality of all 10 comp* fields with a period-selector Sunday variation (_dayOfWeek = 1); _dayOfWeek itself is ignored for this comparison.',
    periodSundayContentPatterns: sundayPatterns.size,
    feastDocuments: feastDocuments.length,
    matchingSundayContent: matching,
    nonMatchingSundayContent: feastDocuments.length - matching,
    matchingPercent: feastDocuments.length ? Number((matching * 100 / feastDocuments.length).toFixed(2)) : null,
    documents: feastDocuments.sort((left, right) => compareValues(left.documentId, right.documentId)),
  };
}

function buildAutomatedAnalysis(variations) {
  const documents = variations.flatMap((variation) => variation.documents.map((document) => ({
    ...document,
    variationId: variation.id,
    contentPatternId: variation.contentPatternId,
    values: variation.values,
  })));
  const bySelectorKind = {};
  for (const kind of ['period', 'date', 'feast', 'mixed', 'unclassified']) {
    const selected = documents.filter((document) => document.selectorKind === kind);
    bySelectorKind[kind] = {
      documents: selected.length,
      uniqueVariationsIncludingDayOfWeek: new Set(selected.map((item) => item.variationId)).size,
      uniqueContentPatternsIgnoringDayOfWeek: new Set(selected.map((item) => item.contentPatternId)).size,
      documentsWithDayOfWeek: selected.filter((item) => item._dayOfWeek !== null).length,
      dayOfWeeks: uniqueSorted(selected.map((item) => item._dayOfWeek)),
    };
  }

  const contentFieldStats = Object.fromEntries(COMPLETORIUM_CONTENT_FIELDS.map((field) => [
    field,
    {
      distinctValuesIncludingBlank: new Set(variations.map((variation) => variation.values[field])).size,
      blankDocuments: documents.filter((document) => !document.values[field]).length,
    },
  ]));

  const periodWeekdayMatrix = {};
  for (const document of documents.filter((item) => item.selectorKind === 'period')) {
    const period = document._periodType;
    const weekday = String(document._dayOfWeek ?? 'missing');
    periodWeekdayMatrix[period] ??= {};
    periodWeekdayMatrix[period][weekday] ??= [];
    periodWeekdayMatrix[period][weekday].push(document);
  }
  for (const weekdays of Object.values(periodWeekdayMatrix)) {
    for (const [weekday, selected] of Object.entries(weekdays)) {
      const distinctByField = Object.fromEntries(COMPLETORIUM_CONTENT_FIELDS.map((field) => [
        field,
        new Set(selected.map((document) => document.values[field])).size,
      ]));
      weekdays[weekday] = {
        weekdayLabel: WEEKDAY_LABELS[weekday] ?? 'Missing',
        documents: selected.length,
        uniqueVariations: new Set(selected.map((item) => item.variationId)).size,
        uniqueContentPatterns: new Set(selected.map((item) => item.contentPatternId)).size,
        differingFields: COMPLETORIUM_CONTENT_FIELDS.filter((field) => distinctByField[field] > 1),
        distinctValuesByField: distinctByField,
        variationIds: uniqueSorted(selected.map((item) => item.variationId)),
      };
    }
  }

  return { bySelectorKind, contentFieldStats, periodWeekdayMatrix };
}

function buildSummary(allDays, analyzedDays, variations) {
  const documentsByKind = Object.fromEntries(
    ['period', 'date', 'feast', 'mixed', 'unclassified'].map((kind) => [
      kind,
      analyzedDays.filter((day) => selectorKind(day) === kind).length,
    ]),
  );
  const weekdayBuckets = [1, 2, 3, 4, 5, 6, 7, null];
  const variationsByWeekday = Object.fromEntries(
    weekdayBuckets.map((weekday) => [
      weekday ?? 'missing',
      variations.filter((variation) => variation.values._dayOfWeek === weekday).length,
    ]),
  );
  const contentPatternsByWeekday = Object.fromEntries(
    weekdayBuckets.map((weekday) => [
      weekday ?? 'missing',
      new Set(variations
        .filter((variation) => variation.values._dayOfWeek === weekday)
        .map((variation) => variation.contentPatternId)).size,
    ]),
  );

  return {
    sourceDocuments: allDays.length,
    documentsWithAnyCompletoriumContent: analyzedDays.length,
    documentsWithoutCompletoriumContent: allDays.length - analyzedDays.length,
    uniqueVariationsIncludingDayOfWeek: variations.length,
    uniqueContentPatternsIgnoringDayOfWeek: new Set(variations.map((item) => item.contentPatternId)).size,
    documentsBySelectorKind: documentsByKind,
    uniqueVariationsByDayOfWeek: variationsByWeekday,
    uniqueContentPatternsByDayOfWeek: contentPatternsByWeekday,
    documentsWithMissingDayOfWeek: analyzedDays.filter((day) => normalizedNumber(day._dayOfWeek) === null).length,
    documentsWithAtLeastOneBlankContentField: analyzedDays.filter((day) => COMPLETORIUM_CONTENT_FIELDS.some((field) => !normalize(day[field]))).length,
  };
}

async function loadFromJson(inputPath) {
  const parsed = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.days)) return parsed.days;
  throw new Error('Input JSON must be an array or an object with a days array.');
}

async function loadFromFirestore(serviceAccountPath) {
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  try {
    const snapshot = await admin.firestore().collection('days').get();
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/analyze-completorium-variations.mjs [--input days.json] [--out report.json] [--service-account key.json]');
    return;
  }

  const days = options.input
    ? await loadFromJson(options.input)
    : await loadFromFirestore(options.serviceAccount);
  const analyzedDays = days.filter((day) => COMPLETORIUM_CONTENT_FIELDS.some((field) => normalize(day[field])));
  const variations = buildVariationGroups(analyzedDays);
  const report = {
    generatedAt: new Date().toISOString(),
    source: options.input
      ? { type: 'json', path: options.input }
      : { type: 'firestore', collection: 'days' },
    fields: {
      selectors: SELECTOR_FIELDS,
      completorium: COMPLETORIUM_FIELDS,
      weekdayLabels: WEEKDAY_LABELS,
    },
    summary: buildSummary(days, analyzedDays, variations),
    automatedAnalysis: buildAutomatedAnalysis(variations),
    sundayComparison: buildSundayComparison(variations),
    selectorIndex: buildSelectorIndex(variations),
    variations,
  };

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: options.output, ...report.summary, sundayComparison: {
    feastDocuments: report.sundayComparison.feastDocuments,
    matchingSundayContent: report.sundayComparison.matchingSundayContent,
    matchingPercent: report.sundayComparison.matchingPercent,
  } }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
