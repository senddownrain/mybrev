import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { retryFirestore } from '@/utils/retry';
import { logger } from '@/utils/logger';
import {
  isSeasonalDateException,
  isChristmasDateExceptionExclusion,
} from '@/utils/liturgicalDayResolution';
import {
  hasReadingDocumentContent,
  normalizeFeastCode,
  selectCalendarDayVariants,
  selectReadingLectionaryVariants,
} from '@/utils/parsedReadingsIdentity';

const COLLECTION = 'parsedData';

function col() {
  return collection(db, COLLECTION);
}

function ddmm(mDate) {
  return mDate.format('DD.MM');
}

function feastCodeVariants(code) {
  const canonical = normalizeFeastCode(code);
  return canonical ? [canonical, canonical.replace(/^feast-/, '')] : [];
}

async function queryDocs(q) {
  const snapshot = await retryFirestore(() => getDocs(q));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(hasReadingDocumentContent);
}

/**
 * Fetch parsed readings for a liturgical date.
 *
 * Priority: dynamic feast > seasonal/fixed date > period (weekday year 1/2 or Sunday A/B/C)
 *
 * @param {import('moment').Moment} mDate
 * @param {Object} context - from liturgicalStore._resolveContext: { periodType, periodWeek, dayOfWeek, cycle, _feast }
 * @param {string[]} dynamicFeastCodes - feast codes from getDynamicFeastCodesForDate (format: 'feast-xxx')
 * @returns {Promise<Object[]>}
 */
export async function getParsedReadingsForDate(mDate, context, dynamicFeastCodes = [], options = {}) {
  const { periodType, periodWeek, dayOfWeek, cycle, sundayCycle = cycle } = context;
  const selectVariants = (documents) => selectReadingLectionaryVariants(documents, { cycle, sundayCycle });
  const dateStr = ddmm(mDate);

  // An explicitly selected fixedDays template is the strongest link. During
  // migration both singular and array forms are supported.
  if (options.dayId) {
    const linked = (await Promise.all([
      queryDocs(query(col(), where('_dayId', '==', options.dayId))),
      queryDocs(query(col(), where('_dayIds', 'array-contains', options.dayId))),
    ])).flat();
    const uniqueLinked = [...new Map(linked.map((document) => [document.id, document])).values()];
    const selected = selectVariants(uniqueLinked);
    if (selected.length) return selected;
  }

  // 1. Dynamic feasts — highest priority
  if (dynamicFeastCodes.length > 0) {
    const feastQueries = dynamicFeastCodes.flatMap((code) => feastCodeVariants(code).map((value) =>
      queryDocs(query(col(), where('_feast', '==', value))),
    ));
    const all = (await Promise.all(feastQueries)).flat();
    // Deduplicate
    const unique = [...new Map(all.map((d) => [d.id, d])).values()];
    // Filter by cycle if the feast has cycle variants, otherwise take all
    const result = selectVariants(unique);
    if (result.length > 0) {
      logger.log(`[parsedReadingsService] feast match (${dynamicFeastCodes}): ${result.length}`);
      return result;
    }
    if (unique.length > 0) {
      logger.log(`[parsedReadingsService] feast match (no cycle filter): ${unique.length}`);
      return unique;
    }
  }

  // 2. Seasonal exceptions (Advent Dec 17–24, Christmas Jan dates)
  //    and Christmas fixed-date exclusions (25.12, 26.12, etc.) — query by _date only
  const isFixedDateOnly =
    isSeasonalDateException(mDate, periodType) || isChristmasDateExceptionExclusion(mDate);

  if (isFixedDateOnly) {
    const docs = await queryDocs(query(col(), where('_date', '==', dateStr)));
    // Sunday feasts in the Christmas octave have year set (A/B/C); they take priority
    // over weekday octave docs (year=null) and suppress them for that Sunday.
    const selected = selectVariants(selectCalendarDayVariants(docs, dayOfWeek));
    logger.log(`[parsedReadingsService] fixed/seasonal ${dateStr} year=${cycle}: ${selected.length}`);
    if (selected.length) return selected;
  }

  // 3. General case: query period + fixed date in parallel, merge with priority
  const queries = [];

  if (periodType && periodWeek !== undefined && dayOfWeek !== undefined) {
    // Try with cycle; weekdays have year '1'/'2', Sundays have A/B/C
    if (cycle) {
      queries.push(
        queryDocs(
          query(
            col(),
            where('_periodType', '==', periodType),
            where('_periodWeekNumber', '==', Number(periodWeek)),
            where('_dayOfWeek', '==', Number(dayOfWeek)),
            where('year', '==', cycle),
          ),
        ),
      );
    }
    // Also fetch docs with year == null (shared across cycles)
    queries.push(
      queryDocs(
        query(
          col(),
          where('_periodType', '==', periodType),
          where('_periodWeekNumber', '==', Number(periodWeek)),
          where('_dayOfWeek', '==', Number(dayOfWeek)),
          where('year', '==', null),
        ),
      ),
    );
  }

  // Fixed date query (saints' days, memorials)
  queries.push(queryDocs(query(col(), where('_date', '==', dateStr))));

  const results = (await Promise.all(queries)).flat();
  const unique = [...new Map(results.map((d) => [d.id, d])).values()];

  // Fixed date docs take priority over period docs
  const fixed = selectVariants(selectCalendarDayVariants(unique.filter((d) => d._date), dayOfWeek));
  const period = selectVariants(unique.filter((d) => !d._date));
  const sorted = [...fixed, ...period];

  logger.log(
    `[parsedReadingsService] ${dateStr} period=${periodType} w${periodWeek} d${dayOfWeek} cycle=${cycle}: ${sorted.length} (fixed=${fixed.length} period=${period.length})`,
  );
  return sorted;
}
