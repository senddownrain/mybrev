import { onScopeDispose } from 'vue';
import { retainPrayerCatalog } from '@/services/prayerCatalogAccess';
import { usePrayersStore } from '@/stores/prayers';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';

// Only a catalog or editorial view owns the full protected listing.
export function usePrayerCatalog() {
  onScopeDispose(retainPrayerCatalog());
  usePrayersStore().init();
  usePrayerCategoriesStore().init();
}
