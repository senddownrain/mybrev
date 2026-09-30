<template>
  <v-container class="items-list-container">
    <h1 class="section-page-title">Літургія гадзін</h1>
    <div class="date-header-shell" :style="dateHeaderStyle">
      <button
        type="button"
        class="date-header"
        aria-label="Адкрыць каляндар і выбраць дату"
        :aria-busy="softLoading"
        @click="toggleCalendarDialog"
      >
        <span class="date-header__eyebrow">
          <v-icon icon="mdi-calendar-blank-outline" size="16"></v-icon>
          {{ isToday ? 'Сёння' : 'Выбраная дата' }}
        </span>
        <h2 class="date-header__weekday">
          {{ currentDate.format('dddd') }}
        </h2>
        <span class="date-header__date">
          {{ displayDate }}
          <v-icon class="date-header__caret" icon="mdi-chevron-down" size="20"></v-icon>
        </span>
      </button>
      <v-progress-linear
        v-if="softLoading"
        indeterminate
        height="4"
        class="date-loading-bar"
      ></v-progress-linear>
    </div>

    <!-- Большой спиннер только для самого первого экрана, когда вообще нет данных -->
    <v-row
      v-if="loading && !dayOptions.length && !error"
      class="justify-center mt-16"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
      ></v-progress-circular>
    </v-row>

    <!-- Ошибка -->
    <v-row v-else-if="error" class="mt-8">
      <v-col>
        <v-alert
          type="error"
          prominent
          border="start"
          icon="mdi-alert-circle-outline"
        >
          <div class="text-h6">Памылка пры загрузцы</div>
          <p>{{ error }}</p>
          <v-btn
            variant="tonal"
            color="white"
            class="mt-2"
            prepend-icon="mdi-refresh"
            @click="retryFetch"
          >
            Паўтарыць
          </v-btn>
        </v-alert>
      </v-col>
    </v-row>

    <v-row v-else-if="dayOptions.length" class="options-row">
      <v-col class="options-column">
        <v-list
          bg-color="transparent"
          class="day-options-list"
          :class="{ 'day-options-list--loading': softLoading }"
          :aria-busy="softLoading"
        >
          <v-list-item
            v-for="option in dayOptions"
            :key="option.key"
            :to="optionRoute(option)"
            class="day-option"
            :class="{
              'day-option--themed': isThemedOption(option),
              'day-option--requiem': isOfficeForDead(option),
            }"
            :style="getOptionStyle(option)"
          >
            <template #prepend>
              <span class="day-option__icon-wrap">
                <v-icon
                  :icon="getOptionIcon(option)"
                  size="25"
                ></v-icon>
              </span>
            </template>

            <v-list-item-title class="day-option__title">
              {{ getOptionDisplayTitle(option) }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="getOptionMeta(option)" class="day-option__subtitle">
              {{ getOptionMeta(option) }}
            </v-list-item-subtitle>

            <template #append>
              <v-icon class="day-option__arrow" icon="mdi-chevron-right" size="24"></v-icon>
            </template>
          </v-list-item>
        </v-list>

      </v-col>
    </v-row>

    <!-- Ничего не найдено -->
    <v-row v-else class="text-center text-grey mt-10">
      <v-col>
        <v-icon size="48">mdi-book-remove-outline</v-icon>
        <p class="mt-2">Нічога не знойдзена.</p>
        <p class="text-caption">
          Для {{ currentDate.format('D MMM YYYY') }} не знойдзены літургічны дзень
          (ні па перыядзе, ні па фіксаванай даце).
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { useAppBar } from '@/composables/useAppBar';
import { logger } from '@/utils/logger';
import { useNotifier } from '@/composables/useNotifier';
import {
  LITURGICAL_OPTION_SOURCE,
  PLACE_LABEL_MAP,
  RANK_LABEL_MAP,
  getLiturgicalCelebrationThemeKey,
  getLiturgicalPeriodTheme,
  getLiturgicalTheme,
} from '@/constants/liturgical';
import { formatDateDayMonth } from '@/utils/date';
import { ordoDiocese } from '@/utils/ordoDiocese';

const route = useRoute();

const {
  getLiturgicalContentForDate,
  getCachedLiturgicalContentForDate,
  restoreCachedLiturgicalContentForDate,
} = useLiturgicalContent();

const { toggleCalendarDialog } = useAppBar();
const { error: notifyError } = useNotifier();

const dayOptions = ref([]);
const loading = ref(false);     // включается только после промаха постоянного кэша
const softLoading = ref(false); // перелистывание — полоска
const error = ref(null);

const currentDate = ref(moment().startOf('day'));
const isToday = computed(() => currentDate.value.isSame(moment().startOf('day'), 'day'));
const displayDate = computed(() => formatDateDayMonth(currentDate.value.toDate()));
const currentPeriodType = computed(() => {
  const optionWithContext = dayOptions.value.find((option) => option?.contextPeriodType);
  const periodOption = dayOptions.value.find((option) => (
    option?.source === LITURGICAL_OPTION_SOURCE.PERIOD && option?.day?._periodType
  ));

  return optionWithContext?.contextPeriodType
    || periodOption?.day?._periodType
    || dayOptions.value.find((option) => option?.day?._periodType)?.day?._periodType
    || 'default';
});
const dateHeaderStyle = computed(() => {
  const firstDay = dayOptions.value[0]?.day || null;
  const theme = getLiturgicalPeriodTheme(firstDay, currentPeriodType.value);
  return {
    '--liturgical-color': theme.color,
    '--liturgical-rgb': theme.rgb,
  };
});

const getOptionDisplayTitle = (option) => {
  const title = String(option?.title || '').trim();
  if (isOfficeForDead(option)) return title;
  const weekday = currentDate.value.format('dddd');
  const titleAlreadyContainsWeekday = title
    .toLocaleLowerCase('be-BY')
    .includes(weekday.toLocaleLowerCase('be-BY'));

  return titleAlreadyContainsWeekday ? title : `${title}, ${weekday}`;
};

const getOptionMeta = (option) => {
  if (isOfficeForDead(option)) return option.subtitle || 'Памінальны афіцый';
  const day = option?.day || {};
  const rank = day._rank || day._feastType;
  const places = Array.isArray(day._place) ? day._place : [day._place];
  const chunks = [];

  if (rank) chunks.push(RANK_LABEL_MAP[rank] || rank);
  else if (option?.ordo?.missingProper && option.ordo.rank) chunks.push(RANK_LABEL_MAP[option.ordo.rank] || '');
  chunks.push(...places
    .filter(Boolean)
    .map((place) => PLACE_LABEL_MAP[place] || place));
  if (option?.ordo?.missingProper) chunks.push('тэксты дня');
  // A memorial on a privileged weekday is only commemorated in the Office
  // of the day (never a separate card).
  (option?.ordo?.commemorations || []).forEach((item) => chunks.push(`Успамін (commemoratio): ${item.title}`));

  return [...new Set(chunks.filter(Boolean))].join(' · ');
};

// Monotonically-increasing counter used to detect stale responses.
// When the user navigates to another date before a fetch completes,
// the old promise resolves but its fetchId no longer matches _currentFetchId,
// so the result is discarded (prevents race condition).
let _currentFetchId = 0;

const fetchItemsForDate = async (date) => {
  const fetchId = ++_currentFetchId;
  const key = date.format('YYYY-MM-DD');

  // 1. Try cache first — no spinners needed
  let cached = getCachedLiturgicalContentForDate(date.toDate());
  let cacheWaitTimer;
  if (!cached) {
    cacheWaitTimer = setTimeout(() => {
      if (fetchId === _currentFetchId && !dayOptions.value.length) loading.value = true;
    }, 100);
    cached = await restoreCachedLiturgicalContentForDate(date.toDate());
    clearTimeout(cacheWaitTimer);
  }
  if (fetchId !== _currentFetchId) return;
  if (cached) {
    logger.log(`[ItemsList] Cache hit for date: ${key}`);
    dayOptions.value = Array.isArray(cached.dayOptions) ? cached.dayOptions : [];
    loading.value = false;
    softLoading.value = false;
    return;
  }

  logger.log(`[ItemsList] Cache miss, fetching data for date: ${key}`);

  error.value = null;

  // 2. Decide spinner type
  if (!dayOptions.value.length) {
    loading.value = true;
    softLoading.value = false;
  } else {
    softLoading.value = true;
    loading.value = false;
  }

  try {
    const result = await getLiturgicalContentForDate(date.toDate());

    // Discard stale response if another fetch was started while we waited
    if (fetchId !== _currentFetchId) {
      logger.log(`[ItemsList] Discarding stale response for date: ${key}`);
      return;
    }

    if (result) {
      dayOptions.value = Array.isArray(result.dayOptions) ? result.dayOptions : [];
    } else {
      dayOptions.value = [];
    }

    if (dayOptions.value.length === 0) {
      logger.warn(`[ItemsList] No liturgical items found for date: ${key}`);
    }
  } catch (e) {
    if (fetchId !== _currentFetchId) return; // stale — ignore

    logger.error('[ItemsList] Critical error loading data:', e);
    const errorMessage = e?.message || 'Не атрымалася загрузіць дадзеныя. Паспрабуйце абнавіць старонку.';
    error.value = errorMessage;
    notifyError(errorMessage);
  } finally {
    if (fetchId === _currentFetchId) {
      loading.value = false;
      softLoading.value = false;
    }
  }
};

function retryFetch() {
  fetchItemsForDate(currentDate.value);
}

const optionRoute = (option) => {
  const targetId = option.dayId || `missing-${option.key}`;
  return `/day/${currentDate.value.format('YYYY-MM-DD')}/ora/${targetId}`;
};

const isOfficeForDead = (option) => (
  option?.source === LITURGICAL_OPTION_SOURCE.OFFICE_FOR_DEAD
);

const isThemedOption = (option) => (
  isOfficeForDead(option) || Boolean(getLiturgicalCelebrationThemeKey(option?.day))
);

const getOptionStyle = (option) => {
  const theme = getLiturgicalTheme(option?.day, option?.contextPeriodType);
  return {
    '--option-color': theme.color,
    '--option-rgb': theme.rgb,
  };
};

const getOptionIcon = (option) => {
  if (isOfficeForDead(option)) return 'mdi-candle';
  if (option.source === LITURGICAL_OPTION_SOURCE.DYNAMIC) return 'mdi-star-four-points';
  if (option.source === LITURGICAL_OPTION_SOURCE.FIXED) return 'mdi-calendar-star';
  return 'mdi-calendar-blank';
};

// The legal Offices depend on the diocese and the own church (Settings).
watch(ordoDiocese, () => fetchItemsForDate(currentDate.value));

watch(
  () => route.params.day,
  (newDay) => {
    const targetDate = newDay
      ? moment(newDay, 'YYYY-MM-DD')
      : moment().startOf('day');

    currentDate.value = targetDate;
    fetchItemsForDate(targetDate);
  },
  { immediate: true },
);
</script>

<style scoped>
.items-list-container {
  width: min(100%, 760px);
  max-width: 760px;
  padding-top: 12px;
}

.section-page-title {
  margin: 8px 12px 22px;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.date-header-shell {
  position: relative;
  width: calc(100% - 24px);
  margin: 0 12px 22px;
}

.date-header {
  --liturgical-visible-color: var(--liturgical-color);
  --liturgical-visible-color: color-mix(
    in srgb,
    var(--liturgical-color) var(--period-accent-weight),
    var(--period-accent-target)
  );
  position: relative;
  display: flex;
  width: 100%;
  min-height: 166px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  margin: 0;
  padding: 22px 24px;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 28px;
  background:
    radial-gradient(circle at 92% 14%, rgba(var(--liturgical-rgb), 0.28) 0, rgba(var(--liturgical-rgb), 0.28) 42px, transparent 43px),
    linear-gradient(145deg, rgba(var(--liturgical-rgb), 0.13), rgba(var(--liturgical-rgb), 0.035) 66%),
    var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: var(--hero-shadow);
  cursor: pointer;
  font: inherit;
  text-align: left;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.date-loading-bar {
  position: absolute !important;
  right: 20px;
  bottom: 0;
  left: 20px;
  z-index: 2;
  width: auto !important;
  overflow: hidden;
  border-radius: 999px 999px 0 0;
  color: var(--liturgical-color) !important;
  pointer-events: none;
}

.date-loading-bar :deep(.v-progress-linear__background),
.date-loading-bar :deep(.v-progress-linear__indeterminate) {
  background-color: var(--liturgical-color) !important;
}

.date-header:hover {
  border-color: rgba(var(--liturgical-rgb), 0.34);
  box-shadow: 0 10px 32px var(--nav-shadow);
}

.date-header:active {
  transform: scale(0.985);
}

.date-header:focus-visible {
  outline: 3px solid rgba(var(--liturgical-rgb), 0.28);
  outline-offset: 3px;
}

.date-header__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--liturgical-visible-color);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.date-header__weekday {
  max-width: 100%;
  margin: 0;
  font-size: clamp(2.15rem, 9vw, 3.25rem);
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: -0.045em;
  overflow-wrap: anywhere;
}

.date-header__date {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 10px;
  color: var(--nav-muted);
  font-size: clamp(1.08rem, 4.6vw, 1.28rem);
  font-weight: 600;
  line-height: 1.2;
}

.date-header__caret {
  margin-left: 2px;
  color: var(--liturgical-visible-color);
}

.options-row {
  margin-inline: 0 !important;
}

.options-column {
  padding: 0 12px !important;
}

.day-options-list {
  display: grid;
  gap: 12px;
  padding: 0 !important;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.day-options-list--loading {
  opacity: 0.48;
  transform: translateY(2px);
  pointer-events: none;
}

.day-option {
  --option-visible-color: var(--option-color);
  --option-visible-color: color-mix(
    in srgb,
    var(--option-color) var(--period-accent-weight),
    var(--period-accent-target)
  );
  min-height: 82px;
  padding: 14px 14px 14px 16px !important;
  border: 1px solid var(--nav-border);
  border-radius: 22px !important;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.day-option:hover {
  border-color: rgba(var(--v-theme-primary), 0.2);
  box-shadow: 0 7px 22px var(--nav-button-shadow);
}

.day-option--themed {
  border-color: rgba(var(--option-rgb), 0.28);
  background:
    linear-gradient(120deg, rgba(var(--option-rgb), 0.14), rgba(var(--option-rgb), 0.025) 72%),
    var(--nav-surface);
}

.day-option--themed:hover {
  border-color: rgba(var(--option-rgb), 0.42);
}

.day-option--themed .day-option__icon-wrap {
  border-color: rgba(var(--option-rgb), 0.22);
  background: rgba(var(--option-rgb), 0.14);
  color: var(--option-visible-color);
}

.day-option:active {
  transform: scale(0.988);
}

.day-option__icon-wrap {
  color: var(--option-visible-color);
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid var(--nav-border);
  border-radius: 16px;
  background: var(--nav-active);
}

.day-option__title {
  padding-inline: 4px 8px;
  font-size: clamp(1.04rem, 4vw, 1.17rem) !important;
  font-weight: 650;
  line-height: 1.36 !important;
  letter-spacing: -0.01em;
}

.day-option__subtitle {
  padding: 3px 8px 0 4px;
  color: var(--nav-muted);
  font-size: 0.82rem !important;
  font-weight: 540;
  line-height: 1.3 !important;
}

.day-option__arrow {
  color: var(--nav-muted);
}

@media (max-width: 600px) {
  .items-list-container {
    padding: 8px 4px !important;
  }

  .section-page-title {
    margin: 10px 12px 22px;
  }

  .date-header {
    min-height: 158px;
    padding: 20px;
  }

  .day-option {
    min-height: 80px;
  }
}

/* Prevent text truncation in list items */
:deep(.day-option .v-list-item-title) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
  max-width: 100% !important;
}

:deep(.day-option .v-list-item-subtitle) {
  display: block !important;
  overflow: visible !important;
  white-space: normal !important;
  text-overflow: clip !important;
  -webkit-line-clamp: unset !important;
}

:deep(.day-option .v-list-item__prepend) {
  align-self: center;
  margin-inline-end: 12px;
}

:deep(.day-option .v-list-item__append) {
  align-self: center;
}

@media (max-width: 359px) {
  .date-header-shell {
    width: calc(100% - 16px);
    margin-inline: 8px;
  }

  .date-header {
    min-height: 148px;
    padding: 18px;
    border-radius: 24px;
  }

  .options-column {
    padding-inline: 8px !important;
  }

  .day-option {
    padding-inline: 12px 10px !important;
    border-radius: 20px !important;
  }

  .day-option__icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }

  :deep(.day-option .v-list-item__prepend) {
    margin-inline-end: 8px;
  }
}
</style>
