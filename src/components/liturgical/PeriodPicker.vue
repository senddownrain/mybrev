<template>
  <div class="period-picker">
    <section class="picker-step">
      <div class="step-heading">
        <span>01</span>
        <div>
          <h2>Літургічны перыяд</h2>
          <p>Выберыце перыяд, а затым патрэбны дзень</p>
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
          @click="selectPeriod(period.value)"
        >
          <span class="period-dot" />
          {{ period.title }}
        </button>
      </div>
    </section>

    <!-- Advent: weeks 1–3 plus the privileged date entities, 17–24 Dec. -->
    <section v-if="selectedPeriod === 'advent'" class="picker-step">
      <div class="step-heading">
        <span>02</span>
        <div>
          <h2>Тыдзень або асобная дата</h2>
          <p>Тыдні 1–3 або канкрэтны дзень з 17 па 24 снежня</p>
        </div>
      </div>

      <div class="subsection-label">Тыдні 1–3</div>
      <div class="choice-grid choice-grid--numbers advent-weeks">
        <button
          v-for="week in 4"
          :key="week"
          type="button"
          class="choice-button number-button"
          :class="{ 'choice-button--active': selectedWeek === week }"
          :disabled="week === 4"
          :title="week === 4 ? 'Дні 4-га тыдня выбіраюцца ніжэй па даце' : ''"
          @click="selectWeek(week)"
        >
          {{ week }}
          <small v-if="week === 4">па датах</small>
        </button>
      </div>

      <div class="special-divider"><span>17–24 снежня</span></div>
      <DateChoiceGrid
        :items="adventDateOptions"
        :selected-date="selectedExactDate"
        @select="selectExactDate"
      />
    </section>

    <!-- Christmas is date-only in both days and readings. -->
    <section v-else-if="selectedPeriod === 'christmas'" class="picker-step">
      <div class="step-heading">
        <span>02</span>
        <div>
          <h2>Каляндарная дата</h2>
          <p>Выберыце дзень ад Божага Нараджэння да Хросту Пана</p>
        </div>
      </div>
      <DateChoiceGrid
        :items="christmasDateOptions"
        :selected-date="selectedExactDate"
        grouped
        @select="selectExactDate"
      />
    </section>

    <section v-else-if="selectedPeriod === 'lent'" class="picker-step">
      <div class="step-heading">
        <span>02</span>
        <div>
          <h2>Пачатак Вялікага посту</h2>
          <p>Папялец і тры наступныя дні перад першай нядзеляй</p>
        </div>
      </div>

      <div class="choice-grid lent-opening-grid">
        <button
          v-for="day in lentOpeningDays"
          :key="day.value"
          type="button"
          class="choice-button lent-opening-button"
          :class="{ 'choice-button--active': selectedWeek === 0 && selectedDayOfWeek === day.value }"
          @click="selectLentOpeningDay(day.value)"
        >
          <strong>{{ day.title }}</strong>
          <small>{{ day.subtitle }}</small>
        </button>
      </div>

      <div class="special-divider"><span>Тыдні 1–5</span></div>
      <div class="choice-grid choice-grid--numbers">
        <button
          v-for="week in availableWeeks"
          :key="week"
          type="button"
          class="choice-button number-button"
          :class="{ 'choice-button--active': selectedWeek === week }"
          @click="selectWeek(week)"
        >
          {{ week }}
        </button>
      </div>
    </section>

    <!-- Every other period except Holy Week still uses a week selector. -->
    <section v-else-if="selectedPeriod && selectedPeriod !== 'holyweek'" class="picker-step">
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
          @click="selectWeek(week)"
        >
          {{ week }}
        </button>
      </div>
    </section>

    <!-- Holy Week skips the meaningless single-week step. -->
    <section v-if="showWeekdayStep" class="picker-step">
      <div class="step-heading">
        <span>{{ selectedPeriod === 'holyweek' ? '02' : '03' }}</span>
        <div>
          <h2>{{ selectedPeriod === 'holyweek' ? 'Дзень Вялікага тыдня' : 'Дзень тыдня' }}</h2>
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
          @click="selectDay(day.value)"
        >
          <span>{{ day.short }}</span>
          <small>{{ day.title }}</small>
        </button>
      </div>
    </section>

    <section v-if="hasCompleteSelection" class="result-section" aria-live="polite">
      <div v-if="loading" class="result-state">
        <v-progress-circular indeterminate color="primary" size="28" width="3" />
        <span>{{ loadingLabel }}</span>
      </div>

      <template v-else-if="resultOptions.length">
        <div class="result-date">
          <div class="result-date-icon"><PhCalendarCheck :size="22" /></div>
          <div>
            <span>{{ exactDateSelection ? 'Каляндарная дата' : 'Знойдзеная дата' }}</span>
            <strong>{{ formattedDate }}</strong>
          </div>
        </div>

        <div class="result-list">
          <button
            v-for="option in resultOptions"
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
                <span v-if="option.readingCount">
                  <PhBookOpenText :size="14" /> {{ readingCountLabel(option.readingCount) }}
                </span>
                <span v-if="option.templates?.length > 1">{{ option.templates.length }} варыянты літургіі</span>
              </div>
            </div>
            <span class="result-arrow"><PhArrowRight :size="19" /></span>
          </button>
        </div>
      </template>

      <div v-else class="empty-state">
        <PhCalendarX :size="34" />
        <strong>{{ resultMessage }}</strong>
        <p>{{ emptyHint }}</p>
        <v-btn
          v-if="isAdmin && !exactDateSelection && mode === 'oras'"
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
import { computed, defineComponent, h, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { useLiturgicalStore } from '@/stores/liturgical';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
import { buildAdventDateOptions, buildChristmasDateOptions } from '@/utils/liturgicalPicker';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';
import { PhArrowRight, PhBookOpenText, PhCalendarCheck, PhCalendarX } from '@phosphor-icons/vue';

const DateChoiceGrid = defineComponent({
  name: 'DateChoiceGrid',
  props: {
    items: { type: Array, required: true },
    selectedDate: { type: String, default: '' },
    grouped: { type: Boolean, default: false },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const renderButton = (item) => h('button', {
        key: item.isoDate,
        type: 'button',
        class: [
          'date-choice-button',
          { 'date-choice-button--active': props.selectedDate === item.isoDate },
        ],
        title: `${item.weekday}, ${item.day} ${item.month}`,
        onClick: () => emit('select', item),
      }, [
        h('strong', item.day),
        h('span', item.month),
        h('small', item.weekdayShort),
      ]);
    const renderGrid = (items) => h('div', { class: 'date-choice-grid' }, items.map(renderButton));

    return () => {
      if (!props.grouped) return renderGrid(props.items);
      const groups = new Map();
      props.items.forEach((item) => {
        const key = item.isoDate.slice(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      return h('div', { class: 'date-choice-groups' }, [...groups.values()].map((items) => h(
        'section',
        { class: 'date-choice-group', key: items[0].isoDate.slice(0, 7) },
        [
          h('div', { class: 'date-month-label' }, `${items[0].monthFull} ${items[0].year}`),
          renderGrid(items),
        ],
      )));
    };
  },
});

const props = defineProps({
  year: { type: Number, required: true },
  mode: { type: String, default: 'oras' },
});

const emit = defineEmits(['day-selected']);
const router = useRouter();
const { calculateDateForPeriod } = useLiturgicalDay();
const { getLiturgicalContentForDate } = useLiturgicalContent();
const liturgicalStore = useLiturgicalStore();
const authStore = useAuthStore();

const selectedPeriod = ref(null);
const selectedWeek = ref(null);
const selectedDayOfWeek = ref(null);
const selectedDateToken = ref('');
const resultOptions = ref([]);
const calculatedDate = ref('');
const loading = ref(false);
const resultMessage = ref('Для гэтага дня нічога не знойдзена.');
let searchSequence = 0;

const isAdmin = computed(() => authStore.isAdmin);
const periodOptions = [
  'advent',
  'christmas',
  'ordinary',
  'lent',
  'holyweek',
  'easter',
].map((value) => ({ value, title: PERIOD_LABEL_MAP[value] }));
const weekdayShort = { 1: 'Нд', 2: 'Пн', 3: 'Аў', 4: 'Ср', 5: 'Чц', 6: 'Пт', 7: 'Сб' };
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({
  value: Number(value),
  title,
  short: weekdayShort[value],
}));
const lentOpeningDays = [
  { value: 4, title: 'Папялец', subtitle: 'серада' },
  { value: 5, title: 'Чацвер', subtitle: 'пасля Папяльца' },
  { value: 6, title: 'Пятніца', subtitle: 'пасля Папяльца' },
  { value: 7, title: 'Субота', subtitle: 'пасля Папяльца' },
];

const maxWeeksForPeriod = { ordinary: 34, lent: 5, easter: 7 };
const availableWeeks = computed(() => Array.from(
  { length: maxWeeksForPeriod[selectedPeriod.value] || 0 },
  (_, index) => index + 1,
));
const adventDateOptions = computed(() => buildAdventDateOptions(props.year));
const christmasDateOptions = computed(() => buildChristmasDateOptions(props.year));
const currentDateOptions = computed(() => (
  selectedPeriod.value === 'advent' ? adventDateOptions.value
    : selectedPeriod.value === 'christmas' ? christmasDateOptions.value
      : []
));
const selectedExactDate = computed(() => (
  currentDateOptions.value.find((item) => item.token === selectedDateToken.value)?.isoDate || ''
));
const exactDateSelection = computed(() => Boolean(selectedExactDate.value));
const showWeekdayStep = computed(() => (
  selectedPeriod.value === 'holyweek'
  || Boolean(selectedPeriod.value && selectedWeek.value !== null
    && selectedWeek.value !== 0 && !exactDateSelection.value)
));
const hasCompleteSelection = computed(() => (
  exactDateSelection.value
  || Boolean(selectedPeriod.value && selectedWeek.value !== null && selectedDayOfWeek.value !== null)
));
const formattedDate = computed(() => calculatedDate.value
  ? moment(calculatedDate.value, 'YYYY-MM-DD').format('dddd, D MMMM YYYY')
  : '');
const loadingLabel = computed(() => props.mode === 'readings'
  ? 'Знаходзім чытанні…'
  : 'Знаходзім літургічныя гадзіны…');
const emptyHint = computed(() => props.mode === 'readings'
  ? 'На гэты дзень чытанняў няма.'
  : 'На гэты дзень няма літургічных гадзін.');

const selectionKey = computed(() => {
  if (selectedExactDate.value) return `date:${selectedExactDate.value}:${props.mode}`;
  if (selectedPeriod.value && selectedWeek.value !== null && selectedDayOfWeek.value !== null) {
    return `period:${props.year}:${selectedPeriod.value}:${selectedWeek.value}:${selectedDayOfWeek.value}:${props.mode}`;
  }
  return '';
});

watch(selectionKey, async (key) => {
  if (!key) return;
  await searchSelection();
});

function selectPeriod(period) {
  selectedPeriod.value = period;
  selectedWeek.value = period === 'holyweek' ? 1 : null;
  selectedDayOfWeek.value = null;
  selectedDateToken.value = '';
  resetResult();
}

function selectWeek(week) {
  if (selectedPeriod.value === 'advent' && week === 4) return;
  selectedWeek.value = week;
  selectedDayOfWeek.value = null;
  selectedDateToken.value = '';
  resetResult();
}

function selectDay(day) {
  selectedDayOfWeek.value = day;
  selectedDateToken.value = '';
}

function selectExactDate(option) {
  selectedDateToken.value = option.token;
  selectedWeek.value = null;
  selectedDayOfWeek.value = null;
  resetResult();
}

function resetResult() {
  searchSequence += 1;
  resultOptions.value = [];
  calculatedDate.value = '';
  loading.value = false;
}

function selectLentOpeningDay(day) {
  selectedWeek.value = 0;
  selectedDayOfWeek.value = day;
  selectedDateToken.value = '';
  resetResult();
}

async function searchSelection() {
  const sequence = ++searchSequence;
  loading.value = true;
  resultOptions.value = [];
  calculatedDate.value = '';

  try {
    const date = selectedExactDate.value || await calculateDateForPeriod(
      props.year,
      selectedPeriod.value,
      selectedWeek.value,
      selectedDayOfWeek.value,
    );
    if (sequence !== searchSequence) return;
    if (!date) {
      resultMessage.value = 'Такой пазіцыі ў выбраным годзе няма.';
      return;
    }
    if (!exactDateSelection.value
      && selectedPeriod.value === 'advent'
      && moment(date, 'YYYY-MM-DD').isSameOrAfter(moment(`${props.year}-12-17`, 'YYYY-MM-DD'), 'day')) {
      resultMessage.value = 'Пасля 16 снежня выберыце асобную каляндарную дату.';
      return;
    }

    if (props.mode === 'readings') {
      const result = await liturgicalStore.fetchReadingsByDate(date);
      if (sequence !== searchSequence) return;
      if (!exactDateSelection.value && !contextMatches(result?.context)) {
        resultMessage.value = 'Гэтая пазіцыя выходзіць за межы перыяду ў выбраным годзе.';
        return;
      }
      const readings = Array.isArray(result?.items) ? result.items : [];
      calculatedDate.value = date;
      resultOptions.value = readings.length ? [{
        key: `readings-${date}`,
        dayId: '',
        subtitle: 'Чытанні',
        title: `Чытанні на ${moment(date).format('D MMMM')}`,
        readingCount: readings.length,
      }] : [];
      if (!readings.length) resultMessage.value = 'Чытанні для гэтай даты не знойдзены.';
      return;
    }

    const result = await getLiturgicalContentForDate(date);
    if (sequence !== searchSequence) return;
    if (!exactDateSelection.value && !contextMatches(result?.context)) {
      resultMessage.value = 'Гэтая пазіцыя выходзіць за межы перыяду ў выбраным годзе.';
      return;
    }
    const options = Array.isArray(result?.dayOptions)
      ? result.dayOptions.filter((option) => option.hasLiturgicalDay)
      : [];
    calculatedDate.value = date;
    resultOptions.value = options;
    if (!options.length) resultMessage.value = 'Літургічны дзень для гэтай даты не знойдзены.';
  } catch (error) {
    logger.error('Памылка пры пошуку дня:', error);
    resultMessage.value = props.mode === 'readings'
      ? 'Не атрымалася загрузіць чытанні.'
      : 'Не атрымалася загрузіць літургічныя гадзіны.';
  } finally {
    if (sequence === searchSequence) loading.value = false;
  }
}

function contextMatches(context) {
  return context?.periodType === selectedPeriod.value
    && Number(context?.periodWeek) === Number(selectedWeek.value)
    && Number(context?.dayOfWeek) === Number(selectedDayOfWeek.value);
}

function selectOption(option) {
  if (!calculatedDate.value) return;
  const dayId = props.mode === 'readings'
    ? ''
    : (option.dayId || option.templates?.[0]?.id || '');
  if (props.mode === 'oras' && !dayId) return;
  emit('day-selected', { dayId, date: calculatedDate.value });
}

function readingCountLabel(count) {
  if (count === 1) return '1 камплект чытанняў';
  if ([2, 3, 4].includes(count)) return `${count} камплекты чытанняў`;
  return `${count} камплектаў чытанняў`;
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
.period-picker { display: grid; gap: 16px; }

.picker-step,
.result-section {
  padding: 18px;
  border: 1px solid var(--nav-border);
  border-radius: 26px;
  background: var(--nav-surface);
  box-shadow: 0 7px 24px var(--nav-button-shadow);
}

.step-heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.step-heading > span {
  display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center;
  border: 1px solid rgba(var(--chrome-accent-rgb), 0.18);
  border-radius: 12px; background: rgba(var(--chrome-accent-rgb), 0.1); color: var(--chrome-accent);
  font-size: 0.72rem; font-weight: 800;
}
.step-heading h2 { margin: 0; font-size: 1.05rem; font-weight: 750; line-height: 1.25; }
.step-heading p { margin: 3px 0 0; color: var(--nav-muted); font-size: 0.8rem; line-height: 1.35; }

.choice-grid { display: grid; gap: 8px; }
.choice-grid--periods { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.choice-grid--numbers { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); }
.choice-grid--weekdays { grid-template-columns: repeat(7, minmax(0, 1fr)); }

.choice-button {
  min-height: 48px; border: 1px solid var(--nav-border); border-radius: 15px;
  background: transparent; color: var(--nav-muted); font: inherit; font-weight: 680;
  cursor: pointer; transition: background 0.16s ease, color 0.16s ease, transform 0.14s ease;
}
.choice-button:active { transform: scale(0.97); }
.choice-button--active { border-color: rgba(var(--chrome-accent-rgb), 0.24); background: rgba(var(--chrome-accent-rgb), 0.11); color: var(--chrome-accent); }
.choice-button:disabled { opacity: 0.38; cursor: not-allowed; }

.period-button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; text-align: left; }
.period-dot { width: 10px; height: 10px; flex: 0 0 10px; border-radius: 50%; background: #4f8a55; }
.period-button--advent .period-dot,
.period-button--lent .period-dot,
.period-button--holyweek .period-dot { background: #76528d; }
.period-button--christmas .period-dot,
.period-button--easter .period-dot { background: #c7952f; }

.subsection-label { margin: 0 0 8px 2px; color: var(--nav-muted); font-size: 0.72rem; font-weight: 780; text-transform: uppercase; }
.advent-weeks { grid-template-columns: repeat(4, minmax(56px, 1fr)); }
.number-button small { display: block; margin-top: 2px; font-size: 0.55rem; }
.special-divider { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; color: var(--nav-muted); font-size: 0.72rem; font-weight: 780; text-transform: uppercase; }
.special-divider::before,
.special-divider::after { height: 1px; flex: 1; background: var(--nav-border); content: ''; }

:deep(.date-choice-grid) { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
:deep(.date-choice-groups) { display: grid; gap: 18px; }
:deep(.date-choice-group) { min-width: 0; }
:deep(.date-month-label) {
  margin: 0 0 9px 2px; color: var(--nav-muted); font-size: 0.72rem;
  font-weight: 780; text-transform: capitalize;
}
:deep(.date-choice-button) {
  position: relative; display: grid; min-height: 66px; padding: 7px 3px; place-items: center;
  border: 1px solid var(--nav-border); border-radius: 15px; background: transparent;
  color: var(--nav-muted); font: inherit; cursor: pointer;
}
:deep(.date-choice-button strong) { color: var(--nav-on-surface); font-size: 1rem; line-height: 1; }
:deep(.date-choice-button span) { font-size: 0.63rem; font-weight: 760; text-transform: uppercase; }
:deep(.date-choice-button small) { font-size: 0.62rem; }
:deep(.date-choice-button--active) { border-color: rgba(var(--chrome-accent-rgb), 0.24); background: rgba(var(--chrome-accent-rgb), 0.11); color: var(--chrome-accent); }

.lent-opening-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.lent-opening-button { display: grid; gap: 3px; padding: 9px 10px; text-align: left; }
.lent-opening-button strong { font-size: 0.84rem; }
.lent-opening-button small { font-size: 0.65rem; font-weight: 600; }

.weekday-button { display: grid; min-width: 0; padding: 7px 2px; place-items: center; }
.weekday-button span { font-size: 0.86rem; }
.weekday-button small { display: none; }

.result-state,
.empty-state { display: flex; align-items: center; justify-content: center; min-height: 120px; color: var(--nav-muted); }
.result-state { gap: 12px; }
.result-date { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.result-date-icon,
.result-arrow { display: grid; place-items: center; border-radius: 50%; background: var(--nav-active); color: var(--nav-on-surface); }
.result-date-icon { width: 46px; height: 46px; }
.result-date > div:last-child { display: grid; }
.result-date span,
.result-source { color: var(--nav-muted); font-size: 0.72rem; font-weight: 760; letter-spacing: 0.04em; }
.result-date strong { font-size: 1rem; text-transform: capitalize; }
.result-list { display: grid; gap: 8px; }
.result-card {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
  padding: 15px; border: 1px solid var(--nav-border); border-radius: 19px;
  background: var(--reader-surface); color: var(--nav-on-surface); text-align: left; cursor: pointer;
}
.result-card:disabled { opacity: 0.55; cursor: default; }
.result-card-copy { display: grid; min-width: 0; gap: 4px; }
.result-card-copy > strong { font-size: 1rem; line-height: 1.35; }
.result-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.result-badges span { display: inline-flex; align-items: center; gap: 4px; color: var(--nav-muted); font-size: 0.72rem; }
.result-arrow { width: 38px; height: 38px; flex: 0 0 38px; }
.empty-state { flex-direction: column; padding: 16px; text-align: center; }
.empty-state strong { margin-top: 10px; color: var(--nav-on-surface); }
.empty-state p { margin: 4px 0 0; font-size: 0.82rem; }

@media (min-width: 620px) {
  .weekday-button small { display: block; margin-top: 2px; font-size: 0.64rem; font-weight: 600; }
  :deep(.date-choice-grid) { grid-template-columns: repeat(7, minmax(0, 1fr)); }
}

@media (max-width: 430px) {
  .picker-step,
  .result-section { padding: 15px; border-radius: 23px; }
  .choice-grid--periods { grid-template-columns: 1fr; }
  .choice-grid--numbers { grid-template-columns: repeat(6, 1fr); }
  .advent-weeks { grid-template-columns: repeat(4, 1fr); }
}
</style>
