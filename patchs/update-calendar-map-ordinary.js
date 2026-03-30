#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToDate(ymd) {
  return new Date(`${ymd}T00:00:00Z`);
}

function addDays(ymd, diffDays) {
  const date = ymdToDate(ymd);
  date.setUTCDate(date.getUTCDate() + diffDays);
  return dateToYmd(date);
}

function dateToYmd(date) {
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(ymd) {
  const day = ymdToDate(ymd).getUTCDay();
  return day === 0 ? 1 : day + 1;
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
    days.push({ year, dateStr, _periodType: 'ordinary', _periodWeekNumber: week, _dayOfWeek: dow });
  });

  const secondStartWeek = week + 2;
  week = secondStartWeek;

  secondDates.forEach((dateStr, index) => {
    const dow = dayOfWeek(dateStr);
    if (index > 0 && dow === 1) {
      week += 1;
    }
    days.push({ year, dateStr, _periodType: 'ordinary', _periodWeekNumber: week, _dayOfWeek: dow });
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

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const [templatesSnap, completoriumSnap, readingsSnap, daysSnap] = await Promise.all([
    db.collection('dayTemplates').where('_periodType', '==', 'ordinary').get(),
    db.collection('completoriumTemplates').where('_periodType', '==', 'ordinary').get(),
    db.collection('readings').where('_periodType', '==', 'ordinary').get(),
    db.collection('days').where('_periodType', '==', 'ordinary').get(),
  ]);

  const templates = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const completoriums = completoriumSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const readings = readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const days = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

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

  const ordinaryDays = ordinaryRanges
    .slice()
    .sort((a, b) => b.year - a.year)
    .flatMap((entry) => buildOrdinaryDaysForYear(entry));
  const ordinaryDayMetaByDate = new Map(ordinaryDays.map((d) => [d.dateStr, d]));

  const updates = [];
  const missing = { template: 0, comp: 0, reading: 0 };
  const report = {
    years: {},
    invalidDocs: [],
    sundayFieldIssues: [],
  };

  for (const day of ordinaryDays) {
    const psalmWeek = psalmWeekFromPeriodWeek(day._periodWeekNumber);
    const template = templateByDayPsalm.get(`${day._dayOfWeek}|${psalmWeek}`) || null;
    const templateRef = template?.id || null;
    const compRef = compByDay.get(`${day._dayOfWeek}`)?.id || null;
    const reading = readingByWeekDay.get(`${day._periodWeekNumber}|${day._dayOfWeek}`) || null;
    const readingRef = reading?.id || null;
    const dayDoc = dayByDate.get(day.dateStr) || null;
    const prevDateStr = addDays(day.dateStr, -1);
    const prevDayDoc = dayByDate.get(prevDateStr) || null;
    const prevMeta = ordinaryDayMetaByDate.get(prevDateStr) || null;
    const prevPsalmWeek = prevMeta ? psalmWeekFromPeriodWeek(prevMeta._periodWeekNumber) : null;
    const prevTemplate = prevMeta
      ? (templateByDayPsalm.get(`${prevMeta._dayOfWeek}|${prevPsalmWeek}`) || null)
      : null;

    if (!templateRef) missing.template += 1;
    if (!compRef) missing.comp += 1;
    if (!readingRef) missing.reading += 1;

    const payload = {
      _date: day.dateStr,
      _dayOfWeek: day._dayOfWeek,
      _periodType: 'ordinary',
      _periodWeekNumber: day._periodWeekNumber,
      templateRef,
      compRef,
      readingRef,
    };

    for (const field of TEMPLATE_CONTROLLED_FIELDS) {
      payload[field] = null;
    }

    const unresolvedFields = [];
    for (const field of RECOVERABLE_OFFICE_FIELDS) {
      const value = firstNonEmpty(reading?.[field], dayDoc?.[field], template?.[field]);
      payload[field] = value;
      if (!hasValue(value)) unresolvedFields.push(field);
    }

    const isSunday = day._dayOfWeek === 1;
    const sundayMissing = [];
    for (const field of SUNDAY_ONLY_FIELDS) {
      if (isSunday) {
        let sundayValue;
        if (field === 'vesper1AntMag') {
          // Воскресная I Вячэрня: берем антифон Магніфікат із суботы.
          sundayValue = firstNonEmpty(
            prevDayDoc?.vesperAntMag,
            prevTemplate?.vesperAntMag,
            dayDoc?.vesper1AntMag,
            template?.vesper1AntMag,
            reading?.vesper1AntMag
          );
        } else {
          sundayValue = firstNonEmpty(dayDoc?.[field], template?.[field], reading?.[field]);
        }
        payload[field] = sundayValue;
        if (!hasValue(sundayValue)) {
          sundayMissing.push(field);
        }
      } else {
        payload[field] = null;
      }
    }

    if (!report.years[day.year]) {
      report.years[day.year] = {
        total: 0,
        missingRefs: { template: 0, comp: 0, reading: 0 },
        unresolvedFields: 0,
        sundayMissingFields: 0,
      };
    }
    report.years[day.year].total += 1;
    if (!templateRef) report.years[day.year].missingRefs.template += 1;
    if (!compRef) report.years[day.year].missingRefs.comp += 1;
    if (!readingRef) report.years[day.year].missingRefs.reading += 1;
    report.years[day.year].unresolvedFields += unresolvedFields.length;
    report.years[day.year].sundayMissingFields += sundayMissing.length;

    if (unresolvedFields.length > 0) {
      report.invalidDocs.push({
        id: readingRef || day.dateStr,
        date: day.dateStr,
        year: day.year,
        week: day._periodWeekNumber,
        day: day._dayOfWeek,
        missing: unresolvedFields,
      });
    }

    if (sundayMissing.length > 0) {
      report.sundayFieldIssues.push({
        id: readingRef || day.dateStr,
        date: day.dateStr,
        year: day.year,
        week: day._periodWeekNumber,
        day: day._dayOfWeek,
        missing: sundayMissing,
      });
    }

    updates.push({ id: day.dateStr, payload });
  }

  let saved = 0;
  for (const items of chunk(updates)) {
    const batch = db.batch();
    for (const item of items) {
      batch.set(db.collection('calendarMap').doc(item.id), item.payload, { merge: true });
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
