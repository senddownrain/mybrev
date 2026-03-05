/**
 * Thin composable wrapper around usePrayersFiltersStore.
 * Kept for backward compatibility — all consumers can continue using
 * `usePrayersFilters()` without changes.
 *
 * State is now managed by Pinia, which means it appears in DevTools and
 * is properly isolated per app instance (no module-level singleton issues).
 */
import { usePrayersFiltersStore } from '@/stores/prayersFilters';

export function usePrayersFilters() {
  return usePrayersFiltersStore();
}
