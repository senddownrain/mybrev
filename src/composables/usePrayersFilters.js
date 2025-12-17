import { ref } from 'vue';
import { useDebounce } from '@/composables/useDebounce';

const searchQuery = ref('');
const selectedTags = ref([]);
const selectedCategory = ref(null);
const isSearchExpanded = ref(false);
const isFilterExpanded = ref(false);

export function usePrayersFilters() {
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const setSearchQuery = (value) => {
    searchQuery.value = value;
  };

  const setSelectedTags = (value) => {
    selectedTags.value = Array.isArray(value) ? value : [];
  };

  const setSelectedCategory = (category) => {
    selectedCategory.value = category;
    // При выборе категории автоматически применяем её теги
    if (category && category.tags) {
      selectedTags.value = [...category.tags];
    } else {
      selectedTags.value = [];
    }
  };

  const clearFilters = () => {
    searchQuery.value = '';
    selectedTags.value = [];
    selectedCategory.value = null;
  };

  const toggleSearch = () => {
    isSearchExpanded.value = !isSearchExpanded.value;
    if (isSearchExpanded.value) {
      isFilterExpanded.value = false;
    }
  };

  const toggleFilter = () => {
    isFilterExpanded.value = !isFilterExpanded.value;
    if (isFilterExpanded.value) {
      isSearchExpanded.value = false;
    }
  };

  return {
    searchQuery,
    debouncedSearchQuery,
    selectedTags,
    selectedCategory,
    isSearchExpanded,
    isFilterExpanded,
    setSearchQuery,
    setSelectedTags,
    setSelectedCategory,
    clearFilters,
    toggleSearch,
    toggleFilter,
  };
}

