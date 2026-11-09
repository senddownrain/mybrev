<template>
  <v-app
    :style="{
      '--reader-font-family': settings.fontFamily,
      '--font-size-multiplier': settings.fontSizeMultiplier
    }"
  >
    <v-app-bar
      v-if="!hideLayoutAppBar"
      flat
      color="transparent"
      class="floating-app-bar"
      :class="{ 'floating-app-bar--behind-drawer': isDrawerOpen, 'floating-app-bar--song-view': isSongViewPage || isCompendiumSubPage }"
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
      <!-- Святая Імша — асобны раздзел праграмы: толькі кнопка меню, без «Назад» -->
      <v-app-bar-nav-icon
        v-else-if="isMassPage"
        class="top-circle-btn"
        @click.stop="isDrawerOpen = !isDrawerOpen"
        aria-label="Адкрыць меню"
      >
        <v-icon>mdi-menu</v-icon>
      </v-app-bar-nav-icon>
      <!-- Кнопка назад для страницы просмотра молитвы (не в режиме редактирования) -->
      <div v-else-if="isPrayerViewPage" class="readings-nav-group">
        <v-btn
          icon
          variant="text"
          class="readings-nav-segment readings-nav-segment--menu"
          aria-label="Назад"
          @click="goBack"
        >
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-btn
          :to="{ name: 'PrayersList' }"
          variant="text"
          class="readings-nav-segment readings-nav-segment--liturgy text-none"
        >
          Усе малітвы
        </v-btn>
      </div>
      <div v-else-if="isSongViewPage" class="readings-nav-group songs-nav-group">
        <v-btn icon variant="text" class="readings-nav-segment readings-nav-segment--menu" aria-label="Назад" :to="{ name: 'Songs' }"><v-icon>mdi-arrow-left</v-icon></v-btn>
        <v-btn :to="{ name: 'Songs' }" variant="text" class="readings-nav-segment readings-nav-segment--liturgy text-none">Усе спевы</v-btn>
      </div>
      <div v-else-if="isCompendiumSubPage" class="readings-nav-group songs-nav-group">
        <v-btn icon variant="text" class="readings-nav-segment readings-nav-segment--menu" aria-label="Назад" @click="goBackInCompendium"><v-icon>mdi-arrow-left</v-icon></v-btn>
        <v-btn :to="{ name: 'Compendium' }" variant="text" class="readings-nav-segment readings-nav-segment--liturgy text-none">Кампендый</v-btn>
      </div>
      <!-- Меню і вяртанне да літургіі як адзін падзелены кантрол -->
      <div v-else-if="isReadingsPage || isOrdoPage" class="readings-nav-group">
        <v-btn
          icon
          variant="text"
          class="readings-nav-segment readings-nav-segment--menu"
          aria-label="Адкрыць меню"
          @click.stop="isDrawerOpen = !isDrawerOpen"
        >
          <v-icon>mdi-menu</v-icon>
        </v-btn>
        <LiturgyNavLink
          :to="topLiturgyRoute"
          :data-test="isOrdoPage ? 'ordo-hours-shortcut' : undefined"
          class="readings-nav-segment readings-nav-segment--liturgy text-none"
        />
      </div>
      <!-- Меню для остальных страниц -->
      <v-app-bar-nav-icon
        v-else
        class="top-circle-btn"
        @click.stop="isDrawerOpen = !isDrawerOpen"
        aria-label="Адкрыць меню"
      >
        <v-icon>mdi-menu</v-icon>
      </v-app-bar-nav-icon>

      <!-- Заголовок при редактировании молитвы -->
      <v-app-bar-title v-if="(isPrayerViewPage && uiStore.prayerIsEditing) || isPrayerEditPage" class="prayer-edit-title">
        {{ layoutTitle }}
      </v-app-bar-title>

      <TextScaleControl
        v-if="showTextScaleControl"
        class="top-action-start"
      />

      <v-btn v-if="isHoursHome" :to="homeCalendarRoute" icon="mdi-calendar-text-outline"
        variant="flat" class="top-circle-btn top-action-start" aria-label="Літургічны каляндар гэтага дня" />

      <template v-if="isSongViewPage">
        <v-btn :icon="settings.favoriteSongs.includes(route.params.id) ? 'mdi-heart' : 'mdi-heart-outline'" :color="settings.favoriteSongs.includes(route.params.id) ? 'red' : undefined" class="top-circle-btn" variant="flat" :aria-label="settings.favoriteSongs.includes(route.params.id) ? 'Выдаліць з абраных' : 'Дадаць у абраныя'" @click="settings.toggleFavoriteSong(route.params.id)" />
        <v-btn v-if="authStore.isAdmin" icon="mdi-pencil-outline" class="top-circle-btn" variant="flat" aria-label="Рэдагаваць" :to="{ name: 'AdminSongEdit', params: { id: route.params.id } }" />
      </template>

      <!-- Кнопки для страницы редактирования молитвы (PrayerEdit) -->
      <div
        v-if="isPrayerEditPage"
        class="prayer-form-top-actions top-action-start"
        role="group"
        aria-label="Дзеянні з малітвай"
      >
        <v-btn
          v-if="canCopyPrayer"
          icon
          class="prayer-form-top-actions__button prayer-form-top-actions__copy"
          variant="flat"
          @click="uiStore.triggerPrayerFormCopy()"
          :loading="uiStore.prayerFormCopying"
          :disabled="uiStore.prayerFormSaving"
          aria-label="Стварыць копію"
          title="Стварыць копію"
        >
          <v-icon>mdi-content-copy</v-icon>
        </v-btn>
        <v-btn
          icon
          class="prayer-form-top-actions__button prayer-form-top-actions__save"
          variant="flat"
          @click="savePrayerForm"
          :loading="uiStore.prayerFormSaving"
          :disabled="uiStore.prayerFormCopying"
          aria-label="Захаваць"
          title="Захаваць"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
      </div>

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
        <MassLanguageMenu v-if="isMassPage" />
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
        <!-- Share is for ordinary prayers; the Mass screen has none -->
        <v-btn
          v-if="!isMassPage"
          icon
          class="top-circle-btn"
          variant="flat"
          :loading="sharingPrayerLink"
          :disabled="!currentPrayer"
          aria-label="Падзяліцца малітвай"
          title="Падзяліцца малітвай"
          @click="shareCurrentPrayer"
        >
          <PhShareNetwork :size="21" weight="bold" aria-hidden="true" />
        </v-btn>
      </template>

    </v-app-bar>

    <NavigationDrawer />

    <v-main :class="{ 'app-main--bottom-nav': hasBottomNav }">
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
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhShareNetwork } from '@phosphor-icons/vue';
import { useAppBar } from '@/composables/useAppBar.js';
import { useNotifier } from '@/composables/useNotifier.js';
import { useUiStore } from '@/stores/ui.js';
import NavigationDrawer from './NavigationDrawer.vue';
import TextSettingsSheet from '@/components/TextSettingsSheet.vue';
import TextScaleControl from '@/components/TextScaleControl.vue';
import LiturgyNavLink from '@/components/common/LiturgyNavLink.vue';
import MassLanguageMenu from '@/components/prayers/MassLanguageMenu.vue';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';
import { useSettingsStore } from '@/stores/settings.js';
import { usePrayersFilters } from '@/composables/usePrayersFilters.js';
import { usePrayers } from '@/composables/usePrayers.js';
import { useAuthStore } from '@/stores/auth.js';
import { buildPrayerSharePath, buildPrayerShareUrl, sharePrayerLink } from '@/utils/prayerShare.js';
import { logger } from '@/utils/logger.js';
import { MASS_ORDER_PRAYER_ID } from '@/utils/massRitual.js';
import { compendiumParentRoute } from '@/utils/compendiumBack.js';
import moment from '@/utils/moment-be';
import { ordoHoursRoute } from '@/utils/ordoScreen';
import { ordoDiocese } from '@/utils/ordoDiocese';
import { trackFeature } from '@/utils/trackFeature';
import { ordoDioceseFilter } from '@/utils/ordoMonthFilter';

