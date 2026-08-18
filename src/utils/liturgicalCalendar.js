/**
 * Pure liturgical calendar computation utilities.
 * No Firestore or Pinia store dependencies — all inputs passed as arguments.
 */
import moment from './moment-be.js';
import { FEAST_NAME_MAP } from '../constants/liturgicalFeastsMap.js';

const getMoment = (isoDateStr) => moment(isoDateStr, 'YYYY-MM-DD');

/**
 * Feast of the Holy Family: the first Sunday after Christmas. When Christmas
 * itself is Sunday, January 1 occupies the following Sunday, so the feast is
 * celebrated on December 30 instead.
 */
export function calculateHolyFamilyDate(year) {
  const christmas = moment(`${year}-12-25`, 'YYYY-MM-DD');
  if (christmas.isoWeekday() === 7) return christmas.clone().date(30);
  return christmas.clone().add(7 - christmas.isoWeekday(), 'days');
}

/** Baptism of the Lord: the first Sunday after January 6. */
export function calculateBaptismOfLordDate(year) {
  const epiphany = moment(`${year}-01-06`, 'YYYY-MM-DD');
  const daysToSunday = epiphany.isoWeekday() === 7 ? 7 : 7 - epiphany.isoWeekday();
  return epiphany.add(daysToSunday, 'days');
}

function firstSundayAfterChristmas(christmas) {
  const daysToSunday = christmas.isoWeekday() === 7 ? 7 : 7 - christmas.isoWeekday();
  return christmas.clone().add(daysToSunday, 'days');
}

function christmasSeasonBounds(mDate, opts, nextYearOpts) {
  const year = mDate.year();
  const currentChristmas = moment(`${year}-12-25`, 'YYYY-MM-DD');
  const startsThisYear = mDate.isSameOrAfter(currentChristmas, 'day');
  const startsPreviousYear = mDate.month() === 0;
  if (!startsThisYear && !startsPreviousYear) return null;

  const start = startsThisYear
    ? currentChristmas
    : moment(`${year - 1}-12-25`, 'YYYY-MM-DD');
  // Christmas ends with the Baptism of the Lord, always the first Sunday
  // after January 6. Stored ordinary-time settings must not extend it.
  const end = calculateBaptismOfLordDate(start.year() + 1);
  return { start, end, firstSunday: firstSundayAfterChristmas(start) };
}

/**
 * @typedef {Object} LiturgicalContext
 * @property {string} periodType - Liturgical period type:
 *   'advent' | 'christmas' | 'lent' | 'holyweek' | 'easter' | 'ordinary'
 * @property {number} periodWeek - Week number within the current liturgical period (1-based).
 *   Week 0 is used for the pre-Lent days before the first Lent Sunday.
 *   -1 indicates the value could not be determined.
 * @property {number} dayOfWeek - Day of week in liturgical numbering (1 = Sunday, 2 = Monday, … 7 = Saturday)
 * @property {string|null} _feast - Feast code from {@link FEAST_NAME_MAP} if the date coincides
 *   with a dynamic feast (e.g. 'feast-eastersunday', 'feast-palmsunday'), otherwise null
 */

/**
 * Compute liturgical period context for a given date.
 *
 * @param {import('moment').Moment} mDate - Moment date set to the start of day (UTC or local)
 * @param {import('@/stores/calendar').YearOptions|null} opts - Liturgical year options for the current calendar year, or null if unavailable
 * @param {import('@/stores/calendar').YearOptions|null} nextYearOpts - Liturgical year options for the next calendar year,
 *   required to correctly delimit the Christmas season at the year boundary; may be null
 * @param {Object.<string, import('moment').Moment>} [dynamicDates={}] - Computed dynamic feast dates
 *   keyed by feast key (e.g. { easterSunday: moment(...), pentecost: moment(...) })
 * @returns {LiturgicalContext} Context object describing the liturgical position of the given date
 */
