import { useLiturgicalStore } from '@/stores/liturgical';
import { warmupStaticLiturgicalCollections } from '@/services/staticLiturgicalService';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

export const CACHE_DAYS_BEHIND = 1;
export const CACHE_DAYS_AHEAD = 7;
const DATE_BATCH_SIZE = 2;

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

/**
 * Prefetch the exact data used by the liturgy and readings screens.
 * Store-level caches make navigation synchronous after each date completes;
 * Firestore's persistent cache keeps the underlying documents for later runs.
 */
export async function warmupDateWindow(baseDate = new Date()) {
  const liturgicalStore = useLiturgicalStore();
  const dates = buildDateWarmupOrder(baseDate);
  let loaded = 0;

  for (let index = 0; index < dates.length; index += DATE_BATCH_SIZE) {
    const batch = dates.slice(index, index + DATE_BATCH_SIZE);
    await Promise.all(batch.map(async (date) => {
      const key = date.format('YYYY-MM-DD');
      const results = await Promise.allSettled([
        liturgicalStore.fetchContentByDate(date.toDate()),
        liturgicalStore.fetchReadingsByDate(date.toDate(), {
          includeAlternatives: true,
        }),
      ]);

      const rejected = results.filter((result) => result.status === 'rejected');
      if (rejected.length) {
        logger.error(`[CacheWarmup] incomplete date ${key}:`, rejected.map((result) => result.reason));
      } else {
        loaded += 1;
      }
    }));
  }

  logger.log(`[CacheWarmup] date window ready: ${loaded}/${dates.length}`);
}

/**
 * Warm all navigation-critical data after the first screen has mounted.
 * Static collections and the date window are independent, so they can load in
 * parallel without making either one a prerequisite for the visible screen.
 */
export async function warmupCache(baseDate = new Date()) {
  const startedAt = Date.now();
  logger.log('[CacheWarmup] background warmup started');

  const results = await Promise.allSettled([
    warmupDateWindow(baseDate),
    warmupStaticLiturgicalCollections(),
  ]);

  results.forEach((result) => {
    if (result.status === 'rejected') {
      logger.error('[CacheWarmup] warmup task failed:', result.reason);
    }
  });

  logger.log(`[CacheWarmup] background warmup finished in ${Date.now() - startedAt}ms`);
}
