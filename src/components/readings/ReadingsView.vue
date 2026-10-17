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
        v-if="readingSets.length > 1"
        class="cycle-choice set-choice"
        aria-labelledby="set-choice-title"
      >
        <div>
          <div id="set-choice-title" class="cycle-choice__label">Чытанні Імшы</div>
          <div class="cycle-choice__hint">{{ readingSets.length }} {{ alternativeWord(readingSets.length) }} аднаго святкавання</div>
        </div>
        <div class="set-choice__buttons" role="group" aria-label="Набор чытанняў">
          <button
            v-for="set in readingSets"
            :key="set.id"
            type="button"
            class="cycle-choice__button set-choice__button"
            :class="{ 'cycle-choice__button--active': set.id === activeSet?.id }"
            :aria-pressed="set.id === activeSet?.id"
            @click="selectReadingSet(set)"
          >
            {{ set.label }}
          </button>
        </div>
      </section>

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

    <div v-else-if="readingsNotice" class="readings-notice text-center py-16">
      <v-icon size="64" color="grey-lighten-1">mdi-book-open-variant-outline</v-icon>
      <p class="text-h6 mt-4">{{ readingsNotice.title }}</p>
      <p class="text-body-2 mt-2 text-grey-darken-1">Тэкст чытанняў пакуль недаступны</p>
      <p v-if="readingsNotice.reference" class="readings-notice__reference mt-4">{{ readingsNotice.reference }}</p>
    </div>

    <div v-else class="text-center py-16">
      <v-icon size="64" color="grey-lighten-1">mdi-book-open-variant-outline</v-icon>
      <p class="text-h6 mt-4 text-grey">Чытанні для гэтага дня не знойдзены</p>
      <p class="text-caption mt-2 text-grey-darken-1">
        Магчыма, яны яшчэ не дададзены ў базу даных
      </p>
    </div>
    <BackToTop bottom-nav />
  </v-container>
</template>

<script setup>
import BackToTop from '@/components/BackToTop.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useReadings } from '@/composables/useReadings';
import ParsedReadingCard from '@/components/readings/ParsedReadingCard.vue';
import { useAuthStore } from '@/stores/auth';
import { normalizeReadingCycle } from '@/utils/parsedReadingsIdentity';
import { resolveReadingsScreen } from '@/utils/readingsScreen';
import { getLiturgicalTheme } from '@/constants/liturgical';
import { liturgicalVisual } from '@/utils/liturgicalVisual';
import { resolveRuntimeDay } from '@/utils/ordo/runtime';
import { currentOrdoDiocese, effectiveOrdoDioceses } from '@/utils/ordoDiocese';
import { DIOCESE_BADGES } from '@/utils/dayOptionsUnion';
import moment from '@/utils/moment-be';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { items, context, isLoading, error, loadForDate } = useReadings();
// The celebration is known but its readings have no text yet (citation only).
const readingsNotice = computed(() => context.value?.readingsNotice || null);
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

// The colour of the celebration the readings are opened for (Ordo), the same
// as on its Hours card; heuristics only for a reading without an Ordo option.
const ordoOption = computed(() => {
  const resolved = resolveRuntimeDay(selectedDate.value.format('YYYY-MM-DD'), {
    diocese: context.value?.diocese || currentOrdoDiocese(),
  });
  // the option chosen in the calendar gives the colour until a reading is picked explicitly
  const chosen = route.query.readingId ? '' : String(route.query.option || '');
  const id = chosen || activeReading.value?._ordoOptionId || String(route.query.option || '') || context.value?.ordoSelectedId;
  return [resolved.primary, ...resolved.alternatives].find((option) => option.id === id) || resolved.primary;
});

