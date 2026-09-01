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

<style scoped>
.prayers-list-container {
  position: relative;
  isolation: isolate;
  width: min(100%, 760px);
  max-width: 760px;
  padding-top: 12px;
  padding-bottom: 104px !important;
}

.prayers-list-container::before {
  position: absolute;
  z-index: -1;
  inset: -24px -20px auto;
  height: 300px;
  border-radius: 48px;
  background: radial-gradient(
    ellipse at 82% 12%,
    rgba(var(--devotional-rgb), var(--ambient-strength)),
    transparent 68%
  );
  content: "";
  filter: blur(12px);
  pointer-events: none;
}

.add-prayer-btn {
  z-index: 96;
  min-height: 54px;
  margin: 16px !important;
  padding-inline: 20px !important;
  border: 1px solid var(--nav-border);
  background: var(--nav-on-surface) !important;
  color: var(--nav-surface) !important;
  font-weight: 720;
  box-shadow: 0 9px 28px var(--nav-shadow) !important;
}

.prayers-page-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 0 12px 22px;
}

.prayers-page-eyebrow {
  margin-bottom: 8px;
  color: var(--devotional-accent);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.prayers-page-title {
  margin: 8px 0 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.prayer-options-list {
  display: grid;
  gap: 12px;
  padding: 0 12px !important;
}

.prayer-list-skeleton {
  min-height: 80px;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
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
  background: var(--overlay-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 9px 28px var(--nav-shadow);
  backdrop-filter: blur(20px) saturate(1.08);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.prayer-search-dock:focus-within {
  border-color: rgba(var(--devotional-rgb), 0.42);
  box-shadow: 0 9px 28px var(--nav-shadow), 0 0 0 3px rgba(var(--devotional-rgb), 0.11);
}

.prayer-search-icon {
  flex: 0 0 auto;
  color: var(--devotional-accent);
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
  background: var(--devotional-soft);
  color: var(--devotional-accent);
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
  background: var(--devotional-accent);
  color: var(--on-devotional-accent);
  font-size: 0.62rem;
  font-weight: 750;
}

.prayer-list-item {
  min-height: 80px;
  padding: 14px 14px 14px 16px !important;
  border: 1px solid var(--nav-border);
  border-radius: 22px !important;
  background:
    linear-gradient(120deg, rgba(var(--devotional-rgb), 0.055), transparent 62%),
    var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.prayer-list-item:hover {
  border-color: rgba(var(--devotional-rgb), 0.28);
  box-shadow: 0 7px 22px var(--nav-button-shadow);
}

.prayer-list-item:active {
  transform: scale(0.988);
}

.prayer-list-item__icon-wrap {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(var(--devotional-rgb), 0.18);
  border-radius: 16px;
  background: var(--devotional-soft);
  color: var(--devotional-accent);
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.prayer-list-item__icon-wrap--favorite {
  border-color: rgba(var(--v-theme-error), 0.2);
  background: rgba(var(--v-theme-error), 0.08);
}

.prayer-title-text {
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-size: clamp(1.04rem, 4vw, 1.17rem) !important;
  font-weight: 650;
  line-height: 1.36 !important;
  letter-spacing: -0.01em;
  white-space: normal;
  padding-inline: 4px 8px;
}

.prayer-list-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.prayer-list-item__arrow {
  color: var(--nav-muted);
}

.confirmation-dialog-card {
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 24px !important;
  background:
    radial-gradient(circle at 92% 0, rgba(var(--devotional-rgb), 0.1), transparent 190px),
    var(--overlay-surface) !important;
}

.confirmation-dialog-card :deep(.v-card-title) {
  padding: 20px 20px 8px;
  font-family: var(--reader-display-font-family);
  font-weight: 700;
}

.confirmation-dialog-card :deep(.v-card-actions) {
  padding: 10px 16px 16px;
  border-top: 1px solid var(--nav-border);
}

:deep(.prayer-list-item .v-list-item__prepend) {
  align-self: center;
  margin-inline-end: 12px;
}

:deep(.prayer-list-item .v-list-item__append) {
  align-self: center;
}

@media (max-width: 600px) {
  .prayers-list-container::before {
    inset-inline: 0;
    height: 260px;
    filter: blur(10px);
  }

  .prayers-list-container {
    padding: 8px 4px 104px !important;
  }

  .prayers-page-header {
    margin-inline: 12px;
  }

  .prayer-options-list {
    padding-inline: 8px !important;
  }

  .prayer-list-item {
    min-height: 80px;
  }

  .prayer-title-text {
    font-size: 1.04rem !important;
  }

  .add-prayer-btn {
    margin: 16px !important;
    bottom: 76px !important;
    width: 54px !important;
    min-width: 54px !important;
    padding: 0 !important;
    font-size: 0;
  }

  .add-prayer-btn :deep(.v-btn__prepend) {
    margin: 0;
  }

  .add-prayer-btn :deep(.v-icon) {
    font-size: 24px;
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

@media (max-width: 359px) {
  .prayer-list-item {
    padding-inline: 12px 10px !important;
    border-radius: 20px !important;
  }

  .prayer-list-item__icon-wrap {
    width: 44px;
    height: 44px;
  }

  :deep(.prayer-list-item .v-list-item__prepend) {
    margin-inline-end: 8px;
  }
}
</style>

