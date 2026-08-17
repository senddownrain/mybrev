#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_INPUT = path.join(PROJECT_ROOT, 'reports', 'completorium-variations.json');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'reports', 'completorium-clean-35');

const PERIODS = ['ordinary', 'advent', 'easter', 'lent', 'christmas'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
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
const EASTER_OVERRIDE_FIELDS = [
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compResp',
  'compAntS',
  'compAntM',
];
const EXCLUDED_SOURCE_DOCUMENT_IDS = new Set([
  'Em6xG4luqEG948pwNopX', // ordinary w12 d1: Saturday core
  'klsjpHe8Z8x3NTuOzf4x', // ordinary w8 d4: Saturday core
  'e4CuAovIToG3rSg2fnOR', // ordinary w9 d5: Saturday core
  'VBdPFyhliH6rJsbuNtv3', // ordinary w18 d6: Saturday core
  'c2FGzi2ltudtPLmS5PJq', // lent w3 d1: Monday core and conflicting duplicate
  'NBy7G7WZGcTS4L1WQmsk', // lent w3 d2: Tuesday core
  '5V70pZjsh8Hte5r190jY', // lent w5 d2: Saturday core
]);
const HYMN_SEPARATOR = '<p><span style="color: #ff0000;">Або:</span></p>';

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

function plainText(html) {
  return parse(String(html || '')).text.replace(/\s+/g, ' ').trim();
}

function weightedValues(report, predicate, field) {
  const counts = new Map();
  for (const variation of report.variations) {
    const count = variation.documents.filter((document) => (
      !EXCLUDED_SOURCE_DOCUMENT_IDS.has(document.id) && predicate(document)
    )).length;
    if (!count) continue;
    const value = String(variation.values[field] ?? '').trim();
    counts.set(value, (counts.get(value) ?? 0) + count);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function mostFrequentValue(report, predicate, field) {
  const ranked = weightedValues(report, predicate, field);
  if (!ranked.length) throw new Error(`No source value found for ${field}`);
  return ranked[0][0];
}

function selectOrdinaryBase(report, weekday) {
  const candidates = report.variations
    .map((variation) => ({
      variation,
      count: variation.documents.filter((document) => (
        !EXCLUDED_SOURCE_DOCUMENT_IDS.has(document.id)
        && document.selectorKind === 'period'
        && document._periodType === 'ordinary'
        && document._dayOfWeek === weekday
      )).length,
    }))
    .filter((candidate) => candidate.count > 0)
    .sort((left, right) => right.count - left.count || left.variation.id.localeCompare(right.variation.id));
  if (!candidates.length) throw new Error(`No ordinary source found for weekday ${weekday}`);
  return Object.fromEntries(CONTENT_FIELDS.map((field) => [field, candidates[0].variation.values[field]]));
}

function selectGeneralHymns(report) {
  const nonEasterPeriod = (document) => (
    document.selectorKind === 'period' && document._periodType !== 'easter'
  );
  const values = weightedValues(report, nonEasterPeriod, 'compHymn')
    .map(([value]) => value)
    .filter(Boolean);
  const creator = values.find((value) => plainText(value).startsWith('Цябе, Стварыцель сусвету'));
  const christ = values.find((value) => plainText(value).startsWith('О Хрыстэ, Ты дзень поўны бляску'));
  if (!creator || !christ) throw new Error('Could not find both canonical general hymns.');
  return `${creator}\n${HYMN_SEPARATOR}\n${christ}`;
}

function selectFullGeneralMarianAntiphons(report) {
  const candidates = weightedValues(
    report,
    (document) => document.selectorKind === 'period' && document._periodType !== 'easter',
    'compAntM',
  ).map(([value]) => value).filter(Boolean);
  if (!candidates.length) throw new Error('Could not find a general compAntM value.');
  return candidates.sort((left, right) => right.length - left.length)[0];
}

function selectEasterOverrides(report) {
  const easterPeriod = (document) => (
    document.selectorKind === 'period'
    && document._periodType === 'easter'
    && Number(document._periodWeekNumber) >= 2
  );
  return Object.fromEntries(EASTER_OVERRIDE_FIELDS.map((field) => [
    field,
    mostFrequentValue(report, easterPeriod, field),
  ]));
}

function assertTemplate(template) {
  const actualKeys = Object.keys(template);
  const expectedKeys = ['_periodType', '_dayOfWeek', ...CONTENT_FIELDS];
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Unexpected template fields for ${template._periodType} d${template._dayOfWeek}`);
  }
  for (const field of CONTENT_FIELDS) {
    if (typeof template[field] !== 'string') {
      throw new Error(`${template._periodType} d${template._dayOfWeek}: ${field} is not a string`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/generate-clean-completorium-35.mjs [--input report.json] [--out-dir directory]');
    return;
  }

  const report = JSON.parse(await fs.readFile(options.input, 'utf8'));
  if (!Array.isArray(report.variations)) throw new Error('Input does not contain a variations array.');

  const ordinaryByWeekday = new Map(WEEKDAYS.map((weekday) => [
    weekday,
    selectOrdinaryBase(report, weekday),
  ]));
  const generalHymns = selectGeneralHymns(report);
  const generalMarianAntiphons = selectFullGeneralMarianAntiphons(report);
  const easterOverrides = selectEasterOverrides(report);

  await fs.mkdir(options.outputDir, { recursive: true });
  const writtenFiles = [];
  for (const period of PERIODS) {
    for (const weekday of WEEKDAYS) {
      const content = {
        ...ordinaryByWeekday.get(weekday),
        compHymn: generalHymns,
        compAntM: generalMarianAntiphons,
      };
      if (period === 'easter') Object.assign(content, easterOverrides);

      const template = {
        _periodType: period,
        _dayOfWeek: weekday,
        ...Object.fromEntries(CONTENT_FIELDS.map((field) => [field, content[field]])),
      };
      assertTemplate(template);

      const fileName = `${period}-d${weekday}.json`;
      await fs.writeFile(path.join(options.outputDir, fileName), `${JSON.stringify(template, null, 2)}\n`, 'utf8');
      writtenFiles.push(fileName);
    }
  }

  const jsonFiles = (await fs.readdir(options.outputDir)).filter((file) => file.endsWith('.json')).sort();
  if (jsonFiles.length !== 35 || writtenFiles.some((file) => !jsonFiles.includes(file))) {
    throw new Error(`Expected exactly 35 JSON files in output directory, found ${jsonFiles.length}.`);
  }

  console.log(JSON.stringify({
    outputDirectory: options.outputDir,
    files: jsonFiles.length,
    periods: PERIODS,
    weekdays: WEEKDAYS,
    excludedSourceDocuments: EXCLUDED_SOURCE_DOCUMENT_IDS.size,
    policy: {
      ordinaryAdventLentChristmas: 'ordinary weekday core + two general hymns + full general compAntM',
      easter: `ordinary weekday core + overrides: ${EASTER_OVERRIDE_FIELDS.join(', ')}`,
      easterSourceWeeks: '2+',
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

