/**
 * Date utility functions using date-fns.
 * Use this module in new code instead of moment.js.
 *
 * Migration guide (moment → date-fns):
 *   moment()                    → new Date()
 *   moment(d).format('YYYY-MM-DD') → formatDate(d)
 *   moment(d).format('D MMMM YYYY')→ formatDateLong(d)
 *   moment().year()             → getYear(new Date())
 *   moment(d).startOf('day')    → startOfDay(d)
 *   moment(d).add(n, 'days')    → addDays(d, n)
 *   moment(a).diff(b, 'days')   → differenceInDays(a, b)
 *   moment(d).clone()           → new Date(d)
 *   moment(d).isSame(e, 'day')  → isSameDay(d, e)
 *   moment(d).isBefore(e)       → isBefore(d, e)
 *   moment(d).isAfter(e)        → isAfter(d, e)
 */

import {
  format,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  differenceInDays,
  isSameDay,
  isBefore,
  isAfter,
  getYear,
  getMonth,
  getDate,
  getDay,
  parseISO,
  isValid,
} from 'date-fns';
import { be } from 'date-fns/locale';

/**
 * Format a date as 'yyyy-MM-dd' (ISO-like, used for Firestore keys).
 * @param {Date|string} date
 * @returns {string} e.g. "2026-03-03"
 */
export function formatDate(date) {
  return format(toDate(date), 'yyyy-MM-dd');
}

/**
 * Format a date in long Belarusian format: "3 сакавіка 2026".
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateLong(date) {
  return format(toDate(date), 'd MMMM yyyy', { locale: be });
}

/**
 * Format a date without the year: "3 сакавіка".
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateDayMonth(date) {
  return format(toDate(date), 'd MMMM', { locale: be });
}

/**
 * Format a date in short Belarusian format: "3 сак 2026".
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateShort(date) {
  return format(toDate(date), 'd MMM yyyy', { locale: be });
}

/**
 * Parse an ISO string or return a Date as-is.
 * @param {Date|string} date
 * @returns {Date}
 */
export function toDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'string') return parseISO(date);
  return new Date(date);
}

export {
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  differenceInDays,
  isSameDay,
  isBefore,
  isAfter,
  getYear,
  getMonth,
  getDate,
  getDay,
  isValid,
};
