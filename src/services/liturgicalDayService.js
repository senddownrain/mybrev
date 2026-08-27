/** Firestore access for normalized liturgical days in `fixedDays`. */
import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { LITURGICAL_DAYS_COLLECTION } from '@/constants/days';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { logger } from '@/utils/logger';
import { calculatePsalterWeek } from '@/utils/liturgicalPsalter';
import {
  applySeasonalWeekdayAntiphons,
  getPeriodDayDocumentId,
  getOrdinaryPsalterDayDocumentId,
  getPeriodPsalterDayDocumentId,
  getSeasonalDateExceptionId,
  hasMissingDaytimeFields,
  isChristmasDateExceptionExclusion,
  isSeasonalDateException,
  isSeasonalDateDocumentId,
  resolveDateDayAgainstPeriod,
  resolveChristmasDateAgainstPeriod,
  resolveDayAgainstPeriod,
  resolvePeriodDayAgainstPsalter,
} from '@/utils/liturgicalDayResolution';

export const OFFICE_FOR_DEAD_ID = 'office-for-dead';

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
  return snapshotToDocs(await getDocsOfflineAware(q));
}

async function queryAll(queries) {
  const results = await Promise.all(queries.map(queryDocs));
  const merged = new Map();
  results.flat().forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

async function withPeriodPsalterFallback(day, periodType, periodWeekNumber, dayOfWeek) {
  const resolved = resolveDayAgainstPeriod(day, null);
  if (!resolved || periodType === 'christmas') return resolved;
  if (periodType !== 'advent' && !hasMissingDaytimeFields(resolved)) return resolved;

  const fallbackId = periodType === 'ordinary'
    ? getPeriodPsalterDayDocumentId(periodType, periodWeekNumber, dayOfWeek)
    : getOrdinaryPsalterDayDocumentId(periodWeekNumber, dayOfWeek);
  if (!fallbackId || fallbackId === resolved.id) return resolved;
  try {
    const snapshot = await getDocOfflineAware(doc(getDaysCollection(), fallbackId));
    if (!snapshot.exists()) return resolved;
    const psalterDay = { id: snapshot.id, ...snapshot.data() };
    return periodType === 'advent'
      ? resolveDayAgainstPeriod(resolved, psalterDay, { fillMissing: true })
      : resolvePeriodDayAgainstPsalter(resolved, psalterDay);
  } catch (error) {
    logger.error(`[liturgicalDayService] psalter fallback failed (${fallbackId}):`, error);
    return resolved;
  }
}

export async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
  // Prefer the canonical document. Besides being cheaper than two compound
  // queries, this can read a day that is already present in IndexedDB while
  // Firestore is temporarily unavailable or its quota is exhausted.
  const canonicalId = getPeriodDayDocumentId(periodType, periodWeekNumber, dayOfWeek);
  let canonicalError = null;
  let canonicalDay = null;
  if (canonicalId) {
    try {
      const snapshot = await getDocOfflineAware(doc(getDaysCollection(), canonicalId));
      if (snapshot.exists()) {
        canonicalDay = { id: snapshot.id, ...snapshot.data() };
        return withPeriodPsalterFallback(
          canonicalDay, periodType, periodWeekNumber, dayOfWeek,
        );
      }
    } catch (error) {
      canonicalError = error;
    }
  }

  let variants = [];
  let queryError = null;
  try {
    variants = await queryAll([
      getDaysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber),
      query(
        getDaysCollection(),
        where('_periodType', '==', periodType),
        where('_dayOfWeek', '==', Number(dayOfWeek)),
        where('_periodWeekNumber', '==', Number(periodWeekNumber)),
      ),
    ]);
  } catch (error) {
    queryError = error;
  }
  if (variants[0]) {
    return withPeriodPsalterFallback(
      variants[0], periodType, periodWeekNumber, dayOfWeek,
    );
  }
  if (canonicalDay) {
    return withPeriodPsalterFallback(
      canonicalDay, periodType, periodWeekNumber, dayOfWeek,
    );
  }
  if (canonicalError) throw canonicalError;
  if (queryError) throw queryError;
  return null;
}