export function computeLiturgicalContext(mDate, opts, nextYearOpts, dynamicDates = {}) {
  const year = mDate.year();

  const context = {
    periodType: 'ordinary',
    periodWeek: -1,
    dayOfWeek: mDate.isoWeekday() === 7 ? 1 : mDate.isoWeekday() + 1,
    _feast: null,
  };

  // Check dynamic feasts first
  for (const feastKey in FEAST_NAME_MAP) {
    if (dynamicDates[feastKey] && dynamicDates[feastKey].isSame(mDate, 'day')) {
      context._feast = FEAST_NAME_MAP[feastKey];
      break;
    }
  }

  if (!opts) return context;

  const fa       = getMoment(opts.firstAdventSunday);
  const christmas = moment(`${year}-12-25`, 'YYYY-MM-DD');
  const easter   = getMoment(opts.easterSunday);
  const ash      = getMoment(opts.ashWednesday);
  const pentecost = getMoment(opts.pentecost);

  // --- Advent ---
  if (mDate.isSameOrAfter(fa) && mDate.isBefore(christmas)) {
    const diff = mDate.diff(fa, 'days');
    context.periodType = 'advent';
    context.periodWeek = Math.floor(diff / 7) + 1;
    context.dayOfWeek  = (diff % 7) + 1;
    return context;
  }

  // --- Christmas ---
  const christmasBounds = christmasSeasonBounds(mDate, opts, nextYearOpts);
  if (christmasBounds && mDate.isSameOrBefore(christmasBounds.end, 'day')) {
    context.periodType = 'christmas';
    context.periodWeek = mDate.month() === 11 ? 1 : 2;
    // dayOfWeek was initialized from the actual calendar weekday. Christmas
    // does not necessarily fall on Sunday, so it must not be anchored to 25.12.
    return context;
  }

  // --- Lent & Holy Week ---
  if (mDate.isSameOrAfter(ash) && mDate.isBefore(easter)) {
    const firstLentSunday = ash.clone().add(4, 'days');
    const lastLentSunday  = easter.clone().subtract(1, 'week');
    const startDiff = mDate.diff(firstLentSunday, 'days');
    const endDiff   = mDate.diff(lastLentSunday, 'days');

    if (startDiff < 0) {
      context.periodType = 'lent';
      context.periodWeek = 0;
      context.dayOfWeek  = 7 + startDiff + 1;
      return context;
    }
    if (endDiff > 0 && endDiff < 8) {
      context.periodType = 'holyweek';
      context.periodWeek = 1;
      context.dayOfWeek  = endDiff + 1;
      return context;
    }
    if (endDiff === 0) {
      context.periodType = 'holyweek';
      context.periodWeek = 1;
      context.dayOfWeek  = 1;
      context._feast     = FEAST_NAME_MAP.palmSunday;
      return context;
    }
    context.periodType = 'lent';
    context.periodWeek = Math.floor(startDiff / 7) + 1;
    context.dayOfWeek  = (startDiff % 7) + 1;
    return context;
  }

  // --- Easter ---
  if (mDate.isSameOrAfter(easter) && mDate.isSameOrBefore(pentecost)) {
    const diff = mDate.diff(easter, 'days');
    context.periodType = 'easter';
    context.periodWeek = Math.floor(diff / 7) + 1;
    context.dayOfWeek  = (diff % 7) + 1;
    return context;
  }

  // --- Ordinary Time (before Lent) ---
  const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;
  const fo = ash.clone().subtract(3, 'days').subtract(weeksBeforeOrd, 'weeks');
  if (mDate.isSameOrAfter(fo) && mDate.isBefore(ash)) {
    const diff = mDate.diff(fo, 'days');
    context.periodType = 'ordinary';
    context.periodWeek = Math.floor(diff / 7) + 1;
    context.dayOfWeek  = (diff % 7) + 1;
    return context;
  }

  // --- Ordinary Time (after Pentecost) ---
  if (mDate.isAfter(pentecost) && mDate.isBefore(fa)) {
    const diff      = mDate.diff(pentecost, 'days');
    const startWeek = parseInt(opts.ordintaryWeeks2);
    context.periodType = 'ordinary';
    context.periodWeek = Math.floor(diff / 7) + startWeek;
    context.dayOfWeek  = (diff % 7) + 1;
    return context;
  }

  return context;
}

