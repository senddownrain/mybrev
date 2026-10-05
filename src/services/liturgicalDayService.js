/** Firestore access for normalized liturgical days in `days`. */
import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { LITURGICAL_DAYS_COLLECTION, LITURGICAL_PROPER_TEXTS_COLLECTION } from '@/constants/days';
import { isSparseDayDocument } from '@/constants/officeFields';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { logger } from '@/utils/logger';
import { calculatePsalterWeek } from '@/utils/liturgicalPsalter';
import {
  getPeriodDayDocumentId,
  getSeasonalDateDocumentId,
  getSeasonalDateExceptionId,
  isSeasonalDateDocumentId,
  withoutObsoleteDocuments,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';
import {
  applyPeriodPsalterFallback,
  assembleDaysResult,
  exclusiveFeastCodeOf,
  fixedDateVariantsOf,
  periodPsalterFallbackId,
} from '@/utils/daysResult';

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

export function getProperTextsByDateQuery(dateStr) {
  return query(collection(db, LITURGICAL_PROPER_TEXTS_COLLECTION), where('_date', '==', dateStr));
}

/**
 * Sparse Propers of the fixed celebrations on these dates. An unpublished or
 * unreachable collection is an empty list: the legacy `days` fallback stays.
 */
async function fetchProperTexts(dates, session) {
  if (!dates.length) return [];
  try {
    return (await queryAll(dates.map(getProperTextsByDateQuery), session)).filter(isSparseDayDocument);
  } catch (error) {
    logger.error('[liturgicalDayService] liturgicalProperTexts unavailable:', error);
    return [];
  }
}

export function getDaysByFeastQuery(feastCode) {
  return query(getDaysCollection(), where('_feast', '==', feastCode));
}

// Query results (the `_date`/`_feast` lookups and the feast list) skip
// documents retired by a migration; single-document reads by id do not.
function snapshotToDocs(snapshot) {
  return withoutObsoleteDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

async function queryDocs(q, session) {
  return snapshotToDocs(await getDocsOfflineAware(q, session));
}

async function queryAll(queries, session) {
  const results = await Promise.all(queries.map((q) => queryDocs(q, session)));
  const merged = new Map();
  results.flat().forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

async function withPeriodPsalterFallback(day, periodType, periodWeekNumber, dayOfWeek, session) {
  const resolved = resolveDayAgainstPeriod(day, null);
  const fallbackId = periodPsalterFallbackId(resolved, periodType, periodWeekNumber, dayOfWeek);
  if (!fallbackId) return resolved;
  try {
    const snapshot = await getDocOfflineAware(doc(getDaysCollection(), fallbackId), session);
    if (!snapshot.exists()) return resolved;
    return applyPeriodPsalterFallback(resolved, { id: snapshot.id, ...snapshot.data() }, periodType);
  } catch (error) {
    logger.error(`[liturgicalDayService] psalter fallback failed (${fallbackId}):`, error);
    return resolved;
  }
}

export async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek, session) {
  // Prefer the canonical document. Besides being cheaper than two compound
  // queries, this can read a day that is already present in IndexedDB while
  // Firestore is temporarily unavailable or its quota is exhausted.
  const canonicalId = getPeriodDayDocumentId(periodType, periodWeekNumber, dayOfWeek);
  let canonicalError = null;
  let canonicalDay = null;
  if (canonicalId) {
    try {
      const snapshot = await getDocOfflineAware(doc(getDaysCollection(), canonicalId), session);
      if (snapshot.exists()) {
        canonicalDay = { id: snapshot.id, ...snapshot.data() };
        return withPeriodPsalterFallback(
          canonicalDay, periodType, periodWeekNumber, dayOfWeek, session,
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
    ], session);
  } catch (error) {
    queryError = error;
  }
  if (variants[0]) {
    return withPeriodPsalterFallback(
      variants[0], periodType, periodWeekNumber, dayOfWeek, session,
    );
  }
  if (canonicalDay) {
    return withPeriodPsalterFallback(
      canonicalDay, periodType, periodWeekNumber, dayOfWeek, session,
    );
  }
  if (canonicalError) throw canonicalError;
  if (queryError) throw queryError;
  return null;
}

export async function getAllFeastDays(session) {
  logger.log(`[liturgicalDayService] Loading ${LITURGICAL_DAYS_COLLECTION}`);
  const snapshot = await getDocsOfflineAware(getDaysCollection(), session);
  return snapshotToDocs(snapshot)
    .filter((item) => (item._feast || item._rank || item._date) && !isSeasonalDateDocumentId(item.id))
    .map((item) => resolveDayAgainstPeriod(item, null));
}

async function getSeasonalException(mDate, periodType, session) {
  // The date document even where the celebration is a fixed document
  // (`assembleDaysResult` decides whether it is the Office or the octave day).
  const id = getSeasonalDateExceptionId(mDate, periodType) || getSeasonalDateDocumentId(mDate);
  if (!id) return null;
  const snapshot = await getDocOfflineAware(doc(db, LITURGICAL_DAYS_COLLECTION, id), session);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getOfficeForDead(session) {
  const snapshot = await getDocOfflineAware(doc(db, LITURGICAL_DAYS_COLLECTION, OFFICE_FOR_DEAD_ID), session);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function dynamicFeastVariants(code) {
  const normalized = String(code || '').replace(/^feast-/, '');
  return [...new Set([normalized, `feast-${normalized}`])];
}

/**
 * Fetch and resolve all day variants for a calendar date.
 * `extraFixedDates` (`DD.MM`) loads fixed documents of celebrations that the
 * Ordo placed on this date from another date (transfers, diocesan dates).
 */
export async function fetchDaysForDate(mDate, context, dynamicFeastCodes = [], session, { extraFixedDates = [] } = {}) {
  const hasPeriod = context.periodType && context.periodWeek !== undefined && context.dayOfWeek;
  const exclusiveFeastCode = exclusiveFeastCodeOf(dynamicFeastCodes);
  const periodPromise = hasPeriod
    ? findDayByPeriod(context.periodType, context.periodWeek, context.dayOfWeek, session)
      .then(async (day) => {
        if (day || context.periodType !== 'christmas') return day;
        const psalterWeek = calculatePsalterWeek({
          date: mDate,
          periodType: 'christmas',
          periodWeek: context.periodWeek,
        });
        return psalterWeek > 0
          ? findDayByPeriod('advent', psalterWeek, context.dayOfWeek, session)
          : null;
      })
    : Promise.resolve(null);
  const fixedDateVariants = fixedDateVariantsOf(mDate);
  const fixedPromise = exclusiveFeastCode
    ? Promise.resolve([])
    : queryAll(fixedDateVariants.map(getDaysByFixedDateQuery), session);
  const seasonalPromise = exclusiveFeastCode
    ? Promise.resolve(null)
    : (context.periodType === 'advent' || context.periodType === 'christmas'
      ? getSeasonalException(mDate, context.periodType, session)
      : Promise.resolve(null));
  const extraFixedPromise = extraFixedDates.length
    ? queryAll(extraFixedDates.map(getDaysByFixedDateQuery), session)
    : Promise.resolve([]);
  const officeForDeadPromise = getOfficeForDead(session);
  const properPromise = exclusiveFeastCode
    ? Promise.resolve([])
    : fetchProperTexts([...new Set([...fixedDateVariants, ...extraFixedDates])], session);
  const dynamicPromises = dynamicFeastCodes.map(async (code) => {
    const docs = await queryAll(dynamicFeastVariants(code).map(getDaysByFeastQuery), session);
    return [code, docs];
  });

  const [periodDay, fixedDocs, seasonalDay, officeForDead, dynamicEntries, extraFixedDocs, properDocs] = await Promise.all([
    periodPromise,
    fixedPromise,
    seasonalPromise,
    officeForDeadPromise,
    Promise.all(dynamicPromises),
    extraFixedPromise,
    properPromise,
  ]);
  return assembleDaysResult({
    mDate,
    context,
    dynamicFeastCodes,
    periodDay,
    fixedDocs,
    seasonalDay,
    officeForDead,
    dynamicEntries,
    extraFixedDocs,
    properDocs,
  });
}
