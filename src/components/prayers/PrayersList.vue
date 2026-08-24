<template>
  <v-container class="prayers-list-container">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="prayers-page-title">{{ selectedCategory?.name || 'Малітвы' }}</h1>
      <v-chip 
        v-if="!isLoading && filteredPrayers.length > 0" 
        size="small" 
        color="primary" 
        variant="tonal"
      >
        {{ filteredPrayers.length }} {{ filteredPrayers.length === 1 ? 'малітва' : 'малітваў' }}
      </v-chip>
    </div>


    <div v-if="isLoading">
      <v-skeleton-loader v-for="n in 10" :key="n" type="text" class="mb-4"></v-skeleton-loader>
    </div>
    
    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі малітваў</div>
      <p>{{ error.message || error }}</p>
      <p v-if="error.code === 'failed-precondition'" class="text-caption mt-2">
        Магчыма, патрабуецца стварыць індэкс у Firebase Console для запыту.
      </p>
    </v-alert>
    
    <div v-else>
      <v-list lines="one" bg-color="transparent">
        <v-list-item
          v-for="prayer in filteredPrayers"
          :key="prayer.id"
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

          <v-list-item-title class="prayer-title-text">
            {{ getTitle(prayer) }}
          </v-list-item-title>

          <template v-slot:append>
            <div class="d-flex align-center ga-1">
              <v-btn
                v-if="authStore.isAdmin"
                icon="mdi-pencil"
                variant="text"
                size="small"
                @click.stop="router.push({ name: 'PrayerEdit', params: { id: prayer.id } })"
                aria-label="Рэдагаваць малітву"
              ></v-btn>
              <v-btn
                v-if="authStore.isAdmin"
                icon="mdi-delete"
                variant="text"
                size="small"
                color="error"
                @click.stop="openDeleteDialog(prayer)"
                aria-label="Выдаліць малітву"
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

    <form class="prayer-search-dock" role="search" @submit.prevent>
      <PhMagnifyingGlass :size="23" class="prayer-search-icon" aria-hidden="true" />
      <input
        v-model="searchQuery"
        type="search"
        class="prayer-search-input"
        placeholder="Пошук малітваў"
        aria-label="Пошук малітваў"
        autocomplete="off"
        enterkeyhint="search"
        @keydown.esc="searchQuery = ''"
      />
      <button
        v-if="searchQuery"
        type="button"
        class="search-dock-action"
        aria-label="Ачысціць пошук"
        @click="searchQuery = ''"
      >
        <PhX :size="19" />
      </button>
      <button
        type="button"
        class="search-dock-action filter-dock-action"
        :class="{ 'search-dock-action--active': selectedTags.length > 0 }"
        :aria-label="selectedTags.length ? `Фільтр: выбрана ${selectedTags.length}` : 'Адкрыць фільтр'"
        @click="toggleFilter"
      >
        <PhSlidersHorizontal :size="21" />
        <span v-if="selectedTags.length" class="filter-count">{{ selectedTags.length }}</span>
      </button>
    </form>

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

    <!-- Диалог подтверждения удаления -->
    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Выдаліць малітву?</v-card-title>
        <v-card-text>
          <p>Вы ўпэўнены, што хочаце выдаліць малітву "{{ prayerToDelete ? getTitle(prayerToDelete) : '' }}"?</p>
          <p class="text-caption text-error mt-2">Гэта дзеянне нельга адмяніць.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" :disabled="isDeleting" @click="closeDeleteDialog">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" :loading="isDeleting" @click="confirmDelete">Выдаліць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayersFilters } from '@/composables/usePrayersFilters';
import { PhMagnifyingGlass, PhSlidersHorizontal, PhX } from '@phosphor-icons/vue';

const router = useRouter();
const { prayers, isLoading, getTitle, getText, error, deletePrayer } = usePrayers();
const authStore = useAuthStore();
const settings = useSettingsStore();
const { notifySuccess, notifyError } = useNotifier();
const { searchQuery, debouncedSearchQuery, selectedTags, selectedCategory, toggleFilter } = usePrayersFilters();

const deleteDialogOpen = ref(false);
const prayerToDelete = ref(null);
const isDeleting = ref(false);

