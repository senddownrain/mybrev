/**
 * Facade composable for liturgical-day scenarios.
 *
 * UI contract (public API — unchanged):
 *   getLiturgicalOptionsForDate(date)  → { items, context }
 *   computeLiturgicalOptionsForDate(date) → alias of above
 *   computeLiturgicalContextForDate(date) → { periodType, periodWeek, dayOfWeek, _feast }
 *   findDayByPeriod(type, week, day)   → Object|null
 *   calculateDateForPeriod(year, type, week, day) → 'YYYY-MM-DD'|null
 *   getAllFeasts(year)                 → Object[]
 *   runLiturgicalDiagnostics(date)    → diagnostics object  (admin)
 *   auditYear(year, progressCallback) → missing items report (admin)
 *   feastNameMap                      → FEAST_NAME_MAP constant
 *
 * Flow:
 *   composable → liturgicalStore → liturgicalDayService / liturgicalContentService
 */
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

import { useCalendarStore }   from '@/stores/calendar';
import { useLiturgicalStore } from '@/stores/liturgical';

import {
  computeLiturgicalContext,
  calculateDateForContext,
  getDynamicFeastCodesForDate,
} from '@/utils/liturgicalCalendar';

import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';
import { LITURGICAL_DAYS_COLLECTION } from '@/constants/days';

// Service query-builders reused in admin diagnostics
import {
  getDaysByPeriodQuery,
  getDaysByFixedDateQuery,
  getDaysByFeastQuery,
} from '@/services/liturgicalDayService';

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

  /**
   * Get all feasts for a year (delegates to store with caching).
   */
  async function getAllFeasts(year) {
    return liturgicalStore.fetchAllFeasts(year);
  }

  // ---- admin / diagnostic tools --------------------------------------------
  // These keep direct service calls so diagnostics always reflect live data.

  /**
   * Run diagnostics for a date — used by the admin LogicTester.
   * Returns raw Firestore query results and calendar context for debugging.
   */
  async function runLiturgicalDiagnostics(currentDate) {
    const mDate = moment(currentDate).startOf('day');
    const year  = mDate.year();

    await _loadCalendar(year);

    const opts         = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};

    const context           = computeLiturgicalContext(mDate, opts, nextYearOpts, dynamicDates);
    const dynamicFeastCodes = getDynamicFeastCodesForDate(mDate, dynamicDates);

    const diagnostics = {};

    if (context.periodType && context.periodWeek !== undefined && context.dayOfWeek) {
      diagnostics.periodParams = {
        periodType: context.periodType,
        periodWeek: context.periodWeek,
        dayOfWeek:  context.dayOfWeek,
      };
      const snap = await getDocs(
        getDaysByPeriodQuery(context.periodType, context.dayOfWeek, context.periodWeek),
      );
      diagnostics.periodResult = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      diagnostics.periodParams = null;
      diagnostics.periodResult = [];
    }

    const fixedSnap = await getDocs(getDaysByFixedDateQuery(mDate.format('DD.MM')));
    diagnostics.fixedFeastResult = fixedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    diagnostics.dynamicFeastsResults = [];
    for (const feastCode of dynamicFeastCodes) {
      const snap = await getDocs(getDaysByFeastQuery(feastCode));
      snap.forEach((d) =>
        diagnostics.dynamicFeastsResults.push({ id: d.id, ...d.data() }),
      );
    }

    return {
      diagnostics,
      rawOptions: { yearOptions: opts, dynamicDates },
    };
  }

  /**
   * Audit a year — list missing period-days and feasts in Firestore.
   * Used by the admin LogicTester.
   */
  async function auditYear(year, progressCallback) {
    logger.log(`[Audit] Starting audit for year ${year}`);

    await _loadCalendar(year);

    const opts         = calendarStore.optionsForYear(year).value;
    const nextYearOpts = calendarStore.optionsForYear(year + 1).value;
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
    const daysCol      = collection(db, LITURGICAL_DAYS_COLLECTION);

    const missing = { periodDays: [], feasts: [] };

    // Check known dynamic feasts
    for (const feastKey in FEAST_NAME_MAP) {
      const feastCode = FEAST_NAME_MAP[feastKey];
      const snap = await retryFirestore(() =>
        getDocs(query(daysCol, where('_feast', '==', feastCode))),
      );
      if (snap.empty) {
        const date = dynamicDates[feastKey]
          ? dynamicDates[feastKey].format('DD.MM.YYYY')
          : 'Дата не вылічаная';
        missing.feasts.push({ name: feastCode, date });
      }
    }

    // Walk every day of the year
    const startDate = moment().year(year).startOf('year');
    const endDate   = moment().year(year).endOf('year');
    const totalDays = endDate.diff(startDate, 'days');

    for (let i = 0; i <= totalDays; i++) {
      const currentDate = startDate.clone().add(i, 'days');
      const ctx = computeLiturgicalContext(currentDate, opts, nextYearOpts, dynamicDates);

      if (ctx.periodType && ctx.periodWeek !== undefined && ctx.dayOfWeek) {
        const snap = await retryFirestore(() =>
          getDocs(getDaysByPeriodQuery(ctx.periodType, ctx.dayOfWeek, ctx.periodWeek)),
        );
        if (snap.empty) {
          const params = {
            date: currentDate.format('DD.MM.YYYY (dddd)'),
            type: ctx.periodType,
            week: ctx.periodWeek,
            day:  ctx.dayOfWeek,
          };
          logger.warn('[Audit] Missing period day:', params);
          missing.periodDays.push(params);
        }
      }

      if (progressCallback) progressCallback(Math.round((i / totalDays) * 100));
    }

    logger.log('[Audit] Complete.');
    return missing;
  }

  return {
    // UI scenarios
    getLiturgicalOptionsForDate,
    computeLiturgicalOptionsForDate,
    computeLiturgicalContextForDate,
    findDayByPeriod,
    calculateDateForPeriod,
    getAllFeasts,
    // Admin tools
    runLiturgicalDiagnostics,
    auditYear,
    // Constant re-exported for components that need it
    feastNameMap: FEAST_NAME_MAP,
  };
}
