<template>
  <v-container class="oras-list-container">
    <div v-if="dayData" class="oras-hero-block">
      <day-title :day-data="dayData" variant="hero" />
      <div v-if="templateOptions.length > 1" class="template-panel">
        <div class="template-label">
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

    <!-- Чытанні — першы, вылучаны пункт агульнага спісу літургічных гадзін -->
    <v-list v-else bg-color="transparent" class="ora-options-list" :style="readingCardStyle">
      <v-list-item
        :to="readingItem ? readingItem.path : undefined"
        :disabled="!readingItem"
        class="reading-card"
        :class="{ 'reading-card--celebration': isCelebration }"
        :style="readingCardStyle"
      >
        <template #prepend>
          <v-badge
            :model-value="isCelebration"
            color="transparent"
            location="top end"
          >
            <template #badge>
              <v-icon
                class="reading-celebration-mark"
                color="amber-darken-3"
                icon="mdi-star-four-points"
                size="16"
                :title="celebrationLabel"
              ></v-icon>
            </template>
            <v-avatar class="reading-icon-wrap" :color="readingTheme.avatarColor" size="48">
              <v-icon :color="readingItem ? readingTheme.iconColor : 'grey'">mdi-book-open-variant</v-icon>
            </v-avatar>
          </v-badge>
        </template>
        <v-list-item-title class="reading-title">
          Чытанні
        </v-list-item-title>
        <v-list-item-subtitle v-if="readingSubtitle" class="reading-subtitle">
          {{ readingSubtitle }}
        </v-list-item-subtitle>
        <template #append>
          <v-icon
            v-if="readingItem"
            icon="mdi-chevron-right"
            size="large"
            class="ora-card__arrow"
          ></v-icon>
        </template>
      </v-list-item>

      <template v-if="dayData">
        <div v-for="ora in oras" :key="ora.name">
          <v-list-item :to="ora.path" class="ora-card">
            <template v-slot:prepend>
              <span class="ora-card__icon-wrap">
                <v-icon :icon="ora.icon" size="25"></v-icon>
              </span>
            </template>
            <v-list-item-title class="ora-card__title">
              {{ ora.title }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="ora.subtitle" class="ora-card__subtitle">
              {{ ora.subtitle }}
            </v-list-item-subtitle>
            <template v-slot:append>
              <v-icon class="ora-card__arrow" icon="mdi-chevron-right" size="24"></v-icon>
            </template>
          </v-list-item>
        </div>
      </template>

      <div v-if="isAdmin && !readingItem" class="mt-4">
        <v-btn
          color="deep-purple"
          variant="tonal"
          prepend-icon="mdi-book-plus"
          @click="goToCreateReading"
        >
          Стварыць чытанне
        </v-btn>
      </div>

      <v-alert v-if="!dayData" type="info" variant="tonal" border="start" class="mt-2">
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
import { useParsedReadings } from '@/composables/useParsedReadings';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import {
  LITURGICAL_THEME_MAP,
  RANK_LABEL_MAP,
  getLiturgicalCelebrationThemeKey,
  getLiturgicalTheme,
} from '@/constants/liturgical';

const route = useRoute();
const router = useRouter();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const {
  items: parsedReadings,
  isLoading: loadingParsedReadings,
  loadForDate: loadParsedReadingsForDate,
} = useParsedReadings();
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

const loadingOra = computed(() => (
  loadingDay.value || loadingReadings.value || loadingParsedReadings.value
));

const READING_THEMES = Object.freeze({
  ordinary: {
    ...LITURGICAL_THEME_MAP.ordinary,
    avatarColor: 'green-lighten-4',
    iconColor: 'green-darken-3',
  },
  advent: {
    ...LITURGICAL_THEME_MAP.advent,
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-3',
  },
  lent: {
    ...LITURGICAL_THEME_MAP.lent,
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-3',
  },
  holyweek: {
    ...LITURGICAL_THEME_MAP.holyweek,
    avatarColor: 'purple-lighten-4',
    iconColor: 'purple-darken-4',
  },
  christmas: {
    ...LITURGICAL_THEME_MAP.christmas,
    avatarColor: 'amber-lighten-4',
    iconColor: 'amber-darken-4',
  },
  easter: {
    ...LITURGICAL_THEME_MAP.easter,
    avatarColor: 'amber-lighten-4',
    iconColor: 'amber-darken-4',
  },
  default: {
    ...LITURGICAL_THEME_MAP.default,
    avatarColor: 'blue-grey-lighten-4',
    iconColor: 'blue-grey-darken-2',
  },
});

const readingTheme = computed(() => (
  dayData.value?._theme === 'requiem'
    ? {
      ...LITURGICAL_THEME_MAP.requiem,
      avatarColor: 'blue-grey-lighten-4',
      iconColor: 'blue-grey-darken-3',
    }
    : {
      ...(READING_THEMES[dayData.value?._periodType] || READING_THEMES.default),
      ...getLiturgicalTheme(dayData.value, dayData.value?._periodType),
      ...(getLiturgicalCelebrationThemeKey(dayData.value) === 'red'
        ? { avatarColor: 'red-lighten-4', iconColor: 'red-darken-3' }
        : {}),
      ...(getLiturgicalCelebrationThemeKey(dayData.value) === 'gold'
        ? { avatarColor: 'amber-lighten-4', iconColor: 'amber-darken-4' }
        : {}),
      ...(getLiturgicalCelebrationThemeKey(dayData.value) === 'white'
        ? { avatarColor: 'grey-lighten-4', iconColor: 'brown-darken-2' }
        : {}),
    }
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
    title: 'Заклік',
    subtitle: 'Invitatorium',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam.value}/ora/${dayId.value}/invitatorium`,
    tag: 'Уступ',
    tagColor: 'blue-grey',
  },
  {
    name: 'morning',
    title: 'Агульная гадзіна',
    subtitle: 'Invitatorium · Officium lectionis · Laudes',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam.value}/ora/${dayId.value}/morning`,
    tag: 'Раніца',
    tagColor: 'orange-darken-3',
  },
  {
    name: 'laudes',
    title: 'Ютрань',
    subtitle: 'Laudes matutinae',
    icon: 'mdi-weather-sunny',
    path: `/day/${dateParam.value}/ora/${dayId.value}/laudes`,
    tag: 'Галоўная',
    tagColor: 'amber-darken-3',
  },
  {
    name: 'lectionis',
    title: 'Гадзіна чытанняў',
    subtitle: 'Officium lectionis',
    icon: 'mdi-book-open-page-variant',
    path: `/day/${dateParam.value}/ora/${dayId.value}/lectionis`,
    tag: 'Разважанне',
    tagColor: 'brown',
  },
  {
    name: 'terz',
    title: 'Малітва перад поўднем',
    subtitle: 'Tertia',
    icon: 'mdi-clock-time-nine-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/terz`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'sext',
    title: 'Малітва апоўдні',
    subtitle: 'Sexta',
    icon: 'mdi-clock-time-twelve-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/sext`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'non',
    title: 'Малітва пасля поўдня',
    subtitle: 'Nona',
    icon: 'mdi-clock-time-three-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/non`,
    tag: 'Малая',
    tagColor: 'teal',
  },
  {
    name: 'vesper',
    title: 'Нешпары',
    subtitle: 'Vesperae',
    icon: 'mdi-weather-night',
    path: `/day/${dateParam.value}/ora/${dayId.value}/vesper`,
    tag: 'Галоўная',
    tagColor: 'indigo-darken-3',
  },
  {
    name: 'completorium',
    title: 'Камплета',
    subtitle: 'Completorium',
    icon: 'mdi-bed-clock',
    path: `/day/${dateParam.value}/ora/${dayId.value}/completorium`,
    tag: 'Завяршэнне',
    tagColor: 'deep-purple',
  },
]);

