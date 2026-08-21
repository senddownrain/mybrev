<template>
  <v-container>
    <div v-if="dayData" class="mb-5">
      <day-title :day-data="dayData" />
      <div v-if="templateOptions.length > 1" class="mt-4">
        <div class="text-caption text-medium-emphasis mb-1">
          Шаблон літургіі дня
        </div>
        <v-btn-toggle
          :model-value="dayId"
          color="primary"
          variant="outlined"
          mandatory
          divided
          class="template-toggle"
          @update:model-value="selectTemplate"
        >
          <v-btn
            v-for="template in templateOptions"
            :key="template.id"
            :value="template.id"
            class="text-none"
          >
            {{ template.label }}
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>

    <div v-if="loadingOra" class="text-center mt-16">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
    </div>

    <!-- Блок чтений и список литургических часов -->
    <v-list v-else lines="three" bg-color="transparent">
      <!-- Блок "Чытанні" -->
      <v-list-item
        :to="readingItem ? readingItem.path : undefined"
        :disabled="!readingItem"
        class="mb-4 reading-card"
        :class="{ 'reading-card--celebration': isCelebration }"
        :style="readingCardStyle"
        rounded="lg"
        border
      >
        <template #prepend>
          <div class="reading-avatar-wrap">
            <v-avatar :color="readingTheme.avatarColor" size="40">
              <v-icon :color="readingItem ? readingTheme.iconColor : 'grey'">mdi-book-open-variant</v-icon>
            </v-avatar>
            <v-icon
              v-if="isCelebration"
              class="reading-celebration-mark"
              color="amber-darken-3"
              icon="mdi-star-four-points"
              size="16"
              :title="celebrationLabel"
            ></v-icon>
          </div>
        </template>
        <v-list-item-title class="reading-title">
          Чытанні
        </v-list-item-title>
        <v-list-item-subtitle v-if="!readingItem">
          Чытанні для гэтай даты не знойдзены
        </v-list-item-subtitle>
        <template #append>
          <v-icon
            v-if="readingItem"
            icon="mdi-chevron-right"
            size="large"
            class="ml-1"
          ></v-icon>
        </template>
      </v-list-item>
      <v-divider class="mb-2"></v-divider>

      <div v-if="isAdmin && !readingItem" class="mb-4">
        <v-btn
          color="deep-purple"
          variant="tonal"
          prepend-icon="mdi-book-plus"
          @click="goToCreateReading"
        >
          Стварыць чытанне
        </v-btn>
      </div>

      <template v-if="dayData">
        <div v-for="(ora, index) in oras" :key="ora.name">
          <v-list-item :to="ora.path">
            <template v-slot:prepend>
              <v-icon :icon="ora.icon" size="large"></v-icon>
            </template>
            <v-list-item-title class="text-h6 font-weight-regular mb-1">
              {{ ora.title }}
            </v-list-item-title>
            <template v-slot:append>
              <v-icon icon="mdi-chevron-right" size="large"></v-icon>
            </template>
          </v-list-item>
          <v-divider v-if="index < oras.length - 1"></v-divider>
        </div>
      </template>

      <v-alert v-else type="info" variant="tonal" border="start" class="mt-2">
        Літургічныя гадзіны для гэтага дня не знойдзены.
        <div v-if="isAdmin" class="mt-3">
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus-box" @click="goToCreateDay">
            Стварыць літургічны дзень
          </v-btn>
        </div>
      </v-alert>
    </v-list>
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import moment from '@/utils/moment-be';

import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import { RANK_LABEL_MAP } from '@/constants/liturgical';

const route = useRoute();
const router = useRouter();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.isAdmin);

const dayId = computed(() => route.params.id);
const dateParam = computed(() => route.params.day);

const { day: dayData, pending: loadingDay } = useResolvedLiturgicalDay();

const readings = ref([]);
const dayOptions = ref([]);
const loadingReadings = ref(true);
const templateOptions = computed(() => (
  dayOptions.value.find((option) => option.templates?.some((item) => item.id === dayId.value))?.templates || []
));

const loadingOra = computed(() => loadingDay.value || loadingReadings.value);

