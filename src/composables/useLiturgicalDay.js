/**
 * Facade composable for liturgical-day scenarios.
 *
 * UI contract (public API — unchanged):
 *   getLiturgicalOptionsForDate(date)  → { items, context }
 *   computeLiturgicalOptionsForDate(date) → alias of above
 *   computeLiturgicalContextForDate(date) → { periodType, periodWeek, dayOfWeek, _feast }
 *   findDayByPeriod(type, week, day)   → Object|null
 *   calculateDateForPeriod(year, type, week, day) → 'YYYY-MM-DD'|null
 *   feastNameMap                      → FEAST_NAME_MAP constant
 *
 * Flow:
 *   composable → liturgicalStore → liturgicalDayService / liturgicalContentService
 */
import { useCalendarStore }   from '@/stores/calendar';
import { useLiturgicalStore } from '@/stores/liturgical';

import {
  computeLiturgicalContext,
  calculateDateForContext,
} from '@/utils/liturgicalCalendar';

import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';

import moment from '@/utils/moment-be';

export function useLiturgicalDay() {
  const calendarStore   = useCalendarStore();
  const liturgicalStore = useLiturgicalStore();

  // ---- private: ensure calendar data is loaded for a year ------------------
  async function _loadCalendar(year) {
    await calendarStore.getYearOptions(year);
    await calendarStore.getYearOptions(year + 1);
    await calendarStore.getDynamicDates(year);
  }

  // ---- public API -----------------------------------------------------------

  /**
   * Compute liturgical context (period, week, dayOfWeek, feast) for a date.
   * Pure calendar math — no Firestore queries.
   */
  async function computeLiturgicalContextForDate(currentDate) {
    const mDate = moment(currentDate).startOf('day');
    const year  = mDate.year();

    await _loadCalendar(year);

    const opts         = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};

    return computeLiturgicalContext(mDate, opts, nextYearOpts, dynamicDates);
  }

  /**
   * Fetch liturgical days for a date (with store-level caching).
   * Returns { items, context } — same shape as old computeLiturgicalOptionsForDate.
   */
  async function getLiturgicalOptionsForDate(currentDate) {
    const result = await liturgicalStore.fetchDaysByDate(currentDate);
    return { items: result.items, context: result.context };
  }

  /** Alias kept for backward compatibility */
  async function computeLiturgicalOptionsForDate(currentDate) {
    return getLiturgicalOptionsForDate(currentDate);
  }

  /**
   * Find a single day document by period / week / dayOfWeek.
   * Delegates to the store (→ liturgicalDayService).
   */
  async function findDayByPeriod(periodType, periodWeekNumber, dayOfWeek) {
    return liturgicalStore.fetchDayByPeriod(periodType, periodWeekNumber, dayOfWeek);
  }

  /**
   * Calculate the calendar date for a liturgical period / week / dayOfWeek.
   * Pure calendar math — no Firestore.
   */
  async function calculateDateForPeriod(year, periodType, periodWeekNumber, dayOfWeek) {
    await _loadCalendar(year);
    const opts         = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
    return calculateDateForContext(year, periodType, periodWeekNumber, dayOfWeek, opts, nextYearOpts);
  }


  return {
    // UI scenarios
    getLiturgicalOptionsForDate,
    computeLiturgicalOptionsForDate,
    computeLiturgicalContextForDate,
    findDayByPeriod,
    calculateDateForPeriod,
    // Constant re-exported for components that need it
    feastNameMap: FEAST_NAME_MAP,
  };
}
