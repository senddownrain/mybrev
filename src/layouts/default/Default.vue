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
      >
        {{ layoutTitle }}
      </v-app-bar-title>

      <!-- Заголовок при редактировании молитвы -->
      <v-app-bar-title v-if="(isPrayerViewPage && uiStore.prayerIsEditing) || isPrayerEditPage" class="prayer-edit-title">
        {{ layoutTitle }}
      </v-app-bar-title>

      <!-- Кнопки поиска и фильтра для страницы списка молитв -->
      <template v-if="isPrayersListPage && !isSearchExpanded && !isFilterExpanded && !(isPrayerViewPage && uiStore.prayerIsEditing) && !isPrayerEditPage">
        <v-btn
          icon
          class="top-circle-btn top-action-start"
          :class="{ 'top-circle-btn--active': searchQuery }"
          :color="searchQuery ? 'primary' : 'default'"
          variant="flat"
          @click="toggleSearch"
          aria-label="Пошук"
        >
          <v-icon>mdi-magnify</v-icon>
        </v-btn>

        <v-btn
          icon
          class="top-circle-btn"
          :class="{ 'top-circle-btn--active': selectedTags.length > 0 }"
          :color="selectedTags.length > 0 ? 'primary' : 'default'"
          variant="flat"
          @click="toggleFilter"
          aria-label="Фільтр"
        >
          <v-icon>mdi-filter</v-icon>
        </v-btn>
      </template>

      <!-- Кнопки закрытия для поиска и фильтра -->
      <v-btn
        v-if="isPrayersListPage && (isSearchExpanded || isFilterExpanded) && !(isPrayerViewPage && uiStore.prayerIsEditing) && !isPrayerEditPage"
        icon
        class="top-circle-btn top-action-start"
        variant="flat"
        @click="closeSearchAndFilter"
        aria-label="Закрыць"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>

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
          icon
          class="top-circle-btn top-action-start"
          variant="flat"
          @click="toggleSettingsSheet"
          aria-label="Налады тэксту"
        >
          <v-icon>mdi-format-font</v-icon>
        </v-btn>

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

    <!-- Bottom sheet для фильтра -->
    <v-bottom-sheet v-model="isFilterExpanded" :scrim="false">
      <v-card rounded="t-lg">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6">Фільтр па тэгах</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeFilter"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="pa-4">
          <v-combobox
            v-model="selectedTags"
            :items="allTags"
            label="Выберыце тэгі"
            multiple
            chips
            clearable
            variant="outlined"
            hide-details
            class="mb-4"
          ></v-combobox>
          <div class="d-flex justify-end ga-2">
            <v-btn variant="text" @click="clearFilter">Ачысціць</v-btn>
            <v-btn color="primary" variant="flat" @click="applyFilter">Ужыць</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-bottom-sheet>

    <!-- Bottom sheet для поиска -->
    <v-bottom-sheet v-model="isSearchExpanded" :scrim="false">
      <v-card rounded="t-lg">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6">Пошук малітваў</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeSearch"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="searchQuery"
            label="Увядзіце тэкст для пошуку"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            hide-details
            density="comfortable"
            autofocus
            clearable
            @click:clear="searchQuery = ''"
            @keydown.enter="closeSearch"
          ></v-text-field>
          <div class="d-flex justify-end ga-2 mt-4">
            <v-btn variant="text" @click="clearSearch">Ачысціць</v-btn>
            <v-btn color="primary" variant="flat" @click="closeSearch">Шукаць</v-btn>
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
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import { usePrayers } from '@/composables/usePrayers.js';
import { useAuthStore } from '@/stores/auth.js';

const { isDrawerOpen, toggleSettingsSheet } = useAppBar();
const uiStore = useUiStore();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const { searchQuery, selectedTags, selectedCategory, isSearchExpanded, isFilterExpanded, toggleSearch, toggleFilter } = usePrayersFilters();
const { allTags } = usePrayers();

const isPrayersListPage = computed(() => {
  return route.name === 'Prayers' || route.name === 'PrayersList';
});

const isPrayerViewPage = computed(() => {
  return route.name === 'PrayerView' || route.name === 'PrayerEdit';
});

const isPrayerEditPage = computed(() => {
  return route.name === 'PrayerEdit' || route.name === 'PrayerAdd';
});

const layoutTitle = computed(() => {
  if (isPrayerViewPage.value && uiStore.prayerIsEditing) return 'Рэдагаванне малітвы';

  switch (route.name) {
    case 'Today':
    case 'SelectedDay':
      return 'Літургія';
    case 'LiturgicalPicker':
      return 'Выбраць перыяд';
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

const closeSearchAndFilter = () => {
  isSearchExpanded.value = false;
  isFilterExpanded.value = false;
};

const closeFilter = () => {
  isFilterExpanded.value = false;
};

const clearFilter = () => {
  selectedTags.value = [];
  isFilterExpanded.value = false;
};

const applyFilter = () => {
  isFilterExpanded.value = false;
};

const closeSearch = () => {
  isSearchExpanded.value = false;
};

const clearSearch = () => {
  searchQuery.value = '';
  isSearchExpanded.value = false;
};
</script>

<style scoped>
.floating-app-bar {
  background: transparent !important;
  box-shadow: none !important;
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
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 50% !important;
  background: #1f1f1f !important;
  color: rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2) !important;
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease !important;
}

.top-circle-btn:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25) !important;
}

.top-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.top-circle-btn--confirm {
  background: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.top-circle-btn--active {
  background: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
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
