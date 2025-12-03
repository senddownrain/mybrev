<template>
  <v-container class="prayers-list-container">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h5 font-weight-light mb-0">Абраныя малітвы</h1>
      <v-chip 
        v-if="!isLoading && favoritePrayers.length > 0" 
        size="small" 
        color="primary" 
        variant="tonal"
      >
        {{ favoritePrayers.length }} {{ favoritePrayers.length === 1 ? 'малітва' : 'малітваў' }}
      </v-chip>
    </div>

    <v-select
      v-if="!isLoading && favoritePrayers.length > 0"
      v-model="sortBy"
      :items="sortOptions"
      label="Сартаваць"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4"
    ></v-select>

    <div v-if="isLoading" class="text-center mt-16">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
      <p class="mt-4 text-grey">Загрузка...</p>
    </div>

    <div v-else-if="favoritePrayers.length === 0" class="text-center text-grey-darken-1 mt-16">
      <v-icon size="48" class="mb-2">mdi-heart-outline</v-icon>
      <p>Няма абраных малітваў</p>
      <p class="text-caption mt-2">Дадайце малітвы ў абраныя, націснуўшы на сэрца</p>
    </div>

    <div v-else>
      <v-list lines="two" bg-color="transparent">
        <v-list-item
          v-for="prayer in favoritePrayers"
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
              color="red"
              aria-label="Выдаліць з абраных"
            >
              <v-icon>mdi-heart</v-icon>
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
    </div>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { getPrayerPreview } from '@/composables/usePrayerPreview';

const router = useRouter();
const { prayers, isLoading, getTitle, getText } = usePrayers();
const authStore = useAuthStore();
const settings = useSettingsStore();

const sortBy = ref('alphabet');

const sortOptions = [
  { title: 'Па алфавіце', value: 'alphabet' },
  { title: 'Па даце (новыя першымі)', value: 'date-desc' },
  { title: 'Па даце (старыя першымі)', value: 'date-asc' },
];

const favoritePrayers = computed(() => {
  if (!prayers.value || !Array.isArray(prayers.value)) return [];
  if (!settings.favoritePrayers || !Array.isArray(settings.favoritePrayers)) return [];
  
  let filtered = prayers.value.filter(prayer => settings.favoritePrayers.includes(prayer.id));
  
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

function toggleFavorite(prayerId) {
  settings.toggleFavoritePrayer(prayerId);
}
</script>

<style scoped>
.prayers-list-container {
  max-width: 100%;
  width: 100%;
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
}
</style>

