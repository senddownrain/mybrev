/**
 * Independent oracle: which Catholic.by page (normalized identity key) must a
 * TEMPORAL Mass option read? Derived from calendar facts only (period, week,
 * weekday, date, Sunday cycle), never from the engine's readings lookups.
 */
const two = (n) => String(n).padStart(2, '0');

/** @returns {string|null} identity key (see lib/identity.mjs) or null when the date has a proper celebration page */
export function expectedPageKey(day) {
  const { date, period, week, dayOfWeek } = day;
  const month = Number(date.slice(5, 7));
  const dom = Number(date.slice(8, 10));
  const cycle = day.readingCycle.sunday;
  const sunday = Number(dayOfWeek) === 1;
  if (period === 'advent') {
    if (month === 12 && dom >= 17 && dom <= 24 && !sunday) return `date:${two(dom)}.12:advent-weekday`;
    return sunday ? `period:advent:w${week}:d1:cycle=${cycle}` : `period:advent:w${week}:d${dayOfWeek}`;
  }
  if (period === 'christmas') {
    if (sunday) return week === 2 ? 'period:christmas:w2:d1' : null; // Holy Family / Baptism: proper pages
    if (month === 12 && dom >= 25) return dom >= 29 ? `date:${two(dom)}.12:octave-day` : null;
    if (month === 1 && dom <= 12) return dom === 1 || dom === 6 ? null : `date:${two(dom)}.01:weekday`;
    return null;
  }
  if (period === 'lent') {
    return sunday ? `period:lent:w${week}:d1:cycle=${cycle}` : `period:lent:w${week}:d${dayOfWeek}`;
  }
  if (period === 'holyweek') {
    if (sunday) return null;
    return [2, 3, 4].includes(Number(dayOfWeek)) ? `period:holyweek:w1:d${dayOfWeek}` : null;
  }
  if (period === 'easter') {
    if (Number(week) === 1 && !sunday) return `period:easter:w1:d${dayOfWeek}`;
    if (sunday) return Number(week) === 1 || Number(week) === 8 ? null : `period:easter:w${week}:d1:cycle=${cycle}`;
    return `period:easter:w${week}:d${dayOfWeek}`;
  }
  if (period === 'ordinary') {
    return sunday ? `period:ordinary:w${week}:d1:cycle=${cycle}` : `period:ordinary:w${week}:d${dayOfWeek}`;
  }
  return null;
}

/** Identity key without the cycle suffix (weekday pages carry both years). */
export const withoutCycle = (key) => String(key || '').replace(/:cycle=[ABC]$/, '');
