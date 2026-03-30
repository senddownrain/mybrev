#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_COLLECTION_PRIMARY = 'oldDays';
const TARGET_COLLECTION = 'calendarMap';
const TARGET_PERIOD = 'ordinary';

const ordinaryRanges = [
  {
    year: 2019,
    ordinary: [
      ['2019-01-14', '2019-03-05'],
      ['2019-06-10', '2019-11-30']
    ]
  },
  {
    year: 2020,
    ordinary: [
      ['2020-01-13', '2020-02-25'],
      ['2020-06-01', '2020-11-28']
    ]
  },
  {
    year: 2021,
    ordinary: [
      ['2021-01-11', '2021-02-16'],
      ['2021-05-24', '2021-11-27']
    ]
  },
  {
    year: 2022,
    ordinary: [
      ['2022-01-10', '2022-03-01'],
      ['2022-06-06', '2022-11-26']
    ]
  },
  {
    year: 2023,
    ordinary: [
      ['2023-01-09', '2023-02-21'],
      ['2023-05-29', '2023-12-02']
    ]
  },
  {
    year: 2024,
    ordinary: [
      ['2024-01-08', '2024-02-13'],
      ['2024-05-20', '2024-11-30']
    ]
  },
  {
    year: 2025,
    ordinary: [
      ['2025-01-13', '2025-03-04'],
      ['2025-06-09', '2025-11-29']
    ]
  }
];

const TEMPLATE_CONTROLLED_FIELDS = [
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
  'laudesAntBen',
  'laudesPr',
  'vesperAntMag',
  'vesper1AntMag',
];

const RECOVERABLE_OFFICE_FIELDS = [
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
];

const SUNDAY_ONLY_FIELDS = [
  'vesperAntMag',
  'vesper1AntMag',
  'laudesAntBen',
];

