#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_INPUT = path.join(PROJECT_ROOT, 'reports', 'completorium-variations.json');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'reports', 'completorium-period-weekdays');
const CONTENT_FIELDS = [
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
const WEEKDAYS = {
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
};
const CORE_WEEKDAY_FIELDS = ['compAnt1', 'compAnt2', 'compPs1', 'compPs2', 'compR'];

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, outputDir: DEFAULT_OUTPUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = path.resolve(argv[++index]);
    else if (arg === '--out-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function compare(left, right) {
  return String(left).localeCompare(String(right), 'en', { numeric: true });
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== '' && value !== null && value !== undefined))].sort(compare);
}

function preview(html, maxLength = 100) {
  const text = parse(String(html || '')).text
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function globalUsageByContentPattern(report) {
  const usage = new Map();
  for (const variation of report.variations) {
    if (!usage.has(variation.contentPatternId)) usage.set(variation.contentPatternId, []);
    usage.get(variation.contentPatternId).push(...variation.documents);
  }
  return usage;
}

function usageSummary(documents) {
  return {
    selectorKinds: uniqueSorted(documents.map((document) => document.selectorKind)),
    periodTypes: uniqueSorted(documents.map((document) => document._periodType)),
    dates: uniqueSorted(documents.map((document) => document._date)),
    feasts: uniqueSorted(documents.map((document) => document._feast)),
    feastNames: uniqueSorted(documents.map((document) => document._feastName)),
  };
}

function differingFields(values, dominantValues) {
  return CONTENT_FIELDS.filter((field) => values[field] !== dominantValues[field]);
}

function coreWeekdaySignature(values) {
  return JSON.stringify(CORE_WEEKDAY_FIELDS.map((field) => values[field]));
}

function buildOrdinaryCoreWeekdayMap(report) {
  const result = new Map();
  for (const weekday of Object.keys(WEEKDAYS).map(Number)) {
    const candidates = report.variations
      .map((variation) => ({
        variation,
        count: variation.documents.filter((document) => (
          document.selectorKind === 'period'
          && document._periodType === 'ordinary'
          && document._dayOfWeek === weekday
        )).length,
      }))
      .filter((candidate) => candidate.count > 0)
      .sort((left, right) => right.count - left.count || compare(left.variation.id, right.variation.id));
    if (candidates.length) {
      result.set(coreWeekdaySignature(candidates[0].variation.values), weekday);
    }
  }
  return result;
}

function buildPeriodEntry(periodType, weekday, documents, variationById, globalUsage, ordinaryCoreWeekdays) {
  const grouped = new Map();
  for (const document of documents) {
    if (!grouped.has(document.variationId)) grouped.set(document.variationId, []);
    grouped.get(document.variationId).push(document);
  }

  const ranked = [...grouped.entries()]
    .map(([variationId, selected]) => ({
      variation: variationById.get(variationId),
      documents: selected,
    }))
    .sort((left, right) => right.documents.length - left.documents.length || compare(left.variation.id, right.variation.id));
  const dominantCount = ranked[0]?.documents.length ?? 0;
  const dominantValues = ranked[0]?.variation.values ?? {};
  const documentsByWeek = new Map();
  for (const document of documents) {
    const week = String(document._periodWeekNumber ?? 'missing');
    if (!documentsByWeek.has(week)) documentsByWeek.set(week, []);
    documentsByWeek.get(week).push(document);
  }
  const duplicatePeriodKeys = [...documentsByWeek.entries()]
    .filter(([, selected]) => selected.length > 1)
    .map(([week, selected]) => ({
      _periodType: periodType,
      _periodWeekNumber: week === 'missing' ? null : Number(week),
      _dayOfWeek: weekday,
      documentIds: uniqueSorted(selected.map((document) => document.id)),
      variationIds: uniqueSorted(selected.map((document) => document.variationId)),
      contentPatternIds: uniqueSorted(selected.map((document) => document.contentPatternId)),
      conflictingContent: new Set(selected.map((document) => document.contentPatternId)).size > 1,
    }));

  const variants = ranked.map(({ variation, documents: selected }, index) => {
    const crossUsage = usageSummary(globalUsage.get(variation.contentPatternId) ?? []);
    const fieldsDifferentFromDominant = index === 0 ? [] : differingFields(variation.values, dominantValues);
    const reviewReasons = [];
    const matchesOrdinaryCoreWeekday = ordinaryCoreWeekdays.get(coreWeekdaySignature(variation.values)) ?? null;
    if (selected.length === 1 && dominantCount >= 5) reviewReasons.push('singleton-among-many-period-weeks');
    else if (selected.length <= 2 && dominantCount >= selected.length * 4) reviewReasons.push('rare-compared-to-dominant');
    if (crossUsage.feasts.length) reviewReasons.push('same-content-is-used-by-feast-selector');
    if (crossUsage.dates.length) reviewReasons.push('same-content-is-used-by-date-selector');
    if (matchesOrdinaryCoreWeekday !== null && matchesOrdinaryCoreWeekday !== weekday) {
      reviewReasons.push('core-fields-match-another-weekday');
    }

    return {
      id: variation.id,
      contentPatternId: variation.contentPatternId,
      classification: index === 0 ? 'dominant' : reviewReasons.length ? 'review' : 'recurring-variant',
      reviewReasons,
      count: selected.length,
      percentWithinPeriodWeekday: Number((selected.length * 100 / documents.length).toFixed(2)),
      weeks: uniqueSorted(selected.map((document) => document._periodWeekNumber)),
      documentIds: uniqueSorted(selected.map((document) => document.id)),
      fieldsDifferentFromDominant,
      coreWeekdayAudit: {
        fields: CORE_WEEKDAY_FIELDS,
        matchesOrdinaryDominantWeekday: matchesOrdinaryCoreWeekday,
        mismatchesDocumentWeekday: matchesOrdinaryCoreWeekday !== null && matchesOrdinaryCoreWeekday !== weekday,
      },
      alsoUsedBy: crossUsage,
      preview: Object.fromEntries(CONTENT_FIELDS.map((field) => [field, preview(variation.values[field])])),
      values: Object.fromEntries(CONTENT_FIELDS.map((field) => [field, variation.values[field]])),
    };
  });

  return {
    _periodType: periodType,
    _dayOfWeek: weekday,
    documents: documents.length,
    weeks: uniqueSorted(documents.map((document) => document._periodWeekNumber)),
    variants: variants.length,
    reviewVariants: variants.filter((variant) => variant.classification === 'review').length,
    duplicatePeriodKeys,
    items: variants,
  };
}

function buildWeekdayReport(report, weekday, globalUsage, ordinaryCoreWeekdays) {
  const variationById = new Map(report.variations.map((variation) => [variation.id, variation]));
  const periodDocuments = report.variations.flatMap((variation) => variation.documents
    .filter((document) => document.selectorKind === 'period' && document._dayOfWeek === weekday)
    .map((document) => ({
      ...document,
      variationId: variation.id,
      contentPatternId: variation.contentPatternId,
    })));
  const periods = uniqueSorted(periodDocuments.map((document) => document._periodType))
    .map((periodType) => buildPeriodEntry(
      periodType,
      weekday,
      periodDocuments.filter((document) => document._periodType === periodType),
      variationById,
      globalUsage,
      ordinaryCoreWeekdays,
    ));

  return {
    generatedAt: new Date().toISOString(),
    source: report.source,
    _dayOfWeek: weekday,
    weekday: WEEKDAYS[weekday],
    fields: ['_dayOfWeek', ...CONTENT_FIELDS],
    summary: {
      periodDocuments: periodDocuments.length,
      periods: periods.length,
      variants: periods.reduce((sum, period) => sum + period.variants, 0),
      reviewVariants: periods.reduce((sum, period) => sum + period.reviewVariants, 0),
      duplicatePeriodKeys: periods.reduce((sum, period) => sum + period.duplicatePeriodKeys.length, 0),
    },
    reviewPolicy: {
      note: 'review is a heuristic audit flag, not a declaration that the data is wrong',
      flags: {
        'singleton-among-many-period-weeks': 'One document while the dominant variant has at least five documents.',
        'rare-compared-to-dominant': 'At most two documents and the dominant variant is at least four times more frequent.',
        'same-content-is-used-by-feast-selector': 'The exact same ten comp* fields occur in a _feast document.',
        'same-content-is-used-by-date-selector': 'The exact same ten comp* fields occur in a _date document.',
        'core-fields-match-another-weekday': 'Antiphons, psalms and reading exactly match the dominant ordinary template of another weekday.',
      },
    },
    periods,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/export-completorium-period-weekdays.mjs [--input report.json] [--out-dir directory]');
    return;
  }

  const report = JSON.parse(await fs.readFile(options.input, 'utf8'));
  if (!Array.isArray(report.variations)) throw new Error('Input does not contain a variations array.');
  const globalUsage = globalUsageByContentPattern(report);
  const ordinaryCoreWeekdays = buildOrdinaryCoreWeekdayMap(report);
  await fs.mkdir(options.outputDir, { recursive: true });

  const files = [];
  const weekdayReports = [];
  for (const [weekdayText, weekdayName] of Object.entries(WEEKDAYS)) {
    const weekday = Number(weekdayText);
    const weekdayReport = buildWeekdayReport(report, weekday, globalUsage, ordinaryCoreWeekdays);
    const fileName = `day-${weekday}-${weekdayName}.json`;
    const outputPath = path.join(options.outputDir, fileName);
    await fs.writeFile(outputPath, `${JSON.stringify(weekdayReport, null, 2)}\n`, 'utf8');
    files.push({ file: fileName, ...weekdayReport.summary });
    weekdayReports.push(weekdayReport);
  }

  const reviewItems = weekdayReports.flatMap((weekdayReport) => weekdayReport.periods.flatMap((period) => (
    period.items
      .filter((item) => item.classification === 'review')
      .map((item) => ({
        _dayOfWeek: weekdayReport._dayOfWeek,
        weekday: weekdayReport.weekday,
        _periodType: period._periodType,
        variationId: item.id,
        contentPatternId: item.contentPatternId,
        count: item.count,
        weeks: item.weeks,
        documentIds: item.documentIds,
        reviewReasons: item.reviewReasons,
        fieldsDifferentFromDominant: item.fieldsDifferentFromDominant,
        coreWeekdayAudit: item.coreWeekdayAudit,
      }))
  )));
  const reviewReport = {
    generatedAt: new Date().toISOString(),
    note: 'Heuristic candidates for manual review; special liturgical periods can legitimately match another weekday.',
    duplicatePeriodKeys: weekdayReports.flatMap((weekdayReport) => (
      weekdayReport.periods.flatMap((period) => period.duplicatePeriodKeys)
    )),
    items: reviewItems,
  };
  await fs.writeFile(path.join(options.outputDir, 'review.json'), `${JSON.stringify(reviewReport, null, 2)}\n`, 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceReport: options.input,
    outputDirectory: options.outputDir,
    reviewFile: 'review.json',
    reviewItems: reviewItems.length,
    duplicatePeriodKeys: reviewReport.duplicatePeriodKeys.length,
    files,
  };
  await fs.writeFile(path.join(options.outputDir, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
