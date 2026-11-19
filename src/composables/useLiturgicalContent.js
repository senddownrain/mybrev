/**
 * Facade composable for assembled liturgical-day options.
 *
 * UI contract (public API — unchanged):
 *   getLiturgicalContentForDate(date)     → { context, itemsDays, dayOptions }
 *   feastNameMap                          → FEAST_NAME_MAP constant
 *
 * Flow:
 *   composable → liturgicalStore.fetchContentByDate → liturgicalContentService
 *
 * Caching is now managed entirely by liturgicalStore, not in a module-level Map.
 */
import { useLiturgicalStore } from '@/stores/liturgical';
import { FEAST_NAME_MAP as feastNameMap } from '@/constants/liturgicalFeastsMap';
import { useRoute } from 'vue-router';

export function useLiturgicalContent() {
  const liturgicalStore = useLiturgicalStore();
  const route = useRoute();
  const referenceOptionId = () => String(route?.query.reference || '');
  const periodOnly = () => route?.query.view === 'period';

  /**
   * Fetch liturgical-day content for a date.
   * Results are cached inside liturgicalStore (keyed by YYYY-MM-DD).
   *
   * @param {Date|import('moment').Moment|string} currentDate
   * @returns {Promise<{ context, itemsDays, dayOptions }>}
   */
  async function getLiturgicalContentForDate(currentDate, diocese, options = {}) {
    return liturgicalStore.fetchContentByDate(currentDate, { ...(diocese ? { diocese } : {}), referenceOptionId: referenceOptionId(), periodOnly: periodOnly(), ...options });
  }

  return { getLiturgicalContentForDate, feastNameMap };
}
