/**
 * Data-access layer for combined liturgical content (days + readings).
 * Assembles the full dayOptions structure consumed by ItemsList / OrasList.
 * No calendar math, no Pinia stores — receives precomputed context.
 */
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';
import {
  PERIOD_LABEL_MAP,
  WEEKDAY_LABEL_MAP,
  LITURGICAL_OPTION_SOURCE,
} from '@/constants/liturgical';

const DAYS_COLLECTION     = 'days';
const READINGS_COLLECTION = 'readings';

const getDaysCollection     = () => collection(db, DAYS_COLLECTION);
const getReadingsCollection = () => collection(db, READINGS_COLLECTION);

// ---------------------------------------------------------------------------
// Query builders — days
// ---------------------------------------------------------------------------

function daysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber) {
  return query(
    getDaysCollection(),
    where('_periodType',       '==', periodType),
    where('_dayOfWeek',        '==', `${dayOfWeek}`),
    where('_periodWeekNumber', '==', `${periodWeekNumber}`),
  );
}

function daysByFixedDateQuery(dateStr) {
  return query(getDaysCollection(), where('_date',  '==', dateStr));
}

function daysByFeastQuery(feastCode) {
  return query(getDaysCollection(), where('_feast', '==', feastCode));
}

// ---------------------------------------------------------------------------
// Query builders — readings
// Readings may store _dayOfWeek and _periodWeekNumber as numbers or strings.
// Build both variants to cover data created before or after migrations.
// ---------------------------------------------------------------------------

function readingsByPeriodQueries(periodType, dayOfWeek, periodWeekNumber) {
  const weekVariants = [periodWeekNumber, `${periodWeekNumber}`];
  const dayVariants  = [dayOfWeek,        `${dayOfWeek}`];
  const queries = [];
  const seen    = new Set();

  weekVariants.forEach((week) => {
    dayVariants.forEach((day) => {
      const key = `${typeof week}:${week}|${typeof day}:${day}`;
      if (!seen.has(key)) {
        seen.add(key);
        queries.push(query(
          getReadingsCollection(),
          where('_periodType',       '==', periodType),
          where('_dayOfWeek',        '==', day),
          where('_periodWeekNumber', '==', week),
        ));
      }
    });
  });

  return queries;
}

function readingsByFixedDateQuery(dateStr) {
  return query(getReadingsCollection(), where('_date',  '==', dateStr));
}