const READING_THEMES = Object.freeze({
  ordinary: {
    color: '#2e7d32',
    rgb: '46, 125, 50',
    avatarColor: 'green-lighten-4',
    iconColor: 'green-darken-3',
  },
  advent: {
    color: '#6a1b9a',
    rgb: '106, 27, 154',
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-3',
  },
  lent: {
    color: '#6a1b9a',
    rgb: '106, 27, 154',
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-3',
  },
  holyweek: {
    color: '#4a148c',
    rgb: '74, 20, 140',
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-4',
  },
  christmas: {
    color: '#a66f00',
    rgb: '166, 111, 0',
    avatarColor: 'amber-lighten-4',
    iconColor: 'amber-darken-4',
  },
  easter: {
    color: '#a66f00',
    rgb: '166, 111, 0',
    avatarColor: 'amber-lighten-4',
    iconColor: 'amber-darken-4',
  },
  default: {
    color: '#455a64',
    rgb: '69, 90, 100',
    avatarColor: 'blue-grey-lighten-4',
    iconColor: 'blue-grey-darken-2',
  },
});

const readingTheme = computed(() => (
  READING_THEMES[dayData.value?._periodType] || READING_THEMES.default
));

const celebrationRank = computed(() => dayData.value?._rank || dayData.value?._feastType || '');
const isCelebration = computed(() => (
  ['solemnitas', 'solemnity', 'festum', 'feast'].includes(celebrationRank.value)
));
const celebrationLabel = computed(() => RANK_LABEL_MAP[celebrationRank.value] || 'Свята');

const readingCardStyle = computed(() => ({
  '--reading-color': readingTheme.value.color,
  '--reading-color-rgb': readingTheme.value.rgb,
}));

const oras = computed(() => [
  {
    name: 'invitatorium',
    title: 'Заклік (Invitatorium)',
    subtitle: 'Уступная малітва, якая папярэднічае першай малітоўнай гадзіне дня.',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam.value}/ora/${dayId.value}/invitatorium`,
    tag: 'Уступ',
    tagColor: 'blue-grey',
  },
  {
    name: 'morning',
    title: 'Раніца',
    subtitle: 'Заклік, Гадзіна чытанняў і Ютрань у адной ранішняй малітве.',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam.value}/ora/${dayId.value}/morning`,
    tag: 'Раніца',
    tagColor: 'orange-darken-3',
  },
  {
    name: 'laudes',
    title: 'Ютрань (Laudes)',
    subtitle: 'Ранішняя хвала, якая асвячае пачатак дня.',
    icon: 'mdi-weather-sunny',
    path: `/day/${dateParam.value}/ora/${dayId.value}/laudes`,
    tag: 'Галоўная',
    tagColor: 'amber-darken-3',
  },
  {
    name: 'lectionis',
    title: 'Гадзіна Чытанняў',
    subtitle: 'Разважанне над Святым Пісаннем і творамі Айцоў Касцёла.',
    icon: 'mdi-book-open-page-variant',
    path: `/day/${dateParam.value}/ora/${dayId.value}/lectionis`,
    tag: 'Разважанне',
    tagColor: 'brown',
  },
  {
    name: 'terz',
    title: 'Трэцяя гадзіна',
    subtitle: 'Кароткая малітва сярод раніцы.',
    icon: 'mdi-clock-time-nine-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/terz`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'sext',
    title: 'Шостая гадзіна',
    subtitle: 'Кароткая малітва апоўдні.',
    icon: 'mdi-clock-time-twelve-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/sext`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'non',
    title: 'Дзевятая гадзіна',
    subtitle: 'Кароткая малітва пасля поўдня.',
    icon: 'mdi-clock-time-three-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/non`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'vesper',
    title: 'Нешпары (Vesper)',
    subtitle: 'Вячэрняя хвала, падзяка за пражыты дзень.',
    icon: 'mdi-weather-night',
    path: `/day/${dateParam.value}/ora/${dayId.value}/vesper`,
    tag: 'Галоўная',
    tagColor: 'indigo-darken-3',
  },
  {
    name: 'completorium',
    title: 'Камплета (Completorium)',
    subtitle: 'Малітва перад сном, рахунак сумлення.',
    icon: 'mdi-bed-clock',
    path: `/day/${dateParam.value}/ora/${dayId.value}/completorium`,
    tag: 'Завяршэнне',
    tagColor: 'deep-purple',
  },
]);

