/**
 * Facade composable for assembled liturgical-day options.
 *
 * UI contract (public API — unchanged):
 *   getLiturgicalContentForDate(date)     → { context, itemsDays, dayOptions }
 *   getCachedLiturgicalContentForDate(date) → same | null (sync, no fetch)
 *   feastNameMap                          → FEAST_NAME_MAP constant
 *
 * Flow:
 *   composable → liturgicalStore.fetchContentByDate → liturgicalContentService
 *
 * Caching is now managed entirely by liturgicalStore, not in a module-level Map.
 */
import { useLiturgicalStore } from '@/stores/liturgical';
import { FEAST_NAME_MAP as feastNameMap } from '@/constants/liturgicalFeastsMap';
import { logger } from '@/utils/logger';

export function useLiturgicalContent() {
  const liturgicalStore = useLiturgicalStore();

  /**
   * Fetch liturgical-day content for a date.
   * Results are cached inside liturgicalStore (keyed by YYYY-MM-DD).
   *
   * @param {Date|import('moment').Moment|string} currentDate
   * @returns {Promise<{ context, itemsDays, dayOptions }>}
   */
  async function getLiturgicalContentForDate(currentDate, diocese) {
    return liturgicalStore.fetchContentByDate(currentDate, diocese ? { diocese } : {});
  }

  /**
   * Return cached content for a date synchronously.
   * Returns null if the data has not been fetched yet.
   *
   * @param {Date|import('moment').Moment|string} currentDate
   * @returns {{ context, itemsDays, dayOptions } | null}
   */
  function getCachedLiturgicalContentForDate(currentDate, diocese) {
    const cached = liturgicalStore.getCachedContent(currentDate, diocese);
    if (cached) {
      // A fresh entry returns immediately; a stale entry is also returned
      // immediately and the store refreshes it in the background when online.
      liturgicalStore.fetchContentByDate(currentDate, diocese ? { diocese } : {}).catch((error) => {
        logger.error('[useLiturgicalContent] background refresh failed:', error);
      });
    }
    return cached;
  }

  async function restoreCachedLiturgicalContentForDate(currentDate, diocese) {
    await liturgicalStore.primeContent(currentDate, diocese);
    return getCachedLiturgicalContentForDate(currentDate, diocese);
  }

  return {
    getLiturgicalContentForDate,
    getCachedLiturgicalContentForDate,
    restoreCachedLiturgicalContentForDate,
    feastNameMap,
  };
}