function readingsByFeastQuery(feastCode) {
  return query(getReadingsCollection(), where('_feast', '==', feastCode));
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

function snapshotToDocs(snapshot) {
  const docs = [];
  snapshot.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
  return docs;
}

function buildPeriodTitle(context) {
  const periodName = PERIOD_LABEL_MAP[context.periodType]  || 'Літургічны перыяд';
  const weekDayName = WEEKDAY_LABEL_MAP[context.dayOfWeek] || '';
  const weekChunk   = context.periodWeek > -1 ? `${context.periodWeek} тыдз.` : '';
  return [periodName, weekChunk, weekDayName].filter(Boolean).join(', ');
}

function pickReadingWithoutPlace(readings) {
  if (!readings.length) return null;
  return readings.find((r) => !r.place) || readings[0];
}

// ---------------------------------------------------------------------------
// Main service method
// ---------------------------------------------------------------------------

/**
 * Fetch combined liturgical content for a specific date.
 *
 * @param {moment.Moment} mDate - start of day
 * @param {{ periodType: string, periodWeek: number, dayOfWeek: number, _feast: string|null }} context
 * @param {string[]} dynamicFeastCodes - feast codes active on mDate
 * @returns {Promise<{
 *   context: Object,
 *   itemsDays: Object[],
 *   itemsReadings: Object[],
 *   dayOptions: Object[]
 * }>}
 */
export async function fetchContentForDate(mDate, context, dynamicFeastCodes = []) {
  logger.log(`[liturgicalContentService] Fetching content for ${mDate.format('YYYY-MM-DD')}`);

  const hasPeriod = context.periodType && context.periodWeek !== undefined && context.dayOfWeek;
  const dateStr   = mDate.format('D.M');

  // --- Build query lists ---
  const periodDayQueryList     = hasPeriod ? [daysByPeriodQuery(context.periodType, context.dayOfWeek, context.periodWeek)] : [];
  const periodReadingQueryList = hasPeriod ? readingsByPeriodQueries(context.periodType, context.dayOfWeek, context.periodWeek) : [];

  const dynamicDayItems     = dynamicFeastCodes.map((fc) => ({ feastCode: fc, q: daysByFeastQuery(fc) }));
  const dynamicReadingItems = dynamicFeastCodes.map((fc) => ({ feastCode: fc, q: readingsByFeastQuery(fc) }));

  // --- Execute all in parallel ---
  const [
    periodDaySnaps,
    periodReadingSnaps,
    fixedDaySnap,
    fixedReadingSnap,
    dynamicDaySnaps,
    dynamicReadingSnaps,
  ] = await Promise.all([
    Promise.all(periodDayQueryList.map((q)     => retryFirestore(() => getDocs(q)))),
    Promise.all(periodReadingQueryList.map((q)  => retryFirestore(() => getDocs(q)))),
    retryFirestore(() => getDocs(daysByFixedDateQuery(dateStr))),
    retryFirestore(() => getDocs(readingsByFixedDateQuery(dateStr))),
    Promise.all(dynamicDayItems.map(({ q })     => retryFirestore(() => getDocs(q)))),
    Promise.all(dynamicReadingItems.map(({ q }) => retryFirestore(() => getDocs(q)))),
  ]);

  // --- Flatten raw docs ---
  const periodDaysDocs    = periodDaySnaps.flatMap(snapshotToDocs);
  const periodReadingsDocs = periodReadingSnaps.flatMap(snapshotToDocs);
  const fixedDaysDocs     = snapshotToDocs(fixedDaySnap);
  const fixedReadingsDocs = snapshotToDocs(fixedReadingSnap);

  const dynamicDayDocsByFeast = new Map();
  dynamicDayItems.forEach(({ feastCode }, i) => {
    const existing = dynamicDayDocsByFeast.get(feastCode) || [];
    dynamicDayDocsByFeast.set(feastCode, [...existing, ...snapshotToDocs(dynamicDaySnaps[i])]);
  });

  const dynamicReadingDocsByFeast = new Map();
  dynamicReadingItems.forEach(({ feastCode }, i) => {
    const existing = dynamicReadingDocsByFeast.get(feastCode) || [];
    dynamicReadingDocsByFeast.set(feastCode, [...existing, ...snapshotToDocs(dynamicReadingSnaps[i])]);
  });

  // --- Deduplicated flat collections ---
  const daysMap = new Map();
  [
    ...periodDaysDocs,
    ...fixedDaysDocs,
    ...Array.from(dynamicDayDocsByFeast.values()).flat(),
  ].forEach((d) => { if (!daysMap.has(d.id)) daysMap.set(d.id, d); });

  const readingsMap = new Map();
  [
    ...periodReadingsDocs,
    ...fixedReadingsDocs,
    ...Array.from(dynamicReadingDocsByFeast.values()).flat(),
  ].forEach((d) => { if (!readingsMap.has(d.id)) readingsMap.set(d.id, d); });

  // --- Assemble dayOptions ---
  const liturgicalOptions = [];

  // 1. Period option (always present)
  const periodDay     = periodDaysDocs[0]     || null;
  const periodReading = periodReadingsDocs[0] || null;

  liturgicalOptions.push({
    key:             `period-${context.periodType}-${context.periodWeek}-${context.dayOfWeek}`,
    source:          LITURGICAL_OPTION_SOURCE.PERIOD,
    title:           periodDay?._feastName || periodDay?.title || buildPeriodTitle(context),
    subtitle:        'Літургічны дзень па перыядзе',
    day:             periodDay,
    reading:         periodReading,
    order:           1,
    contextPeriodType: context.periodType,
  });

  // 2. Dynamic feast options
  const dynamicFeastKeys = [
    ...new Set([...dynamicDayDocsByFeast.keys(), ...dynamicReadingDocsByFeast.keys()]),
  ];

  dynamicFeastKeys.forEach((feastCode) => {
    const day     = dynamicDayDocsByFeast.get(feastCode)?.[0]     || null;
    const reading = dynamicReadingDocsByFeast.get(feastCode)?.[0] || null;
    if (!day && !reading) return;

    liturgicalOptions.push({
      key:             `dynamic-${feastCode}`,
      source:          LITURGICAL_OPTION_SOURCE.DYNAMIC,
      title:           day?._feastName || day?.title || reading?.title || feastCode,
      subtitle:        'Рухомае свята',
      day,
      reading,
      order:           2,
      contextPeriodType: context.periodType,
    });
  });

  // 3. Fixed date options — pair days with readings, orphan readings last
  const fixedReadingsPool = [...fixedReadingsDocs];

  fixedDaysDocs.forEach((day) => {
    let reading = fixedReadingsPool.find((r) => r.id === day.id) || null;
    if (!reading) reading = pickReadingWithoutPlace(fixedReadingsPool);
    if (reading) {
      const idx = fixedReadingsPool.findIndex((r) => r.id === reading.id);
      if (idx > -1) fixedReadingsPool.splice(idx, 1);
    }
    liturgicalOptions.push({
      key:             `fixed-${day.id}`,
      source:          LITURGICAL_OPTION_SOURCE.FIXED,
      title:           day._feastName || day.title || `Дата ${day._date}`,
      subtitle:        'Свята па фіксаванай даце',
      day,
      reading,
      order:           3,
      contextPeriodType: context.periodType,
    });
  });

  // Orphan fixed readings (no paired day)
  (fixedDaysDocs.length === 0 ? fixedReadingsPool : []).forEach((reading) => {
    liturgicalOptions.push({
      key:             `fixed-reading-only-${reading.id}`,
      source:          LITURGICAL_OPTION_SOURCE.FIXED,
      title:           reading.title || `Дата ${reading._date}`,
      subtitle:        'Свята па фіксаванай даце',
      day:             null,
      reading,
      order:           3,
      contextPeriodType: context.periodType,
    });
  });

  const dayOptions = liturgicalOptions
    .sort((a, b) => a.order - b.order)
    .map((option) => ({
      ...option,
      dayId:            option.day?.id    || null,
      readingId:        option.reading?.id || null,
      hasLiturgicalDay: Boolean(option.day),
      hasReadings:      Boolean(option.reading),
      disabled:         false,
    }));

  logger.log(
    `[liturgicalContentService] Content ready for ${mDate.format('YYYY-MM-DD')}:`,
    `${daysMap.size} days, ${readingsMap.size} readings, ${dayOptions.length} options`,
  );

  return {
    context,
    itemsDays:    Array.from(daysMap.values()),
    itemsReadings: Array.from(readingsMap.values()),
    dayOptions,
  };
}
