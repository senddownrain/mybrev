<template>
  <v-container class="oras-list-container">
    <div v-if="dayData" class="oras-hero-block">
      <day-title :day-data="dayData" variant="hero" />
      <div v-if="templateOptions.length > 1" class="template-panel">
        <div class="template-label">
          {{ templateLabel }}
        </div>
        <v-btn-toggle
          :model-value="selectedTemplateId"
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
            <v-avatar class="reading-icon-wrap" size="48">
              <v-icon>mdi-book-open-variant</v-icon>
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
            <v-chip
              v-if="ora.rubric"
              class="mt-2 vespers-rubric-chip"
              :class="`vespers-rubric-chip--${ora.rubric.kind}`"
              density="compact"
              :prepend-icon="ora.rubric.icon || undefined"
              size="small"
              :style="ora.rubricStyle"
              variant="tonal"
            >
              <span class="vespers-rubric__line" aria-hidden="true"></span>
              <span class="vespers-rubric__label" v-html="ora.rubric.labelHtml"></span>
            </v-chip>
            <template v-slot:append>
              <v-icon class="ora-card__arrow" icon="mdi-chevron-right" size="24"></v-icon>
            </template>
          </v-list-item>
        </div>
      </template>

      <div v-if="isAdmin && !readingItem" class="mt-4">
        <v-btn
          color="primary"
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
import { useReadings } from '@/composables/useReadings';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth';
import DayTitle from '@/components/oraparts/DayTitle.vue';
import {
  PLACE_LABEL_MAP,
  RANK_LABEL_MAP,
  getLiturgicalTheme,
} from '@/constants/liturgical';
import { eveningVespersModel } from '@/utils/liturgicalVespers';

const route = useRoute();
const router = useRouter();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const {
  items: readings,
  loadForDate: loadReadingsForDate,
} = useReadings();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.isAdmin);

const dayId = computed(() => route.params.id);
const dateParam = computed(() => route.params.day);

const { day: dayData, pending: loadingDay } = useResolvedLiturgicalDay();

const dayOptions = ref([]);
const tomorrowContent = ref(null);
// II Vespers vs I Vespers of tomorrow: the Ordo descriptor of the selected
// Office decides (legacy heuristics only for days without a descriptor).
const eveningModel = computed(() => (
  dayId.value === 'office-for-dead' ? { firstVespers: null, local: [], second: false }
    : eveningVespersModel(dayData.value, tomorrowContent.value, {
      isoWeekday: moment(String(dateParam.value), ['YYYY-MM-DD', 'DD-MM-YYYY'], true).isoWeekday(),
    })
));
const tomorrowFirstVespers = computed(() => eveningModel.value.firstVespers);
const localTomorrowFirstVespers = computed(() => eveningModel.value.local);
const templateContainsDay = (template, id) => (
  template?.id === id || template?.dayIds?.includes(id)
);
const templateOptions = computed(() => (
  dayOptions.value.find((option) => (
    option.templates?.some((template) => templateContainsDay(template, dayId.value))
  ))?.templates || []
));
// A memorial may take the rest of its texts from the day or from a Common.
const templateLabel = computed(() => (
  templateOptions.value.some((template) => template.choice === 'current-day') ? 'Астатнія тэксты' : 'Шаблон літургіі дня'
));
const selectedTemplateId = computed(() => (
  templateOptions.value.find((template) => templateContainsDay(template, dayId.value))?.id
    || dayId.value
));

// The selected day is the only render-blocking resource. Readings and
// tomorrow's first Vespers enrich the screen after its saved content appears.
const loadingOra = computed(() => loadingDay.value);

// The icon and the card must follow the same celebration override. A second
// period-only icon palette could leave a Marian feast in Lent looking purple.
const readingTheme = computed(() => (
  getLiturgicalTheme(dayData.value, dayData.value?._periodType)
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

function getVespersRubricStyle(rubricDay) {
  const theme = getLiturgicalTheme(rubricDay, rubricDay?._periodType);
  return {
    '--vespers-rubric-color': theme.color,
    '--vespers-rubric-rgb': theme.rgb,
  };
}

const vespersRubricStyle = computed(() => (
  getVespersRubricStyle(tomorrowFirstVespers.value?.day || dayData.value)
));

const vespersRubric = computed(() => {
  if (tomorrowFirstVespers.value) return {
    labelHtml: formatTitleHtml(`I Нешпары · ${tomorrowFirstVespers.value.title}`),
    kind: 'first',
    icon: '',
  };
  if (eveningModel.value.second) return {
    labelHtml: 'II Нешпары',
    kind: 'second',
    icon: '',
  };
  return null;
});

// Назва свята надходзіць з даных: дазваляем толькі <br>, а іншыя тэгі экраніруем.
function formatTitleHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\?&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\r?\n/g, '<br>');
}

function localFirstVespersLabel(item) {
  const places = (item.places || []).map((place) => PLACE_LABEL_MAP[place] || place);
  return ['I Нешпары', item.title, ...places].filter(Boolean).join(' · ');
}

