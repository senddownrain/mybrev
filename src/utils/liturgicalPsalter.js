import moment from './moment-be.js';

const CYCLICAL_PERIODS = new Set(['ordinary', 'advent', 'easter']);
const PSALTER_WEEK_NUMERALS = Object.freeze({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV' });

/** Convert an arbitrary liturgical week to the repeating four-week psalter. */
export function normalizePsalterWeek(week) {
  const value = Number(week);
  if (!Number.isInteger(value) || value < 1) return null;
  return ((value - 1) % 4) + 1;
}

function parseDate(value) {
  if (moment.isMoment(value)) return value.clone().startOf('day');
  if (value instanceof Date) return moment(value).startOf('day');
  const parsed = moment(String(value || ''), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
  return parsed.isValid() ? parsed.startOf('day') : null;
}

/**
 * Resolve the psalter week for a liturgical day.
 *
 * Christmas is the one calendar-sensitive transition: when 25 December falls
 * on a weekday, the remaining weekdays retain Advent's week IV and the new
 * cycle starts on the following Sunday. When Christmas itself is Sunday, it
 * starts week I immediately.
 */
export function calculatePsalterWeek({ date, periodType, periodWeek }) {
  const period = String(periodType || '').trim().toLowerCase();

  if (CYCLICAL_PERIODS.has(period)) return normalizePsalterWeek(periodWeek);

  // The days from Ash Wednesday through Saturday continue the preceding
  // psalter week; Lent week I begins on the first Sunday of Lent.
  if (period === 'lent') {
    return Number(periodWeek) === 0 ? 4 : normalizePsalterWeek(periodWeek);
  }

  // Holy Week is the sixth week of Lent, hence week II of the psalter.
  if (period === 'holyweek') return 2;

  if (period !== 'christmas') return null;

  const currentDate = parseDate(date);
  if (!currentDate) return normalizePsalterWeek(periodWeek);

  const christmasYear = currentDate.month() === 0
    ? currentDate.year() - 1
    : currentDate.year();
  const christmas = moment(`${christmasYear}-12-25`, 'YYYY-MM-DD');
  const daysToSunday = christmas.isoWeekday() === 7 ? 0 : 7 - christmas.isoWeekday();
  const firstChristmasSunday = christmas.clone().add(daysToSunday, 'days');

  if (currentDate.isBefore(firstChristmasSunday, 'day')) return 4;

  const christmasWeek = currentDate.diff(firstChristmasSunday, 'weeks') + 1;
  return normalizePsalterWeek(christmasWeek);
}

export function formatPsalterWeekLabel(week) {
  const numeral = PSALTER_WEEK_NUMERALS[Number(week)] || '';
  return numeral ? `${numeral} тыдзень Псалтыра` : '';
}
