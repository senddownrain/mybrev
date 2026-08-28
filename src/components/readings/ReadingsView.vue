<template>
  <v-container class="readings-container" :style="readingsPageStyle">
    <header class="readings-page-header">
      <div>
        <h1 class="section-page-title">Чытанні</h1>
        <p class="readings-date">
          <span class="readings-date__marker" aria-hidden="true"></span>
          {{ displayDate }}
        </p>
      </div>
      <v-btn
        v-if="authStore.isAdmin"
        :icon="activeReading ? 'mdi-pencil-outline' : 'mdi-plus'"
        variant="tonal"
        color="primary"
        :aria-label="activeReading ? 'Рэдагаваць гэтыя чытанні' : 'Дадаць чытанні'"
        :disabled="isLoading"
        @click="openReadingEditor"
      />
    </header>

    <div v-if="isLoading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <p class="mt-4 text-grey">Загрузка чытанняў...</p>
    </div>

    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі чытанняў</div>
      <p>{{ error.message || error }}</p>
      <v-btn variant="tonal" color="white" class="mt-2" prepend-icon="mdi-refresh" @click="load">
        Паўтарыць
      </v-btn>
    </v-alert>

    <div v-else-if="activeReading" class="readings-content">
      <details
        v-if="readingGroups.length > 1"
        ref="readingChoiceDetails"
        class="reading-choice"
      >
        <summary class="reading-choice__summary">
          <span class="reading-choice__option-icon">
            <v-icon :icon="groupIcon(activeGroup)" size="20"></v-icon>
          </span>
          <span class="reading-choice__option-copy">
            <span class="reading-choice__eyebrow">На гэты дзень</span>
            <span class="reading-choice__option-title">{{ activeGroup?.label }}</span>
            <span class="reading-choice__option-meta">
              Яшчэ {{ readingGroups.length - 1 }} {{ alternativeWord(readingGroups.length - 1) }}
            </span>
          </span>
          <span class="reading-choice__count">{{ readingGroups.length }}</span>
          <v-icon icon="mdi-chevron-down" size="22" class="reading-choice__chevron"></v-icon>
        </summary>

        <div class="reading-choice__options">
          <button
            v-for="group in readingGroups"
            :key="group.key"
            type="button"
            class="reading-choice__option"
            :class="{ 'reading-choice__option--active': group.key === activeGroup?.key }"
            :aria-pressed="group.key === activeGroup?.key"
            @click="selectReadingGroup(group)"
          >
            <span class="reading-choice__option-icon">
              <v-icon :icon="groupIcon(group)" size="20"></v-icon>
            </span>
            <span class="reading-choice__option-copy">
              <span class="reading-choice__option-title">{{ group.label }}</span>
              <span class="reading-choice__option-meta">{{ groupMeta(group) }}</span>
            </span>
            <v-icon
              :icon="group.key === activeGroup?.key ? 'mdi-check-circle' : 'mdi-chevron-right'"
              size="20"
              class="reading-choice__option-end"
            ></v-icon>
          </button>
        </div>
      </details>

      <section
        v-if="availableCycles.length > 1"
        class="cycle-choice"
        aria-labelledby="cycle-choice-title"
      >
        <div>
          <div id="cycle-choice-title" class="cycle-choice__label">Літургічны цыкл</div>
          <div class="cycle-choice__hint">Актуальны на гэту дату адкрыты аўтаматычна</div>
        </div>
        <div class="cycle-choice__buttons" role="group" aria-label="Літургічны цыкл">
          <button
            v-for="cycle in availableCycles"
            :key="cycle"
            type="button"
            class="cycle-choice__button"
            :class="{
              'cycle-choice__button--active': cycle === activeCycle,
              'cycle-choice__button--current': cycle === currentCycle,
            }"
            :aria-pressed="cycle === activeCycle"
            :aria-label="cycleAriaLabel(cycle)"
            @click="selectCycle(cycle)"
          >
            {{ cycleLabel(cycle) }}
            <span v-if="cycle === currentCycle" class="cycle-choice__dot" aria-hidden="true"></span>
          </button>
        </div>
      </section>

      <ParsedReadingCard :reading="activeReading" />
    </div>

    <div v-else class="text-center py-16">
      <v-icon size="64" color="grey-lighten-1">mdi-book-open-variant-outline</v-icon>
      <p class="text-h6 mt-4 text-grey">Чытанні для гэтага дня не знойдзены</p>
      <p class="text-caption mt-2 text-grey-darken-1">
        Магчыма, яны яшчэ не дададзены ў базу даных
      </p>
    </div>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useParsedReadings } from '@/composables/useParsedReadings';
import ParsedReadingCard from '@/components/readings/ParsedReadingCard.vue';
import { useAuthStore } from '@/stores/auth';
import {
  normalizeReadingCycle,
  readingCelebrationKey,
} from '@/utils/parsedReadingsIdentity';
import { getLiturgicalPeriodTheme } from '@/constants/liturgical';
import moment from '@/utils/moment-be';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { items, context, isLoading, error, loadForDate } = useParsedReadings();
const readingChoiceDetails = ref(null);

