import { toValue, watch } from 'vue';
import { retainPrayerCatalog } from '@/services/prayerCatalogAccess';
import { usePrayersStore } from '@/stores/prayers';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';

// Only an open menu or reader catalog view requests the protected listing.
export function usePrayerCatalog(enabled = true) {
  watch(() => toValue(enabled), (requested, _, onCleanup) => {
    if (requested) onCleanup(retainPrayerCatalog());
  }, { immediate: true, flush: 'sync' });
  usePrayersStore().init();
  usePrayerCategoriesStore().init();
}
