/** Firestore access for normalized liturgical days in `fixedDays`. */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { LITURGICAL_DAYS_COLLECTION } from '@/constants/days';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';
import {
  applySeasonalWeekdayAntiphons,
  getSeasonalDateExceptionId,
  isChristmasDateExceptionExclusion,
  isSeasonalDateException,
  isSeasonalDateDocumentId,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';

function getDaysCollection() {
  return collection(db, LITURGICAL_DAYS_COLLECTION);
}

export function getDaysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber) {
  return query(
    getDaysCollection(),
    where('_periodType', '==', periodType),
    where('_dayOfWeek', '==', `${dayOfWeek}`),
    where('_periodWeekNumber', '==', `${periodWeekNumber}`),
  );
}

export function getDaysByFixedDateQuery(dateStr) {
  return query(getDaysCollection(), where('_date', '==', dateStr));
}

export function getDaysByFeastQuery(feastCode) {
  return query(getDaysCollection(), where('_feast', '==', feastCode));
}

function snapshotToDocs(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function queryDocs(q) {
  return snapshotToDocs(await retryFirestore(() => getDocs(q)));
}

async function queryAll(queries) {
  const results = await Promise.all(queries.map(queryDocs));
  const merged = new Map();
  results.flat().forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
  const variants = await queryAll([
    getDaysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber),
    query(
      getDaysCollection(),
      where('_periodType', '==', periodType),
      where('_dayOfWeek', '==', Number(dayOfWeek)),
      where('_periodWeekNumber', '==', Number(periodWeekNumber)),
    ),
  ]);
  return resolveDayAgainstPeriod(variants[0] || null, null);
}

export async function getAllFeastDays() {
  logger.log(`[liturgicalDayService] Loading ${LITURGICAL_DAYS_COLLECTION}`);
  const snapshot = await retryFirestore(() => getDocs(getDaysCollection()));
  return snapshotToDocs(snapshot)
    .filter((item) => (item._feast || item._rank || item._date) && !isSeasonalDateDocumentId(item.id))
    .map((item) => resolveDayAgainstPeriod(item, null));
}

async function getSeasonalException(mDate) {
  const id = getSeasonalDateExceptionId(mDate);
  if (!id) return null;
  const snapshot = await retryFirestore(() => getDoc(doc(db, LITURGICAL_DAYS_COLLECTION, id)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function dynamicFeastVariants(code) {
  const normalized = String(code || '').replace(/^feast-/, '');
  return [...new Set([normalized, `feast-${normalized}`])];
}

const normalizedFeastCode = (code) => String(code || '').replace(/^feast-/, '');

/** Fetch and resolve all day variants for a calendar date. */
export async function fetchDaysForDate(mDate, context, dynamicFeastCodes = []) {
  const hasPeriod = context.periodType && context.periodWeek !== undefined && context.dayOfWeek;
  const exclusiveFeastCode = dynamicFeastCodes
    .map(normalizedFeastCode)
    .find((code) => code === 'holyfamily' || code === 'buptismofthelord') || null;
  const exclusiveFixedDate = isChristmasDateExceptionExclusion(mDate);
  const periodPromise = hasPeriod
    ? findDayByPeriod(context.periodType, context.periodWeek, context.dayOfWeek)
    : Promise.resolve(null);
  const fixedDateVariants = [...new Set([mDate.format('DD.MM'), mDate.format('D.M')])];
  const fixedPromise = exclusiveFeastCode
    ? Promise.resolve([])
    : queryAll(fixedDateVariants.map(getDaysByFixedDateQuery));
  const seasonalPromise = exclusiveFeastCode
    ? Promise.resolve(null)
    : getSeasonalException(mDate);
  const dynamicPromises = dynamicFeastCodes.map(async (code) => {
    const docs = await queryAll(dynamicFeastVariants(code).map(getDaysByFeastQuery));
    return [code, docs];
  });

  const [periodDay, fixedDocs, seasonalDay, dynamicEntries] = await Promise.all([
    periodPromise,
    fixedPromise,
    seasonalPromise,
    Promise.all(dynamicPromises),
  ]);
  const withCalendarContext = (day, overrides = {}) => day ? {
    ...day,
    _periodType: overrides.periodType || context.periodType || day._periodType,
    _periodWeekNumber: overrides.periodWeek ?? context.periodWeek ?? day._periodWeekNumber,
    _dayOfWeek: context.dayOfWeek ?? day._dayOfWeek,
  } : null;
  const resolvedPeriodDay = withCalendarContext(resolveDayAgainstPeriod(periodDay, null));

  const hasSeasonalException = isSeasonalDateException(mDate)
    && Boolean(seasonalDay);
  const seasonalPeriodType = mDate.month() === 11 && mDate.date() <= 24
    ? 'advent'
    : 'christmas';
  const seasonalPeriodWeek = seasonalPeriodType === 'christmas'
    ? (mDate.month() === 11 ? 1 : 2)
    : context.periodWeek;
  const seasonal = hasSeasonalException
    ? applySeasonalWeekdayAntiphons(
      withCalendarContext(
        resolveDayAgainstPeriod(seasonalDay, resolvedPeriodDay, { fillMissing: true }),
        { periodType: seasonalPeriodType, periodWeek: seasonalPeriodWeek },
      ),
      context.dayOfWeek,
    )
    : null;
  const resolvedFixed = fixedDocs
    .filter((item) => item.id !== seasonalDay?.id && !isSeasonalDateDocumentId(item.id))
    .map((item) => withCalendarContext(resolveDayAgainstPeriod(item, resolvedPeriodDay)));
  if (seasonal) resolvedFixed.unshift(seasonal);

  const resolvedDynamicDays = new Map(dynamicEntries
    .filter(([code]) => !exclusiveFeastCode || normalizedFeastCode(code) === exclusiveFeastCode)
    .map(([code, docs]) => [
      code,
      docs.map((item) => withCalendarContext(resolveDayAgainstPeriod(item, resolvedPeriodDay))),
    ]));

  return {
    periodDays: exclusiveFeastCode || exclusiveFixedDate || hasSeasonalException
      ? []
      : (resolvedPeriodDay ? [resolvedPeriodDay] : []),
    periodFallback: resolvedPeriodDay,
    fixedDays: exclusiveFeastCode ? [] : resolvedFixed,
    dynamicDaysByFeast: resolvedDynamicDays,
    seasonalException: exclusiveFeastCode ? null : seasonal,
    exclusiveFeastCode,
    exclusiveFixedDate,
  };
}