const SUNDAY_WEEKS_EXCLUDED_FROM_VALIDATION = new Set([1, 34]);

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToDate(ymd) {
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(ymd, diffDays) {
  const date = ymdToDate(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + diffDays);
  return dateToYmd(date);
}

function dateToYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(ymd) {
  const parsed = ymdToDate(ymd);
  if (!parsed) return null;
  const day = parsed.getUTCDay();
  return day === 0 ? 1 : day + 1;
}

function isValidYmd(ymd) {
  if (typeof ymd !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return ymdToDate(ymd) !== null;
}

function psalmWeekFromPeriodWeek(periodWeekNumber) {
  const mod = periodWeekNumber % 4;
  return mod === 0 ? 4 : mod;
}

function buildDateSpan(start, end) {
  const out = [];
  const startMs = ymdToDate(start).getTime();
  const endMs = ymdToDate(end).getTime();
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    out.push(dateToYmd(new Date(ms)));
  }
  return out;
}

function buildOrdinaryDaysForYear({ year, ordinary }) {
  const [firstRange, secondRange] = ordinary;
  const firstDates = buildDateSpan(firstRange[0], firstRange[1]);
  const secondDates = buildDateSpan(secondRange[0], secondRange[1]);

  const days = [];
  let week = 1;

  firstDates.forEach((dateStr, index) => {
    const dow = dayOfWeek(dateStr);
    if (index > 0 && dow === 1) {
      week += 1;
    }
    days.push({ year, dateStr, _periodType: TARGET_PERIOD, _periodWeekNumber: week, _dayOfWeek: dow });
  });

  const secondStartWeek = week + 2;
  week = secondStartWeek;

  secondDates.forEach((dateStr, index) => {
    const dow = dayOfWeek(dateStr);
    if (index > 0 && dow === 1) {
      week += 1;
    }
    days.push({ year, dateStr, _periodType: TARGET_PERIOD, _periodWeekNumber: week, _dayOfWeek: dow });
  });

  return days;
}

function indexBy(items, keyBuilder) {
  const map = new Map();
  for (const item of items) {
    const key = keyBuilder(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return map;
}

function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return null;
}

function weekDayKey(week, day) {
  return `${Number(week)}|${Number(day)}`;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const [templatesSnap, completoriumSnap, readingsSnap, daysSnap, calendarMapSnap] = await Promise.all([
    db.collection('dayTemplates').where('_periodType', '==', TARGET_PERIOD).get(),
    db.collection('completoriumTemplates').where('_periodType', '==', TARGET_PERIOD).get(),
    db.collection('readings').where('_periodType', '==', TARGET_PERIOD).get(),
    db.collection(SOURCE_COLLECTION_PRIMARY).where('_periodType', '==', TARGET_PERIOD).get(),
    db.collection(TARGET_COLLECTION).where('_periodType', '==', TARGET_PERIOD).get(),
  ]);

  const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const completoriums = completoriumSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const readings = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const days = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const calendarMapDocs = calendarMapSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const templateByDayPsalm = indexBy(templates, (item) => {
    if (item._dayOfWeek == null || item._psalmWeekNumber == null) return null;
    return `${Number(item._dayOfWeek)}|${Number(item._psalmWeekNumber)}`;
  });

  const compByDay = indexBy(completoriums, (item) => {
    if (item._dayOfWeek == null) return null;
    return `${Number(item._dayOfWeek)}`;
  });

  const readingByWeekDay = indexBy(readings, (item) => {
    if (item._periodWeekNumber == null || item._dayOfWeek == null) return null;
    return `${Number(item._periodWeekNumber)}|${Number(item._dayOfWeek)}`;
  });
  const dayByDate = indexBy(days, (item) => item.id || item._date || null);
  const calendarMapByDate = indexBy(calendarMapDocs, (item) => item.id || item._date || null);
  calendarMapDocs.sort((a, b) => String(b._date || b.id || '').localeCompare(String(a._date || a.id || '')));

  const updates = [];
  const missing = { template: 0, comp: 0, reading: 0 };
  const resolvedFieldCacheByWeekDay = new Map();
  const report = {
    years: {},
    invalidDocs: [],
    sundayFieldIssues: [],
  };

  for (const day of calendarMapDocs) {
    if (Number(day._periodWeekNumber) < 1 || Number(day._periodWeekNumber) > 34) continue;
    const psalmWeek = psalmWeekFromPeriodWeek(day._periodWeekNumber);
    const template = templateByDayPsalm.get(`${day._dayOfWeek}|${psalmWeek}`) || null;
    const templateRef = template?.id || null;
    const compRef = compByDay.get(`${day._dayOfWeek}`)?.id || null;
    const weekDay = weekDayKey(day._periodWeekNumber, day._dayOfWeek);
    const reading = readingByWeekDay.get(weekDay) || null;
    const readingRef = reading?.id || null;
    const dateStr = isValidYmd(day._date) ? day._date : (isValidYmd(day.id) ? day.id : null);
    if (!dateStr) {
      report.invalidDocs.push({
        id: day.id || null,
        date: day._date || null,
        year: null,
        week: day._periodWeekNumber,
        day: day._dayOfWeek,
        missing: ['_date'],
      });
      continue;
    }
    const dayDoc = dayByDate.get(dateStr) || null;
    const prevDateStr = addDays(dateStr, -1);
    if (!prevDateStr) continue;
    const prevDayDoc = dayByDate.get(prevDateStr) || null;
    const prevCalendarDay = calendarMapByDate.get(prevDateStr) || null;
    const prevPsalmWeek = prevCalendarDay ? psalmWeekFromPeriodWeek(prevCalendarDay._periodWeekNumber) : null;
    const prevTemplate = prevCalendarDay
      ? (templateByDayPsalm.get(`${prevCalendarDay._dayOfWeek}|${prevPsalmWeek}`) || null)
      : null;

    if (!templateRef) missing.template += 1;
    if (!compRef) missing.comp += 1;
    if (!readingRef) missing.reading += 1;

    const payload = {};
    if (!hasValue(day.templateRef) && hasValue(templateRef)) payload.templateRef = templateRef;
    if (!hasValue(day.compRef) && hasValue(compRef)) payload.compRef = compRef;
    if (!hasValue(day.readingRef) && hasValue(readingRef)) payload.readingRef = readingRef;

    const unresolvedFields = [];
    const cachedFields = resolvedFieldCacheByWeekDay.get(weekDay) || {};
    const resolvedForWeekDay = { ...cachedFields };

    for (const field of RECOVERABLE_OFFICE_FIELDS) {
      if (hasValue(day[field])) {
        resolvedForWeekDay[field] = day[field];
        continue;
      }
      const value = firstNonEmpty(
        cachedFields[field],
        reading?.[field],
        dayDoc?.[field],
        template?.[field]
      );
      if (hasValue(value)) {
        payload[field] = value;
        resolvedForWeekDay[field] = value;
      } else {
        unresolvedFields.push(field);
      }
    }

    const isSunday = day._dayOfWeek === 1;
    const shouldValidateSundayFields =
      isSunday && !SUNDAY_WEEKS_EXCLUDED_FROM_VALIDATION.has(day._periodWeekNumber);
    const sundayMissing = [];
    for (const field of SUNDAY_ONLY_FIELDS) {
      if (isSunday) {
        if (hasValue(day[field])) {
          resolvedForWeekDay[field] = day[field];
          continue;
        }
        let sundayValue;
        if (field === 'vesper1AntMag') {
          // Воскресная I Вячэрня: берем антифон Магніфікат із суботы.
          sundayValue = firstNonEmpty(
            cachedFields[field],
            prevDayDoc?.vesperAntMag,
            prevTemplate?.vesperAntMag,
            dayDoc?.vesper1AntMag,
            template?.vesper1AntMag,
            reading?.vesper1AntMag
          );
        } else {
          sundayValue = firstNonEmpty(cachedFields[field], dayDoc?.[field], template?.[field], reading?.[field]);
        }
        if (hasValue(sundayValue)) {
          payload[field] = sundayValue;
          resolvedForWeekDay[field] = sundayValue;
        }
        if (shouldValidateSundayFields && !hasValue(sundayValue)) {
          sundayMissing.push(field);
        }
      }
    }

    const year = Number(String(dateStr).slice(0, 4));
    if (!report.years[year]) {
      report.years[year] = {
        total: 0,
        missingRefs: { template: 0, comp: 0, reading: 0 },
        unresolvedFields: 0,
        sundayMissingFields: 0,
      };
    }
    report.years[year].total += 1;
    if (!templateRef) report.years[year].missingRefs.template += 1;
    if (!compRef) report.years[year].missingRefs.comp += 1;
    if (!readingRef) report.years[year].missingRefs.reading += 1;
    report.years[year].unresolvedFields += unresolvedFields.length;
    report.years[year].sundayMissingFields += sundayMissing.length;

    if (unresolvedFields.length > 0) {
      report.invalidDocs.push({
        id: readingRef || dateStr,
        date: dateStr,
        year: Number(String(dateStr).slice(0, 4)),
        week: day._periodWeekNumber,
        day: day._dayOfWeek,
        missing: unresolvedFields,
      });
    }

    if (sundayMissing.length > 0) {
      report.sundayFieldIssues.push({
        id: readingRef || dateStr,
        date: dateStr,
        year: Number(String(dateStr).slice(0, 4)),
        week: day._periodWeekNumber,
        day: day._dayOfWeek,
        missing: sundayMissing,
      });
    }

    resolvedFieldCacheByWeekDay.set(weekDay, resolvedForWeekDay);
    if (Object.keys(payload).length > 0) {
      updates.push({ id: dateStr, payload });
    }
  }

  let saved = 0;
  for (const items of chunk(updates)) {
    const batch = db.batch();
    for (const item of items) {
      batch.set(db.collection(TARGET_COLLECTION).doc(item.id), item.payload, { merge: true });
    }
    await batch.commit();
    saved += items.length;
    console.log(`saved ${saved}/${updates.length}`);
  }

  const reportPath = path.resolve(__dirname, 'json/ordinary-calendar-map-update-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('done', {
    total: updates.length,
    missing,
    reportPath,
    invalidDocs: report.invalidDocs.length,
    sundayFieldIssues: report.sundayFieldIssues.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