/**
 * Calculate the calendar date (YYYY-MM-DD) for a given liturgical period, week and day.
 * Performs the inverse of {@link computeLiturgicalContext}.
 *
 * @param {number} year - Calendar year (e.g. 2026)
 * @param {string} periodType - Liturgical period type:
 *   'advent' | 'christmas' | 'lent' | 'holyweek' | 'easter' | 'ordinary'
 * @param {number} periodWeekNumber - 1-based week number within the period
 * @param {number} dayOfWeek - Day of week in liturgical numbering (1 = Sunday)
 * @param {import('@/stores/calendar').YearOptions|null} opts - Liturgical year options for the given year
 * @param {import('@/stores/calendar').YearOptions|null} nextYearOpts - Liturgical year options for the next year
 *   (currently reserved; not used by this function)
 * @returns {string|null} Date string in 'YYYY-MM-DD' format, or null if the period type is
 *   unrecognised or opts is null
 */
export function calculateDateForContext(year, periodType, periodWeekNumber, dayOfWeek, opts, nextYearOpts) {
  if (!opts) return null;

  const fa        = getMoment(opts.firstAdventSunday);
  const christmas = moment(`${year}-12-25`, 'YYYY-MM-DD');
  const easter    = getMoment(opts.easterSunday);
  const ash       = getMoment(opts.ashWednesday);
  const pentecost = getMoment(opts.pentecost);

  let baseDate     = null;
  let adjustedWeek = periodWeekNumber;

  if (periodType === 'advent') {
    baseDate = fa.clone();
  } else if (periodType === 'christmas') {
    const firstSunday = firstSundayAfterChristmas(christmas);
    const targetIsoWeekday = dayOfWeek === 1 ? 7 : dayOfWeek - 1;
    if (periodWeekNumber === 1) {
      const offset = (targetIsoWeekday - christmas.isoWeekday() + 7) % 7;
      return christmas.clone().add(offset, 'days').format('YYYY-MM-DD');
    }
    return firstSunday.clone()
      .add(targetIsoWeekday === 7 ? 7 : targetIsoWeekday, 'days')
      .format('YYYY-MM-DD');
  } else if (periodType === 'lent') {
    baseDate = ash.clone().add(4, 'days');
  } else if (periodType === 'holyweek') {
    baseDate = easter.clone().subtract(1, 'week');
  } else if (periodType === 'easter') {
    baseDate = easter.clone();
  } else if (periodType === 'ordinary') {
    const weeksBeforeOrd = parseInt(opts.ordintaryWeeks1) - 1;
    const fo = ash.clone().subtract(3, 'days').subtract(weeksBeforeOrd, 'weeks');
    const startWeek2 = parseInt(opts.ordintaryWeeks2);
    if (periodWeekNumber < parseInt(opts.ordintaryWeeks1)) {
      baseDate = fo.clone();
    } else {
      baseDate     = pentecost.clone();
      adjustedWeek = periodWeekNumber - startWeek2 + 1;
    }
  }

  if (!baseDate) return null;

  const baseIsoWeekday = baseDate.isoWeekday();
  const baseDayOfWeek  = baseIsoWeekday === 7 ? 1 : baseIsoWeekday + 1;
  const daysToAdd      = (adjustedWeek - 1) * 7 + (dayOfWeek - baseDayOfWeek);
  return baseDate.clone().add(daysToAdd, 'days').format('YYYY-MM-DD');
}

/**
 * Return all feast codes from {@link FEAST_NAME_MAP} whose dynamic date matches the given date.
 *
 * @param {import('moment').Moment} mDate - Moment date to check against dynamic feast dates
 * @param {Object.<string, import('moment').Moment>} dynamicDates - Dynamic feast dates keyed by feast key
 *   (e.g. { easterSunday: moment(...), pentecost: moment(...) })
 * @returns {string[]} Array of matching feast code strings (e.g. ['feast-eastersunday']).
 *   Returns an empty array if no feast matches the date.
 */
export function getDynamicFeastCodesForDate(mDate, dynamicDates) {
  const codes = [];
  for (const feastKey in FEAST_NAME_MAP) {
    if (dynamicDates[feastKey] && dynamicDates[feastKey].isSame(mDate, 'day')) {
      codes.push(FEAST_NAME_MAP[feastKey]);
    }
  }
  return codes;
}