const selectedDate = computed(() => {
  const dateParam = route.params.date || route.query.date;
  const value = dateParam ? moment(dateParam, 'YYYY-MM-DD', true) : moment();
  return value.isValid() ? value.startOf('day') : moment().startOf('day');
});

const displayDate = computed(() => {
  const prefix = selectedDate.value.isSame(moment().startOf('day'), 'day') ? 'Сёння, ' : '';
  return `${prefix}${selectedDate.value.format('dddd, D MMMM YYYY')}`;
});

const readingsPageStyle = computed(() => {
  const periodType = route.query.returnDayId === 'office-for-dead'
    ? 'requiem'
    : context.value?.periodType || 'default';
  const theme = getLiturgicalPeriodTheme(activeReading.value, periodType);
  return {
    '--reading-period-color': theme.color,
    '--reading-period-rgb': theme.rgb,
  };
});

const readingGroups = computed(() => {
  const groups = new Map();
  for (const reading of items.value) {
    const key = readingCelebrationKey(reading);
    if (!groups.has(key)) groups.set(key, { key, documents: [] });
    groups.get(key).documents.push(reading);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    label: group.documents.find((document) => document.title)?.title || 'Чытанні дня',
  }));
});

const activeGroup = computed(() => {
  const readingId = String(route.query.readingId || '');
  const dayId = String(route.query.dayId || '');

  if (readingId) {
    const exact = readingGroups.value.find((group) =>
      group.documents.some((document) => document.id === readingId));
    if (exact) return exact;
  }

  if (dayId) {
    const linked = readingGroups.value.find((group) => group.documents.some((document) =>
      document._dayId === dayId || document._dayIds?.includes(dayId)));
    if (linked) return linked;
  }

  return readingGroups.value[0] || null;
});

const availableCycles = computed(() => {
  const found = new Set((activeGroup.value?.documents || [])
    .map((document) => normalizeReadingCycle(document.year))
    .filter(Boolean));
  return ['A', 'B', 'C', '1', '2'].filter((cycle) => found.has(cycle));
});

const currentCycle = computed(() => {
  const hasSundayCycles = availableCycles.value.some((cycle) => ['A', 'B', 'C'].includes(cycle));
  return normalizeReadingCycle(hasSundayCycles ? context.value?.sundayCycle : context.value?.cycle);
});

const activeCycle = computed(() => {
  const requested = normalizeReadingCycle(route.query.year);
  if (requested && availableCycles.value.includes(requested)) return requested;
  if (currentCycle.value && availableCycles.value.includes(currentCycle.value)) return currentCycle.value;
  const hasSharedReading = activeGroup.value?.documents
    .some((document) => !normalizeReadingCycle(document.year));
  if (hasSharedReading) return '';
  return availableCycles.value[0] || '';
});

const activeReading = computed(() => {
  const documents = activeGroup.value?.documents || [];
  if (!documents.length) return null;
  if (activeCycle.value) {
    const exact = documents.find((document) => normalizeReadingCycle(document.year) === activeCycle.value);
    if (exact) return exact;
  }
  return documents.find((document) => !normalizeReadingCycle(document.year)) || documents[0];
});

function groupIcon(group) {
  const reading = group.documents[0] || {};
  if (reading._feast) return 'mdi-star-four-points';
  if (reading._date) return 'mdi-calendar-star';
  return 'mdi-calendar-blank-outline';
}

function groupMeta(group) {
  const reading = group.documents[0] || {};
  const cycles = [...new Set(group.documents
    .map((document) => normalizeReadingCycle(document.year))
    .filter(Boolean))];
  if (cycles.length) return `Цыклы ${cycles.map(cycleLabel).join(', ')}`;
  if (reading._date) return 'Уласныя чытанні святкавання';
  if (reading._feast) return 'Уласныя чытанні свята';
  return 'Чытанні літургічнага перыяду';
}

function cycleLabel(cycle) {
  if (cycle === '1') return 'I';
  if (cycle === '2') return 'II';
  return cycle;
}

function cycleAriaLabel(cycle) {
  const current = cycle === currentCycle.value ? ', актуальны на гэту дату' : '';
  return `Цыкл ${cycleLabel(cycle)}${current}`;
}

function alternativeWord(count) {
  if (count === 1) return 'варыянт';
  if (count >= 2 && count <= 4) return 'варыянты';
  return 'варыянтаў';
}

function selectReadingGroup(group) {
  if (!group) return;
  if (readingChoiceDetails.value) readingChoiceDetails.value.open = false;
  if (group.key === activeGroup.value?.key) return;
  const reading = group.documents[0];
  const query = { ...route.query, readingId: reading.id };
  if (reading._dayId) query.dayId = reading._dayId;
  else delete query.dayId;
  delete query.year;
  router.replace({ query });
}

function selectCycle(cycle) {
  if (!cycle || cycle === activeCycle.value) return;
  router.replace({ query: { ...route.query, year: cycle } });
}