export async function getAllFeastDays() {
  logger.log(`[liturgicalDayService] Loading ${LITURGICAL_DAYS_COLLECTION}`);
  const snapshot = await getDocsOfflineAware(getDaysCollection());
  return snapshotToDocs(snapshot)
    .filter((item) => (item._feast || item._rank || item._date) && !isSeasonalDateDocumentId(item.id))
    .map((item) => resolveDayAgainstPeriod(item, null));
}

async function getSeasonalException(mDate, periodType) {
  const id = getSeasonalDateExceptionId(mDate, periodType);
  if (!id) return null;
  const snapshot = await getDocOfflineAware(doc(db, LITURGICAL_DAYS_COLLECTION, id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getOfficeForDead() {
  const snapshot = await getDocOfflineAware(doc(db, LITURGICAL_DAYS_COLLECTION, OFFICE_FOR_DEAD_ID));
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
      .then(async (day) => {
        if (day || context.periodType !== 'christmas') return day;
        const psalterWeek = calculatePsalterWeek({
          date: mDate,
          periodType: 'christmas',
          periodWeek: context.periodWeek,
        });
        return psalterWeek > 0
          ? findDayByPeriod('advent', psalterWeek, context.dayOfWeek)
          : null;
      })
    : Promise.resolve(null);
  const fixedDateVariants = [...new Set([mDate.format('DD.MM'), mDate.format('D.M')])];
  const fixedPromise = exclusiveFeastCode
    ? Promise.resolve([])
    : queryAll(fixedDateVariants.map(getDaysByFixedDateQuery));
  const seasonalPromise = exclusiveFeastCode
    ? Promise.resolve(null)
    : (context.periodType === 'advent' || context.periodType === 'christmas'
      ? getSeasonalException(mDate, context.periodType)
      : Promise.resolve(null));
  const officeForDeadPromise = getOfficeForDead();
  const dynamicPromises = dynamicFeastCodes.map(async (code) => {
    const docs = await queryAll(dynamicFeastVariants(code).map(getDaysByFeastQuery));
    return [code, docs];
  });

  const [periodDay, fixedDocs, seasonalDay, officeForDead, dynamicEntries] = await Promise.all([
    periodPromise,
    fixedPromise,
    seasonalPromise,
    officeForDeadPromise,
    Promise.all(dynamicPromises),
  ]);
  const withCalendarContext = (day, overrides = {}) => day ? {
    ...day,
    _periodType: overrides.periodType || context.periodType || day._periodType,
    _periodWeekNumber: overrides.periodWeek ?? context.periodWeek ?? day._periodWeekNumber,
    _dayOfWeek: context.dayOfWeek ?? day._dayOfWeek,
  } : null;
  const resolvedPeriodDay = withCalendarContext(resolveDayAgainstPeriod(periodDay, null));

  const hasSeasonalException = isSeasonalDateException(mDate, context.periodType)
    && Boolean(seasonalDay);
  const seasonalPeriodType = mDate.month() === 11 && mDate.date() <= 24
    ? 'advent'
    : 'christmas';
  const seasonalPeriodWeek = context.periodWeek;
  const seasonal = hasSeasonalException
    ? applySeasonalWeekdayAntiphons(
      withCalendarContext(
        context.periodType === 'christmas'
          ? resolveChristmasDateAgainstPeriod(seasonalDay, resolvedPeriodDay)
          : resolveDayAgainstPeriod(seasonalDay, resolvedPeriodDay, { fillMissing: true }),
        { periodType: seasonalPeriodType, periodWeek: seasonalPeriodWeek },
      ),
      context.dayOfWeek,
    )
    : null;
  const resolvedFixed = fixedDocs
    .filter((item) => item.id !== seasonalDay?.id && !isSeasonalDateDocumentId(item.id))
    .map((item) => withCalendarContext(resolveDateDayAgainstPeriod(item, resolvedPeriodDay)));
  if (seasonal) resolvedFixed.unshift(seasonal);

  const resolvedDynamicDays = new Map(dynamicEntries
    .filter(([code]) => !exclusiveFeastCode || normalizedFeastCode(code) === exclusiveFeastCode)
    .map(([code, docs]) => [
      code,
      docs.map((item) => withCalendarContext(resolveDayAgainstPeriod(item, resolvedPeriodDay))),
    ]));
  const resolvedOfficeForDead = officeForDead
    ? withCalendarContext(resolveDayAgainstPeriod(officeForDead, resolvedPeriodDay))
    : null;

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
    officeForDead: resolvedOfficeForDead,
  };
}
