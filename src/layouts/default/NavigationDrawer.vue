<template>
  <v-navigation-drawer
    v-model="isDrawerOpen"
    temporary
    :width="320"
    class="app-drawer"
    scrim="black"
  >
    <div ref="drawerShell" class="drawer-shell">
      <header class="drawer-header">
        <div class="drawer-brand">
          <div class="drawer-logo-wrap">
            <img
              src="/app-brand-96.png"
              alt=""
              class="drawer-logo"
              width="34"
              height="34"
              loading="lazy"
              decoding="async"
            />
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
        tabindex="0"
        title="Літургія гадзінаў"
        :to="{ name: 'Today' }"
        :active="route.name === 'Today' || route.name === 'SelectedDay'"
      >
        <template #prepend>
          <PhCross :size="22" weight="light" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Чытанні дня"
        :to="{ name: 'Readings' }"
        :active="route.name === 'Readings' || route.name === 'ReadingsByDate' || route.name === 'ReadingsPicker' || (route.name === 'LiturgicalPicker' && route.query.mode === 'readings')"
      >
        <template #prepend>
          <PhBookOpenText :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Літургічны каляндар"
        :to="{ name: 'Ordo' }"
        :active="ORDO_ROUTE_NAMES.includes(route.name)"
      >
        <template #prepend>
          <PhCalendarDots :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Святая Імша"
        :to="{ name: 'PrayerView', params: { id: MASS_ORDER_PRAYER_ID } }"
        :active="route.name === 'PrayerView' && route.params.id === MASS_ORDER_PRAYER_ID"
      >
        <template #prepend>
          <PhChurch :size="22" weight="regular" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Біблія"
        :to="{ name: 'Bible' }"
        :active="route.name === 'Bible'"
      >
        <template #prepend>
          <PhBookOpen :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Кампендый"
        :to="{ name: 'Compendium' }"
        :active="COMPENDIUM_ROUTE_NAMES.has(route.name)"
      >
        <template #prepend>
          <PhScroll :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item tabindex="0" title="Спеўнік" subtitle="Пілігрымковы" :to="{ name: 'Songs' }" :active="route.name === 'Songs' || route.name === 'SongView'">
        <template #prepend><PhMusicNotes :size="22" class="drawer-icon" /></template>
      </v-list-item>

      <v-list-item
        tag="button"
        tabindex="0"
        title="Малітвы"
        :active="isPrayersPage && !selectedCategory"
        @click="showAllPrayers"
      >
        <template #prepend>
          <PhBookBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <div class="drawer-section-label drawer-section-label--spaced">Малітоўныя зборнікі</div>

      <v-list-item
        tabindex="0"
        title="Абраныя малітвы"
        :to="{ name: 'FavoritePrayers' }"
        :active="route.name === 'FavoritePrayers'"
      >
        <template #prepend>
          <PhHeart :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        v-for="category in menuCategories"
        :key="category.id || category.name"
        :title="category.name"
        tag="button"
        tabindex="0"
        @click="selectCategory(category)"
        :active="selectedCategory?.name === category.name"
      >
        <template #prepend>
          <PhBookmark :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <div class="drawer-section-label drawer-section-label--spaced">Праграма</div>

      <v-list-item
        tabindex="0"
        title="Налады"
        :to="{ name: 'Settings' }"
        :active="route.name === 'Settings'"
      >
        <template #prepend>
          <PhGear :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <v-list-item
        tabindex="0"
        title="Інфармацыя"
        :to="{ name: 'About' }"
        :active="route.name === 'About'"
      >
        <template #prepend>
          <PhInfo :size="22" class="drawer-icon" />
        </template>
      </v-list-item>


      <div class="drawer-section-label drawer-section-label--spaced">Мабільныя праграмы</div>
      <div class="drawer-store-badges" aria-label="Спасылкі на мабільныя праграмы з'явяцца пазней">
        <div class="drawer-store-badge" aria-disabled="true" title="Спасылка з'явіцца пазней">
          <svg class="drawer-store-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M5 3.8v24.4L18 16 5 3.8Z" fill="#37C7D6"/>
            <path d="m5 3.8 18 10-5 2.2L5 3.8Z" fill="#58CE7A"/>
            <path d="m5 28.2 18-10-5-2.2L5 28.2Z" fill="#F7C851"/>
            <path d="m18 16 5-2.2 4 2.2-4 2.2L18 16Z" fill="#F17F78"/>
          </svg>
          <span class="drawer-store-copy"><span class="drawer-store-kicker">Праграма для Android</span><strong>Google Play</strong></span>
          <span class="drawer-store-soon">Хутка</span>
        </div>
        <div class="drawer-store-badge" aria-disabled="true" title="Спасылка з'явіцца пазней">
          <svg class="drawer-store-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="8" y="2.5" width="16" height="27" rx="3.5" stroke="currentColor" stroke-width="2.3"/>
            <path d="M13 6h6M14 26h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          <span class="drawer-store-copy"><span class="drawer-store-kicker">Праграма для iPhone</span><strong>App Store</strong></span>
          <span class="drawer-store-soon">Хутка</span>
        </div>
      </div>

      <v-list-item v-if="!auth.user" tabindex="0" title="Уваход" to="/login">
        <template #prepend>
          <PhSignIn :size="22" class="drawer-icon" />
        </template>
      </v-list-item>

      <template v-if="auth.user">
        <v-list-item v-if="auth.isAdmin" tabindex="0" title="Панэль адміністратара" to="/admin">
          <template #prepend>
            <PhShieldCheck :size="22" class="drawer-icon" />
          </template>
        </v-list-item>
        <v-list-item tag="button" tabindex="0" title="Выйсці" @click="auth.logout">
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useAppBar } from '@/composables/useAppBar.js';
import { useAuthStore } from '@/stores/auth.js';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayerCategoriesStore } from '@/stores/prayerCategories.js';
import { buildPrayerCategoryMenu } from '@/utils/prayerCategoryMenu.js';
import { usePrayersStore } from '@/stores/prayers';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import {
  PhCross, PhBookOpenText, PhBookOpen, PhBookBookmark, PhHeart, PhBookmark,
  PhChurch, PhGear, PhInfo, PhSignIn, PhSignOut, PhShieldCheck, PhX, PhMusicNotes, PhScroll, PhCalendarDots,
} from '@phosphor-icons/vue';