// Always link to parsedData readings view for the current date
const readingItem = computed(() => {
  if (!dateParam.value) return null;
  return {
    id: dateParam.value,
    title: 'Чытанні',
    path: `/readings/${dateParam.value}`,
  };
});

const selectTemplate = (id) => {
  if (!id || id === dayId.value) return;
  router.replace({ name: 'oras', params: { day: dateParam.value, id } });
};

const loadReadings = async () => {
  try {
    loadingReadings.value = true;
    readings.value = [];
    const mDate = moment(dateParam.value, 'YYYY-MM-DD').startOf('day');
    const result = await getLiturgicalContentForDate(mDate.toDate());
    dayOptions.value = Array.isArray(result.dayOptions) ? result.dayOptions : [];
    readings.value = Array.isArray(result.itemsReadings)
      ? result.itemsReadings
      : [];
  } catch (e) {
    logger.error('[OrasList] Памылка пры загрузцы чытанняў:', e);
    readings.value = [];
  } finally {
    loadingReadings.value = false;
  }
};

const goToCreateDay = () => {
  const mDate = moment(dateParam.value, 'YYYY-MM-DD').startOf('day');
  const weekDay = mDate.isoWeekday();
  const periodCandidate = readings.value.find((item) => item._periodType);
  router.push({
    name: 'AdminDayEditor',
    params: { id: 'new' },
    query: {
      _periodType: periodCandidate?._periodType || '',
      _periodWeekNumber: periodCandidate?._periodWeekNumber || '',
      _dayOfWeek: periodCandidate?._dayOfWeek || weekDay,
    },
  });
};

const goToCreateReading = () => {
  const mDate = moment(dateParam.value, 'YYYY-MM-DD').startOf('day');
  const periodCandidate = dayData.value || null;

  router.push({
    name: 'ReadingsTest',
    query: {
      type: periodCandidate?._periodType ? 'period' : 'date',
      _periodType: periodCandidate?._periodType || '',
      _periodWeekNumber: periodCandidate?._periodWeekNumber || '',
      _dayOfWeek: periodCandidate?._dayOfWeek || mDate.isoWeekday(),
      _date: mDate.format('YYYY-MM-DD'),
    },
  });
};

watch(dateParam, (newDateParam) => {
  if (newDateParam) {
    loadReadings();
  }
}, { immediate: true });
</script>

<style scoped>
.reading-card {
  border-inline-start: 3px solid var(--reading-color) !important;
  background-color: rgba(var(--reading-color-rgb), 0.045);
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

.reading-card:hover {
  background-color: rgba(var(--reading-color-rgb), 0.09);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.reading-card--celebration {
  border-color: rgba(183, 128, 0, 0.5) !important;
  border-inline-start-color: var(--reading-color) !important;
  background: linear-gradient(
    120deg,
    rgba(var(--reading-color-rgb), 0.07),
    rgba(255, 193, 7, 0.12)
  );
  box-shadow: inset 0 0 0 1px rgba(255, 193, 7, 0.12);
}

.reading-card--celebration:hover {
  background: linear-gradient(
    120deg,
    rgba(var(--reading-color-rgb), 0.12),
    rgba(255, 193, 7, 0.17)
  );
}

.reading-avatar-wrap {
  position: relative;
}

.reading-celebration-mark {
  position: absolute;
  top: -5px;
  right: -6px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}

.reading-title {
  color: var(--reading-color);
  font-weight: 500;
  font-size: 1.05rem;
}

.reading-subtitle {
  font-size: 0.9rem;
  opacity: 0.8;
}

.template-toggle {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  height: auto !important;
}

.template-toggle :deep(.v-btn) {
  flex: 1 1 auto;
  min-height: 46px;
  height: auto;
  padding-top: 10px;
  padding-bottom: 10px;
}

.template-toggle :deep(.v-btn__content) {
  line-height: 1.35;
  white-space: normal;
  text-align: center;
}

/* на маленьких экранах чуть компактнее */
@media (max-width: 600px) {
  .reading-title {
    font-size: 1rem;
  }
  .reading-subtitle {
    font-size: 0.85rem;
  }
}
</style>
