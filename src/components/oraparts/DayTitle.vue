<template>
  <!-- Используем наш глобальный класс для автоматического применения стилей -->
  <div class="prayer-content-area text-center mb-6 day-title-container">
    
    <!-- Индикатор загрузки -->
    <v-skeleton-loader v-if="loading" type="heading, subtitle"></v-skeleton-loader>

    <!-- Основной контент, когда данные загружены -->
    <div v-else-if="resolvedDay" class="day-title-content">
      <div v-if="isHero" class="day-title-hero" :style="heroStyle">
        <div class="day-title-hero__eyebrow">
          <v-icon icon="mdi-circle-slice-8" size="14"></v-icon>
          {{ periodLabel }}
        </div>
        <h1>{{ displayTitle }}</h1>
        <div class="day-title-hero__footer">
          <span class="day-title-hero__date">
            <v-icon icon="mdi-calendar-blank-outline" size="17"></v-icon>
            {{ formattedDate }}
          </span>
          <span v-if="dayMeta" class="day-title-hero__rank">{{ dayMeta }}</span>
        </div>
      </div>

      <template v-else>
        <div class="day-title-meta text-grey-darken-1">{{ formattedDate }}</div>
        <h1 class="text-h4 font-weight-light mt-1">
          {{ displayTitle }}
        </h1>
        <p v-if="dayMeta" class="day-title-meta text-grey-darken-1 mt-1">
          {{ dayMeta }}
        </p>
      </template>

      <div
        v-if="resolvedDay.feastComment || resolvedDay.comment"
        class="day-title-comment ora-text text-start mt-5"
        v-html="resolvedDay.feastComment || resolvedDay.comment"
      ></div>
     
    </div>

    <!-- Сообщение, если данные не загрузились -->
    <div v-else class="text-grey">
      Немагчыма вызначыць назву дня
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import {
  PERIOD_LABEL_MAP,
  WEEKDAY_LABEL_MAP,
  FEAST_TYPE_LABEL_MAP,
  LITURGICAL_THEME_MAP,
} from '@/constants/liturgical';
import { formatDateLong } from '@/utils/date';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { isSeasonalDateDocumentId } from '@/utils/liturgicalDayResolution';

const props = defineProps({
  dayData: { type: Object, default: null },
  variant: { type: String, default: 'default' },
});
const route = useRoute();
const routeDay = props.dayData ? null : useResolvedLiturgicalDay();
const resolvedDay = computed(() => props.dayData || routeDay?.day.value || null);
const loading = computed(() => props.dayData ? false : routeDay?.pending.value);
const isHero = computed(() => props.variant === 'hero');
const displayTitle = computed(() => {
  const day = resolvedDay.value;
  if (!day) return '';
  const isChristmasDateDay = day._periodType === 'christmas'
    && (isSeasonalDateDocumentId(day.id) || (!day._feast && !day._rank && !day._feastType));
  if (isChristmasDateDay) {
    return getPeriodTitle(day);
  }
  if (day._feastName) return day._feastName;
  return day._title || getPeriodTitle(day);
});

// --- Форматирование даты ---
// Берем полную дату из параметра URL (:day) и форматируем ее
const formattedDate = computed(() => {
  if (!route.params.day) return '';
  // Используем массив форматов для надежности, как мы делали раньше
  const mDate = moment(route.params.day, ['YYYY-MM-DD', 'DD-MM-YYYY']);
  if (!mDate.isValid()) return '';
  // Форматируем в красивый вид, например, "18 верасня 2025 г."
  const dateStr = `${formatDateLong(mDate.toDate())} г.`;
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
});

// Перевод ранга на белорусский
const getRankName = (rank) => FEAST_TYPE_LABEL_MAP[rank] || rank;
const dayMeta = computed(() => {
  const day = resolvedDay.value;
  if (!day) return '';
  const rank = day._rank || day._feastType;
  return rank ? getRankName(rank) : (day._psalmWeek || '');
});
const periodLabel = computed(() => (
  PERIOD_LABEL_MAP[resolvedDay.value?._periodType] || 'Літургічны дзень'
));
const heroStyle = computed(() => {
  const theme = LITURGICAL_THEME_MAP[resolvedDay.value?._periodType]
    || LITURGICAL_THEME_MAP.default;
  return {
    '--liturgical-color': theme.color,
    '--liturgical-rgb': theme.rgb,
  };
});

