import admin from 'firebase-admin';
import * as cheerio from 'cheerio';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };

const SOURCE_URL = 'https://lh.catholic.by/kalyandar.php';
const FIRST_YEAR = 2026;
const LAST_YEAR = 2034;
const apply = process.argv.includes('--apply');

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parseBelarusianDate(value, year) {
  const monthByName = {
    'студз.': 0, 'лют.': 1, 'сакав.': 2, 'красав.': 3,
    'мая': 4, 'чэрв.': 5, 'ліп.': 6, 'жн.': 7,
    'вер.': 8, 'кастр.': 9, 'ліст.': 10, 'снеж.': 11,
  };
  const match = value.trim().match(/^(\d+)\s+(.+)$/);
  if (!match || monthByName[match[2]] === undefined) {
    throw new Error(`Cannot parse Belarusian date: ${value}`);
  }
  return new Date(Date.UTC(year, monthByName[match[2]], Number(match[1])));
}

function extractCalendarRows(html) {
  const $ = cheerio.load(html);
  const tables = $('table').toArray();
  const table = tables.at(-1);
  if (!table) throw new Error('Calendar table was not found on the source page.');

  const dates = new Map();
  $(table).find('tr').each((_, tr) => {
    const cells = $(tr).find('td').toArray().map((td) => $(td).text().trim().split(/\s*\n\s*/).filter(Boolean));
    if (cells.length < 12 || !cells[0].some((value) => /^20\d{2}$/.test(value))) return;

    for (let index = 0; index < cells[0].length; index += 1) {
      const year = Number(cells[0][index]);
      if (year < FIRST_YEAR || year > LAST_YEAR) continue;
      // The last calendar table columns are: year, cycles, psalter, Ash Wednesday,
      // Easter, Ascension, Pentecost, Corpus Christi, ..., Advent I.
      dates.set(year, {
        ashWednesday: parseBelarusianDate(cells[3][index], year),
        easterSunday: parseBelarusianDate(cells[4][index], year),
        ascension: parseBelarusianDate(cells[5][index], year),
        pentecost: parseBelarusianDate(cells[6][index], year),
        corpusChristi: parseBelarusianDate(cells[7][index], year),
        firstAdventSunday: parseBelarusianDate(cells.at(-1)[index], year),
      });
    }
  });
  return dates;
}

function toYearOptions(year, sourceDates) {
  const easterSunday = sourceDates.easterSunday;
  const epiphany = new Date(Date.UTC(year, 0, 6));
  let baptismOfLord = addDays(epiphany, 7 - epiphany.getUTCDay());
  if (baptismOfLord.getUTCMonth() === 0 && baptismOfLord.getUTCDate() < 7) baptismOfLord = addDays(baptismOfLord, 7);
  const ordinaryStart1 = addDays(baptismOfLord, 1);
  const ordinaryEnd1 = addDays(sourceDates.ashWednesday, -1);

  return {
    year,
    ashWednesday: dateString(sourceDates.ashWednesday),
    easterSunday: dateString(easterSunday),
    ascension: dateString(sourceDates.ascension),
    pentecost: dateString(sourceDates.pentecost),
    corpusChristi: dateString(sourceDates.corpusChristi),
    baptismOfLord: dateString(baptismOfLord),
    firstAdventSunday: dateString(sourceDates.firstAdventSunday),
    ordintaryStart1: dateString(ordinaryStart1),
    ordintaryWeeks1: Math.ceil((ordinaryEnd1 - ordinaryStart1 + 86400000) / 604800000),
    ordintaryStart2: dateString(addDays(easterSunday, 50)),
    ordintaryWeeks2: Math.ceil((ordinaryEnd1 - ordinaryStart1 + 86400000) / 604800000) + 2,
  };
}

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Source request failed: ${response.status} ${response.statusText}`);
const sourceRows = extractCalendarRows(await response.text());
if (sourceRows.size !== LAST_YEAR - FIRST_YEAR + 1) {
  throw new Error(`Expected ${LAST_YEAR - FIRST_YEAR + 1} rows, received ${sourceRows.size}.`);
}

const options = [...sourceRows].sort(([a], [b]) => a - b).map(([year, dates]) => toYearOptions(year, dates));
console.table(options.map(({ year, easterSunday, firstAdventSunday }) => ({ year, easterSunday, firstAdventSunday })));

if (!apply) {
  console.log('Dry run only. Re-run with --apply to create missing yearOptions documents.');
  process.exit(0);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const existing = await db.collection('yearOptions').get();
const existingYears = new Set(existing.docs.map((document) => Number(document.data().year)));
const missing = options.filter(({ year }) => !existingYears.has(year));
const batch = db.batch();
for (const item of missing) batch.set(db.collection('yearOptions').doc(), item);
if (missing.length) await batch.commit();
console.log(`Created ${missing.length} document(s): ${missing.map(({ year }) => year).join(', ') || 'none'}.`);
