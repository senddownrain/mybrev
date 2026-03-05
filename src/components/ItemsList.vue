<template>
  <v-container class="items-list-container">
    <div class="d-flex align-center justify-space-between pa-2 mb-2 date-selector">
      <v-btn
        icon="mdi-chevron-left"
        @click="goToPrevDay"
        :disabled="softLoading"
      ></v-btn>

      <div
        class="text-center flex-grow-1 mx-2"
        @click="toggleCalendarDialog"
        style="cursor: pointer;"
      >
        <h2 class="text-h6 font-weight-regular text-wrap">
          {{ currentDate.format('D MMM YYYY') }}
        </h2>
      </div>

      <v-btn
        icon="mdi-chevron-right"
        @click="goToNextDay"
        :disabled="softLoading"
      ></v-btn>
    </div>

    <!-- Мягкий индикатор загрузки (полоска сверху) -->
    <v-progress-linear
      v-if="softLoading"
      indeterminate
      color="primary"
      height="3"
      class="mb-2"
    ></v-progress-linear>

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

    <v-row v-else-if="dayOptions.length">
      <v-col>
        <v-list lines="three" bg-color="transparent">
          <v-list-item
            v-for="option in dayOptions"
            :key="option.key"
            :to="optionRoute(option)"
            class="mb-2"
            border
            rounded
          >
            <template #prepend>
              <v-icon :icon="getOptionIcon(option)" :color="getOptionColor(option)"></v-icon>
            </template>

            <v-list-item-title>{{ option.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ option.subtitle }}</v-list-item-subtitle>

            <template #append>
              <div class="d-flex flex-column align-end ga-1">
                <v-chip size="small" :color="option.hasLiturgicalDay ? 'success' : 'grey'" variant="tonal">
                  {{ option.hasLiturgicalDay ? 'Літургія: ёсць' : 'Літургія: няма' }}
                </v-chip>
                <v-chip size="small" :color="option.hasReadings ? 'deep-purple' : 'grey'" variant="tonal">
                  {{ option.hasReadings ? 'Чытанні: ёсць' : 'Чытанні: няма' }}
                </v-chip>
              </div>
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
          Для {{ currentDate.format('D MMM YYYY') }} не знойдзены ні чытанні, ні літургічны дзень
          (ні па перыядзе, ні па фіксаванай даце).
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { useAppBar } from '@/composables/useAppBar';
import { logger } from '@/utils/logger';
import { useNotifier } from '@/composables/useNotifier';
import { LITURGICAL_OPTION_SOURCE } from '@/constants/liturgical';

const route = useRoute();
const router = useRouter();

const {
  getLiturgicalContentForDate,
  getCachedLiturgicalContentForDate,
} = useLiturgicalContent();

const { toggleCalendarDialog } = useAppBar();
const { error: notifyError } = useNotifier();

const dayOptions = ref([]);
const loading = ref(true);      // первый экран — большой спиннер
const softLoading = ref(false); // перелистывание — полоска
const error = ref(null);

const currentDate = ref(moment().startOf('day'));

// Monotonically-increasing counter used to detect stale responses.
// When the user navigates to another date before a fetch completes,
// the old promise resolves but its fetchId no longer matches _currentFetchId,
// so the result is discarded (prevents race condition).
let _currentFetchId = 0;

const fetchItemsForDate = async (date) => {
  const fetchId = ++_currentFetchId;
  const key = date.format('YYYY-MM-DD');

  // 1. Try cache first — no spinners needed
  const cached = getCachedLiturgicalContentForDate(date.toDate());
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
  if (!dayOptions.value.length && loading.value === true) {
    softLoading.value = false; // keep big spinner for first load
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

function navigateToDate(date) {
  const dateString = date.format('YYYY-MM-DD');
  router.push({ name: 'SelectedDay', params: { day: dateString } });
}

const goToNextDay = () =>
  navigateToDate(currentDate.value.clone().add(1, 'day'));

const goToPrevDay = () =>
  navigateToDate(currentDate.value.clone().subtract(1, 'day'));

const optionRoute = (option) => {
  const targetId = option.dayId || `missing-${option.key}`;
  return `/day/${currentDate.value.format('YYYY-MM-DD')}/ora/${targetId}`;
};

const getOptionIcon = (option) => {
  if (option.source === LITURGICAL_OPTION_SOURCE.DYNAMIC) return 'mdi-star-four-points';
  if (option.source === LITURGICAL_OPTION_SOURCE.FIXED) return 'mdi-calendar-star';
  return 'mdi-calendar-blank';
};

const getOptionColor = (option) => {
  const periodType = option.day?._periodType || option.contextPeriodType;
  if (periodType === 'advent' || periodType === 'lent') return 'purple-darken-3';
  if (periodType === 'easter' || periodType === 'christmas') return 'yellow-darken-3';
  if (periodType === 'ordinary') return 'green-darken-2';
  return 'red-darken-2';
};

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
  max-width: 100%;
}

.date-selector h2 {
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-size: 1rem;
}

@media (max-width: 600px) {
  .items-list-container {
    padding: 8px 4px !important;
  }

  .date-selector {
    padding: 8px 4px !important;
    margin-bottom: 8px !important;
  }

  .date-selector h2 {
    font-size: 0.9rem !important;
  }

  .v-list-item {
    padding: 12px 8px !important;
    margin-bottom: 8px !important;
  }

  .v-list-item-title {
    font-size: 0.95rem !important;
    line-height: 1.4 !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    word-break: break-word !important;
    text-overflow: unset !important;
    overflow: visible !important;
  }

  .v-list-item-subtitle {
    font-size: 0.85rem !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    word-break: break-word !important;
    text-overflow: unset !important;
    overflow: visible !important;
  }
}

/* Prevent text truncation in list items */
:deep(.v-list-item-title),
:deep(.v-list-item-subtitle) {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  text-overflow: unset !important;
  overflow: visible !important;
  max-width: 100% !important;
}
</style>