const filteredPrayers = computed(() => {
  if (isLoading.value) return [];
  
  const prayersArray = prayers.value;
  if (!prayersArray || !Array.isArray(prayersArray)) {
    return [];
  }
  
  let filtered = [...prayersArray];
  
  // Фильтр по тегам категории
  if (selectedTags.value && selectedTags.value.length > 0) {
    filtered = filtered.filter(prayer => {
      const prayerTags = prayer.tags || [];
      return selectedTags.value.every(tag => prayerTags.includes(tag));
    });
  }
  
  // Поиск
  if (debouncedSearchQuery.value && debouncedSearchQuery.value.trim()) {
    const query = debouncedSearchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(prayer => {
      const title = getTitle(prayer).toLowerCase();
      const text = getText(prayer);
      const textPlain = text.replace(/<[^>]*>/g, '').toLowerCase();
      return title.includes(query) || textPlain.includes(query);
    });
  }
  
  // Сортировка: избранные молитвы вверху, затем по алфавиту
  filtered.sort((a, b) => {
    const aIsFavorite = isFavorite(a.id);
    const bIsFavorite = isFavorite(b.id);

    // Если один избранный, а другой нет - избранный вверх
    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;

    // Если оба избранные или оба не избранные - сортировка по алфавиту
    const titleA = getTitle(a).toLowerCase();
    const titleB = getTitle(b).toLowerCase();
    return titleA.localeCompare(titleB, 'be', { sensitivity: 'base' });
  });
  
  return filtered;
});

function viewPrayer(id) {
  router.push({ name: 'PrayerView', params: { id } });
}

function isFavorite(prayerId) {
  return settings.favoritePrayers.includes(prayerId);
}

function toggleFavorite(prayerId) {
  settings.toggleFavoritePrayer(prayerId);
}

function openDeleteDialog(prayer) {
  prayerToDelete.value = prayer;
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  deleteDialogOpen.value = false;
  prayerToDelete.value = null;
}

async function confirmDelete() {
  if (!prayerToDelete.value || isDeleting.value) return;

  isDeleting.value = true;
  try {
    await deletePrayer(prayerToDelete.value.id);
    notifySuccess('Малітва выдалена');
    closeDeleteDialog();
  } catch (error) {
    notifyError('Памылка пры выдаленні малітвы');
  } finally {
    isDeleting.value = false;
  }
}
</script>

<style scoped>
.prayers-list-container {
  max-width: 100%;
  width: 100%;
  padding-bottom: 104px !important;
}

.prayers-page-title {
  margin: 8px 8px 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.prayer-search-dock {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  left: 16px;
  z-index: 95;
  display: flex;
  align-items: center;
  width: calc(100% - 32px);
  max-width: 480px;
  height: 58px;
  margin-inline: auto;
  padding: 0 8px 0 18px;
  border: 1px solid var(--nav-border);
  border-radius: 29px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 9px 28px var(--nav-shadow);
}

.prayer-search-icon {
  flex: 0 0 auto;
  color: var(--nav-muted);
}

.prayer-search-input {
  min-width: 0;
  flex: 1;
  height: 100%;
  padding: 0 12px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--nav-on-surface);
  font: inherit;
  font-size: 0.98rem;
}

.prayer-search-input::placeholder {
  color: var(--nav-muted);
  opacity: 1;
}

.prayer-search-input::-webkit-search-cancel-button {
  display: none;
}

.search-dock-action {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--nav-muted);
  cursor: pointer;
}

.search-dock-action:active {
  background: var(--nav-active);
}

.search-dock-action--active {
  background: var(--nav-active);
  color: var(--nav-on-surface);
}

.filter-count {
  position: absolute;
  top: 1px;
  right: 0;
  display: grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--nav-on-surface);
  color: var(--nav-surface);
  font-size: 0.62rem;
  font-weight: 750;
}

.prayer-list-item {
  cursor: pointer;
  transition: background-color 0.2s;
}

.prayer-list-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.prayer-title-text {
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
  white-space: normal;
  padding-left: 8px;
}

.prayer-list-item {
  padding-left: 4px !important;
}

@media (max-width: 600px) {
  .prayers-list-container {
    padding: 12px 4px 104px !important;
  }

  .prayer-list-item {
    padding: 12px 4px !important;
    min-height: 56px;
  }

  .prayer-title-text {
    font-size: 0.95rem !important;
    padding-left: 4px;
  }

  .add-prayer-btn {
    margin: 16px !important;
    bottom: 76px !important;
  }
}

@media (max-width: 400px) {
  .prayer-search-dock {
    right: 10px;
    left: 10px;
    width: calc(100% - 20px);
  }

  .add-prayer-btn {
    margin: 12px !important;
    bottom: 74px !important;
  }
}
</style>