const { isDrawerOpen } = useAppBar();
const uiStore = useUiStore();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { notifySuccess, notifyError } = useNotifier();
const sharingPrayerLink = ref(false);

const { selectedTags, selectedCategory, isFilterExpanded } = usePrayersFilters();
const { prayers, allTags, getTitle, init: initPrayers } = usePrayers();
const prayerRouteNames = new Set([
  'Prayers',
  'PrayersList',
  'FavoritePrayers',
  'PrayerView',
  'PrayerAdd',
  'PrayerEdit',
]);

watch(
  () => route.name,
  (routeName) => {
    if (prayerRouteNames.has(routeName)) initPrayers();
  },
  { immediate: true },
);
const filterTags = computed(() => (
  [...new Set(allTags.value || [])].sort((a, b) => a.localeCompare(b, 'be', { sensitivity: 'base' }))
));
const currentPrayer = computed(() => (
  prayers.value.find((prayer) => prayer.id === route.params.id) || null
));

const isPrayerViewPage = computed(() => {
  return route.name === 'PrayerView' || route.name === 'PrayerEdit';
});

// The Holy Mass reader is opened from the drawer as its own screen, not as a
// prayer from the list, so its header has no back/list navigation or Share.
const isMassPage = computed(() => (
  route.name === 'PrayerView' && route.params.id === MASS_ORDER_PRAYER_ID && !uiStore.prayerIsEditing
));

