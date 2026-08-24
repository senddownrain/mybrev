<template>
  <div class="period-picker">
    <section class="picker-step">
      <div class="step-heading">
        <span>01</span>
        <div>
          <h2>Літургічны перыяд</h2>
          <p>Спачатку выберыце частку літургічнага года</p>
        </div>
      </div>
      <div class="choice-grid choice-grid--periods">
        <button
          v-for="period in periodOptions"
          :key="period.value"
          type="button"
          class="choice-button period-button"
          :class="[
            `period-button--${period.value}`,
            { 'choice-button--active': selectedPeriod === period.value },
          ]"
          @click="selectedPeriod = period.value"
        >
          <span class="period-dot" />
          {{ period.title }}
        </button>
      </div>
    </section>

    <section v-if="selectedPeriod" class="picker-step">
      <div class="step-heading">
        <span>02</span>
        <div>
          <h2>Тыдзень</h2>
          <p>Нумар тыдня ў абраным перыядзе</p>
        </div>
      </div>
      <div class="choice-grid choice-grid--numbers">
        <button
          v-for="week in availableWeeks"
          :key="week"
          type="button"
          class="choice-button number-button"
          :class="{ 'choice-button--active': selectedWeek === week }"
          @click="selectedWeek = week"
        >
          {{ week }}
        </button>
      </div>
    </section>

    <section v-if="selectedPeriod && selectedWeek" class="picker-step">
      <div class="step-heading">
        <span>03</span>
        <div>
          <h2>Дзень тыдня</h2>
          <p>Пакажам сапраўдную дату ў {{ year }} годзе</p>
        </div>
      </div>
      <div class="choice-grid choice-grid--weekdays">
        <button
          v-for="day in dayOfWeekOptions"
          :key="day.value"
          type="button"
          class="choice-button weekday-button"
          :class="{ 'choice-button--active': selectedDayOfWeek === day.value }"
          @click="selectedDayOfWeek = day.value"
        >
          <span>{{ day.short }}</span>
          <small>{{ day.title }}</small>
        </button>
      </div>
    </section>

    <section v-if="hasCompleteSelection" class="result-section" aria-live="polite">
      <div v-if="loading" class="result-state">
        <v-progress-circular indeterminate color="primary" size="28" width="3" />
        <span>Правяраем каляндарную дату…</span>
      </div>

      <template v-else-if="dayOptions.length">
        <div class="result-date">
          <div class="result-date-icon"><PhCalendarCheck :size="22" /></div>
          <div>
            <span>Знойдзеная дата</span>
            <strong>{{ formattedDate }}</strong>
          </div>
        </div>

        <div class="result-list">
          <button
            v-for="option in dayOptions"
            :key="option.key"
            type="button"
            class="result-card"
            :disabled="mode === 'oras' && !option.dayId"
            @click="selectOption(option)"
          >
            <div class="result-card-copy">
              <span class="result-source">{{ option.subtitle }}</span>
              <strong>{{ option.title }}</strong>
              <div class="result-badges">
                <span v-if="option.hasReadings"><PhBookOpenText :size="14" /> ёсць чытанні</span>
                <span v-if="option.templates?.length > 1">{{ option.templates.length }} варыянты</span>
              </div>
            </div>
            <span class="result-arrow"><PhArrowRight :size="19" /></span>
          </button>
        </div>
      </template>

      <div v-else class="empty-state">
        <PhCalendarX :size="34" />
        <strong>{{ resultMessage }}</strong>
        <p>Паспрабуйце іншы тыдзень або дзень.</p>
        <v-btn
          v-if="isAdmin"
          variant="tonal"
          rounded="pill"
          class="mt-3"
          @click="createDay"
        >
          Стварыць шаблон дня
        </v-btn>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import {
  PhArrowRight,
  PhBookOpenText,
  PhCalendarCheck,
  PhCalendarX,
} from '@phosphor-icons/vue';

const props = defineProps({
  year: { type: Number, required: true },
  mode: { type: String, default: 'oras' },
});

const emit = defineEmits(['day-selected']);
const router = useRouter();
const { calculateDateForPeriod } = useLiturgicalDay();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const authStore = useAuthStore();

const selectedPeriod = ref(null);
const selectedWeek = ref(null);
const selectedDayOfWeek = ref(null);
const dayOptions = ref([]);
const calculatedDate = ref('');
const loading = ref(false);
const resultMessage = ref('Для гэтай пазіцыі няма каляндарнай даты.');
let searchSequence = 0;

const isAdmin = computed(() => authStore.isAdmin);
const hasCompleteSelection = computed(() => Boolean(
  selectedPeriod.value && selectedWeek.value && selectedDayOfWeek.value,
));

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({ value, title }));
const weekdayShort = { 1: 'Нд', 2: 'Пн', 3: 'Аў', 4: 'Ср', 5: 'Чц', 6: 'Пт', 7: 'Сб' };
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({
  value: Number(value),
  title,
  short: weekdayShort[value],
}));

const maxWeeksForPeriod = {
  ordinary: 34,
  advent: 4,
  christmas: 2,
  lent: 5,
  holyweek: 1,
  easter: 7,
};

const availableWeeks = computed(() => Array.from(
  { length: maxWeeksForPeriod[selectedPeriod.value] || 0 },
  (_, index) => index + 1,
));

const formattedDate = computed(() => (
  calculatedDate.value
    ? moment(calculatedDate.value, 'YYYY-MM-DD').format('dddd, D MMMM YYYY')
    : ''
));

watch(selectedPeriod, () => {
  selectedWeek.value = null;
  selectedDayOfWeek.value = null;
  resetResult();
});

watch(selectedWeek, () => {
  selectedDayOfWeek.value = null;
  resetResult();
});