// Формирование заголовка для дня периода
const getPeriodTitle = (day) => {
  if (!day || !day._periodType) return 'Літургія Гадзінаў';

  const routeDate = moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
  const routeDayOfWeek = routeDate.isValid()
    ? (routeDate.isoWeekday() === 7 ? 1 : routeDate.isoWeekday() + 1)
    : null;
  const periodWeek = day._periodWeekNumber
    ?? (day._periodType === 'christmas' && routeDate.isValid() ? (routeDate.month() === 11 ? 1 : 2) : null);
  const dayOfWeek = day._dayOfWeek ?? routeDayOfWeek;
  const periodName = PERIOD_LABEL_MAP[day._periodType] || 'Перыяд';
  const dayName = WEEKDAY_LABEL_MAP[dayOfWeek] || '';

  if (day._periodType === 'christmas' && Number(periodWeek) === 1) {
    return `${dayName} у Актаве Нараджэння Пана`;
  }

  const inlineDayName = dayName
    ? `${dayName.charAt(0).toLowerCase()}${dayName.slice(1)}`
    : '';
  return [periodName, periodWeek ? `${periodWeek} тыдзень` : '', inlineDayName]
    .filter(Boolean)
    .join(', ');
};
</script>

<style scoped>
/* Запрещаем выделение текста и появление каретки в заголовке дня */
.day-title-container {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  /*
   * overflow-x: hidden на .prayer-content-area вычисляется браузером как
   * overflow-y: auto. Из-за дробной высоты заголовка это создавало локальный
   * вертикальный скроллбар даже при переполнении меньше одного пикселя.
   */
  overflow-x: clip;
  overflow-y: visible;
}

.day-title-content {
  pointer-events: none;
}

.day-title-content * {
  pointer-events: none;
}

.day-title-hero {
  position: relative;
  display: flex;
  min-height: 190px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 24px;
  overflow: hidden;
  border: 1px solid rgba(var(--liturgical-rgb), 0.25);
  border-radius: 28px;
  background:
    radial-gradient(circle at 92% 14%, rgba(var(--liturgical-rgb), 0.3) 0, rgba(var(--liturgical-rgb), 0.3) 44px, transparent 45px),
    linear-gradient(145deg, rgba(var(--liturgical-rgb), 0.16), rgba(var(--liturgical-rgb), 0.04) 66%),
    var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 8px 28px var(--nav-button-shadow);
  text-align: left;
}

.day-title-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--liturgical-color);
  font-size: 0.72rem !important;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.day-title-container .day-title-hero h1 {
  max-width: 100%;
  margin: 0;
  font-size: clamp(1.65rem, 6.6vw, 2.55rem) !important;
  font-weight: 720 !important;
  line-height: 1.08 !important;
  letter-spacing: -0.035em;
  overflow-wrap: anywhere;
  text-align: left !important;
}

.day-title-hero__footer {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  margin-top: 15px;
  color: var(--nav-muted);
}

.day-title-hero__date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.92rem !important;
  font-weight: 600;
}

.day-title-hero__rank {
  margin-left: auto;
  padding: 5px 9px;
  border: 1px solid rgba(var(--liturgical-rgb), 0.2);
  border-radius: 999px;
  background: rgba(var(--liturgical-rgb), 0.12);
  color: var(--liturgical-color);
  font-size: 0.72rem !important;
  font-weight: 750;
  line-height: 1.2;
  white-space: nowrap;
}

/* Масштабирование текста заголовка дня */
.day-title-container,
.day-title-container * {
  font-family: var(--app-font-family, sans-serif) !important;
}

.day-title-container h1,
.day-title-container .text-h4 {
  font-size: calc(2rem * var(--font-size-multiplier, 1)) !important;
  line-height: 1.3 !important;
}

.day-title-container .day-title-meta {
  font-size: calc(0.875rem * var(--font-size-multiplier, 1)) !important;
  line-height: 1.4;
}

.day-title-container .day-title-comment {
  font-size: calc(1.1rem * var(--font-size-multiplier, 1)) !important;
  line-height: 1.65 !important;
}

@media (max-width: 600px) {
  .day-title-container {
    padding: 0 8px;
    margin-bottom: 16px;
  }

  .day-title-container h1,
  .day-title-container .text-h4 {
    font-size: calc(1.3rem * var(--font-size-multiplier, 1)) !important;
    line-height: 1.3 !important;
  }

  .day-title-container .day-title-meta {
    font-size: calc(0.85rem * var(--font-size-multiplier, 1)) !important;
  }

  .day-title-hero {
    min-height: 184px;
    padding: 20px;
  }

  .day-title-container .day-title-hero h1 {
    font-size: clamp(1.58rem, 7vw, 2.1rem) !important;
    line-height: 1.1 !important;
  }

  .day-title-hero__footer {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .day-title-hero__rank {
    margin-left: 0;
  }
}
</style>
