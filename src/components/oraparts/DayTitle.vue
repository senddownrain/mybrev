<template>
  <!-- Используем наш глобальный класс для автоматического применения стилей -->
  <div class="prayer-content-area text-center mb-6 day-title-container">
    
    <!-- Индикатор загрузки -->
    <v-skeleton-loader v-if="loading" type="heading, subtitle"></v-skeleton-loader>

    <!-- Основной контент, когда данные загружены -->
    <div v-else-if="resolvedDay" class="day-title-content">
      <!-- 1. Полная дата -->
      <div class="day-title-meta text-grey-darken-1" v-html="formattedDate"></div>
        
      
      <!-- 2. Название праздника или дня периода -->
      <h1 class="text-h4 font-weight-light mt-1">
        {{ displayTitle }}
      </h1>
      
      <!-- 3. Ранг праздника или псалтырь -->
      <p
        v-if="resolvedDay._rank || resolvedDay._feastType || resolvedDay._psalmWeek"
        class="day-title-meta text-grey-darken-1 mt-1"
      >
        {{ resolvedDay._rank || resolvedDay._feastType ? getRankName(resolvedDay._rank || resolvedDay._feastType) : resolvedDay._psalmWeek }}
      </p>

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
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP, FEAST_TYPE_LABEL_MAP } from '@/constants/liturgical';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { isSeasonalDateDocumentId } from '@/utils/liturgicalDayResolution';

const props = defineProps({ dayData: { type: Object, default: null } });
const route = useRoute();
const routeDay = props.dayData ? null : useResolvedLiturgicalDay();
const resolvedDay = computed(() => props.dayData || routeDay?.day.value || null);
const loading = computed(() => props.dayData ? false : routeDay?.pending.value);
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
  const dateStr = mDate.format('D MMMM YYYY г.');
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
});

// Перевод ранга на белорусский
const getRankName = (rank) => FEAST_TYPE_LABEL_MAP[rank] || rank;

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
}
</style>
