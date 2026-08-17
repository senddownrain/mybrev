import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };
import { DAY_EDITOR_FIELDS } from '../src/constants/days.js';

const YEARS = [2022, 2023, 2024, 2025];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'outputs', 'dynamic-feasts-2022-2025.json');

const FEAST_NAME_MAP = {
  holyFamily: 'holyfamily',
  baptismOfLord: 'buptismofthelord',
  holyTrinity: 'trinity',
  christKing: 'christking',
  sacredHeartOfJesus: 'heartofjesus',
  immaculateHeartOfMary: 'heartofmary',
  christTheHighPriest: 'christthehighpriest',
  ashWednesday: 'ash',
  easterSunday: 'eastersunday',
  pentecost: 'pentecost',
  palmSunday: 'palmsunday',
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
};

const PREVIOUS_DAY_VESPER_MAPPING = [
  ['vesperHymn', 'vesper1Hymn'],
  ['vesperAnt1', 'vesper1Ant1'],
  ['vesperAnt2', 'vesper1Ant2'],
  ['vesperAnt3', 'vesper1Ant3'],
  ['vesperPs1', 'vesper1Ps1'],
  ['vesperPs2', 'vesper1Ps2'],
  ['vesperPs3', 'vesper1Ps3'],
  ['vesperR', 'vesper1R'],
  ['vesperAntMag', 'vesper1AntMag'],
  ['vesperInter', 'vesper1Inter'],
  ['vesperPr', 'vesper1Pr'],
];

const FIRST_VESPER_FIELDS = PREVIOUS_DAY_VESPER_MAPPING.map(([, target]) => target);

function addDays(isoDate, amount) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function firstAdventSunday(year) {
  const november27 = `${year}-11-27`;
  const weekday = new Date(`${november27}T00:00:00Z`).getUTCDay();
  return addDays(november27, (7 - weekday) % 7);
}

function holyFamilyDate(year) {
  const christmas = `${year}-12-25`;
  const christmasWeekday = new Date(`${christmas}T00:00:00Z`).getUTCDay();
  const followingSunday = addDays(christmas, 7 - christmasWeekday);
  return followingSunday.endsWith('-01-01') ? `${year}-12-30` : followingSunday;
}

function baptismOfLordDate(year) {
  const epiphany = `${year}-01-06`;
  const weekday = new Date(`${epiphany}T00:00:00Z`).getUTCDay();
  return addDays(epiphany, weekday === 0 ? 7 : 7 - weekday);
}

function westernEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveBaseDate(options, field, fallback) {
  return {
    date: options?.[field] || fallback,
    source: options?.[field] ? `yearOptions.${field}` : 'liturgical-rule',
  };
}

function buildCalendar(year, options) {
  const easter = resolveBaseDate(options, 'easterSunday', westernEasterDate(year));
  const pentecost = resolveBaseDate(options, 'pentecost', addDays(easter.date, 49));
  const ashWednesday = resolveBaseDate(options, 'ashWednesday', addDays(easter.date, -46));
  const advent = resolveBaseDate(options, 'firstAdventSunday', firstAdventSunday(year));
  const holyFamily = resolveBaseDate(options, 'holyFamily', holyFamilyDate(year));
  const baptism = resolveBaseDate(options, 'baptismOfLord', baptismOfLordDate(year));
  const ascension = resolveBaseDate(options, 'ascension', addDays(easter.date, 39));
  const corpusChristi = resolveBaseDate(options, 'corpusChristi', addDays(easter.date, 60));

  const dates = {
    holyFamily: holyFamily.date,
    baptismOfLord: baptism.date,
    holyTrinity: addDays(pentecost.date, 7),
    christKing: addDays(advent.date, -7),
    sacredHeartOfJesus: addDays(pentecost.date, 19),
    immaculateHeartOfMary: addDays(pentecost.date, 20),
    christTheHighPriest: addDays(pentecost.date, 4),
    ashWednesday: ashWednesday.date,
    easterSunday: easter.date,
    pentecost: pentecost.date,
    palmSunday: addDays(easter.date, -7),
    corpusChristi: corpusChristi.date,
    ascension: ascension.date,
  };

  return {
    year,
    yearOptionsDocument: options?.id ?? null,
    bases: {
      easterSunday: easter,
      pentecost,
      ashWednesday,
      firstAdventSunday: advent,
      holyFamily,
      baptismOfLord: baptism,
      ascension,
      corpusChristi,
    },
    dates,
  };
}

function pickExistingFields(data) {
  const sourceFields = [...new Set([...DAY_EDITOR_FIELDS, '_rank'])];
  return Object.fromEntries(
    sourceFields
      .filter((field) => Object.hasOwn(data, field))
      .map((field) => [field, data[field]]),
  );
}

