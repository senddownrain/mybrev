/**
 * Assemble liturgical-day options without querying the independent readings
 * collection. The legal Offices come from the Ordo engine's
 * ResolvedLiturgicalDay (see `src/utils/ordoDayOptions.js`); this service only
 * fetches the `days` documents that carry them.
 */
import { logger } from '@/utils/logger';
import { fetchDaysForDate } from '@/services/liturgicalDayService';
import { getLiturgicalTemplate } from '@/services/staticLiturgicalService';
import { buildOrdoDayOptions, contentDayMap } from '@/utils/ordoDayOptions';
import { extraFixedDatesOf } from '@/utils/ordo/runtime';

async function buildOptionsWithTemplates(input, session) {
  const checked = new Set();
  const needed = new Set();
  // Use the assembly's actual dependencies, including transitive field rules,
  // so the reader only loads the Commons needed by the day's legal options.
  const templates = new class extends Map {
    has(id) {
      if (typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && !checked.has(id)) needed.add(id);
      return super.has(id);
    }
    get(id) {
      this.has(id);
      return super.get(id);
    }
  }();
  while (true) {
    const result = buildOrdoDayOptions({ ...input, templates });
    if (!needed.size) return result;
    const ids = [...needed];
    needed.clear();
    const loaded = await Promise.all(ids.map((id) => getLiturgicalTemplate(id, session)));
    ids.forEach((id, index) => {
      checked.add(id);
      if (loaded[index]) templates.set(id, loaded[index]);
    });
  }
}

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
  if (resolved.periodOnly && resolved.primary.kind === 'temporal' && daysResult.seasonalDateDay) {
    // Date-based seasonal texts remain their own source on octave dates too.
    daysResult.periodDays = [daysResult.seasonalDateDay];
    daysResult.periodFallback = daysResult.seasonalDateDay;
  }
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
  const { dayOptions, ordo, unavailable } = await buildOptionsWithTemplates({
    resolved, daysResult, context, date, diocese,
  }, session);
  // The route resolves itemsDays first. Keep every legal Office there in its
  // resolved form, including legacy documents with template placeholders.
  const dayMap = contentDayMap(allDays, dayOptions);
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