const isPrayerEditPage = computed(() => {
  return route.name === 'PrayerEdit' || route.name === 'PrayerAdd';
});

const canCopyPrayer = computed(() => route.name === 'PrayerEdit');

const isReadingsPage = computed(() => {
  return route.name === 'Readings' || route.name === 'ReadingsByDate';
});
const isOrdoPage = computed(() => ['Ordo', 'OrdoByDate'].includes(route.name));
const isHoursHome = computed(() => ['Today', 'SelectedDay'].includes(route.name));
const homeCalendarRoute = computed(() => ({
  name: 'OrdoByDate', params: { date: route.params.day || moment().format('YYYY-MM-DD') },
}));
const hasBottomNav = computed(() => route.matched.some((record) => record.components?.bottomNav));
const isSongViewPage = computed(() => route.name === 'SongView');
const isCompendiumSubPage = computed(() => ['CompendiumPart', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion'].includes(route.name));
// Back inside the Compendium: history when it exists (keeps search and scroll),
// otherwise the logical parent, e.g. after opening a deep link directly.
const goBackInCompendium = () => {
  if (router.options.history.state.back) {
    router.back();
    return;
  }
  router.push(compendiumParentRoute(route.name, route.params));
};

const readingsLiturgyRoute = computed(() => {
  const dateParam = route.params.date || route.query.date;
  const selectedDate = dateParam
    ? moment(dateParam, 'YYYY-MM-DD', true)
    : moment().startOf('day');
  const validDate = selectedDate.isValid() ? selectedDate : moment().startOf('day');
  const date = validDate.format('YYYY-MM-DD');
  const dayId = String(route.query.returnDayId || route.query.dayId || '');

  if (dayId) return { name: 'oras', params: { day: date, id: dayId } };
  if (validDate.isSame(moment().startOf('day'), 'day')) return { name: 'Today' };
  return { name: 'SelectedDay', params: { day: date } };
});

const topLiturgyRoute = computed(() => isOrdoPage.value
  ? ordoHoursRoute({
    date: route.params.date || '',
    filter: ordoDioceseFilter.value,
    userDiocese: ordoDiocese.value,
  })
  : readingsLiturgyRoute.value);

const showTextScaleControl = computed(() => {
  if (isPrayerEditPage.value) return false;
  if (isPrayerViewPage.value) return !uiStore.prayerIsEditing;
  return [
    'SongView',
    'CompendiumTopic',
    'CompendiumQuestion',
    'Readings',
    'ReadingsByDate',
    'Bible',
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
      return 'Літургія гадзінаў';
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
      return 'Чытанні дня';
    case 'ReadingsPicker':
      return 'Каляндар чытанняў';
    case 'Bible':
      return 'Біблія';
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

const shareCurrentPrayer = async () => {
  if (!currentPrayer.value || sharingPrayerLink.value) return;

  const routeHref = router.resolve({
    path: buildPrayerSharePath(currentPrayer.value.id),
  }).href;
  const url = buildPrayerShareUrl(routeHref, window.location.href);
  if (!url) return;

  sharingPrayerLink.value = true;
  try {
    const result = await sharePrayerLink({
      title: getTitle(currentPrayer.value),
      url,
    });
    if (result !== 'cancelled') trackFeature('share_use');
    if (result === 'copied') notifySuccess('Спасылка на малітву скапіявана');
  } catch (error) {
    logger.error('Failed to share prayer link:', error);
    notifyError('Не ўдалося падзяліцца спасылкай');
  } finally {
    sharingPrayerLink.value = false;
  }
};

const goBack = () => {
  if (route.name === 'PrayerView') {
    if (router.options.history.state.back) {
      router.back();
    } else {
      router.push({ name: 'PrayersList' });
    }
    return;
  }

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
  background: var(--overlay-surface) !important;
  color: var(--nav-on-surface) !important;
  box-shadow: 0 2px 9px var(--nav-button-shadow) !important;
  transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease !important;
  backdrop-filter: blur(18px);
}

.top-circle-btn:hover {
  box-shadow: 0 3px 12px var(--nav-button-shadow) !important;
}

.top-circle-btn:active {
  opacity: 0.72;
  transform: scale(0.94);
}

.top-circle-btn--confirm {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.top-circle-btn--active {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.prayer-form-top-actions {
  display: flex;
  flex: 0 0 auto;
  height: 48px;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--overlay-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
  backdrop-filter: blur(18px);
}

.prayer-form-top-actions__button {
  width: 46px !important;
  min-width: 46px !important;
  height: 46px !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--nav-on-surface) !important;
  box-shadow: none !important;
}

.prayer-form-top-actions__copy {
  border-right: 1px solid var(--nav-border) !important;
}

.prayer-form-top-actions__save {
  background: rgba(var(--chrome-accent-rgb), 0.13) !important;
  color: var(--chrome-accent) !important;
}

.readings-nav-group {
  display: flex;
  height: 48px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 24px;
  background: var(--overlay-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
  backdrop-filter: blur(18px);
}

.readings-nav-segment {
  height: 46px !important;
  border-radius: 0 !important;
  color: var(--nav-on-surface) !important;
}

.readings-nav-segment--menu {
  width: 48px !important;
  min-width: 48px !important;
}

.readings-nav-segment--liturgy {
  min-width: 112px !important;
  padding-inline: 12px 16px !important;
  border-left: 1px solid var(--nav-border) !important;
  font-weight: 650;
}

.readings-nav-segment:active {
  background: var(--nav-active) !important;
}

.top-action-start {
  margin-left: auto !important;
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
  background:
    radial-gradient(circle at 90% 0, rgba(var(--devotional-rgb), 0.13), transparent 240px),
    var(--overlay-surface) !important;
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
  color: var(--devotional-accent);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-sheet-title {
  margin-top: 2px;
  font-size: 1.25rem;
  font-family: var(--reader-display-font-family);
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
  background: var(--devotional-soft) !important;
  color: var(--devotional-accent) !important;
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

.filter-sheet-actions :deep(.v-btn:last-child) {
  background: var(--devotional-accent) !important;
  color: var(--on-devotional-accent) !important;
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

  .prayer-form-top-actions {
    height: 44px;
    border-radius: 22px;
  }

  .prayer-form-top-actions__button {
    width: 42px !important;
    min-width: 42px !important;
    height: 42px !important;
  }

  .readings-nav-group {
    height: 44px;
    border-radius: 22px;
  }

  .readings-nav-segment {
    height: 42px !important;
  }

  .readings-nav-segment--menu {
    width: 44px !important;
    min-width: 44px !important;
  }

  .readings-nav-segment--liturgy {
    min-width: 104px !important;
    padding-inline: 10px 13px !important;
  }

}
@media (max-width: 600px) {
  .songs-nav-group .readings-nav-segment--liturgy { min-width: 96px !important; padding-inline: 8px 10px !important; font-size: .8rem; }
}
@media (max-width: 400px) {
  .floating-app-bar--song-view :deep(.v-toolbar__content) { gap: 6px; padding-inline: 10px; }
  .floating-app-bar--song-view .top-circle-btn { width: 44px !important; height: 44px !important; min-width: 44px !important; flex-basis: 44px !important; }
  .songs-nav-group .readings-nav-segment--menu { width: 44px !important; min-width: 44px !important; }
  .songs-nav-group .readings-nav-segment--liturgy { min-width: 88px !important; padding-inline: 6px 8px !important; }
}
@media (max-width: 359px) {
  .floating-app-bar--song-view :deep(.v-toolbar__content) { gap: 4px; }
  .songs-nav-group .readings-nav-segment--menu { width: 40px !important; min-width: 40px !important; }
  .songs-nav-group .readings-nav-segment--liturgy { min-width: 82px !important; padding-inline: 5px 7px !important; font-size: .75rem; }
}
</style>
