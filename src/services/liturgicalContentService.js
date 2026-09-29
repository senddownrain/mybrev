/**
 * Assemble liturgical-day options without querying the independent readings
 * collection. The legal Offices come from the Ordo engine's
 * ResolvedLiturgicalDay (see `src/utils/ordoDayOptions.js`); this service only
 * fetches the `days` documents that carry them.
 */
import { logger } from '@/utils/logger';
import { fetchDaysForDate } from '@/services/liturgicalDayService';
import { buildOrdoDayOptions } from '@/utils/ordoDayOptions';
import { extraFixedDatesOf } from '@/utils/ordo/runtime';

/**
 * @param {import('moment').Moment} mDate
 * @param {object} context            legacy context (period/week/day for `days` lookups)
 * @param {string[]} dynamicFeastCodes codes of the resolved legal options
 * @param {object} session
 * @param {{ resolved: object, diocese: string }} ordo
 */
export async function fetchContentForDate(mDate, context, dynamicFeastCodes = [], session, { resolved, diocese } = {}) {
  const date = mDate.format('YYYY-MM-DD');
  logger.log(`[liturgicalContentService] Fetching ${date} (${diocese})`);
  const daysResult = await fetchDaysForDate(mDate, context, dynamicFeastCodes, session, {
    extraFixedDates: extraFixedDatesOf(resolved, mDate.format('DD.MM')),
  });
  const allDays = [
    ...daysResult.periodDays,
    ...daysResult.fixedDateDays,
    ...(daysResult.extraFixedDays || []),
    ...[...daysResult.dynamicDaysByFeast.values()].flat(),
    // Keep the period document addressable by an explicit route ID even when
    // it is not a legal Office card (it stays the field-level fallback of the
    // memorial/feast that replaced it, and old links keep working).
    daysResult.periodFallback,
    daysResult.officeForDead,
  ].filter(Boolean);
  const dayMap = new Map(allDays.map((item) => [item.id, item]));
  const { dayOptions, ordo, unavailable } = buildOrdoDayOptions({
    resolved, daysResult, context, date, diocese,
  });
  if (unavailable.length) {
    logger.log(`[liturgicalContentService] ${date}: legal options without days documents`, unavailable);
  }

  return {
    context,
    ordo,
    itemsDays: [...dayMap.values()],
    dayOptions,
  };
}