const readingReferences = computed(() => {
  const references = parsedReadings.value.flatMap((reading) => (
    ['reading1', 'reading2', 'gospel']
      .map((section) => String(reading?.[section]?.bible || '').trim())
      .filter(Boolean)
  ));
  return [...new Set(references)];
});

const readingSubtitle = computed(() => {
  if (readingReferences.value.length) return readingReferences.value.join(' · ');
  if (!readingItem.value) return 'Чытанні для гэтай даты не знойдзены';
  return 'Чытанні і Евангелле';
});

// Always link to parsedData readings view for the current date
const readingItem = computed(() => {
  if (!dateParam.value) return null;
  return {
    id: dateParam.value,
    title: 'Чытанні',
    path: dayData.value?._readingsFromDay
      ? `/readings/${dateParam.value}?returnDayId=${encodeURIComponent(dayId.value || '')}`
      : `/readings/${dateParam.value}?dayId=${encodeURIComponent(dayId.value || '')}`,
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
    const [result] = await Promise.all([
      getLiturgicalContentForDate(mDate.toDate()),
      loadParsedReadingsForDate(mDate.toDate(), {
        dayId: dayId.value === 'office-for-dead' ? '' : dayId.value || '',
      }),
    ]);
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
.oras-list-container {
  width: min(100%, 760px);
  max-width: 760px;
  padding-top: 10px;
}

.oras-hero-block {
  margin: 0 12px 22px;
}

.template-panel {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--nav-border);
  border-radius: 20px;
  background: var(--nav-surface);
}

.template-label {
  margin: 0 4px 9px;
  color: var(--nav-muted);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ora-options-list {
  --reading-visible-color: var(--reading-color);
  --reading-visible-color: color-mix(
    in srgb,
    var(--reading-color) var(--period-accent-weight),
    var(--period-accent-target)
  );
  display: grid;
  gap: 12px;
  padding: 0 12px !important;
}

.ora-card,
.reading-card {
  min-height: 80px;
  padding: 14px 14px 14px 16px !important;
  border: 1px solid var(--nav-border);
  border-radius: 22px !important;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.ora-card:hover,
.reading-card:hover {
  border-color: rgba(var(--reading-color-rgb, 85, 112, 124), 0.25);
  box-shadow: 0 7px 22px var(--nav-button-shadow);
}

.ora-card:active,
.reading-card:active {
  transform: scale(0.988);
}

.reading-card {
  border-color: rgba(var(--reading-color-rgb), 0.24);
  background:
    linear-gradient(120deg, rgba(var(--reading-color-rgb), 0.13), rgba(var(--reading-color-rgb), 0.025) 70%),
    var(--nav-surface);
}

.reading-card--celebration {
  background: linear-gradient(
    120deg,
    rgba(var(--reading-color-rgb), 0.15),
    rgba(255, 193, 7, 0.1)
  ), var(--nav-surface);
}

.reading-card--celebration:hover {
  background: linear-gradient(
    120deg,
    rgba(var(--reading-color-rgb), 0.19),
    rgba(255, 193, 7, 0.13)
  ), var(--nav-surface);
}

.reading-celebration-mark {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}

.reading-title {
  color: var(--reading-visible-color);
  font-weight: 700;
  font-size: clamp(1.04rem, 4vw, 1.17rem);
}

.reading-subtitle {
  font-size: 0.82rem;
  color: var(--nav-muted);
  opacity: 1;
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

.ora-card__icon-wrap {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(var(--reading-color-rgb), 0.18);
  border-radius: 16px;
  background: rgba(var(--reading-color-rgb), 0.13);
  color: var(--reading-visible-color);
}

.ora-card__title {
  padding-inline: 4px 8px;
  font-size: clamp(1.04rem, 4vw, 1.17rem) !important;
  font-weight: 650;
  line-height: 1.36 !important;
  letter-spacing: -0.01em;
}

.ora-card__subtitle {
  padding: 3px 8px 0 4px;
  color: var(--nav-muted);
  font-size: 0.82rem !important;
  font-weight: 520;
  line-height: 1.3 !important;
  letter-spacing: 0.01em;
}

:deep(.reading-card .v-list-item-subtitle),
:deep(.ora-card .v-list-item-subtitle) {
  display: block !important;
  overflow: visible !important;
  white-space: normal !important;
  text-overflow: clip !important;
  -webkit-line-clamp: unset !important;
}

.ora-card__arrow {
  color: var(--nav-muted);
}

:deep(.ora-card .v-list-item__prepend),
:deep(.reading-card .v-list-item__prepend) {
  align-self: center;
  margin-inline-end: 12px;
}

:deep(.ora-card .v-list-item__append),
:deep(.reading-card .v-list-item__append) {
  align-self: center;
}

.template-toggle :deep(.v-btn__content) {
  line-height: 1.35;
  white-space: normal;
  text-align: center;
}

/* на маленьких экранах чуть компактнее */
@media (max-width: 600px) {
  .oras-list-container {
    padding: 8px 4px !important;
  }

  .oras-hero-block {
    margin-inline: 8px;
  }

  .ora-options-list {
    padding-inline: 8px !important;
  }

  .reading-title {
    font-size: 1.04rem;
  }
  .reading-subtitle {
    font-size: 0.85rem;
  }
}

@media (max-width: 359px) {
  .ora-card,
  .reading-card {
    padding-inline: 12px 10px !important;
    border-radius: 20px !important;
  }

  .ora-card__icon-wrap,
  .reading-icon-wrap {
    width: 44px !important;
    height: 44px !important;
  }

  :deep(.ora-card .v-list-item__prepend),
  :deep(.reading-card .v-list-item__prepend) {
    margin-inline-end: 8px;
  }
}
</style>
