import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = resolve(ROOT, 'outputs', 'dynamic-feasts-2022-2025.json');
const OUTPUT_DIR = resolve(ROOT, 'outputs', 'dynamic-feasts-final');

const FIELDS = [
  '_feast', '_feastName', '_rank', 'invitatoriumAnt', 'feastComment',
  'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2',
  'officeOfReadingsAnt3', 'officeOfReadingsPs1', 'officeOfReadingsPs2',
  'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
  'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr',
  'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1',
  'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter',
  'laudesPr', 'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3',
  'sext1Ps1', 'sext1Ps2', 'sext1Ps3', 'sext1R', 'sext1Pr', 'sext2Hymn',
  'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2',
  'sext2Ps3', 'sext2R', 'sext2Pr', 'sext3Hymn', 'sext3Ant1',
  'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2', 'sext3Ps3',
  'sext3R', 'sext3Pr', 'vesperHymn', 'vesperAnt1', 'vesperAnt2',
  'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR',
  'vesperAntMag', 'vesperInter', 'vesperPr', 'vesper1Hymn',
  'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1',
  'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag',
  'vesper1Inter', 'vesper1Pr',
];

const BASE_YEARS = {
  holyFamily: 2025,
  baptismOfLord: 2025,
  holyTrinity: 2025,
  christKing: 2025,
  sacredHeartOfJesus: 2025,
  immaculateHeartOfMary: 2024,
  christTheHighPriest: 2025,
  ashWednesday: 2025,
  easterSunday: 2025,
  pentecost: 2024,
  palmSunday: 2025,
  corpusChristi: 2025,
  ascension: 2025,
};

const RANKS = {
  holyFamily: 'festum',
  baptismOfLord: 'festum',
  holyTrinity: 'solemnitas',
  christKing: 'solemnitas',
  sacredHeartOfJesus: 'solemnitas',
  immaculateHeartOfMary: 'memoria',
  christTheHighPriest: 'festum',
  ashWednesday: null,
  easterSunday: 'solemnitas',
  pentecost: 'solemnitas',
  palmSunday: null,
  corpusChristi: 'solemnitas',
  ascension: 'solemnitas',
};

const FIRST_VESPER_FIELDS = FIELDS.filter((field) => field.startsWith('vesper1'));
const EVENING_FIELDS = FIELDS.filter((field) => field.startsWith('vesper'));

const IMMACULATE_HEART_MARIAN_FIELDS = new Set([
  'feastComment',
  'officeOfReadingsR2',
  'officeOfReadingsPr',
  'laudesAntBen',
  'laudesPr',
]);

function emptyPayload() {
  return Object.fromEntries(FIELDS.map((field) => [field, null]));
}

function findRecord(source, feastKey, year) {
  const record = source.records.find((item) => item.feastKey === feastKey && item.year === year);
  if (!record) throw new Error(`Missing source record: ${feastKey}, ${year}`);
  return record;
}

function exactCommonFields(records) {
  return new Set(FIELDS.filter((field) => (
    records.every((record) => Object.hasOwn(record.sourceFields, field))
    && new Set(records.map((record) => JSON.stringify(record.sourceFields[field]))).size === 1
  )));
}

function fillFromFields(payload, sourceFields, allowedFields = new Set(FIELDS)) {
  for (const field of FIELDS) {
    if (allowedFields.has(field) && Object.hasOwn(sourceFields, field)) {
      payload[field] = sourceFields[field];
    }
  }
}

function buildRegularPayload(record) {
  const payload = emptyPayload();
  fillFromFields(payload, record.fields);
  return payload;
}

function buildImmaculateHeartPayload(source, baseRecord) {
  const validRecords = [2022, 2023, 2024].map((year) => (
    findRecord(source, 'immaculateHeartOfMary', year)
  ));
  const common = exactCommonFields(validRecords);
  const allowed = new Set(
    [...IMMACULATE_HEART_MARIAN_FIELDS].filter((field) => common.has(field)),
  );
  const payload = emptyPayload();
  fillFromFields(payload, baseRecord.sourceFields, allowed);
  for (const field of EVENING_FIELDS) payload[field] = null;
  return payload;
}

function buildHighPriestPayload(source, baseRecord) {
  const records = [2022, 2023, 2024, 2025].map((year) => (
    findRecord(source, 'christTheHighPriest', year)
  ));
  const common = exactCommonFields(records);
  const payload = emptyPayload();
  fillFromFields(payload, baseRecord.sourceFields, common);
  return payload;
}

async function main() {
  const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
  await mkdir(OUTPUT_DIR, { recursive: true });
  const summary = [];

  for (const [feastKey, feastName] of Object.entries(source.feastNameMap)) {
    const baseYear = BASE_YEARS[feastKey];
    const baseRecord = findRecord(source, feastKey, baseYear);
    const id = `feast-${feastName}`;
    let payload;

    if (feastKey === 'immaculateHeartOfMary') {
      payload = buildImmaculateHeartPayload(source, baseRecord);
    } else if (feastKey === 'christTheHighPriest') {
      payload = buildHighPriestPayload(source, baseRecord);
    } else {
      payload = buildRegularPayload(baseRecord);
    }

    payload._feast = id;
    payload._feastName = baseRecord.sourceFields._feastName
      ?? baseRecord.sourceFields._dayName
      ?? null;
    payload._rank = RANKS[feastKey];

    if (feastKey === 'ashWednesday') {
      for (const field of FIRST_VESPER_FIELDS) payload[field] = null;
    }
    if (feastKey === 'immaculateHeartOfMary') {
      for (const field of EVENING_FIELDS) payload[field] = null;
    }

    const outputPath = resolve(OUTPUT_DIR, `${id}.json`);
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    summary.push({
      feastKey,
      id,
      baseYear,
      rank: payload._rank,
      nonNullFields: Object.values(payload).filter((value) => value !== null).length,
      outputPath,
    });
  }

  console.log(JSON.stringify({ outputDirectory: OUTPUT_DIR, files: summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
