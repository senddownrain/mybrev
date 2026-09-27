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
    unsubscribe = subscribePrayerCategories(
      (items) => {
        categories.value = items;
        error.value = null;
        isLoading.value = false;
      },
      (subscriptionError) => {
        logger.error('[prayerCategories] Subscription failed:', subscriptionError);
        error.value = subscriptionError;
        isLoading.value = false;
      },
    );
  }

  async function loadPublicCategories() {
    const sequence = ++loadSequence;
    unsubscribe?.();
    unsubscribe = null;
    isLoading.value = categories.value.length === 0;
    try {
      const items = await getSavedPrayerCategories();
      if (sequence !== loadSequence) return;
      categories.value = items;
      error.value = null;
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
    if (stopAuthWatch) {
      if (!authStore.isAdmin && !unsubscribe && categories.value.length === 0) loadPublicCategories();
      return;
    }
    stopAuthWatch = watch(() => authStore.isAdmin, (isAdmin) => {
      if (isAdmin) {
        loadSequence += 1;
        startLiveSubscription();
      } else {
        loadPublicCategories();
      }
    }, { immediate: true });
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
