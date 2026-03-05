/**
 * Facade composable for the liturgical-readings scenario.
 *
 * UI contract (public API — unchanged):
 *   getLiturgicalReadingsForDate(date, options?) → { items, context }
 *   getLiturgicalReadingsForToday(options?)      → { items, context }
 *   feastNameMap                                 → FEAST_NAME_MAP constant
 *
 * Flow:
 *   composable → liturgicalStore.fetchReadingsByDate
 *              → calendarStore (context) + readingsService (data)
 *
 * Cycle determination and context computation are now handled inside the store.
 */
import { useLiturgicalStore } from '@/stores/liturgical';
import { FEAST_NAME_MAP as feastNameMap } from '@/constants/liturgicalFeastsMap';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
export function useLiturgicalReadings() {
  const liturgicalStore = useLiturgicalStore();

  /**
   * Fetch liturgical readings for a given date.
   * Context (period, week, dayOfWeek, feast, cycle) is resolved inside the store.
   *
   * @param {Date|import('moment').Moment|string} currentDate
   * @param {Object} [options] - reserved for future use
   * @returns {Promise<{ items: Object[], context: Object }>}
   */
  async function getLiturgicalReadingsForDate(currentDate, options = {}) {
    const mDate = moment(currentDate).startOf('day');
    logger.log(`[useLiturgicalReadings] Fetching readings for ${mDate.format('YYYY-MM-DD')}`);
    return liturgicalStore.fetchReadingsByDate(currentDate);
  }

  /**
   * Fetch liturgical readings for today.
   * @param {Object} [options] - reserved for future use
   * @returns {Promise<{ items: Object[], context: Object }>}
   */
  async function getLiturgicalReadingsForToday(options = {}) {
    return getLiturgicalReadingsForDate(moment().toDate(), options);
  }

  return {
    getLiturgicalReadingsForDate,
    getLiturgicalReadingsForToday,
    feastNameMap,
  };
}
