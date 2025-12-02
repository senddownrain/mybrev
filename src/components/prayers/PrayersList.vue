<template>
  <v-container class="prayers-list-container">
    <h1 class="text-h5 font-weight-light mb-4">Малітвы</h1>

    <!-- Поисковая строка -->
    <v-text-field
      v-model="searchQuery"
      label="Пошук малітваў"
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-4"
      clearable
    ></v-text-field>

    <!-- Фильтр по тегам -->
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
      class="mb-4"
    ></v-combobox>

    <div v-if="isLoading">
      <v-skeleton-loader v-for="n in 3" :key="n" type="card" class="mb-4"></v-skeleton-loader>
    </div>
    
    <div v-else>
      <v-card v-for="prayer in filteredPrayers" :key="prayer.id" class="mb-3 prayer-card" variant="outlined">
        <v-card-title class="font-weight-bold d-flex align-center prayer-card-title">
          <span class="flex-grow-1 text-wrap" @click="viewPrayer(prayer.id)" style="cursor: pointer;">
            {{ getTitle(prayer) }}
          </span>
        </v-card-title>
        <v-card-text class="pb-2" @click="viewPrayer(prayer.id)" style="cursor: pointer;">
          <p class="mb-3 text-medium-emphasis prayer-preview">{{ getPreviewText(prayer) }}</p>
          <div class="d-flex flex-wrap ga-1">
            <v-chip 
              v-for="tag in prayer.tags" 
              :key="tag" 
              size="small" 
              color="primary" 
              variant="tonal"
              class="mb-1"
            >
              {{ tag }}
            </v-chip>
          </div>
        </v-card-text>
        <v-card-actions v-if="authStore.isAdmin">
          <v-spacer></v-spacer>
          <v-btn
            icon="mdi-pencil"
            variant="text"
            size="small"
            @click.stop="router.push({ name: 'PrayerEdit', params: { id: prayer.id } })"
          ></v-btn>
        </v-card-actions>
      </v-card>

      <div v-if="!isLoading && filteredPrayers.length === 0" class="text-center text-grey-darken-1 mt-16">
        <v-icon size="48" class="mb-2">mdi-note-off-outline</v-icon>
        <p>Малітвы не знойдзены</p>
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

const router = useRouter();
const { prayers, isLoading, getTitle, getText, allTags } = usePrayers();
const authStore = useAuthStore();

const searchQuery = ref('');
const selectedTags = ref([]);

const filteredPrayers = computed(() => {
  if (isLoading.value) return [];
  
  let filtered = [...prayers.value];
  
  // Фильтр по тегам
  if (selectedTags.value.length > 0) {
    filtered = filtered.filter(prayer => {
      const prayerTags = prayer.tags || [];
      return selectedTags.value.every(tag => prayerTags.includes(tag));
    });
  }
  
  // Поиск по тексту (работает даже во время загрузки)
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(prayer => {
      const title = getTitle(prayer).toLowerCase();
      const text = getText(prayer);
      // Убираем HTML теги для поиска
      const textPlain = text.replace(/<[^>]*>/g, '').toLowerCase();
      return title.includes(query) || textPlain.includes(query);
    });
  }
  
  return filtered;
});

function getPreviewText(prayer) {
  const text = getText(prayer);
  if (!text) return 'Няма змесціва';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const plainText = (doc.body.textContent || "").trim();
  return plainText.length > 150 ? plainText.substring(0, 150) + '...' : plainText;
}

function viewPrayer(id) {
  router.push({ name: 'PrayerView', params: { id } });
}
</script>

<style scoped>
.prayers-list-container {
  max-width: 100%;
}

.prayer-card {
  transition: box-shadow 0.2s;
}

.prayer-card:active {
  opacity: 0.8;
}

.prayer-card-title {
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4 !important;
}

.prayer-preview {
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

@media (max-width: 600px) {
  .prayer-card {
    margin-left: 0;
    margin-right: 0;
  }

  .prayer-card-title {
    font-size: 0.95rem !important;
    padding: 12px 12px 8px 12px !important;
  }

  .prayer-preview {
    font-size: 0.875rem !important;
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

