import { writeFile } from 'node:fs/promises';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const SOURCE_COLLECTION_PRIMARY = 'oldDates';
const SOURCE_COLLECTION_FALLBACK = 'oldDays';
const TARGET_COLLECTION = 'dayTemplates';

const ADVENT_STARTS = {
  2025: '2025-11-30',
  2024: '2024-12-01',
  2023: '2023-12-03',
  2022: '2022-11-27',
  2021: '2021-11-28',
  2020: '2020-11-29',
  2019: '2019-12-01',
};

const YEARS_DESC = Object.keys(ADVENT_STARTS).map(Number).sort((a, b) => b - a);
const SEARCH_END_SUFFIX = '-12-16';

const WEEKDAY_LABELS = {
  1: 'Нядзеля',
  2: 'Панядзелак',
  3: 'Аўторак',
  4: 'Серада',
  5: 'Чацвер',
  6: 'Пятніца',
  7: 'Субота',
};

function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseRomanNumeralToNumber(raw) {
  if (!raw) return null;
  const normalized = String(raw)
    .toUpperCase()
    .replace(/І/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/\b(IV|III|II|I)\b\s+ТЫДЗЕНЬ\s+ПСАЛТЫРА/i);
  if (!match) return null;

  switch (match[1]) {
    case 'I': return 1;
    case 'II': return 2;
    case 'III': return 3;
    case 'IV': return 4;
    default: return null;
  }
}

function ymdToDate(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}

