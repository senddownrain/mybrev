import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  createPrayerCategory,
  deletePrayerCategory,
  deletePrayerTagEverywhere,
  getSavedPrayerCategories,
  restoreDefaultPrayerCategories,
  subscribePrayerCategories,
} from '@/services/prayerCategoryService';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth';
import { canReadPrayerCatalog, prayerCatalogDemand, prayerCatalogRevision } from '@/services/prayerCatalogAccess';
import { getPublicPrayerContent } from '@/services/prayerContentService';
import { isProtectedPrayerRow } from '@/utils/accessSetsV2Policy.mjs';
import { comparePrayerCategories } from '@/utils/prayerCategoryMembership.mjs';

export const usePrayerCategoriesStore = defineStore('prayerCategories', () => {
  const categories = ref([]);
  const isLoading = ref(true);
  const error = ref(null);
  let unsubscribe = null;
  let stopAuthWatch = null;
  let loadSequence = 0;

  function startLiveSubscription() {
    unsubscribe?.();
    isLoading.value = true;
    const sequence = loadSequence;
    unsubscribe = subscribePrayerCategories(
      (items) => {
        if (sequence !== loadSequence) return;
        categories.value = items;
        error.value = null;
        isLoading.value = false;
      },
      (subscriptionError) => {
        if (sequence !== loadSequence) return;
        categories.value = categories.value.filter((row) => !isProtectedPrayerRow(row));
        logger.error('[prayerCategories] Subscription failed:', subscriptionError);
        error.value = subscriptionError;
        isLoading.value = false;
      },
    );
  }

  async function loadCategories(includeProtected) {
    const sequence = ++loadSequence;
    unsubscribe?.();
    unsubscribe = null;
    categories.value = categories.value.filter((row) => !isProtectedPrayerRow(row));
    isLoading.value = categories.value.length === 0;
    try {
      const publicData = await getPublicPrayerContent();
      if (sequence !== loadSequence) return;
      categories.value = [...publicData.categories].sort(comparePrayerCategories);
      error.value = null;
      isLoading.value = false;
      if (!includeProtected) return;
      const items = await getSavedPrayerCategories(publicData);
      if (sequence === loadSequence) categories.value = items;
    } catch (loadError) {
      if (sequence === loadSequence) {
        logger.error('[prayerCategories] One-shot load failed:', loadError);
        error.value = loadError;
      }
    } finally {
      if (sequence === loadSequence) isLoading.value = false;
    }
  }

  function init() {
    const authStore = useAuthStore();
    if (stopAuthWatch) return;
    stopAuthWatch = watch([() => authStore.isAdmin, () => authStore.user?.uid, () => prayerCatalogDemand.value > 0, prayerCatalogRevision], ([isAdmin, , requested]) => {
      const includeProtected = requested && canReadPrayerCatalog();
      if (!isAdmin || !includeProtected) return loadCategories(includeProtected);
      loadSequence++;
      categories.value = categories.value.filter((row) => !isProtectedPrayerRow(row));
      startLiveSubscription();
    }, { immediate: true, flush: 'sync' });
  }

  async function addCategory(category) {
    try {
      return await createPrayerCategory(category);
    } catch (actionError) {
      error.value = actionError;
      throw actionError;
    }
  }

  async function removeCategory(categoryId) {
    try {
      await deletePrayerCategory(categoryId);
    } catch (actionError) {
      error.value = actionError;
      throw actionError;
    }
  }

  async function restoreDefaults() {
    try {
      return await restoreDefaultPrayerCategories(categories.value);
    } catch (actionError) {
      error.value = actionError;
      throw actionError;
    }
  }

  async function removeTagEverywhere(tag, prayers) {
    try {
      return await deletePrayerTagEverywhere(tag, prayers, categories.value);
    } catch (actionError) {
      error.value = actionError;
      throw actionError;
    }
  }

  function cleanup() {
    loadSequence++;
    categories.value = categories.value.filter((row) => !isProtectedPrayerRow(row));
    unsubscribe?.();
    unsubscribe = null;
    stopAuthWatch?.();
    stopAuthWatch = null;
  }

  return {
    categories,
    isLoading,
    error,
    init,
    cleanup,
    addCategory,
    removeCategory,
    restoreDefaults,
    removeTagEverywhere,
  };
});
