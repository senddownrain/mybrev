<template>
  <v-navigation-drawer
    v-model="isDrawerOpen"
    temporary
    :width="320"
    class="app-drawer"
    scrim="black"
  >
    <div class="drawer-shell">
      <header class="drawer-header">
        <div class="drawer-brand">
          <div class="drawer-logo-wrap">
            <img src="/favicon.svg" alt="" class="drawer-logo" />
          </div>
          <div>
            <div class="drawer-title">Малітоўнік</div>
            <div class="drawer-subtitle">Літургія і малітвы</div>
          </div>
        </div>

        <button class="drawer-close-btn" type="button" aria-label="Закрыць меню" @click="isDrawerOpen = false">
          <PhX :size="20" />
        </button>
      </header>

      <div v-if="auth.loading" class="drawer-loading">
        <v-progress-circular indeterminate color="primary" size="24"></v-progress-circular>
      </div>

      <v-list nav class="drawer-list">
      <div class="drawer-section-label">Асноўнае</div>
      <v-list-item
        title="Літургія"
        :to="{ name: 'Today' }"
        :active="route.name === 'Today' || route.name === 'SelectedDay'"
      >
        <template #prepend>
          <PhCross :size="22" weight="light" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Малітвы"
        :to="{ name: 'Prayers' }"
        :active="route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView'"
      >
        <template #prepend>
          <PhBookBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <div class="drawer-section-label drawer-section-label--spaced">Малітоўныя зборнікі</div>

      <v-list-item
        title="Абраныя малітвы"
        :to="{ name: 'FavoritePrayers' }"
        :active="route.name === 'FavoritePrayers'"
      >
        <template #prepend>
          <PhHeart :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Марыйныя"
        @click="selectCategoryByName('Марыйныя')"
        :active="selectedCategory?.name === 'Марыйныя'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Літаніі"
        @click="selectCategoryByName('Літаніі')"
        :active="selectedCategory?.name === 'Літаніі'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        title="Навэнны"
        @click="selectCategoryByName('Навэнны')"
        :active="selectedCategory?.name === 'Навэнны'"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <div class="drawer-section-label drawer-section-label--spaced">Праграма</div>

      <v-list-item
        title="Налады"
        :to="{ name: 'Settings' }"
        :active="route.name === 'Settings'"
      >
        <template #prepend>
          <PhGear :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item v-if="!auth.user" title="Уваход" to="/login">
        <template #prepend>
          <PhSignIn :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <template v-if="auth.user">
        <v-list-item v-if="auth.isAdmin" title="Панэль адміністратара" to="/admin">
          <template #prepend>
            <PhShieldCheck :size="22" class="drawer-icon" />
          </template>
        </v-list-item>
        <v-list-item title="Выйсці" @click="auth.logout">
          <template #prepend>
            <PhSignOut :size="22" class="drawer-icon" />
          </template>
        </v-list-item>
      </template>
      </v-list>
    </div>
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { useAppBar } from '@/composables/useAppBar.js';
import { useAuthStore } from '@/stores/auth.js';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import {
  PhCross, PhBookBookmark, PhHeart, PhBookmark,
  PhGear, PhSignIn, PhSignOut, PhShieldCheck, PhX,
} from '@phosphor-icons/vue';

const { isDrawerOpen } = useAppBar();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const { selectedCategory, setSelectedCategory } = usePrayersFilters();

const isPrayersPage = computed(() =>
  route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView',
);

const selectCategory = (category) => {
  setSelectedCategory(category);
  isDrawerOpen.value = false;
};

const selectCategoryByName = (categoryName) => {
  const category = settings.menuCategories.find(cat => cat.name === categoryName);
  if (category) {
    selectCategory(category);
    router.push({ name: 'Prayers' });
  }
};
</script>

<style scoped>
.app-drawer {
  top: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  height: 100% !important;
  max-width: min(320px, 88vw) !important;
  border: 0 !important;
  border-right: 1px solid var(--nav-border) !important;
  border-radius: 0 !important;
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 10px 0 32px var(--nav-shadow) !important;
  overflow: hidden;
}

.drawer-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 14px 6px;
}

.drawer-brand {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.drawer-logo-wrap {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 14px;
  background: var(--nav-active);
}

.drawer-logo {
  display: block;
  width: 34px;
  height: 34px;
}

.drawer-title {
  font-size: 1rem;
  font-weight: 750;
  line-height: 1.25;
}

.drawer-subtitle {
  margin-top: 2px;
  color: var(--nav-muted);
  font-size: 0.75rem;
  line-height: 1.25;
}

.drawer-close-btn {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--nav-on-surface);
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.drawer-close-btn:active {
  opacity: 0.7;
  transform: scale(0.94);
}

.drawer-loading {
  display: flex;
  justify-content: center;
  padding: 4px 0 10px;
}

.drawer-list {
  flex: 1;
  min-height: 0;
  padding: 0 !important;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.drawer-list :deep(.v-list-item) {
  min-height: 50px;
  margin-bottom: 4px;
  padding-inline: 14px !important;
  border-radius: 17px !important;
  color: var(--nav-on-surface);
  transition: background 0.16s ease, color 0.16s ease;
}

.drawer-list :deep(.v-list-item__prepend) {
  width: 38px;
}

.drawer-list :deep(.v-list-item-title) {
  font-size: 0.94rem;
  font-weight: 560;
}

.drawer-list :deep(.v-list-item--active) {
  background: var(--nav-active) !important;
  color: var(--nav-on-surface) !important;
}

.drawer-list :deep(.v-list-item--active .v-list-item__overlay) {
  opacity: 0 !important;
}

.drawer-list :deep(.v-list-item--active .drawer-icon) {
  color: var(--nav-on-surface);
}

.drawer-section-label {
  padding: 8px 14px 7px;
  color: var(--nav-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.drawer-section-label--spaced {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--nav-border);
}

.drawer-icon {
  flex-shrink: 0;
  color: var(--nav-muted);
}

@media (max-width: 359px) {
  .drawer-shell {
    padding: 10px;
  }

  .drawer-subtitle {
    display: none;
  }
}
</style>