function openReadingEditor() {
  const query = {
    date: selectedDate.value.format('YYYY-MM-DD'),
  };
  const dayId = String(route.query.dayId || route.query.returnDayId || '');
  if (dayId) query.dayId = dayId;

  if (!activeReading.value) {
    if (dayId) {
      query.type = 'linked';
    } else if (context.value?.periodType) {
      query.type = 'period';
      query.periodType = context.value.periodType;
      query.periodWeekNumber = context.value.periodWeek;
      query.dayOfWeek = context.value.dayOfWeek;
      query.year = currentCycle.value || '';
    } else {
      query.type = 'date';
      query._date = selectedDate.value.format('DD.MM');
    }
  }

  router.push({
    name: 'AdminParsedReadingEditor',
    params: { id: activeReading.value?.id || 'new' },
    query,
  });
}

function load() {
  loadForDate(selectedDate.value.toDate(), {
    dayId: route.query.dayId || '',
    includeAlternatives: true,
  });
}

onMounted(load);
watch(() => [route.params.date || route.query.date, route.query.dayId], load);
</script>

<style scoped>
.readings-container {
  --reading-visible-color: var(--reading-period-color);
  --reading-visible-color: color-mix(
    in srgb,
    var(--reading-period-color) var(--period-accent-weight),
    var(--period-accent-target)
  );
  width: min(100%, 960px);
  max-width: 960px;
  margin-inline: auto;
  padding: 12px;
}

.readings-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 12px 24px;
}

.section-page-title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: clamp(1.85rem, 8vw, 2.35rem);
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.readings-date {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 8px 0 0;
  color: var(--reading-visible-color);
  font-size: calc(1.02rem * var(--font-size-multiplier, 1));
  font-weight: 680;
  line-height: 1.4;
  text-transform: none;
}

.readings-date__marker {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border: 2px solid rgba(var(--reading-period-rgb), 0.28);
  border-radius: 50%;
  background: var(--reading-visible-color);
  box-shadow: 0 0 0 4px rgba(var(--reading-period-rgb), 0.09);
}

.readings-content {
  display: grid;
  gap: 14px;
  width: 100%;
}

.reading-choice,
.cycle-choice {
  margin-inline: 12px;
  border: 1px solid var(--nav-border);
  background: var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
}

.reading-choice {
  overflow: hidden;
  border-radius: 24px;
}

.reading-choice__summary {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 28px 24px;
  gap: 11px;
  align-items: center;
  min-height: 82px;
  padding: 12px 14px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.reading-choice__summary::-webkit-details-marker {
  display: none;
}

.reading-choice__summary:hover {
  background: rgba(var(--reading-period-rgb), 0.05);
}

.reading-choice__eyebrow,
.cycle-choice__label {
  color: var(--reading-visible-color);
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.reading-choice__count {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: var(--nav-active);
  color: var(--nav-muted);
  font-size: 0.75rem;
  font-weight: 800;
}

.reading-choice__chevron {
  color: var(--nav-muted);
  transition: transform 0.18s ease;
}

.reading-choice[open] .reading-choice__chevron {
  transform: rotate(180deg);
}

.reading-choice__options {
  display: grid;
  gap: 1px;
  border-top: 1px solid var(--nav-border);
  background: var(--nav-border);
}

.reading-choice__option {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 24px;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 70px;
  padding: 11px 14px;
  border: 0;
  background: var(--nav-surface);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.reading-choice__option:hover,
.reading-choice__option--active {
  background: rgba(var(--reading-period-rgb), 0.075);
}

.reading-choice__option-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 13px;
  background: rgba(var(--reading-period-rgb), 0.1);
  color: var(--reading-visible-color);
}

.reading-choice__summary .reading-choice__option-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
}

.reading-choice__option-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.reading-choice__option-title {
  overflow: hidden;
  font-size: 0.91rem;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reading-choice__summary .reading-choice__option-title {
  font-size: 0.96rem;
}

.reading-choice__option-meta,
.cycle-choice__hint {
  color: var(--nav-muted);
  font-size: 0.72rem;
  line-height: 1.35;
}

.reading-choice__option-end {
  color: var(--nav-muted);
}

.reading-choice__option--active .reading-choice__option-end {
  color: var(--reading-visible-color);
}

.cycle-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 14px 13px 16px;
  border-radius: 20px;
}

.cycle-choice__hint {
  margin-top: 3px;
}

.cycle-choice__buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 5px;
}

.cycle-choice__button {
  position: relative;
  display: grid;
  min-width: 42px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--nav-border);
  border-radius: 13px;
  background: transparent;
  color: var(--nav-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
}

.cycle-choice__button--active {
  border-color: rgba(var(--reading-period-rgb), 0.3);
  background: rgba(var(--reading-period-rgb), 0.11);
  color: var(--reading-visible-color);
}

.cycle-choice__dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--reading-visible-color);
}

@media (max-width: 600px) {
  .readings-container {
    padding: 8px 4px !important;
  }

  .readings-page-header,
  .reading-choice,
  .cycle-choice {
    margin-inline: 8px;
  }

  .cycle-choice {
    align-items: flex-start;
    flex-direction: column;
  }

  .cycle-choice__buttons {
    width: 100%;
  }

  .cycle-choice__button {
    flex: 1 1 0;
  }

}
</style>
