/**
 * Orchestration store for liturgical reading scenarios.
 *
 * Canonical flow:  view/component → composable → this store → service → Firestore
 *
 * Covers three runtime scenarios:
 *   1. fetchContentByDate  — day + readings together (main screen)
 *   2. fetchDaysByDate     — only liturgical hours / days
 *   3. fetchReadingsByDate — only readings in liturgical context
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import { logger } from '@/utils/logger';

import { useCalendarStore } from '@/stores/calendar';

import { computeLiturgicalContext, getDynamicFeastCodesForDate } from '@/utils/liturgicalCalendar';
import { getLiturgicalYear, getCycleForDate } from '@/utils/liturgicalCycle';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';

import { fetchContentForDate }                     from '@/services/liturgicalContentService';
import { fetchDaysForDate, findDayByPeriod, getAllFeastDays } from '@/services/liturgicalDayService';
import { getReadingsForDate }                       from '@/services/readingsService';

/** Cache TTL constants (milliseconds) */
const TTL = {
  CONTENT:  60 * 60 * 1000,      // 1 hour
  DAYS:     60 * 60 * 1000,      // 1 hour
  READINGS: 30 * 60 * 1000,      // 30 minutes
  FEASTS:   24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Check whether a cache entry is still valid.
 * @param {{ data: unknown, cachedAt: number } | undefined} entry
 * @param {number} ttl - milliseconds
 * @returns {boolean}
 */
function _isCacheValid(entry, ttl) {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < ttl;
}

export const useLiturgicalStore = defineStore('liturgical', () => {
  const calendarStore = useCalendarStore();

  // ----- per-date caches (each entry: { data, cachedAt }) -----
  /** @type {import('vue').Ref<Map<string, { data: Object, cachedAt: number }>>} */
  const contentCache  = ref(new Map());
  /** @type {import('vue').Ref<Map<string, { data: Object, cachedAt: number }>>} */
  const daysCache     = ref(new Map());
  /** @type {import('vue').Ref<Map<string, { data: Object, cachedAt: number }>>} */
  const readingsCache = ref(new Map());
  /** @type {import('vue').Ref<Map<string, { data: Object[], cachedAt: number }>>} */
  const feastsCache   = ref(new Map());

  const isLoading = ref(false);
  const error     = ref(null);

  // ---------------------------------------------------------------------------
  // Private helper — load calendar options and compute context for a date
  // ---------------------------------------------------------------------------
  async function _resolveContext(mDate) {
    const year = mDate.year();
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);

    const opts         = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};

    const context          = computeLiturgicalContext(mDate, opts, nextYearOpts, dynamicDates);
    const dynamicFeastCodes = getDynamicFeastCodesForDate(mDate, dynamicDates);

    return { opts, nextYearOpts, dynamicDates, context, dynamicFeastCodes };
  }

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  /**
   * Fetch combined day + readings content for a date.
   * Result is cached by date key.
   *
   * @param {Date|moment.Moment|string} date
   * @returns {Promise<{ context, itemsDays, itemsReadings, dayOptions }>}
   */
  async function fetchContentByDate(date) {
    const mDate = moment(date).startOf('day');
    const key   = mDate.format('YYYY-MM-DD');

    const cachedContent = contentCache.value.get(key);
    if (_isCacheValid(cachedContent, TTL.CONTENT)) {
      logger.log(`[liturgicalStore] content cache hit: ${key}`);
      return cachedContent.data;
    }

    isLoading.value = true;
    error.value     = null;

    try {
      const { context, dynamicFeastCodes } = await _resolveContext(mDate);
      const result = await fetchContentForDate(mDate, context, dynamicFeastCodes);
      contentCache.value.set(key, { data: result, cachedAt: Date.now() });
      logger.log(`[liturgicalStore] content loaded for ${key}`);
      return result;
    } catch (err) {
      logger.error(`[liturgicalStore] fetchContentByDate error (${key}):`, err);
      error.value = err;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetch liturgical days (hours) for a date.
   * Result is cached by date key.
   *
   * @param {Date|moment.Moment|string} date
   * @returns {Promise<{ context, items: Object[] }>}
   */
  async function fetchDaysByDate(date) {
    const mDate = moment(date).startOf('day');
    const key   = mDate.format('YYYY-MM-DD');

    const cachedDays = daysCache.value.get(key);
    if (_isCacheValid(cachedDays, TTL.DAYS)) {
      logger.log(`[liturgicalStore] days cache hit: ${key}`);
      return cachedDays.data;
    }

    isLoading.value = true;
    error.value     = null;

    try {
      const { context, dynamicFeastCodes } = await _resolveContext(mDate);
      const { periodDays, fixedDays, dynamicDaysByFeast } = await fetchDaysForDate(
        mDate, context, dynamicFeastCodes,
      );

      // Deduplicate
      const seen  = new Set();
      const items = [
        ...periodDays,
        ...fixedDays,
        ...Array.from(dynamicDaysByFeast.values()).flat(),
      ].filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      const result = { context, items };
      daysCache.value.set(key, { data: result, cachedAt: Date.now() });
      logger.log(`[liturgicalStore] days loaded for ${key}: ${items.length}`);
      return result;
    } catch (err) {
      logger.error(`[liturgicalStore] fetchDaysByDate error (${key}):`, err);
      error.value = err;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetch liturgical readings for a date (with cycle determination).
   * Result is cached by date key.
   *
   * @param {Date|moment.Moment|string} date
   * @returns {Promise<{ context: Object, items: Object[] }>}
   */
  async function fetchReadingsByDate(date) {
    const mDate = moment(date).startOf('day');
    const key   = mDate.format('YYYY-MM-DD');

    const cachedReadings = readingsCache.value.get(key);
    if (_isCacheValid(cachedReadings, TTL.READINGS)) {
      logger.log(`[liturgicalStore] readings cache hit: ${key}`);
      return cachedReadings.data;
    }

    isLoading.value = true;
    error.value     = null;

    try {
      const { context } = await _resolveContext(mDate);

      // Determine liturgical cycle
      const liturgicalYear = await getLiturgicalYear(date, { useCalendarStore: true });
      const cycle          = await getCycleForDate(date, liturgicalYear, context.dayOfWeek, { useCalendarStore: true });

      const items = await getReadingsForDate(date, {
        cycle,
        periodType:        context.periodType,
        periodWeekNumber:  context.periodWeek,
        dayOfWeek:         context.dayOfWeek,
        _feast:            context._feast,
      });

      const fullContext = { ...context, cycle };
      const result      = { context: fullContext, items };
      readingsCache.value.set(key, { data: result, cachedAt: Date.now() });
      logger.log(`[liturgicalStore] readings loaded for ${key}: ${items.length}`);
      return result;
    } catch (err) {
      logger.error(`[liturgicalStore] fetchReadingsByDate error (${key}):`, err);
      error.value = err;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetch combined content for today.
   * @returns {Promise<{ context, itemsDays, itemsReadings, dayOptions }>}
   */
  async function fetchToday() {
    return fetchContentByDate(moment().startOf('day').toDate());
  }

  /**
   * Get all feast day documents (with isDynamic / isFixed flags) for a year.
   * Cached by year.
   *
   * @param {number} year
   * @returns {Promise<Object[]>}
   */
  async function fetchAllFeasts(year) {
    const cacheKey = `year_${year}`;
    const cachedFeasts = feastsCache.value.get(cacheKey);
    if (_isCacheValid(cachedFeasts, TTL.FEASTS)) {
      logger.log(`[liturgicalStore] feasts cache hit: ${year}`);
      return cachedFeasts.data;
    }

    await calendarStore.getYearOptions(year);
    await calendarStore.getDynamicDates(year);
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};

    const allFeastDays = await getAllFeastDays();

    const result = allFeastDays.map((feast) => {
      const isDynamic = Object.keys(FEAST_NAME_MAP).some(
        (key) => FEAST_NAME_MAP[key] === feast._feast && dynamicDates[key],
      );
      return {
        ...feast,
        isDynamic,
        isFixed: !isDynamic && feast._date,
      };
    });

    feastsCache.value.set(cacheKey, { data: result, cachedAt: Date.now() });
    logger.log(`[liturgicalStore] feasts loaded for ${year}: ${result.length}`);
    return result;
  }

  /**
   * Find a single day document by period / week / dayOfWeek.
   * Delegates directly to the service (no cache — used for editor/picker).
   *
   * @param {string} periodType
   * @param {number} periodWeekNumber
   * @param {number} dayOfWeek
   * @returns {Promise<Object|null>}
   */
  async function fetchDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
    return findDayByPeriod(periodType, periodWeekNumber, dayOfWeek);
  }

  /**
   * Return cached content for a date synchronously (null if not cached yet).
   * Used by getCachedLiturgicalContentForDate in the composable.
   *
   * @param {Date|moment.Moment|string} date
   * @returns {Object|null}
   */
  function getCachedContent(date) {
    const key = moment(date).startOf('day').format('YYYY-MM-DD');
    const entry = contentCache.value.get(key);
    return _isCacheValid(entry, TTL.CONTENT) ? entry.data : null;
  }

  /**
   * Clear cached data.
   * @param {string|null} dateKey - specific YYYY-MM-DD key, or null to wipe all
   */
  function clearCache(dateKey = null) {
    if (dateKey) {
      contentCache.value.delete(dateKey);
      daysCache.value.delete(dateKey);
      readingsCache.value.delete(dateKey);
    } else {
      contentCache.value.clear();
      daysCache.value.clear();
      readingsCache.value.clear();
      feastsCache.value.clear();
    }
    logger.log(`[liturgicalStore] cache cleared${dateKey ? ` for ${dateKey}` : ''}`);
  }

  return {
    // state
    isLoading,
    error,

    // actions
    fetchContentByDate,
    fetchDaysByDate,
    fetchReadingsByDate,
    fetchToday,
    fetchAllFeasts,
    fetchDayByPeriod,

    // sync helpers
    getCachedContent,
    clearCache,
  };
});