const ORDO_ROUTE_NAMES = ['Ordo', 'OrdoByDate'];

const COMPENDIUM_ROUTE_NAMES = new Set(['Compendium', 'CompendiumPart', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion']);

const MASS_ORDER_PRAYER_ID = 'eMmCtxwyJ75ogmL5rwye';
const { isDrawerOpen } = useAppBar();
const drawerShell = ref(null);
let returnFocusTo = null;
let inertElements = [];
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const prayerCategories = usePrayerCategoriesStore();
const prayersStore = usePrayersStore();
prayersStore.init();
const { selectedCategory, setSelectedCategory } = usePrayersFilters();
prayerCategories.init();

const menuCategories = computed(() => {
  return buildPrayerCategoryMenu(
    prayerCategories.categories,
    settings.personalPrayerCategories,
    settings.hiddenGlobalPrayerCategoryIds,
    auth.isAdmin ? null : prayersStore.prayers,
  );
});

const isPrayersPage = computed(() =>
  route.name === 'Prayers' || route.name === 'PrayersList' || route.name === 'PrayerView',
);

const selectCategory = (category) => {
  setSelectedCategory(category);
  isDrawerOpen.value = false;
  router.push({ name: 'Prayers' });
};

const showAllPrayers = () => {
  setSelectedCategory(null);
  isDrawerOpen.value = false;
  router.push({ name: 'Prayers' });
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',');

function drawerRoot() {
  return drawerShell.value?.closest('.app-drawer') || null;
}

function setBackgroundInert(value) {
  if (value) {
    const root = drawerRoot();
    inertElements = [...document.querySelectorAll('.v-main > *, .v-app-bar, .v-bottom-navigation')]
      .filter((element) => root && !root.contains(element) && !element.contains(root));
    inertElements.forEach((element) => { element.inert = true; });
  } else {
    inertElements.forEach((element) => { element.inert = false; });
    inertElements = [];
  }
}

function handleDrawerKeydown(event) {
  if (!isDrawerOpen.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    isDrawerOpen.value = false;
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...(drawerRoot()?.querySelectorAll(focusableSelector) || [])]
    .filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(isDrawerOpen, async (open, wasOpen) => {
  if (open) {
    returnFocusTo = document.activeElement;
    setBackgroundInert(true);
    window.addEventListener('keydown', handleDrawerKeydown, true);
    await nextTick();
    drawerRoot()?.querySelector('.drawer-close-btn')?.focus();
  } else if (wasOpen) {
    window.removeEventListener('keydown', handleDrawerKeydown, true);
    setBackgroundInert(false);
    await nextTick();
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
    returnFocusTo = null;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleDrawerKeydown, true);
  setBackgroundInert(false);
});

</script>

<style scoped>
.app-drawer {
  top: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  height: 100% !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  max-width: min(320px, 88vw) !important;
  border: 0 !important;
  border-right: 1px solid var(--nav-border) !important;
  border-radius: 0 !important;
  background:
    radial-gradient(circle at 14% 4%, rgba(var(--chrome-accent-rgb), 0.13), transparent 210px),
    var(--nav-surface) !important;
  color: var(--nav-on-surface) !important;
  /* A closed drawer sits at translateX(-100%) but its shadow would still reach
     into the viewport: only the open drawer casts one (Vuetify's own box-shadow
     transition animates it). */
  box-shadow: none !important;
  overflow: hidden;
}

.app-drawer.v-navigation-drawer--active {
  box-shadow: 10px 0 32px var(--nav-shadow) !important;
}

.drawer-shell {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding:
    max(12px, env(safe-area-inset-top, 0px))
    12px
    max(12px, env(safe-area-inset-bottom, 0px));
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
  border: 1px solid rgba(var(--chrome-accent-rgb), 0.2);
  background: rgba(var(--chrome-accent-rgb), 0.1);
}

.drawer-logo {
  display: block;
  width: 34px;
  height: 34px;
}

.drawer-title {
  font-size: 1rem;
  font-family: var(--reader-display-font-family);
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
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
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
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.drawer-list :deep(.v-list-item--active .v-list-item__overlay) {
  opacity: 0 !important;
}

.drawer-list :deep(.v-list-item--active .drawer-icon) {
  color: var(--chrome-accent);
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

.drawer-store-badges {
  display: grid;
  gap: 8px;
  padding: 4px 8px 12px;
}

.drawer-store-badge {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 60px;
  padding: 10px 12px;
  border: 1px solid var(--nav-border);
  border-radius: 14px;
  background: var(--reader-surface);
  color: var(--nav-on-surface);
  opacity: 0.86;
  cursor: default;
}

.drawer-store-icon {
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
}

.drawer-store-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  line-height: 1.22;
}

.drawer-store-kicker {
  color: var(--nav-muted);
  font-size: 0.66rem;
}

.drawer-store-copy strong {
  font-size: 0.92rem;
  font-weight: 650;
}

.drawer-store-soon {
  color: var(--nav-muted);
  font-size: 0.69rem;
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