const readingsPageStyle = computed(() => {
  const periodType = route.query.returnDayId === 'office-for-dead'
    ? 'requiem'
    : context.value?.periodType || 'default';
  const canonical = periodType === 'requiem' ? null : liturgicalVisual(ordoOption.value);
  const theme = canonical?.accent || getLiturgicalTheme(activeReading.value, periodType);
  return {
    '--reading-period-color': theme.color,
    '--reading-period-rgb': theme.rgb,
  };
});

// Pure resolution shared with the audit scripts (`utils/readingsScreen.js`).
const screen = computed(() => resolveReadingsScreen({
  items: items.value,
  context: context.value,
  query: route.query,
}));
const readingGroups = computed(() => screen.value.groups);
const activeGroup = computed(() => screen.value.activeGroup);
const readingSets = computed(() => screen.value.sets);
const activeSet = computed(() => screen.value.activeSet);
const availableCycles = computed(() => screen.value.availableCycles);
const currentCycle = computed(() => screen.value.currentCycle);
const activeCycle = computed(() => screen.value.activeCycle);
const activeReading = computed(() => screen.value.activeReading);

function groupIcon(group) {
  const reading = group.documents[0] || {};
  if (reading._feast) return 'mdi-star-four-points';
  if (reading._date) return 'mdi-calendar-star';
  return 'mdi-calendar-blank-outline';
}

/** Diocese badges of a group that only some of the selected dioceses read. */
function groupBadges(group) {
  const selected = context.value?.dioceses || [];
  if (selected.length < 2) return [];
  const read = new Set(group.documents.flatMap((document) => document._dioceses || []));
  return read.size && read.size < selected.length ? [...read].map((id) => DIOCESE_BADGES[id] || id) : [];
}

function groupMeta(group) {
  const badges = groupBadges(group).join(', ');
  const meta = groupMetaText(group);
  return badges ? `${meta} · ${badges}` : meta;
}

function groupMetaText(group) {
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
  delete query.set;
  router.replace({ query });
}

function selectReadingSet(set) {
  if (!set || set.id === activeSet.value?.id) return;
  router.replace({ query: { ...route.query, set: set.id } });
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

  if (activeSet.value) query.set = activeSet.value.id;

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
    dioceses: effectiveOrdoDioceses.value,
  });
}

onMounted(load);
watch(() => [route.params.date || route.query.date, route.query.dayId, effectiveOrdoDioceses.value.join(',')], load);
</script>

<style scoped>
.readings-notice__reference {
  max-width: 34rem;
  margin-inline: auto;
  color: var(--nav-on-surface);
  font-family: var(--reader-font-family);
  line-height: 1.6;
}
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
  align-items: flex-start;
  gap: 9px;
  margin: 8px 0 0;
  color: var(--reading-visible-color);
  font-size: calc(1.02rem * var(--font-size-multiplier, 1));
  font-weight: 680;
  line-height: 1.4;
  text-transform: none;
}

.readings-date__marker {
  /* Centred on the first line of the date, so a wrapped date keeps its dot at the top. */
  margin-top: calc(0.7 * 1.02rem * var(--font-size-multiplier, 1) - 4.5px);
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

/* The reading card shares the page gutter with the choice cards above it. */
.readings-content > :deep(.parsed-reading) {
  margin-inline: 12px;
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

.set-choice__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.set-choice__button {
  width: auto;
  padding-inline: 12px;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .set-choice__buttons {
    width: 100%;
    justify-content: flex-start;
  }

  .readings-container {
    padding: 8px 4px !important;
  }

  .readings-page-header,
  .reading-choice,
  .cycle-choice,
  .readings-content > :deep(.parsed-reading) {
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

  /* Reading-set buttons carry long Belarusian labels: they stack at full width
     and may wrap, instead of inheriting the compact A/B/C shrink above. */
  .set-choice__buttons {
    flex-direction: column;
    align-items: stretch;
    flex-wrap: nowrap;
  }

  .set-choice__button {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 44px;
    padding-block: 9px;
    line-height: 1.25;
    overflow-wrap: anywhere;
    text-align: center;
    white-space: normal;
  }
}
</style>