function addDays(ymd, days) {
  const dt = ymdToDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fallbackDayOfWeekFromDate(ymd) {
  const js = ymdToDate(ymd).getUTCDay();
  return js === 0 ? 1 : js + 1;
}

function asNullable(value) {
  return value === undefined ? null : value;
}

function buildTemplateId(psalmWeekNumber, dayOfWeek) {
  return `advent-psalmweek-${psalmWeekNumber}-day-${dayOfWeek}`;
}

function buildTitle(psalmWeekNumber, dayOfWeek) {
  return `${psalmWeekNumber} тыдзень, ${WEEKDAY_LABELS[dayOfWeek] || dayOfWeek}, Адвэнт`;
}

function buildWindowDates(startDate, endDateInclusive) {
  const out = [];
  for (let cursor = startDate; cursor <= endDateInclusive; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}

async function loadSourceRows(db) {
  const minYear = Math.min(...YEARS_DESC);
  const maxYear = Math.max(...YEARS_DESC);
  const globalMin = `${minYear}-11-20`;
  const globalMax = `${maxYear}${SEARCH_END_SUFFIX}`;

  const byDocIdQuery = (collectionName) => db.collection(collectionName)
    .where(admin.firestore.FieldPath.documentId(), '>=', globalMin)
    .where(admin.firestore.FieldPath.documentId(), '<=', globalMax)
    .orderBy(admin.firestore.FieldPath.documentId());

  const primary = await byDocIdQuery(SOURCE_COLLECTION_PRIMARY).get();
  if (!primary.empty) {
    return {
      sourceCollection: SOURCE_COLLECTION_PRIMARY,
      rows: primary.docs.map((d) => ({ id: d.id, ...d.data() })),
      fallbackUsed: false,
    };
  }

  const fallback = await byDocIdQuery(SOURCE_COLLECTION_FALLBACK).get();
  return {
    sourceCollection: SOURCE_COLLECTION_FALLBACK,
    rows: fallback.docs.map((d) => ({ id: d.id, ...d.data() })),
    fallbackUsed: true,
  };
}

async function deleteExistingAdventTemplates(db) {
  const snap = await db.collection(TARGET_COLLECTION).where('_periodType', '==', 'advent').get();
  let deleted = 0;

  for (const docsChunk of chunk(snap.docs, 400)) {
    const batch = db.batch();
    for (const docSnap of docsChunk) {
      batch.delete(docSnap.ref);
      deleted += 1;
    }
    await batch.commit();
  }

  return deleted;
}

function buildTemplateFromRow(row, sourceByDate, dateStr, psalmWeekNumber, dayOfWeek, report) {
  const template = {
    _title: buildTitle(psalmWeekNumber, dayOfWeek),
    _checkedAt: null,
    _dayOfWeek: dayOfWeek,
    _isChecked: false,
    _periodType: 'advent',
    _psalmWeekNumber: psalmWeekNumber,
    laudesAnt1: asNullable(row.laudesAnt1),
    laudesAnt2: asNullable(row.laudesAnt2),
    laudesAnt3: asNullable(row.laudesAnt3),
    laudesPs1: asNullable(row.laudesPs1),
    laudesPs2: asNullable(row.laudesPs2),
    laudesPs3: asNullable(row.laudesPs3),
    sext1Ant1: asNullable(row.sext1Ant1),
    sext1Ant2: asNullable(row.sext1Ant2),
    sext1Ant3: asNullable(row.sext1Ant3),
    sext1Ps1: asNullable(row.sext1Ps1),
    sext1Ps2: asNullable(row.sext1Ps2),
    sext1Ps3: asNullable(row.sext1Ps3),
    sext2Ant1: asNullable(row.sext2Ant1),
    sext2Ant2: asNullable(row.sext2Ant2),
    sext2Ant3: asNullable(row.sext2Ant3),
    sext2Ps1: asNullable(row.sext2Ps1),
    sext2Ps2: asNullable(row.sext2Ps2),
    sext2Ps3: asNullable(row.sext2Ps3),
    sext3Ant1: asNullable(row.sext3Ant1),
    sext3Ant2: asNullable(row.sext3Ant2),
    sext3Ant3: asNullable(row.sext3Ant3),
    sext3Ps1: asNullable(row.sext3Ps1),
    sext3Ps2: asNullable(row.sext3Ps2),
    sext3Ps3: asNullable(row.sext3Ps3),
    vesper1Ant1: null,
    vesper1Ant2: null,
    vesper1Ant3: null,
    vesper1Ps1: null,
    vesper1Ps2: null,
    vesper1Ps3: null,
    vesper2Ant1: asNullable(row.vesperAnt1),
    vesper2Ant2: asNullable(row.vesperAnt2),
    vesper2Ant3: asNullable(row.vesperAnt3),
    vesper2Ps1: asNullable(row.vesperPs1),
    vesper2Ps2: asNullable(row.vesperPs2),
    vesper2Ps3: asNullable(row.vesperPs3),
  };

  if (dayOfWeek === 1) {
    const saturdayDate = addDays(dateStr, -1);
    const saturdayRow = sourceByDate.get(saturdayDate);
    if (!saturdayRow) {
      report.stats.missingSaturdayForVesper1.push({ sunday: dateStr, saturdayExpected: saturdayDate, reason: 'not found' });
    } else {
      template.vesper1Ant1 = asNullable(saturdayRow.vesperAnt1);
      template.vesper1Ant2 = asNullable(saturdayRow.vesperAnt2);
      template.vesper1Ant3 = asNullable(saturdayRow.vesperAnt3);
      template.vesper1Ps1 = asNullable(saturdayRow.vesperPs1);
      template.vesper1Ps2 = asNullable(saturdayRow.vesperPs2);
      template.vesper1Ps3 = asNullable(saturdayRow.vesperPs3);
    }
  }

  return template;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const sourceLoad = await loadSourceRows(db);
  const sourceByDate = new Map(sourceLoad.rows.map((row) => [row.id, row]));

  const deletedTemplates = await deleteExistingAdventTemplates(db);

  const report = {
    sourceCollection: sourceLoad.sourceCollection,
    fallbackUsed: sourceLoad.fallbackUsed,
    deletedTemplates,
    yearsScanned: YEARS_DESC,
    windows: YEARS_DESC.map((year) => ({ year, from: ADVENT_STARTS[year], to: `${year}${SEARCH_END_SUFFIX}` })),
    stats: {
      totalRowsLoaded: sourceLoad.rows.length,
      createdTemplates: 0,
      missingTemplateSlots: [],
      missingAdventDaysByYear: {},
      missingPsalmWeek: [],
      missingSaturdayForVesper1: [],
      filledFrom: {},
    },
  };

  const filledTemplates = new Map();

  for (const year of YEARS_DESC) {
    const startDate = ADVENT_STARTS[year];
    const endDate = `${year}${SEARCH_END_SUFFIX}`;
    const dates = buildWindowDates(startDate, endDate);

    report.stats.missingAdventDaysByYear[year] = [];

    for (const dateStr of dates) {
      const row = sourceByDate.get(dateStr);
      if (!row || row._periodType !== 'advent') {
        report.stats.missingAdventDaysByYear[year].push(dateStr);
        continue;
      }

      const psalmWeekNumber = parseRomanNumeralToNumber(row._feastName);
      if (!psalmWeekNumber) {
        report.stats.missingPsalmWeek.push({ date: dateStr, feastName: row._feastName ?? null });
        continue;
      }

      const dayOfWeek = Number(row._dayOfWeek) || fallbackDayOfWeekFromDate(dateStr);
      const templateId = buildTemplateId(psalmWeekNumber, dayOfWeek);

      if (filledTemplates.has(templateId)) continue;

      const payload = buildTemplateFromRow(row, sourceByDate, dateStr, psalmWeekNumber, dayOfWeek, report);
      filledTemplates.set(templateId, { id: templateId, payload, sourceDate: dateStr, sourceYear: year });
      report.stats.filledFrom[templateId] = { year, date: dateStr };
    }
  }

  const templatesToWrite = Array.from(filledTemplates.values());

  for (const rowsChunk of chunk(templatesToWrite, 400)) {
    const batch = db.batch();
    for (const row of rowsChunk) {
      const ref = db.collection(TARGET_COLLECTION).doc(row.id);
      batch.set(ref, row.payload, { merge: false });
    }
    await batch.commit();
  }

  report.stats.createdTemplates = templatesToWrite.length;

  for (let week = 1; week <= 4; week += 1) {
    for (let day = 1; day <= 7; day += 1) {
      const id = buildTemplateId(week, day);
      if (!filledTemplates.has(id)) report.stats.missingTemplateSlots.push(id);
    }
  }

  const reportPath = new URL('./json/advent-day-templates-regeneration-report.json', import.meta.url);
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log('Template IDs:', templatesToWrite.map((item) => item.id).join(', '));

  if (report.stats.missingTemplateSlots.length > 0 || report.stats.missingPsalmWeek.length > 0 || report.stats.missingSaturdayForVesper1.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
