<template>
  <v-container class="prayers-list-container">
    <div class="prayers-page-header">
      <div class="prayers-page-eyebrow">Малітоўнік</div>
      <h1 class="prayers-page-title">{{ selectedCategory?.name || 'Малітвы' }}</h1>
    </div>


    <div v-if="isLoading" class="prayer-options-list">
      <v-skeleton-loader
        v-for="n in 6"
        :key="n"
        type="list-item-avatar"
        class="prayer-list-skeleton"
      ></v-skeleton-loader>
    </div>
    
    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі малітваў</div>
      <p>{{ error.message || error }}</p>
      <p v-if="error.code === 'failed-precondition'" class="text-caption mt-2">
        Магчыма, патрабуецца стварыць індэкс у Firebase Console для запыту.
      </p>
    </v-alert>
    
    <div v-else>
      <v-list lines="one" bg-color="transparent" class="prayer-options-list">
        <v-list-item
          v-for="prayer in filteredPrayers"
          :key="prayer.id"
          @click="viewPrayer(prayer.id)"
          class="prayer-list-item"
        >
          <template v-slot:prepend>
            <span
              class="prayer-list-item__icon-wrap"
              :class="{ 'prayer-list-item__icon-wrap--favorite': isFavorite(prayer.id) }"
            >
              <v-btn
                icon
                variant="text"
                size="small"
                @click.stop="toggleFavorite(prayer.id)"
                :color="isFavorite(prayer.id) ? 'red' : undefined"
                :aria-label="isFavorite(prayer.id) ? 'Выдаліць з абраных' : 'Дадаць у абраныя'"
              >
                <v-icon>{{ isFavorite(prayer.id) ? 'mdi-heart' : 'mdi-heart-outline' }}</v-icon>
              </v-btn>
            </span>
          </template>

          <v-list-item-title class="prayer-title-text">
            {{ getTitle(prayer) }}
          </v-list-item-title>

          <template v-slot:append>
            <div class="prayer-list-item__actions">
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
              <v-icon class="prayer-list-item__arrow" icon="mdi-chevron-right" size="24"></v-icon>
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
      prepend-icon="mdi-plus"
      position="fixed"
      location="bottom right"
      size="large"
      rounded="pill"
      class="add-prayer-btn text-none"
      @click="router.push({ name: 'PrayerAdd' })"
    >
      Новая малітва
    </v-btn>

    <!-- Диалог подтверждения удаления -->
    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card class="confirmation-dialog-card">
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
import '@/styles/prayers-list.css';
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayersFilters } from '@/composables/usePrayersFilters';
import { matchesPrayerTags } from '@/utils/prayerTagFilter';
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
  
  // Малітва ўваходзіць у катэгорыю, калі мае хаця б адзін яе тэг.
  if (selectedTags.value && selectedTags.value.length > 0) {
    filtered = filtered.filter((prayer) => matchesPrayerTags(prayer.tags, selectedTags.value));
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
    // Legacy titles may contain leading spaces invisible in the rendered list.
    const titleA = getTitle(a).trim().toLowerCase();
    const titleB = getTitle(b).trim().toLowerCase();
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
  } catch {
    notifyError('Памылка пры выдаленні малітвы');
  } finally {
    isDeleting.value = false;
  }
}
</script>
<style scoped src="@/styles/prayers-list.css"></style>
