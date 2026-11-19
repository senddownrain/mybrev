import moment from '@/utils/moment-be';

export const CACHE_DAYS_BEHIND = 1;
export const CACHE_DAYS_AHEAD = 7;

/**
 * Build the date prefetch order around a base date.
 * The visible day is first, then its immediate neighbours, then the rest of
 * the forward window. This makes quick right/left navigation useful as early
 * as possible while warmup continues in the background.
 */
export function buildDateWarmupOrder(
  baseDate = new Date(),
  daysBehind = CACHE_DAYS_BEHIND,
  daysAhead = CACHE_DAYS_AHEAD,
) {
  const base = moment(baseDate).startOf('day');
  const offsets = [0];

  for (let distance = 1; distance <= Math.max(daysBehind, daysAhead); distance += 1) {
    if (distance <= daysAhead) offsets.push(distance);
    if (distance <= daysBehind) offsets.push(-distance);
  }

  return offsets.map((offset) => base.clone().add(offset, 'days'));
}
