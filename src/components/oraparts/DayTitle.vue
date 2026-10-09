<template>
  <!-- Используем наш глобальный класс для автоматического применения стилей -->
  <div class="mb-6 day-title-container" :style="heroStyle">
    
    <!-- Индикатор загрузки -->
    <v-skeleton-loader v-if="loading" type="heading, subtitle"></v-skeleton-loader>

    <!-- Основной контент, когда данные загружены -->
    <div v-else-if="resolvedDay" class="day-title-content">
      <div v-if="isHero" class="day-title-hero">
        <div class="day-title-hero__eyebrow">
          <v-icon icon="mdi-circle-slice-8" size="14"></v-icon>
          <span>{{ periodLabel }}</span>
          <span v-if="psalterWeekLabel" class="day-title__eyebrow-separator" aria-hidden="true">·</span>
          <span v-if="psalterWeekLabel">{{ psalterWeekLabel }}</span>
        </div>
        <h1 v-html="displayTitleHtml"></h1>
        <div class="day-title-hero__footer">
          <span class="day-title-hero__date">
            <v-icon icon="mdi-calendar-blank-outline" size="17"></v-icon>
            {{ formattedDate }}
          </span>
          <span v-if="dayMeta" class="day-title-hero__rank">{{ dayMeta }}</span>
        </div>
      </div>

      <div v-else class="day-title-standard">
        <div class="day-title-standard__eyebrow">
          <span>{{ periodLabel }}</span>
          <span v-if="psalterWeekLabel" class="day-title__eyebrow-separator" aria-hidden="true">·</span>
          <span v-if="psalterWeekLabel">{{ psalterWeekLabel }}</span>
        </div>
        <h1 v-html="displayTitleHtml"></h1>
        <div class="day-title-standard__meta">
          <span class="day-title-standard__marker" aria-hidden="true"></span>
          <span>{{ formattedDate }}</span>
          <span v-if="dayMeta" class="day-title-standard__rank">{{ dayMeta }}</span>
        </div>
      </div>

      <div v-if="isHero && dayComment" class="day-title-comment-disclosure">
        <button
          type="button"
          class="day-title-comment-toggle"
          :aria-expanded="commentExpanded"
          aria-controls="day-title-comment-content"
          @click="commentExpanded = !commentExpanded"
        >
          <span class="day-title-comment-toggle__label">
            <v-icon icon="mdi-text-box-outline" size="20"></v-icon>
            Заўвага да дня
          </span>
          <v-icon
            class="day-title-comment-toggle__chevron"
            :class="{ 'day-title-comment-toggle__chevron--open': commentExpanded }"
            icon="mdi-chevron-down"
            size="22"
          ></v-icon>
        </button>
        <v-expand-transition>
          <div
            v-show="commentExpanded"
            id="day-title-comment-content"
            class="day-title-comment day-title-comment--hero ora-text text-start"
            v-html="dayComment"
          ></div>
        </v-expand-transition>
      </div>

      <div
        v-else-if="dayComment"
        class="day-title-comment ora-text text-start mt-5"
        v-html="dayComment"
      ></div>
     
    </div>

    <!-- Сообщение, если данные не загрузились -->
    <div v-else class="text-grey">
      Немагчыма вызначыць назву дня
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import {
  PERIOD_LABEL_MAP,
  FEAST_TYPE_LABEL_MAP,
  getLiturgicalTheme,
} from '@/constants/liturgical';
import { formatDateLong } from '@/utils/date';
import { useResolvedLiturgicalDay } from '@/composables/useResolvedLiturgicalDay';
import { isSeasonalDateDocumentId } from '@/utils/liturgicalDayResolution';
import { formatLiturgicalPeriodTitle } from '@/utils/liturgicalPeriodTitle';
import { calculatePsalterWeek, formatPsalterWeekLabel } from '@/utils/liturgicalPsalter';

const props = defineProps({
  dayData: { type: Object, default: null },
  variant: { type: String, default: 'default' },
});
const route = useRoute();
const routeDay = props.dayData ? null : useResolvedLiturgicalDay();
const resolvedDay = computed(() => props.dayData || routeDay?.day.value || null);
const loading = computed(() => props.dayData ? false : routeDay?.pending.value);
const isHero = computed(() => props.variant === 'hero');
const commentExpanded = ref(false);
const dayComment = computed(() => (
  resolvedDay.value?.feastComment || resolvedDay.value?.comment || ''
));