const oras = computed(() => [
  {
    name: 'invitatorium',
    title: 'Заклік',
    subtitle: 'Invitatorium',
    icon: 'mdi-weather-sunset-up',
    path: `/day/${dateParam.value}/ora/${dayId.value}/invitatorium`,
    tag: 'Уступ',
  },
  {
    name: 'morning',
    title: 'Агульная гадзіна',
    subtitle: 'Invitatorium · Officium lectionis · Laudes',
    icon: 'mdi-sun-clock-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/morning`,
    tag: 'Раніца',
  },
  {
    name: 'lectionis',
    title: 'Гадзіна чытанняў',
    subtitle: 'Officium lectionis',
    icon: 'mdi-book-open-page-variant',
    path: `/day/${dateParam.value}/ora/${dayId.value}/lectionis`,
    tag: 'Разважанне',
  },
  {
    name: 'laudes',
    title: 'Ютрань',
    subtitle: 'Laudes matutinae',
    icon: 'mdi-weather-sunny',
    path: `/day/${dateParam.value}/ora/${dayId.value}/laudes`,
    tag: 'Галоўная',
  },
  {
    name: 'terz',
    title: 'Малітва перад поўднем',
    subtitle: 'Tertia',
    icon: 'mdi-clock-time-nine-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/terz`,
    tag: 'Малая',
  },
  {
    name: 'sext',
    title: 'Малітва апоўдні',
    subtitle: 'Sexta',
    icon: 'mdi-clock-time-twelve-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/sext`,
    tag: 'Малая',
  },
  {
    name: 'non',
    title: 'Малітва пасля поўдня',
    subtitle: 'Nona',
    icon: 'mdi-clock-time-three-outline',
    path: `/day/${dateParam.value}/ora/${dayId.value}/non`,
    tag: 'Малая',
  },
  {
    name: 'vesper',
    title: 'Нешпары',
    subtitle: 'Vesperae',
    icon: 'mdi-weather-night',
    path: `/day/${dateParam.value}/ora/${dayId.value}/vesper`,
    tag: 'Галоўная',
    rubric: vespersRubric.value,
    rubricStyle: vespersRubricStyle.value,
  },
  ...localTomorrowFirstVespers.value.map((item, index) => ({
    name: `vesper-first-${item.sourceDayId || index}`,
    title: 'Нешпары',
    subtitle: 'Vesperae',
    icon: 'mdi-weather-night-partly-cloudy',
    path: {
      name: 'vesper',
      params: { day: dateParam.value, id: dayId.value },
      query: { firstVespersDayId: item.sourceDayId },
    },
    tag: 'Галоўная',
    rubric: {
      labelHtml: formatTitleHtml(localFirstVespersLabel(item)),
      kind: 'first',
      icon: '',
    },
    rubricStyle: getVespersRubricStyle(item.day),
  })),
  {
    name: 'completorium',
    title: 'Камплета',
    subtitle: 'Completorium',
    icon: 'mdi-bed-clock',
    path: `/day/${dateParam.value}/ora/${dayId.value}/completorium`,
    tag: 'Завяршэнне',
  },
]);

const readingReferences = computed(() => {
  const references = readings.value.flatMap((reading) => (
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

// Always link to the readings view for the current date.
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

let contentLoadSequence = 0;
const loadReadings = async () => {
  const sequence = ++contentLoadSequence;
  const mDate = moment(dateParam.value, 'YYYY-MM-DD').startOf('day');
  tomorrowContent.value = null;

  getLiturgicalContentForDate(mDate.clone().add(1, 'day').toDate()).then((content) => {
    if (sequence !== contentLoadSequence) return;
    tomorrowContent.value = content;
  }).catch((error) => logger.error('[OrasList] Памылка загрузкі заўтрашняга дня:', error));

  try {
    const [result] = await Promise.all([
      getLiturgicalContentForDate(mDate.toDate()),
      loadReadingsForDate(mDate.toDate(), {
        dayId: dayId.value === 'office-for-dead' ? '' : dayId.value || '',
      }),
    ]);
    if (sequence !== contentLoadSequence) return;
    dayOptions.value = Array.isArray(result.dayOptions) ? result.dayOptions : [];
  } catch (e) {
    logger.error('[OrasList] Памылка пры загрузцы чытанняў:', e);
  }
};

const goToCreateDay = () => {
  const mDate = moment(dateParam.value, 'YYYY-MM-DD').startOf('day');
  const weekDay = mDate.isoWeekday();
  const periodCandidate = dayData.value
    || dayOptions.value.find((option) => option.day?._periodType)?.day
    || null;
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
    name: 'AdminParsedReadingEditor',
    params: { id: 'new' },
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

.reading-icon-wrap {
  background: rgba(var(--reading-color-rgb), 0.14);
  color: var(--reading-visible-color);
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

.vespers-rubric-chip {
  width: fit-content;
  max-width: 100%;
  height: auto !important;
  min-height: 22px;
  padding-inline: 2px !important;
  white-space: normal;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--vespers-rubric-color) 34%, var(--nav-muted)) !important;
  font-size: 0.68rem !important;
  font-weight: 750;
  letter-spacing: 0.03em;
}

.vespers-rubric-chip :deep(.v-chip__content) {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.35;
  white-space: normal;
}

.vespers-rubric__line {
  width: 16px;
  height: 1px;
  flex: 0 0 16px;
  margin-right: 7px;
  background: rgba(var(--vespers-rubric-rgb), 0.26);
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
