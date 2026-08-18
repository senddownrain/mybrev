/**
 * Thin composable wrapper around usePrayersFiltersStore.
 * Kept for backward compatibility — all consumers can continue using
 * `usePrayersFilters()` without changes.
 *
 * State is now managed by Pinia, which means it appears in DevTools and
 * is properly isolated per app instance (no module-level singleton issues).
 */
import { usePrayersFiltersStore } from '@/stores/prayersFilters';
import { storeToRefs } from 'pinia';

export function usePrayersFilters() {
  const store = usePrayersFiltersStore();

  // Pinia unwraps refs when a store is accessed directly. Returning the store
  // itself therefore breaks consumers that destructure the state and expect
  // refs (for example, `selectedTags.value` in PrayersList). Keep the original
  // composable contract by exposing state as refs and actions as bound methods.
  return {
    ...storeToRefs(store),
    setSearchQuery: store.setSearchQuery,
    setSelectedTags: store.setSelectedTags,
    setSelectedCategory: store.setSelectedCategory,
    clearFilters: store.clearFilters,
    toggleSearch: store.toggleSearch,
    toggleFilter: store.toggleFilter,
  };
}