watch(
  () => resolvedDay.value?.id,
  () => { commentExpanded.value = false; },
);
const displayTitle = computed(() => {
  const day = resolvedDay.value;
  if (!day) return '';
  const hasCelebrationIdentity = day._feast || day._rank || day._feastType;
  if (day._kind === 'office-for-dead') return day._feastName || day._title || 'Афіцый за памерлых';
  const isChristmasDateDay = day._periodType === 'christmas'
    && (isSeasonalDateDocumentId(day.id) || (!day._feast && !day._rank && !day._feastType));
  if ((day._periodType && !hasCelebrationIdentity) || isChristmasDateDay) {
    return getPeriodTitle(day);
  }
  if (day._feastName) return day._feastName;
  return day._title || getPeriodTitle(day);
});

// Названия дней хранятся в данных и не должны вставляться как произвольный HTML.
// Разрешаем только <br> для многострочных названий, например праздника Святой Сям'і.
const displayTitleHtml = computed(() => String(displayTitle.value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\\?&lt;br\s*\/?&gt;/gi, '<br>')
  .replace(/\r?\n/g, '<br>'));

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
  if (day._kind === 'office-for-dead') return '';
  const rank = day._rank || day._feastType;
  return rank ? getRankName(rank) : '';
});
const psalterWeek = computed(() => calculatePsalterWeek({
  date: route.params.day,
  periodType: resolvedDay.value?._periodType,
  periodWeek: resolvedDay.value?._periodWeekNumber,
}));
const psalterWeekLabel = computed(() => formatPsalterWeekLabel(psalterWeek.value));
const periodLabel = computed(() => (
  resolvedDay.value?._kind === 'office-for-dead'
    ? 'Памінальны афіцый'
    : PERIOD_LABEL_MAP[resolvedDay.value?._periodType] || 'Літургічны дзень'
));
const heroStyle = computed(() => {
  const theme = getLiturgicalTheme(resolvedDay.value, resolvedDay.value?._periodType);
  return {
    '--liturgical-color': theme.color,
    '--liturgical-rgb': theme.rgb,
  };
});

// Формирование заголовка для дня периода
const getPeriodTitle = (day) => {
  if (!day || !day._periodType) return 'Літургія гадзінаў';

  const routeDate = moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
  const routeDayOfWeek = routeDate.isValid()
    ? (routeDate.isoWeekday() === 7 ? 1 : routeDate.isoWeekday() + 1)
    : null;
  const periodWeek = day._periodWeekNumber
    ?? (day._periodType === 'christmas' && routeDate.isValid() ? (routeDate.month() === 11 ? 1 : 2) : null);
  const dayOfWeek = day._dayOfWeek ?? routeDayOfWeek;
  return formatLiturgicalPeriodTitle({
    periodType: day._periodType,
    periodWeek,
    dayOfWeek,
    date: route.params.day,
  });
};
</script>