watch(
  [() => props.year, selectedPeriod, selectedWeek, selectedDayOfWeek],
  async ([year, period, week, day]) => {
    if (!period || !week || !day) return;
    await searchDay(year, period, week, day);
  },
);

function resetResult() {
  searchSequence += 1;
  dayOptions.value = [];
  calculatedDate.value = '';
  loading.value = false;
}

async function searchDay(year, periodType, periodWeekNumber, dayOfWeek) {
  const sequence = ++searchSequence;
  loading.value = true;
  dayOptions.value = [];
  calculatedDate.value = '';

  try {
    const date = await calculateDateForPeriod(year, periodType, periodWeekNumber, dayOfWeek);
    if (sequence !== searchSequence) return;
    if (!date) {
      resultMessage.value = 'Такога тыдня ў выбраным годзе няма.';
      return;
    }

    const result = await getLiturgicalContentForDate(date);
    if (sequence !== searchSequence) return;

    const matchesSelection = result?.context?.periodType === periodType
      && Number(result?.context?.periodWeek) === Number(periodWeekNumber)
      && Number(result?.context?.dayOfWeek) === Number(dayOfWeek);

    if (!matchesSelection) {
      resultMessage.value = 'Гэтая пазіцыя выходзіць за межы перыяду ў выбраным годзе.';
      return;
    }

    calculatedDate.value = date;
    dayOptions.value = Array.isArray(result?.dayOptions) ? result.dayOptions : [];
    if (!dayOptions.value.length) {
      resultMessage.value = 'Дата існуе, але літургічны дзень яшчэ не дададзены.';
    }
  } catch (error) {
    logger.error('Памылка пры пошуку дня:', error);
    resultMessage.value = 'Не атрымалася праверыць каляндар. Паспрабуйце яшчэ раз.';
  } finally {
    if (sequence === searchSequence) loading.value = false;
  }
}

function selectOption(option) {
  if (!calculatedDate.value) return;
  const dayId = option.dayId || option.templates?.[0]?.id || '';
  if (props.mode === 'oras' && !dayId) return;
  emit('day-selected', { dayId, date: calculatedDate.value });
}

function createDay() {
  router.push({
    name: 'AdminDayEditor',
    params: { id: 'new' },
    query: {
      _periodType: selectedPeriod.value,
      _periodWeekNumber: selectedWeek.value,
      _dayOfWeek: selectedDayOfWeek.value,
    },
  });
}
</script>

<style scoped>
.period-picker {
  display: grid;
  gap: 16px;
}

.picker-step,
.result-section {
  padding: 18px;
  border: 1px solid var(--nav-border);
  border-radius: 26px;
  background: var(--nav-surface);
  box-shadow: 0 7px 24px var(--nav-button-shadow);
}

.step-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.step-heading > span {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 12px;
  background: var(--nav-active);
  color: var(--nav-on-surface);
  font-size: 0.72rem;
  font-weight: 800;
}

.step-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 750;
  line-height: 1.25;
}

.step-heading p {
  margin: 3px 0 0;
  color: var(--nav-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.choice-grid {
  display: grid;
  gap: 8px;
}

.choice-grid--periods {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice-grid--numbers {
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
}

.choice-grid--weekdays {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.choice-button {
  min-height: 48px;
  border: 1px solid var(--nav-border);
  border-radius: 15px;
  background: transparent;
  color: var(--nav-muted);
  font: inherit;
  font-weight: 680;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.14s ease;
}

.choice-button:active {
  transform: scale(0.97);
}

.choice-button--active {
  background: var(--nav-active);
  color: var(--nav-on-surface);
}

.period-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
}

.period-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border-radius: 50%;
  background: #4f8a55;
}

.period-button--advent .period-dot,
.period-button--lent .period-dot,
.period-button--holyweek .period-dot { background: #76528d; }
.period-button--christmas .period-dot,
.period-button--easter .period-dot { background: #c7952f; }

.weekday-button {
  display: grid;
  min-width: 0;
  padding: 7px 2px;
  place-items: center;
}

.weekday-button span {
  font-size: 0.86rem;
}

.weekday-button small {
  display: none;
}

.result-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--nav-muted);
}

.result-state {
  gap: 12px;
}

.result-date {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.result-date-icon,
.result-arrow {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--nav-active);
  color: var(--nav-on-surface);
}

.result-date-icon {
  width: 46px;
  height: 46px;
}

.result-date > div:last-child {
  display: grid;
}

.result-date span,
.result-source {
  color: var(--nav-muted);
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.04em;
}

.result-date strong {
  font-size: 1rem;
  text-transform: capitalize;
}

.result-list {
  display: grid;
  gap: 8px;
}

.result-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 15px;
  border: 1px solid var(--nav-border);
  border-radius: 19px;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.result-card:disabled {
  opacity: 0.55;
  cursor: default;
}

.result-card-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.result-card-copy > strong {
  font-size: 1rem;
  line-height: 1.35;
}

.result-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.result-badges span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--nav-muted);
  font-size: 0.72rem;
}

.result-arrow {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
}

.empty-state {
  flex-direction: column;
  padding: 16px;
  text-align: center;
}

.empty-state strong {
  margin-top: 10px;
  color: var(--nav-on-surface);
}

.empty-state p {
  margin: 4px 0 0;
  font-size: 0.82rem;
}

@media (min-width: 620px) {
  .weekday-button small {
    display: block;
    margin-top: 2px;
    font-size: 0.64rem;
    font-weight: 600;
  }
}

@media (max-width: 430px) {
  .picker-step,
  .result-section {
    padding: 15px;
    border-radius: 23px;
  }

  .choice-grid--periods {
    grid-template-columns: 1fr;
  }

  .choice-grid--numbers {
    grid-template-columns: repeat(6, 1fr);
  }
}
</style>
