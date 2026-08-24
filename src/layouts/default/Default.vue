<template>
  <v-app
    :style="{
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier
    }"
  >
    <v-app-bar
      v-if="!hideLayoutAppBar"
      flat
      color="transparent"
      class="floating-app-bar"
      :class="{ 'floating-app-bar--behind-drawer': isDrawerOpen }"
    >
      <!-- Кнопка назад для страницы редактирования молитвы (PrayerEdit) -->
      <v-app-bar-nav-icon
        v-if="isPrayerEditPage"
        class="top-circle-btn"
        @click="goBack"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Кнопка назад для страницы просмотра молитвы в режиме редактирования -->
      <v-app-bar-nav-icon
        v-else-if="isPrayerViewPage && uiStore.prayerIsEditing"
        class="top-circle-btn"
        @click="cancelEdit"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Кнопка назад для страницы просмотра молитвы (не в режиме редактирования) -->
      <v-app-bar-nav-icon
        v-else-if="isPrayerViewPage"
        class="top-circle-btn"
        @click="goBack"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Меню для остальных страниц -->
      <v-app-bar-nav-icon
        v-else
        class="top-circle-btn"
        @click.stop="isDrawerOpen = !isDrawerOpen"
        aria-label="Адкрыць меню"
      >
        <v-icon>mdi-menu</v-icon>
      </v-app-bar-nav-icon>

      <v-app-bar-title
        v-if="!isPrayerEditPage && !(isPrayerViewPage && uiStore.prayerIsEditing)"
        class="app-title-clickable"
        :class="{ 'app-title-clickable--visible': isAppBarTitleVisible }"
      >
        {{ layoutTitle }}
      </v-app-bar-title>

      <!-- Заголовок при редактировании молитвы -->
      <v-app-bar-title v-if="(isPrayerViewPage && uiStore.prayerIsEditing) || isPrayerEditPage" class="prayer-edit-title">
        {{ layoutTitle }}
      </v-app-bar-title>

      <TextScaleControl
        v-if="showTextScaleControl"
        class="top-action-start"
      />

      <!-- Кнопки для страницы редактирования молитвы (PrayerEdit) -->
      <template v-if="isPrayerEditPage">
        <v-btn
          icon
          class="top-circle-btn top-circle-btn--confirm top-action-start"
          variant="flat"
          @click="savePrayerForm"
          :loading="uiStore.prayerFormSaving"
          aria-label="Захаваць"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
      </template>

      <!-- Кнопки для страницы просмотра молитвы в режиме редактирования -->
      <template v-else-if="isPrayerViewPage && uiStore.prayerIsEditing">
        <v-btn
          icon
          class="top-circle-btn top-circle-btn--confirm top-action-start"
          variant="flat"
          @click="uiStore.triggerPrayerSave()"
          :loading="uiStore.prayerSaving"
          aria-label="Захаваць"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
      </template>

      <!-- Кнопки для страницы просмотра молитвы (не в режиме редактирования) -->
      <template v-else-if="isPrayerViewPage">
        <v-btn
          v-if="authStore.isAdmin"
          icon
          class="top-circle-btn"
          variant="flat"
          @click="uiStore.triggerPrayerToggleEdit()"
          aria-label="Рэдагаваць"
        >
          <v-icon>mdi-pencil-outline</v-icon>
        </v-btn>
      </template>

    </v-app-bar>

    <NavigationDrawer />

    <v-main style="padding-bottom: 92px;">
      <router-view name="topNav" />
      <router-view />
    </v-main>

    <router-view name="bottomNav" />

    <TextSettingsSheet />

    <!-- Compact tag filter used by the prayer search dock -->
    <v-bottom-sheet v-model="isFilterExpanded" :scrim="false">
      <v-card rounded="t-xl" class="prayer-filter-sheet">
        <v-card-title class="filter-sheet-header">
          <div>
            <div class="filter-sheet-eyebrow">Малітвы</div>
            <div class="filter-sheet-title">Фільтр па тэгах</div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Закрыць фільтр" @click="closeFilter"></v-btn>
        </v-card-title>
        <v-card-text class="filter-sheet-content">
          <p class="filter-sheet-hint">Можна выбраць некалькі тэгаў</p>
          <v-chip-group v-model="selectedTags" multiple column class="filter-chip-group">
            <v-chip
              v-for="tag in filterTags"
              :key="tag"
              :value="tag"
              filter
              variant="flat"
              class="filter-chip"
            >
              {{ tag }}
            </v-chip>
          </v-chip-group>
          <div class="filter-sheet-actions">
            <v-btn variant="text" rounded="pill" :disabled="selectedTags.length === 0" @click="clearFilter">Ачысціць</v-btn>
            <v-btn color="primary" variant="flat" rounded="pill" min-width="112" @click="applyFilter">Гатова</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <NotificationSnackbar />
  </v-app>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar.js';
import { useUiStore } from '@/stores/ui.js';
import NavigationDrawer from './NavigationDrawer.vue';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import TextScaleControl from '@/components/TextScaleControl.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import { usePrayers } from '@/composables/usePrayers.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCollapsingAppBar } from '@/composables/useCollapsingAppBar.js';

const { isDrawerOpen } = useAppBar();
const uiStore = useUiStore();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const { selectedTags, selectedCategory, isFilterExpanded } = usePrayersFilters();
const { allTags } = usePrayers();
const { isAppBarTitleVisible } = useCollapsingAppBar();
const filterTags = computed(() => (
  [...new Set(allTags.value || [])].sort((a, b) => a.localeCompare(b, 'be', { sensitivity: 'base' }))
));

