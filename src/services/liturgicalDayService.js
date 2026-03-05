/**
 * Data-access layer for the 'days' Firestore collection.
 * Only Firestore queries and document normalization — no calendar math, no stores.
 */
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';

const DAYS_COLLECTION = 'days';

function getDaysCollection() {
  return collection(db, DAYS_COLLECTION);
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/**
 * Query days by liturgical period.
 * In 'days', _periodWeekNumber and _dayOfWeek are stored as strings.
 */
export function getDaysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber) {
  return query(
    getDaysCollection(),
    where('_periodType', '==', periodType),
    where('_dayOfWeek', '==', `${dayOfWeek}`),
    where('_periodWeekNumber', '==', `${periodWeekNumber}`),
  );
}

/**
 * Query days by fixed calendar date.
 * @param {string} dateStr - 'D.M' format (e.g. '25.12')
 */
export function getDaysByFixedDateQuery(dateStr) {
  return query(getDaysCollection(), where('_date', '==', dateStr));
}

/**
 * Query days by dynamic feast code.
 * @param {string} feastCode - e.g. 'eastersunday', 'pentecost'
 */
export function getDaysByFeastQuery(feastCode) {
  return query(getDaysCollection(), where('_feast', '==', feastCode));
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Find a single day document by exact period / week / dayOfWeek.
 * @returns {Promise<Object|null>}
 */
export async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
  const q = getDaysByPeriodQuery(periodType, dayOfWeek, periodWeekNumber);
  const snapshot = await retryFirestore(() => getDocs(q));
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Fetch all documents in 'days' that have feast data (_feast or _feastType).
 * Used to build the feasts list.
 * @returns {Promise<Object[]>}
 */
export async function getAllFeastDays() {
  logger.log('[liturgicalDayService] Loading all feast days');
  const snapshot = await retryFirestore(() => getDocs(getDaysCollection()));
  const result = [];
  const seen = new Set();
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if ((data._feast || data._feastType) && !seen.has(docSnap.id)) {
      seen.add(docSnap.id);
      result.push({ id: docSnap.id, ...data });
    }
  });
  logger.log(`[liturgicalDayService] Feast days found: ${result.length}`);
  return result;
}

/**
 * Fetch all days matching a date — period, fixed, and dynamic feasts.
 *
 * @param {moment.Moment} mDate
 * @param {{ periodType: string, periodWeek: number, dayOfWeek: number }} context
 * @param {string[]} dynamicFeastCodes - feast codes active on mDate
 * @returns {Promise<{ periodDays: Object[], fixedDays: Object[], dynamicDaysByFeast: Map<string, Object[]> }>}
 */
export async function fetchDaysForDate(mDate, context, dynamicFeastCodes = []) {
  const queryItems = [];

  if (context.periodType && context.periodWeek !== undefined && context.dayOfWeek) {
    queryItems.push({
      type: 'period',
      q: getDaysByPeriodQuery(context.periodType, context.dayOfWeek, context.periodWeek),
    });
  }

  queryItems.push({
    type: 'fixed',
    q: getDaysByFixedDateQuery(mDate.format('D.M')),
  });

  dynamicFeastCodes.forEach((feastCode) => {
    queryItems.push({ type: 'dynamic', feastCode, q: getDaysByFeastQuery(feastCode) });
  });

  const snapshots = await Promise.all(
    queryItems.map(({ q }) => retryFirestore(() => getDocs(q))),
  );

  const result = {
    periodDays: [],
    fixedDays: [],
    dynamicDaysByFeast: new Map(),
  };

  queryItems.forEach(({ type, feastCode }, i) => {
    const docs = [];
    snapshots[i].forEach((docSnap) => {
      docs.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (type === 'period') {
      result.periodDays = docs;
    } else if (type === 'fixed') {
      result.fixedDays = docs;
    } else {
      result.dynamicDaysByFeast.set(feastCode, docs);
    }
  });

  return result;
}
