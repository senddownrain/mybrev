/**
 * Recommended start dates of a novena (contract 1.0 §4). Civil dates only
 * (YYYY-MM-DD, no time zones); liturgical feasts come from the Ordo engine
 * for the chosen diocese. A feast the engine does not place → no suggestion.
 */
import { getYearPlan } from '../ordo/yearPlan.js';
import { addDays } from '../ordo/dates.js';

export const SCHEDULE_TYPES = Object.freeze(['manual', 'fixedFeast', 'fixedStart', 'liturgical']);

/** Ids of Ordo celebrations; `good-friday` is a year anchor. */
export const LITURGICAL_EVENTS = Object.freeze([
  'good-friday', 'pentecost', 'trinity', 'corpus-christi', 'sacred-heart', 'immaculate-heart', 'christ-king', 'holy-family',
]);

const pad = (value) => String(value).padStart(2, '0');

/** `YYYY-MM-DD` of an existing civil date, else null (29.02 outside leap years). */
export function civilDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists ? `${year}-${pad(month)}-${pad(day)}` : null;
}

export const isCivilDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
  return Boolean(match) && civilDate(Number(match[1]), Number(match[2]), Number(match[3])) === value;
};

function eventDate(year, event, context) {
  const plan = getYearPlan(year, context);
  if (event === 'good-friday') return plan.anchors.goodFriday || null;
  return plan.celebrationDates.get(event)?.date || null;
}

/** Start dates falling in `year`, sorted, without repeats. */
export function recommendedStarts(schedule, year, { diocese = 'minsk-mohilev' } = {}) {
  if (!schedule?.enabled) return [];
  if (schedule.dioceses?.length && !schedule.dioceses.includes(diocese)) return [];
  const starts = [...(schedule.extraDates || []).filter(isCivilDate)];
  const offset = schedule.offsetDays || 0;
  // A start may belong to the feast of the neighbouring year.
  for (const base of [year - 1, year, year + 1]) {
    let start = null;
    if (schedule.type === 'fixedStart') {
      start = civilDate(base, schedule.month, schedule.day);
    } else if (schedule.type === 'fixedFeast') {
      const feast = civilDate(base, schedule.month, schedule.day);
      start = feast && addDays(feast, offset);
    } else if (schedule.type === 'liturgical' && LITURGICAL_EVENTS.includes(schedule.event)) {
      const feast = eventDate(base, schedule.event, { diocese });
      start = feast && addDays(feast, offset);
    }
    if (start) starts.push(start);
  }
  return [...new Set(starts)].filter((value) => value.startsWith(`${year}-`)).sort();
}
