import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };
import { DAY_EDITOR_FIELDS } from '../src/constants/days.js';

const YEARS = [2022, 2023, 2024, 2025];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'outputs', 'holy-family-christ-king-2022-2025.json');

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

function pickExistingFields(data) {
  return Object.fromEntries(
    DAY_EDITOR_FIELDS
      .filter((field) => Object.hasOwn(data, field))
      .map((field) => [field, data[field]]),
  );
}

function buildLegacyCopy(feastDoc, previousDayDoc) {
  if (!feastDoc.exists) return null;

  const feastData = feastDoc.data() || {};
  const previousDayData = previousDayDoc.exists ? previousDayDoc.data() || {} : {};
  const fields = pickExistingFields(feastData);
  const firstVespers = {};

  for (const [sourceField, targetField] of PREVIOUS_DAY_VESPER_MAPPING) {
    if (Object.hasOwn(previousDayData, sourceField)) {
      fields[targetField] = previousDayData[sourceField];
      firstVespers[targetField] = {
        sourceDocument: previousDayDoc.id,
        sourceField,
      };
    }
  }

  return {
    sourceDocument: feastDoc.id,
    previousDaySourceDocument: previousDayDoc.id,
    fields,
    firstVespersSources: firstVespers,
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  // Старые документы могут хранить `year` как строку, поэтому нормализуем его
  // после чтения вместо Firestore-запроса с типизированным оператором `in`.
  const yearOptionsSnapshot = await db.collection('yearOptions').get();
  const optionsByYear = new Map(
    yearOptionsSnapshot.docs.map((doc) => [
      Number(doc.data().year ?? doc.id),
      { id: doc.id, ...doc.data() },
    ]),
  );

  const calendar = YEARS.map((year) => {
    const options = optionsByYear.get(year);
    const computedFirstAdventSunday = firstAdventSunday(year);

    return {
      year,
      yearOptionsDocument: options?.id ?? null,
      holyFamily: options?.holyFamily || holyFamilyDate(year),
      holyFamilyDateSource: options?.holyFamily ? 'yearOptions' : 'liturgical-rule',
      christKing: addDays(options?.firstAdventSunday || computedFirstAdventSunday, -7),
      christKingDateSource: options?.firstAdventSunday ? 'yearOptions.firstAdventSunday' : 'liturgical-rule',
      firstAdventSunday: options?.firstAdventSunday || computedFirstAdventSunday,
    };
  });

  const requests = calendar.flatMap(({ holyFamily, christKing }) => (
    [holyFamily, christKing].flatMap((date) => [date, addDays(date, -1)])
  ));
  const uniqueDates = [...new Set(requests)];
  const docs = await db.getAll(
    ...uniqueDates.map((date) => db.collection('oldDays').doc(date)),
  );
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));

  const records = calendar.flatMap((dates) => ([
    {
      feastKey: 'holyFamily',
      feastName: 'holyfamily',
      year: dates.year,
      date: dates.holyFamily,
      ...buildLegacyCopy(
        docsById.get(dates.holyFamily),
        docsById.get(addDays(dates.holyFamily, -1)),
      ),
    },
    {
      feastKey: 'christKing',
      feastName: 'christking',
      year: dates.year,
      date: dates.christKing,
      ...buildLegacyCopy(
        docsById.get(dates.christKing),
        docsById.get(addDays(dates.christKing, -1)),
      ),
    },
  ]));

  const output = {
    generatedAt: new Date().toISOString(),
    sourceCollections: ['yearOptions', 'oldDays'],
    years: YEARS,
    calendar,
    records,
    missingOldDaysDocuments: uniqueDates.filter((date) => !docsById.get(date)?.exists),
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    dates: calendar,
    records: records.map(({ feastKey, year, date, fields }) => ({
      feastKey,
      year,
      date,
      copiedFields: fields ? Object.keys(fields).length : 0,
    })),
    missingOldDaysDocuments: output.missingOldDaysDocuments,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