<style scoped>
/* Запрещаем выделение текста и появление каретки в заголовке дня */
.day-title-container {
  position: relative;
  isolation: isolate;
  --liturgical-visible-color: var(--liturgical-color);
  --liturgical-visible-color: color-mix(
    in srgb,
    var(--liturgical-color) var(--period-accent-weight),
    var(--period-accent-target)
  );
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

.day-title-container::before {
  position: absolute;
  z-index: -1;
  inset: -42px -34px -54px;
  border-radius: 48px;
  background: radial-gradient(
    ellipse at 76% 24%,
    rgba(var(--liturgical-rgb), var(--ambient-strength, 0.14)),
    transparent 68%
  );
  content: "";
  filter: blur(10px);
  pointer-events: none;
}

.day-title-content {
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.day-title-content * {
  pointer-events: none;
}

.day-title-standard {
  position: relative;
  padding: 24px 26px 22px;
  overflow: hidden;
  border: 1px solid rgba(var(--liturgical-rgb), 0.2);
  border-radius: 28px;
  background:
    radial-gradient(circle at 92% 18%, rgba(var(--liturgical-rgb), 0.16) 0, rgba(var(--liturgical-rgb), 0.16) 44px, transparent 45px),
    linear-gradient(145deg, rgba(var(--liturgical-rgb), 0.1), transparent 62%),
    var(--nav-surface);
  box-shadow: 0 5px 20px var(--nav-button-shadow);
  text-align: left;
}

.day-title-standard__eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--liturgical-visible-color);
  font-size: 0.68rem !important;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.day-title__eyebrow-separator {
  opacity: 0.55;
}

.day-title-container .day-title-standard h1 {
  max-width: 100%;
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(clamp(1.85rem, 6vw, 2.35rem) * var(--font-size-multiplier, 1)) !important;
  font-family: var(--reader-display-font-family) !important;
  font-weight: 700 !important;
  line-height: 1.08 !important;
  letter-spacing: -0.012em;
  overflow-wrap: anywhere;
  text-align: left !important;
}

.day-title-standard__meta {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  color: var(--nav-muted);
  font-size: calc(0.92rem * var(--font-size-multiplier, 1)) !important;
  font-weight: 600;
  line-height: 1.4;
}

.day-title-standard__marker {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border: 2px solid rgba(var(--liturgical-rgb), 0.28);
  border-radius: 50%;
  background: var(--liturgical-visible-color);
  box-shadow: 0 0 0 4px rgba(var(--liturgical-rgb), 0.09);
}

.day-title-standard__rank {
  margin-left: auto;
  color: var(--nav-muted);
  font-size: 0.78em !important;
  font-weight: 650;
  text-align: right !important;
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
  box-shadow: var(--hero-shadow);
  text-align: left;
}

.day-title-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--liturgical-visible-color);
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
  font-family: var(--reader-display-font-family) !important;
  font-weight: 700 !important;
  line-height: 1.05 !important;
  letter-spacing: -0.016em;
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
  color: var(--liturgical-visible-color);
  font-size: 0.72rem !important;
  font-weight: 750;
  line-height: 1.2;
  white-space: nowrap;
}

.day-title-comment-disclosure {
  margin-top: 12px;
  pointer-events: auto !important;
}

.day-title-comment-toggle {
  display: flex;
  width: 100%;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--nav-border);
  border-radius: 18px;
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
  cursor: pointer;
  font: inherit;
  pointer-events: auto !important;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.16s ease, transform 0.16s ease;
}

.day-title-comment-toggle:hover {
  border-color: rgba(var(--liturgical-rgb), 0.3);
}

.day-title-comment-toggle:active {
  transform: scale(0.99);
}

.day-title-comment-toggle:focus-visible {
  outline: 3px solid rgba(var(--liturgical-rgb), 0.25);
  outline-offset: 2px;
}

.day-title-comment-toggle__label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--liturgical-visible-color);
  font-size: 0.9rem !important;
  font-weight: 700;
}

.day-title-comment-toggle__chevron {
  color: var(--nav-muted);
  transition: transform 0.2s ease;
}

.day-title-comment-toggle__chevron--open {
  transform: rotate(180deg);
}

.day-title-comment--hero {
  margin-top: 8px;
  padding: 16px;
  border: 1px solid var(--nav-border);
  border-radius: 18px;
  background: rgba(var(--liturgical-rgb), 0.055);
  pointer-events: auto !important;
}

/* Масштабирование текста заголовка дня */
.day-title-container,
.day-title-container * {
  font-family: var(--ui-font-family) !important;
}

.day-title-container :is(.day-title-standard, .day-title-hero) h1 {
  font-family: var(--reader-display-font-family) !important;
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
  .day-title-container::before {
    inset: -26px -6px -38px;
    border-radius: 34px;
    filter: blur(8px);
  }

  .day-title-container {
    padding: 0;
    margin-bottom: 16px;
  }

  .day-title-standard {
    margin-inline: 8px;
    padding: 21px 20px 19px;
    border-radius: 24px;
  }

  .day-title-container .day-title-standard h1 {
    font-size: calc(clamp(1.55rem, 7vw, 2rem) * var(--font-size-multiplier, 1)) !important;
    line-height: 1.16 !important;
  }

  .day-title-standard__meta {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .day-title-standard__rank {
    width: 100%;
    margin-left: 18px;
    text-align: left !important;
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