const isPrayerViewPage = computed(() => {
  return route.name === 'PrayerView' || route.name === 'PrayerEdit';
});

const isPrayerEditPage = computed(() => {
  return route.name === 'PrayerEdit' || route.name === 'PrayerAdd';
});

const showTextScaleControl = computed(() => {
  if (isPrayerViewPage.value) return !uiStore.prayerIsEditing;
  return [
    'Readings',
    'ReadingsByDate',
    'invitatorium',
    'morning',
    'laudes',
    'lectionis',
    'terz',
    'sext',
    'non',
    'vesper',
    'completorium',
  ].includes(route.name);
});

const layoutTitle = computed(() => {
  if (isPrayerViewPage.value && uiStore.prayerIsEditing) return 'Рэдагаванне малітвы';

  switch (route.name) {
    case 'Today':
    case 'SelectedDay':
      return 'Літургія';
    case 'LiturgicalPicker':
      return route.query.mode === 'readings' ? 'Знайсці чытанні' : 'Знайсці дзень';
    case 'Prayers':
    case 'PrayersList':
      return selectedCategory.value?.name || 'Малітвы';
    case 'FavoritePrayers':
      return 'Абраныя';
    case 'PrayerView':
      return 'Малітва';
    case 'PrayerAdd':
      return 'Новая малітва';
    case 'PrayerEdit':
      return 'Рэдагаванне малітвы';
    case 'Readings':
    case 'ReadingsByDate':
      return 'Чытанні';
    case 'ReadingsPicker':
      return 'Каляндар чытанняў';
    case 'Settings':
      return 'Налады';
    case 'Login':
      return 'Уваход';
    default:
      return 'Малітоўнік';
  }
});

const hideLayoutAppBar = computed(() => route.matched.some((record) => record.meta?.hideLayoutAppBar));


const cancelEdit = () => {
  if (uiStore.prayerIsEditing) {
    uiStore.triggerPrayerCancelEdit();
  } else {
    goBack();
  }
};

// prayerFormSaving is read directly from the Pinia store (written by PrayerForm on mount)
const savePrayerForm = () => {
  uiStore.triggerPrayerFormSave();
};

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    router.push({ name: 'Prayers' });
  }
};

const closeFilter = () => {
  isFilterExpanded.value = false;
};

const clearFilter = () => {
  selectedTags.value = [];
};

const applyFilter = () => {
  isFilterExpanded.value = false;
};

</script>

<style scoped>
.floating-app-bar {
  background: transparent !important;
  box-shadow: none !important;
  transition: opacity 0.16s ease;
}

.floating-app-bar--behind-drawer {
  z-index: 1 !important;
  opacity: 0;
  pointer-events: none;
}

.floating-app-bar :deep(.v-toolbar__content) {
  gap: 8px;
  padding: 10px 16px;
}

.floating-app-bar :deep(.v-toolbar__prepend) {
  margin-inline-start: 0;
}

.floating-app-bar :deep(.v-toolbar__append) {
  gap: 8px;
  margin-inline-end: 0;
}

.top-circle-btn {
  width: 48px !important;
  height: 48px !important;
  min-width: 48px !important;
  flex: 0 0 48px !important;
  border: 1px solid var(--nav-border) !important;
  border-radius: 50% !important;
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 9px var(--nav-button-shadow) !important;
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease !important;
}

.top-circle-btn:hover {
  box-shadow: 0 3px 12px var(--nav-button-shadow) !important;
}

.top-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.top-circle-btn--confirm {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
}

.top-circle-btn--active {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
}

.top-action-start {
  margin-left: auto !important;
}

.app-title-clickable {
  position: absolute;
  left: 50%;
  width: auto;
  max-width: calc(100% - 152px);
  margin-inline-start: 0 !important;
  cursor: default;
  font-size: 1.15rem;
  font-weight: 650;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.app-title-clickable--visible {
  opacity: 1;
  transform: translate(-50%, 0);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.prayer-edit-title {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
  max-width: 100% !important;
  flex: 1 1 auto !important;
}

@media (max-width: 600px) {
  .floating-app-bar :deep(.v-toolbar__content) {
    padding: 8px 12px;
  }

  .v-app-bar-title {
    font-size: 1.1rem !important;
    padding: 0 4px !important;
  }

  .prayer-edit-title {
    font-size: 0.95rem !important;
    line-height: 1.3 !important;
  }

  .v-app-bar-nav-icon {
    margin-left: 0 !important;
  }
}

.prayer-filter-sheet {
  border: 1px solid var(--nav-border);
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface);
  box-shadow: 0 -12px 40px var(--nav-shadow) !important;
}

.filter-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 8px !important;
}

.filter-sheet-eyebrow {
  color: var(--nav-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-sheet-title {
  margin-top: 2px;
  font-size: 1.25rem;
  font-weight: 700;
}

.filter-sheet-content {
  padding: 8px 20px 18px !important;
}

.filter-sheet-hint {
  margin: 0 0 10px;
  color: var(--nav-muted);
  font-size: 0.82rem;
}

.filter-chip-group {
  max-height: min(42vh, 320px);
  overflow-y: auto;
}

.filter-chip {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
}

.filter-chip:not(.v-chip--selected) {
  background: transparent !important;
  box-shadow: inset 0 0 0 1px var(--nav-border);
}

.filter-sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

@media (max-width: 359px) {
  .floating-app-bar :deep(.v-toolbar__content) {
    gap: 6px;
    padding-inline: 10px;
  }

  .top-circle-btn {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    flex-basis: 44px !important;
  }

  .app-title-clickable {
    max-width: calc(100% - 148px);
    font-size: 1rem;
  }
}
</style>
