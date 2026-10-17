<template>
  <v-container class="picker-page">
    <header class="picker-hero">
      <div class="picker-eyebrow">Літургічны каляндар</div>
      <h1>Знайсці дзень</h1>
      <p>
        Выберыце месца ў літургічным годзе або канкрэтнае свята.
        <span v-if="readingMode">Адкрыем чытанні выбранага святкавання.</span>
      </p>
    </header>

    <section class="picker-controls" aria-label="Налады пошуку">
      <div class="mode-note" :class="{ 'mode-note--readings': readingMode }">
        <PhBookOpenText v-if="readingMode" :size="20" />
        <PhHandsPraying v-else :size="20" />
        <span>{{ readingMode ? 'Рэжым чытанняў' : 'Рэжым літургічных гадзін' }}</span>
      </div>
    </section>

    <nav class="picker-tabs" aria-label="Спосаб пошуку">
      <button
        type="button"
        :class="{ 'picker-tab--active': activeTab === 'period' }"
        @click="activeTab = 'period'"
      >
        <PhCalendarDots :size="20" />
        Па перыядзе
      </button>
      <button
        type="button"
        :class="{ 'picker-tab--active': activeTab === 'feasts' }"
        @click="activeTab = 'feasts'"
      >
        <PhStarFour :size="20" />
        Па свяце
      </button>
    </nav>

    <v-window v-model="activeTab" class="picker-window">
      <v-window-item value="period">
        <PeriodPicker
          :year="selectedYear"
          :mode="readingMode ? 'readings' : 'oras'"
          @day-selected="openSelection"
        />
      </v-window-item>
      <v-window-item value="feasts">
        <FeastsPicker
          :year="selectedYear"
          :mode="readingMode ? 'readings' : 'oras'"
          @feast-selected="openSelection"
        />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PeriodPicker from '@/components/liturgical/PeriodPicker.vue';
import FeastsPicker from '@/components/liturgical/FeastsPicker.vue';
import moment from '@/utils/moment-be';
import {
  PhBookOpenText,
  PhCalendarDots,
  PhHandsPraying,
  PhStarFour,
} from '@phosphor-icons/vue';

const route = useRoute();
const router = useRouter();
const selectedYear = new Date().getFullYear();
const activeTab = computed({
  get: () => route.query.tab === 'feasts' ? 'feasts' : 'period',
  set: (tab) => router.replace({ query: { ...route.query, tab } }),
});
const readingMode = computed(() => route.query.mode === 'readings');

function openSelection({ dayId, date, optionId, diocese, referenceOnly, periodOnly }) {
  if (periodOnly && date) {
    const query = { view: 'period', ...(diocese ? { diocese } : {}) };
    router.push(readingMode.value
      ? { name: 'ReadingsByDate', params: { date }, query }
      : { name: 'oras', params: { day: date, id: dayId }, query });
    return;
  }
  // «Па свяце»: the celebration itself (its Office / its readings, its diocese).
  if (optionId && date) {
    const query = { option: optionId, view: 'reference', ...(referenceOnly ? { reference: optionId } : {}), ...(diocese ? { diocese } : {}) };
    router.push(readingMode.value
      ? { name: 'ReadingsByDate', params: { date }, query }
      : { name: 'SelectedDay', params: { day: date }, query });
    return;
  }
  if (!date || (!readingMode.value && !dayId)) return;

  if (readingMode.value) {
    const isToday = moment(date, 'YYYY-MM-DD').isSame(moment(), 'day');
    router.push({
      name: isToday ? 'Readings' : 'ReadingsByDate',
      params: isToday ? {} : { date },
      query: dayId ? { dayId } : {},
    });
    return;
  }

  router.push({ name: 'oras', params: { day: date, id: dayId } });
}
</script>

<style scoped>
.picker-page {
  position: relative;
  isolation: isolate;
  width: min(100%, 780px);
  padding: 10px 18px 36px;
}

.picker-page::before {
  position: absolute;
  z-index: -1;
  inset: -28px -24px auto;
  height: 320px;
  border-radius: 52px;
  background: radial-gradient(ellipse at 82% 10%, rgba(var(--chrome-accent-rgb), var(--ambient-strength)), transparent 68%);
  content: "";
  filter: blur(12px);
  pointer-events: none;
}

.picker-hero {
  padding: 8px 4px 20px;
}

.picker-eyebrow,
.control-label {
  color: var(--nav-muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.picker-eyebrow {
  color: var(--chrome-accent);
}

.picker-hero h1 {
  margin: 5px 0 8px;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(2rem, 9vw, 2.7rem);
  font-family: var(--reader-display-font-family);
  font-weight: 750;
  line-height: 1.02;
  letter-spacing: -0.025em;
}

.picker-hero p {
  max-width: 620px;
  margin: 0;
  color: var(--nav-muted);
  font-size: 0.98rem;
  line-height: 1.55;
}

.picker-controls {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.year-control,
.mode-note {
  min-height: 66px;
  border: 1px solid var(--nav-border);
  background: var(--nav-surface);
  box-shadow: 0 5px 20px var(--nav-button-shadow);
}

.year-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 18px;
  border-radius: 22px;
}

.year-control > div:first-child {
  display: grid;
  gap: 1px;
}

.year-control strong {
  font-size: 1.2rem;
  line-height: 1.2;
}

.year-select {
  max-width: 112px;
}

.year-select :deep(.v-field) {
  border-radius: 16px;
  background: var(--nav-active) !important;
  box-shadow: none !important;
}

.year-select :deep(.v-field__input) {
  min-height: 44px;
  padding-inline-start: 14px;
  font-weight: 700;
}

.mode-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: 22px;
  color: var(--nav-muted);
  font-size: 0.8rem;
  font-weight: 700;
}

.mode-note--readings {
  border-color: rgba(var(--chrome-accent-rgb), 0.2);
  background: rgba(var(--chrome-accent-rgb), 0.075);
  color: var(--chrome-accent);
}

.picker-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
  box-shadow: 0 5px 20px var(--nav-button-shadow);
}

.picker-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  border: 0;
  border-radius: 17px;
  background: transparent;
  color: var(--nav-muted);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 720;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.16s ease;
}

.picker-tabs button:active {
  transform: scale(0.98);
}

.picker-tabs .picker-tab--active {
  background: rgba(var(--chrome-accent-rgb), 0.12);
  color: var(--chrome-accent);
}

.picker-window {
  margin-top: 18px;
  overflow: visible;
}

@media (max-width: 560px) {
  .picker-page::before {
    inset-inline: 0;
    height: 280px;
    filter: blur(10px);
  }

  .picker-page {
    padding-inline: 14px;
  }

  .picker-controls {
    grid-template-columns: 1fr;
  }

  .mode-note {
    min-height: 48px;
  }
}
</style>
