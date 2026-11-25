<template>
  <v-container class="prayers-list-container">
    <div class="prayers-page-header">
      <router-link
        v-if="selectedCategory"
        class="category-parent-link"
        :to="categoryNavigation.parent ? categoryLocation(categoryNavigation.parent) : { name: 'Prayers' }"
        @click="clearPersonalCategory"
      >
        <PhArrowLeft :size="20" aria-hidden="true" />
        <span>{{ categoryNavigation.parent?.name || 'Усе малітвы' }}</span>
      </router-link>
      <div class="prayers-page-eyebrow">Малітоўнік</div>
      <h1 ref="categoryHeading" tabindex="-1" class="prayers-page-title">{{ selectedCategory?.name || 'Малітвы' }}</h1>
      <v-select v-if="authStore.isAdmin" v-model="accessFilter" label="Доступ" :items="accessFilters" class="mt-4" hide-details />
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
      <nav v-if="categoryNavigation.children.length" class="subcategory-list" aria-label="Падкатэгорыі">
        <router-link
          v-for="category in categoryNavigation.children"
          :id="`category-row-${category.id}`"
          :key="category.id"
          :to="categoryLocation(category)"
          class="subcategory-link"
          @click="rememberChild(category, $event)"
        >
          <CategoryIcon :icon-key="displayCategoryIconKey(category)" :size="24" />
          <span>{{ category.name }}</span>
          <PhCaretRight :size="20" aria-hidden="true" />
        </router-link>
      </nav>
      <v-list v-if="filteredPrayers.length" lines="one" bg-color="transparent" class="prayer-options-list">
        <v-list-item
          v-for="prayer in filteredPrayers"
          :key="prayer.id"
          :id="`prayer-row-${prayer.id}`"
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
            <span>{{ getTitle(prayer) }}</span>
            <v-icon v-if="authStore.isAdmin && accessPolicy.prayerRestricted(prayer)" icon="mdi-key" size="small" aria-label="Толькі для святароў" />
            <v-chip
              v-if="authStore.isAdmin && prayer.verified === true"
              color="success"
              variant="tonal"
              size="x-small"
              prepend-icon="mdi-check-decagram"
              class="prayer-verified-chip"
            >
              Праверана
            </v-chip>
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

      <div v-if="!isLoading && filteredPrayers.length === 0 && !categoryNavigation.children.length" class="text-center text-grey-darken-1 mt-16">
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useNotifier } from '@/composables/useNotifier';
import { usePrayersFilters } from '@/composables/usePrayersFilters';
import { matchesPrayerTags } from '@/utils/prayerTagFilter';
import { prayerCategoryMatch } from '@/utils/prayerCategoryMembership.mjs';
import { PhMagnifyingGlass, PhSlidersHorizontal, PhX, PhArrowLeft, PhCaretRight } from '@phosphor-icons/vue';
import CategoryIcon from './CategoryIcon.vue';
import { displayCategoryIconKey } from '@/constants/prayerCategoryIcons.js';
import { buildPrayerCategoryMenu } from '@/utils/prayerCategoryMenu.js';
import { buildCategoryTree, categoryPageNavigation } from '@/utils/prayerCategoryTree.mjs';
import { prayerCatalogRevision } from '@/services/prayerCatalogAccess';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories';
import { usePrayerCatalog } from '@/composables/usePrayerCatalog';
import { prayerAccessPolicy } from '../../utils/priestPolicy.mjs';
import { hasV2ContentFields, isProtectedPrayerRow } from '@/utils/accessSetsV2Policy.mjs';

const router = useRouter();
const route = useRoute();
const { prayers, isLoading, getTitle, getText, error, deletePrayer } = usePrayers();
const authStore = useAuthStore();
const categoriesStore = usePrayerCategoriesStore();
usePrayerCatalog();
const accessPolicy = computed(() => prayerAccessPolicy(prayers.value, categoriesStore.categories));
const accessFilter = ref('all');
const accessFilters = [{ title: 'Усе', value: 'all' }, { title: 'Агульнадаступныя', value: 'public' }, { title: 'Толькі для святароў', value: 'priest' }];
const settings = useSettingsStore();
const { notifySuccess, notifyError } = useNotifier();
const { searchQuery, debouncedSearchQuery, selectedTags, selectedCategory, lastOpenedPrayerId, categoryReturnFocus, setSelectedCategory, toggleFilter } = usePrayersFilters();
const categoryHeading = ref(null);
const categoryTree = computed(() => buildCategoryTree(buildPrayerCategoryMenu(
  categoriesStore.categories, [], settings.hiddenGlobalPrayerCategoryIds, prayers.value, true,
)));
const categoryNavigation = computed(() => selectedCategory.value?.scope === 'global'
  ? categoryPageNavigation(categoryTree.value, selectedCategory.value.id) : { parent: null, children: [] });
