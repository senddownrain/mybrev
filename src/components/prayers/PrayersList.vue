<template>
  <v-container class="prayers-list-container">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h5 font-weight-light mb-0">Малітвы</h1>
      <v-chip 
        v-if="!isLoading && filteredPrayers.length > 0" 
        size="small" 
        color="primary" 
        variant="tonal"
      >
        {{ filteredPrayers.length }} {{ filteredPrayers.length === 1 ? 'малітва' : 'малітваў' }}
      </v-chip>
    </div>

    <v-text-field
      v-model="searchQuery"
      label="Пошук малітваў"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4 search-field"
      clearable
    ></v-text-field>

    <v-combobox
      v-model="selectedTags"
      :items="allTags"
      label="Фільтр па тэгах"
      multiple
      chips
      clearable
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4 filter-field"
    ></v-combobox>

    <v-select
      v-model="sortBy"
      :items="sortOptions"
      label="Сартаваць"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4"
    ></v-select>

    <div v-if="isLoading">
      <v-skeleton-loader v-for="n in 3" :key="n" type="card" class="mb-4"></v-skeleton-loader>
    </div>
    
    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі малітваў</div>
      <p>{{ error.message || error }}</p>
      <p v-if="error.code === 'failed-precondition'" class="text-caption mt-2">
        Магчыма, патрабуецца стварыць індэкс у Firebase Console для запыту.
      </p>
    </v-alert>
    
    <div v-else>
      <v-list lines="two" bg-color="transparent">
        <v-list-item
          v-for="prayer in filteredPrayers"
          :key="prayer.id"
          :title="getTitle(prayer)"
          :subtitle="getPreviewText(prayer)"
          @click="viewPrayer(prayer.id)"
          class="prayer-list-item"
        >
          <template v-slot:prepend>
            <v-btn
              icon
              variant="text"
              size="small"
              @click.stop="toggleFavorite(prayer.id)"
              :color="isFavorite(prayer.id) ? 'red' : 'grey'"
              :aria-label="isFavorite(prayer.id) ? 'Выдаліць з абраных' : 'Дадаць у абраныя'"
            >
              <v-icon>{{ isFavorite(prayer.id) ? 'mdi-heart' : 'mdi-heart-outline' }}</v-icon>
            </v-btn>
          </template>

          <template v-slot:append>
            <div class="d-flex align-center ga-2">
              <div v-if="prayer.tags && prayer.tags.length > 0" class="d-flex flex-wrap ga-1">
                <v-chip 
                  v-for="tag in prayer.tags.slice(0, 2)" 
                  :key="tag" 
                  size="x-small" 
                  color="primary" 
                  variant="tonal"
                >
                  {{ tag }}
                </v-chip>
                <v-chip 
                  v-if="prayer.tags.length > 2"
                  size="x-small" 
                  color="grey" 
                  variant="tonal"
                >
                  +{{ prayer.tags.length - 2 }}
                </v-chip>
              </div>
              <v-btn
                v-if="authStore.isAdmin"
                icon="mdi-pencil"
                variant="text"
                size="small"
                @click.stop="router.push({ name: 'PrayerEdit', params: { id: prayer.id } })"
                aria-label="Рэдагаваць малітву"
              ></v-btn>
            </div>
          </template>
        </v-list-item>
      </v-list>

      <div v-if="!isLoading && filteredPrayers.length === 0" class="text-center text-grey-darken-1 mt-16">
        <v-icon size="48" class="mb-2">mdi-note-off-outline</v-icon>
        <p>Малітвы не знойдзены</p>
        <p v-if="searchQuery || selectedTags.length > 0" class="text-caption mt-2">
          Паспрабуйце змяніць пошук або фільтры
        </p>
      </div>
    </div>

    <v-btn
      v-if="authStore.isAdmin"
      icon="mdi-plus"
      color="primary"
      position="fixed"
      location="bottom right"
      size="large"
      class="add-prayer-btn"
      @click="router.push({ name: 'PrayerAdd' })"
    ></v-btn>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useDebounce } from '@/composables/useDebounce';
import { getPrayerPreview } from '@/composables/usePrayerPreview';

