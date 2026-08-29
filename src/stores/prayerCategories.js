import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  createPrayerCategory,
  deletePrayerCategory,
  deletePrayerTagEverywhere,
  restoreDefaultPrayerCategories,
  subscribePrayerCategories,
  updatePrayerCategory,
} from '@/services/prayerCategoryService';
import { logger } from '@/utils/logger';

export const usePrayerCategoriesStore = defineStore('prayerCategories', () => {
  const categories = ref([]);
  const isLoading = ref(true);
  const error = ref(null);
  let unsubscribe = null;

  const defaultPrayerTags = computed(() => [...new Set(
    categories.value
      .filter((category) => category.addToNewPrayers)
      .flatMap((category) => category.tags || []),
  )]);

  function init() {
    if (unsubscribe) return;
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

  async function setAddToNewPrayers(categoryId, enabled) {
    try {
      await updatePrayerCategory(categoryId, { addToNewPrayers: Boolean(enabled) });
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
  }

  return {
    categories,
    isLoading,
    error,
    defaultPrayerTags,
    init,
    cleanup,
    addCategory,
    removeCategory,
    setAddToNewPrayers,
    restoreDefaults,
    removeTagEverywhere,
  };
});