const categoryLocation = (category) => ({ name: 'Prayers', query: { category: category.id } });
function rememberChild(category, event) {
  if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey || event?.button > 0) return;
  categoryReturnFocus.value = { ...categoryReturnFocus.value, [selectedCategory.value.id]: category.id };
}
function clearPersonalCategory(event) {
  if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey || event?.button > 0) return;
  if (selectedCategory.value?.scope !== 'global') setSelectedCategory(null);
}
// The existing /prayers route accepts an optional stable ID; old URLs still work.
watch(() => [route.query.category, categoriesStore.categories], ([id]) => {
  if (id) {
    const category = categoriesStore.categories.find((c) => c.id === id);
    const next = category ? { ...category, key: `global-${category.id}`, scope: 'global' } : { id, name: 'Катэгорыя недаступная', tags: [], prayerIds: [], scope: 'global' };
    if (selectedCategory.value?.scope === 'global' && selectedCategory.value.id === id) selectedCategory.value = next;
    else setSelectedCategory(next);
  } else if (selectedCategory.value?.scope === 'global') setSelectedCategory(null);
}, { immediate: true });

const previousTitle = document.title;
watch(() => selectedCategory.value, (category) => {
  document.title = `${(!isProtectedPrayerRow(category) && category?.name) || 'Малітвы'} · Малітоўнік`;
}, { immediate: true });
onBeforeUnmount(() => { document.title = previousTitle; });
let focusedPage = null;
let restoringPrayerFocus = Boolean(lastOpenedPrayerId.value);
watch([() => route.fullPath, isLoading, () => categoriesStore.isLoading], async () => {
  if (isLoading.value || categoriesStore.isLoading || focusedPage === route.fullPath) return;
  focusedPage = route.fullPath;
  await nextTick();
  if (restoringPrayerFocus || lastOpenedPrayerId.value) { restoringPrayerFocus = false; return; }
  const childId = categoryReturnFocus.value[selectedCategory.value?.id];
  const target = childId && document.getElementById(`category-row-${childId}`);
  (target || categoryHeading.value)?.focus({ preventScroll: true });
}, { immediate: true, flush: 'post' });

const deleteDialogOpen = ref(false);
const prayerToDelete = ref(null);
watch(prayerCatalogRevision, () => {
  if (isProtectedPrayerRow(prayerToDelete.value)) {
    prayerToDelete.value = null;
    deleteDialogOpen.value = false;
  }
}, { flush: 'sync' });
const isDeleting = ref(false);

const filteredPrayers = computed(() => {
  if (isLoading.value) return [];
  
  const prayersArray = prayers.value;
  if (!prayersArray || !Array.isArray(prayersArray)) {
    return [];
  }
  
  let filtered = [...prayersArray];
  if (authStore.isAdmin && accessFilter.value !== 'all') filtered = filtered.filter((p) => accessPolicy.value.prayerRestricted(p) === (accessFilter.value === 'priest'));
  
  const category = selectedCategory.value?.scope === 'global'
    ? categoriesStore.categories.find((c) => c.id === selectedCategory.value.id) : selectedCategory.value;
  if (selectedCategory.value) filtered = category ? filtered.filter((p) => prayerCategoryMatch(p, category).matches) : [];
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
  lastOpenedPrayerId.value = id;
  router.push({ name: 'PrayerView', params: { id } });
}

// Browser history restores scroll; restore keyboard focus without scrolling.
let restoredPrayerFocusId = null;
watch(filteredPrayers, async (items) => {
  const id = lastOpenedPrayerId.value;
  if (!id || restoredPrayerFocusId === id || !items.some((p) => p.id === id)) return;
  await nextTick();
  if (lastOpenedPrayerId.value !== id) return;
  document.getElementById(`prayer-row-${id}`)?.focus({ preventScroll: true });
  restoredPrayerFocusId = id;
}, { immediate: true });

function isFavorite(prayerId) {
  const prayer = prayers.value.find((row) => row.id === prayerId);
  return settings.isFavoritePrayer(prayerId, Boolean(prayer && hasV2ContentFields(prayer)));
}

function toggleFavorite(prayerId) {
  const prayer = prayers.value.find((row) => row.id === prayerId);
  if (prayer) settings.toggleFavoritePrayer(prayerId, hasV2ContentFields(prayer));
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
<style scoped>
.category-parent-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-bottom: 12px; color: var(--chrome-accent); text-decoration: none; overflow-wrap: anywhere; }
.category-parent-link svg { flex: none; }
.subcategory-list { display: grid; gap: 8px; margin: 0 0 20px; }
.subcategory-link { display: flex; align-items: center; gap: 14px; min-height: 60px; padding: 12px 16px; border: 1px solid var(--nav-border); border-radius: 16px; background: var(--nav-surface); color: var(--nav-on-surface); text-decoration: none; }
.subcategory-link > span:not(.category-icon-glyph) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.subcategory-link > svg { flex: none; color: var(--nav-muted); }
.subcategory-link:hover { background: var(--nav-active); }
.subcategory-link:focus-visible, .category-parent-link:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; }
.prayers-page-title:focus { outline: none; }
</style>