const router = useRouter();
const { prayers, isLoading, getTitle, getText, allTags, error } = usePrayers();
const authStore = useAuthStore();
const settings = useSettingsStore();

const searchQuery = ref('');
const debouncedSearchQuery = useDebounce(searchQuery, 300);
const selectedTags = ref([]);
const sortBy = ref('alphabet');

const sortOptions = [
  { title: 'Па алфавіце', value: 'alphabet' },
  { title: 'Па даце (новыя першымі)', value: 'date-desc' },
  { title: 'Па даце (старыя першымі)', value: 'date-asc' },
  { title: 'Абраныя першымі', value: 'favorites-first' },
];

const filteredPrayers = computed(() => {
  if (isLoading.value) return [];
  
  const prayersArray = prayers.value;
  if (!prayersArray || !Array.isArray(prayersArray)) {
    console.warn('[PrayersList] prayers.value is not an array:', prayersArray, 'type:', typeof prayersArray);
    return [];
  }
  
  console.log('[PrayersList] Total prayers:', prayersArray.length);
  let filtered = [...prayersArray];
  
  if (selectedTags.value.length > 0) {
    filtered = filtered.filter(prayer => {
      const prayerTags = prayer.tags || [];
      return selectedTags.value.every(tag => prayerTags.includes(tag));
    });
  }
  
  if (debouncedSearchQuery.value.trim()) {
    const query = debouncedSearchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(prayer => {
      const title = getTitle(prayer).toLowerCase();
      const text = getText(prayer);
      const textPlain = text.replace(/<[^>]*>/g, '').toLowerCase();
      return title.includes(query) || textPlain.includes(query);
    });
  }
  
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'alphabet':
        const titleA = getTitle(a).toLowerCase();
        const titleB = getTitle(b).toLowerCase();
        return titleA.localeCompare(titleB, 'be', { sensitivity: 'base' });
      
      case 'date-desc':
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return dateB - dateA;
      
      case 'date-asc':
        const dateA2 = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const dateB2 = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return dateA2 - dateB2;
      
      case 'favorites-first':
        const aIsFavorite = settings.favoritePrayers.includes(a.id);
        const bIsFavorite = settings.favoritePrayers.includes(b.id);
        if (aIsFavorite && !bIsFavorite) return -1;
        if (!aIsFavorite && bIsFavorite) return 1;
        const titleA2 = getTitle(a).toLowerCase();
        const titleB2 = getTitle(b).toLowerCase();
        return titleA2.localeCompare(titleB2, 'be', { sensitivity: 'base' });
      
      default:
        return 0;
    }
  });
  
  return filtered;
});

function getPreviewText(prayer) {
  const text = getText(prayer);
  return getPrayerPreview(text);
}

function viewPrayer(id) {
  router.push({ name: 'PrayerView', params: { id } });
}

function isFavorite(prayerId) {
  return settings.favoritePrayers.includes(prayerId);
}

function toggleFavorite(prayerId) {
  settings.toggleFavoritePrayer(prayerId);
}
</script>

<style scoped>
.prayers-list-container {
  max-width: 100%;
  width: 100%;
}

.search-field,
.filter-field {
  width: 100%;
  max-width: 100%;
}

.prayer-list-item {
  cursor: pointer;
  transition: background-color 0.2s;
}

.prayer-list-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.prayer-list-item :deep(.v-list-item-title) {
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
}

.prayer-list-item :deep(.v-list-item-subtitle) {
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 600px) {
  .prayers-list-container {
    padding: 12px 8px !important;
  }

  .prayer-list-item {
    padding: 12px 8px !important;
  }

  .prayer-list-item :deep(.v-list-item-title) {
    font-size: 0.95rem !important;
  }

  .prayer-list-item :deep(.v-list-item-subtitle) {
    font-size: 0.85rem !important;
    -webkit-line-clamp: 2;
  }

  .search-field,
  .filter-field {
    width: 100% !important;
    max-width: 100% !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  .v-text-field,
  .v-combobox {
    width: 100% !important;
    max-width: 100% !important;
  }

  .add-prayer-btn {
    margin: 16px !important;
    bottom: 80px !important;
  }
}

@media (max-width: 400px) {
  .add-prayer-btn {
    margin: 12px !important;
    bottom: 76px !important;
  }
}
</style>