function buildLegacyCopy(feastDoc, previousDayDoc) {
  if (!feastDoc?.exists) return null;

  const feastData = feastDoc.data() || {};
  const previousDayData = previousDayDoc?.exists ? previousDayDoc.data() || {} : {};
  const sourceFields = pickExistingFields(feastData);
  const fields = { ...sourceFields };
  const originalFirstVespers = Object.fromEntries(
    FIRST_VESPER_FIELDS
      .filter((field) => Object.hasOwn(feastData, field))
      .map((field) => [field, feastData[field]]),
  );
  const firstVespersFromPreviousDay = {};
  const firstVespersSources = {};

  for (const [sourceField, targetField] of PREVIOUS_DAY_VESPER_MAPPING) {
    if (Object.hasOwn(previousDayData, sourceField)) {
      fields[targetField] = previousDayData[sourceField];
      firstVespersFromPreviousDay[targetField] = previousDayData[sourceField];
      firstVespersSources[targetField] = {
        sourceDocument: previousDayDoc.id,
        sourceField,
      };
    }
  }

  return {
    sourceDocument: feastDoc.id,
    previousDaySourceDocument: previousDayDoc?.id ?? null,
    sourceFields,
    fields,
    originalFirstVespers,
    firstVespersFromPreviousDay,
    firstVespersSources,
  };
}

function analyzeFields(records, fieldsProperty) {
  return Object.fromEntries(Object.keys(FEAST_NAME_MAP).map((feastKey) => {
    const feastRecords = records.filter((record) => record.feastKey === feastKey && record[fieldsProperty]);
    const allFields = [...new Set(
      feastRecords.flatMap((record) => Object.keys(record[fieldsProperty])),
    )].sort();
    const fieldsPresentEveryYear = allFields.filter((field) => (
      feastRecords.length === YEARS.length
      && feastRecords.every((record) => Object.hasOwn(record[fieldsProperty], field))
    ));
    const varyingFields = allFields.filter((field) => (
      new Set(feastRecords.map((record) => JSON.stringify(record[fieldsProperty][field]))).size > 1
    ));

    return [feastKey, {
      recordsFound: feastRecords.length,
      allFields,
      fieldsPresentEveryYear,
      varyingFields,
      identicalFields: allFields.filter((field) => !varyingFields.includes(field)),
    }];
  }));
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const yearOptionsSnapshot = await db.collection('yearOptions').get();
  const optionsByYear = new Map(
    yearOptionsSnapshot.docs.map((doc) => [
      Number(doc.data().year ?? doc.id),
      { id: doc.id, ...doc.data() },
    ]),
  );
  const calendar = YEARS.map((year) => buildCalendar(year, optionsByYear.get(year)));

  const requestedDates = calendar.flatMap(({ dates }) => (
    Object.values(dates).flatMap((date) => [date, addDays(date, -1)])
  ));
  const uniqueDates = [...new Set(requestedDates)];
  const docs = await db.getAll(
    ...uniqueDates.map((date) => db.collection('oldDays').doc(date)),
  );
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));

  const records = calendar.flatMap(({ year, dates }) => (
    Object.entries(FEAST_NAME_MAP).map(([feastKey, feastName]) => {
      const date = dates[feastKey];
      return {
        feastKey,
        feastName,
        year,
        date,
        ...buildLegacyCopy(
          docsById.get(date),
          docsById.get(addDays(date, -1)),
        ),
      };
    })
  ));

  const output = {
    generatedAt: new Date().toISOString(),
    sourceCollections: ['yearOptions', 'oldDays'],
    years: YEARS,
    feastNameMap: FEAST_NAME_MAP,
    calendar,
    records,
    fieldAnalysis: {
      sourceDocuments: analyzeFields(records, 'sourceFields'),
      withPreviousDayFirstVespers: analyzeFields(records, 'fields'),
    },
    missingOldDaysDocuments: uniqueDates.filter((date) => !docsById.get(date)?.exists),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    calendars: calendar.map(({ year, yearOptionsDocument, dates }) => ({
      year,
      yearOptionsDocument,
      ...dates,
    })),
    records: records.map(({ feastKey, year, date, fields, firstVespersFromPreviousDay }) => ({
      feastKey,
      year,
      date,
      copiedFields: fields ? Object.keys(fields).length : 0,
      copiedFirstVespers: firstVespersFromPreviousDay
        ? Object.keys(firstVespersFromPreviousDay).length
        : 0,
    })),
    missingOldDaysDocuments: output.missingOldDaysDocuments,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
