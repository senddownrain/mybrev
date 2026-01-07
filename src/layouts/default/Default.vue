<template>
  <v-app 
    :style="{ 
      '--app-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier 
    }"
  >
    <v-app-bar flat class="app-bar-border">
      <!-- Кнопка назад для страницы редактирования молитвы (PrayerEdit) -->
      <v-app-bar-nav-icon 
        v-if="isPrayerEditPage"
        @click="goBack"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Кнопка назад для страницы просмотра молитвы в режиме редактирования -->
      <v-app-bar-nav-icon 
        v-else-if="isPrayerViewPage && prayerIsEditing"
        @click="cancelEdit"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Кнопка назад для страницы просмотра молитвы (не в режиме редактирования) -->
      <v-app-bar-nav-icon 
        v-else-if="isPrayerViewPage"
        @click="goBack"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-app-bar-nav-icon>
      <!-- Меню для остальных страниц -->
      <v-app-bar-nav-icon 
        v-else
        @click.stop="isDrawerOpen = !isDrawerOpen"
      ></v-app-bar-nav-icon>

      <v-app-bar-title
        v-if="!isPrayerEditPage && !(isPrayerViewPage && prayerIsEditing)"
        @click="goHome()"
        class="app-title-clickable"
      >
        Малітоўнік
      </v-app-bar-title>
      
      <!-- Заголовок при редактировании молитвы -->
      <v-app-bar-title v-if="(isPrayerViewPage && prayerIsEditing) || isPrayerEditPage" class="prayer-edit-title">
        Рэдагаванне малітвы
      </v-app-bar-title>

      <!-- Поиск теперь в виде bottom sheet -->
      <!-- Фильтр теперь в виде bottom sheet -->

      <!-- Кнопки поиска и фильтра для страницы списка молитв (только не в режиме редактирования молитвы) -->
      <template v-if="isPrayersListPage && !isSearchExpanded && !isFilterExpanded && !(isPrayerViewPage && prayerIsEditing) && !isPrayerEditPage">
        <v-btn
          icon
          :color="searchQuery ? 'primary' : 'default'"
          variant="text"
          @click="toggleSearch"
          aria-label="Пошук"
        >
          <v-icon>mdi-magnify</v-icon>
        </v-btn>

        <v-btn
          icon
          :color="selectedTags.length > 0 ? 'primary' : 'default'"
          variant="text"
          @click="toggleFilter"
          aria-label="Фільтр"
        >
          <v-icon>mdi-filter</v-icon>
        </v-btn>
      </template>

      <!-- Кнопки закрытия для поиска и фильтра -->
      <v-btn
        v-if="isPrayersListPage && (isSearchExpanded || isFilterExpanded) && !(isPrayerViewPage && prayerIsEditing) && !isPrayerEditPage"
        icon
        variant="text"
        @click="closeSearchAndFilter"
        aria-label="Закрыць"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>

      <!-- Кнопки для страницы редактирования молитвы (PrayerEdit) -->
      <template v-if="isPrayerEditPage">
        <v-btn 
          icon 
          variant="text"
          @click="savePrayerForm"
          :loading="prayerFormSaving"
          aria-label="Захаваць"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
      </template>
      
      <!-- Кнопки для страницы просмотра молитвы в режиме редактирования -->
      <template v-else-if="isPrayerViewPage && prayerIsEditing">
        <v-btn 
          icon 
          variant="text"
          @click="savePrayer"
          :loading="prayerSaving"
          aria-label="Захаваць"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
      </template>
      
      <!-- Кнопки для страницы просмотра молитвы (не в режиме редактирования) -->
      <template v-else-if="isPrayerViewPage">
        <v-btn 
          icon 
          variant="text"
          @click="toggleSettingsSheet"
          aria-label="Налады тэксту"
        >
          <v-icon>mdi-format-font</v-icon>
        </v-btn>
        
        <v-btn 
          v-if="authStore.isAdmin"
          icon 
          variant="text"
          @click="togglePrayerEdit"
          aria-label="Рэдагаваць"
        >
          <v-icon>mdi-pencil-outline</v-icon>
        </v-btn>
      </template>

    </v-app-bar>
    
    <NavigationDrawer />

    <v-main>
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
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar.js';
import NavigationDrawer from './NavigationDrawer.vue';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';
import { useRouter } from 'vue-router';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import { usePrayers } from '@/composables/usePrayers.js';
import { useAuthStore } from '@/stores/auth.js';

const { isDrawerOpen, toggleSettingsSheet } = useAppBar();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const { searchQuery, selectedTags, isSearchExpanded, isFilterExpanded, toggleSearch, toggleFilter } = usePrayersFilters();
const { allTags } = usePrayers();

const isPrayersPage = computed(() => {
  return route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView' || route.name === 'PrayerEdit';
});

const isPrayersListPage = computed(() => {
  return route.name === 'Prayers' || route.name === 'PrayersList';
});

const isPrayerViewPage = computed(() => {
  return route.name === 'PrayerView' || route.name === 'PrayerEdit';
});

const isPrayerEditPage = computed(() => {
  return route.name === 'PrayerEdit';
});

// Состояние редактирования молитвы (синхронизируется с PrayerView через события)
const prayerIsEditing = ref(false);
const prayerSaving = ref(false);
const prayerFormSaving = ref(false);

function handlePrayerStateUpdate(e) {
  prayerIsEditing.value = e.detail.isEditing;
  prayerSaving.value = e.detail.saving;
}

function handlePrayerFormStateUpdate(e) {
  prayerFormSaving.value = e.detail.saving;
}

onMounted(() => {
  window.addEventListener('prayer-state-update', handlePrayerStateUpdate);
  window.addEventListener('prayer-form-state-update', handlePrayerFormStateUpdate);
});

onUnmounted(() => {
  window.removeEventListener('prayer-state-update', handlePrayerStateUpdate);
  window.removeEventListener('prayer-form-state-update', handlePrayerFormStateUpdate);
});

const togglePrayerEdit = () => {
  window.dispatchEvent(new CustomEvent('prayer-toggle-edit'));
};

const cancelEdit = () => {
  if (prayerIsEditing.value) {
    // Отменяем редактирование
    window.dispatchEvent(new CustomEvent('prayer-cancel-edit'));
  } else {
    goBack();
  }
};

const savePrayer = () => {
  if (prayerIsEditing.value) {
    // Сохраняем изменения
    window.dispatchEvent(new CustomEvent('prayer-save'));
  }
};

const savePrayerForm = () => {
  // Сохраняем изменения в PrayerForm
  window.dispatchEvent(new CustomEvent('prayer-form-save'));
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

const handleSearchBlur = () => {
  if (!searchQuery.value) {
    isSearchExpanded.value = false;
  }
};


const goHome = function(){
  //router.push('/')
}

const closeFilter = () => {
  isFilterExpanded.value = false;
}

const clearFilter = () => {
  selectedTags.value = [];
  isFilterExpanded.value = false;
}

const applyFilter = () => {
  isFilterExpanded.value = false;
}

const closeSearch = () => {
  isSearchExpanded.value = false;
}

const clearSearch = () => {
  searchQuery.value = '';
  isSearchExpanded.value = false;
}
</script>

<style scoped>
.app-bar-border {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.app-title-clickable {
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.app-title-clickable:active {
  opacity: 0.7;
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
  .v-app-bar-title {
    font-size: 1.1rem !important;
    padding: 0 8px !important;
  }
  
  .prayer-edit-title {
    font-size: 0.95rem !important;
    line-height: 1.3 !important;
  }

  .v-app-bar-nav-icon {
    margin-left: 4px !important;
  }
}
</style>