import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

/**
 * Prayers filter/search state store.
 * Replaces module-level refs in usePrayersFilters composable so state is
 * visible in Pinia DevTools and properly SSR-safe.
 *
 * Debounce is implemented inline because this store has no component lifecycle.
 * and would throw a Vue warning inside a Pinia store setup function.
 */
export const usePrayersFiltersStore = defineStore('prayersFilters', () => {
  const searchQuery = ref('');
  const selectedTags = ref([]);
  const selectedCategory = ref(null);
  const lastOpenedPrayerId = ref(null);
  const isSearchExpanded = ref(false);
  const isFilterExpanded = ref(false);
  const categoryReturnFocus = ref({});

  // Debounced version of searchQuery — no onUnmounted needed since the store
  // is a singleton that lives for the entire app lifetime.
  const debouncedSearchQuery = ref('');
  let _debounceTimer = null;

  watch(searchQuery, (newValue) => {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      debouncedSearchQuery.value = newValue;
    }, 300);
  }, { immediate: true });

  function setSearchQuery(value) {
    searchQuery.value = value;
  }

  function setSelectedTags(value) {
    selectedTags.value = Array.isArray(value) ? value : [];
  }

  function setSelectedCategory(category) {
    if (selectedCategory.value?.id !== category?.id || selectedCategory.value?.name !== category?.name) lastOpenedPrayerId.value = null;
    selectedCategory.value = category;
    selectedTags.value = [];
  }

  function clearFilters() {
    lastOpenedPrayerId.value = null;
    searchQuery.value = '';
    selectedTags.value = [];
    selectedCategory.value = null;
  }

  function toggleSearch() {
    isSearchExpanded.value = !isSearchExpanded.value;
    if (isSearchExpanded.value) {
      isFilterExpanded.value = false;
    }
  }

  function toggleFilter() {
    isFilterExpanded.value = !isFilterExpanded.value;
    if (isFilterExpanded.value) {
      isSearchExpanded.value = false;
    }
  }

  return {
    categoryReturnFocus,
    searchQuery,
    debouncedSearchQuery,
    selectedTags,
    selectedCategory,
    lastOpenedPrayerId,
    isSearchExpanded,
    isFilterExpanded,
    setSearchQuery,
    setSelectedTags,
    setSelectedCategory,
    clearFilters,
    toggleSearch,
    toggleFilter,
  };
});
