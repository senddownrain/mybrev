<template>
  <div class="feasts-picker">
    <div class="feast-tools">
      <div class="search-field">
        <PhMagnifyingGlass :size="20" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Назва, дата, ранг або дыяцэзія"
          aria-label="Пошук свята"
          :disabled="loading"
        >
        <button
          v-if="searchQuery"
          type="button"
          aria-label="Ачысціць пошук"
          @click="searchQuery = ''"
        >
          <PhX :size="17" />
        </button>
      </div>

      <div class="source-filters" aria-label="Тып свята">
        <button
          v-for="filter in sourceFilters"
          :key="filter.value"
          type="button"
          :class="{ 'source-filter--active': sourceFilter === filter.value }"
          @click="sourceFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-list" aria-label="Загрузка святаў">
      <div v-for="index in 5" :key="index" class="skeleton-row">
        <v-skeleton-loader type="avatar, list-item-two-line" />
      </div>
    </div>

    <template v-else-if="filteredFeasts.length">
      <div class="list-summary">
        <span>{{ resultCountLabel }}</span>
        <span>у {{ year }} годзе</span>
      </div>

      <div class="feast-list">
        <button
          v-for="feast in filteredFeasts"
          :key="feast.key"
          type="button"
          class="feast-row"
          :disabled="!canOpenFeast(feast)"
          @click="selectFeast(feast)"
        >
          <div class="date-tile" :class="{ 'date-tile--dynamic': feast.isDynamic }">
            <strong>{{ feast.dayLabel }}</strong>
            <span>{{ feast.monthLabel }}</span>
          </div>

          <div class="feast-copy">
            <div class="feast-source">
              <PhCalendarBlank v-if="feast.isFixed" :size="14" />
              <PhCalendarDots v-else :size="14" />
              {{ feast.isDynamic ? 'Рухомае' : 'Нерухомае' }}
            </div>
            <h3>{{ feast.title }}</h3>
            <div class="feast-meta">
              <span v-if="feast.rankLabel" class="rank-badge">{{ feast.rankLabel }}</span>
              <span v-if="feast.colorLabel">
                <i class="feast-color" :style="{ backgroundColor: feast.swatch }" aria-hidden="true" />
                {{ feast.colorLabel }}
              </span>
              <span v-for="place in feast.placeLabels" :key="place" class="place-badge">
                <PhMapPin :size="13" />{{ place }}
              </span>
              <span v-if="feast.variantCount > 1">{{ feast.variantCount }} варыянты</span>
            </div>
            <div v-if="feast.statusLabel" class="feast-status">{{ feast.statusLabel }}</div>
            <div v-else-if="!canOpenFeast(feast)" class="feast-status">
              {{ mode === 'readings' ? 'Чытанні гэтага свята не дазволены' : 'Літургічныя гадзіны гэтага свята не дазволены' }}
            </div>
          </div>

          <span v-if="canOpenFeast(feast)" class="open-button" :title="openLabel">
            <PhBookOpenText v-if="mode === 'readings'" :size="19" />
            <PhArrowRight v-else :size="19" />
          </span>
        </button>
      </div>
    </template>

    <div v-else class="empty-state">
      <PhStarFour :size="36" />
      <strong>Святы не знойдзены</strong>
      <p>Змяніце запыт або пакажыце ўсе тыпы святаў.</p>
      <button v-if="searchQuery || sourceFilter !== 'all'" type="button" @click="resetFilters">
        Скінуць фільтры
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import moment from '@/utils/moment-be';
import { colorInfo, ORDO_COLORS, ORDO_FILTER_DIOCESES, yearCelebrations } from '@/utils/ordoScreen';
import { ordoDiocese } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import {
  PhArrowRight,
  PhBookOpenText,
  PhCalendarBlank,
  PhCalendarDots,
  PhMagnifyingGlass,
  PhMapPin,
  PhStarFour,
  PhX,
} from '@phosphor-icons/vue';

const props = defineProps({
  year: { type: Number, required: true },
  mode: { type: String, default: 'oras' },
});

const emit = defineEmits(['feast-selected']);

const searchQuery = ref('');
const sourceFilter = ref('all');
// The list is computed by the Ordo engine on the device: no `days` read.
const loading = ref(false);

const sourceFilters = [
  { value: 'all', label: 'Усе' },
  { value: 'fixed', label: 'Нерухомыя' },
  { value: 'dynamic', label: 'Рухомыя' },
];

const openLabel = computed(() => (
  props.mode === 'readings' ? 'Адкрыць чытанні' : 'Адкрыць літургічныя гадзіны'
));

/**
 * Search all four diocesan calendars without changing Settings. Presence
 * comes from definitions; permission and the opening date come from Ordo.
 */
const preparedFeasts = computed(() => (ordoCalendarEpoch.value, yearCelebrations(props.year, ORDO_FILTER_DIOCESES))
  .map((item) => {
    // A fixed nominal 29 February remains displayable in a non-leap year.
    const date = moment(item.movable ? item.date : `2000-${item.date.slice(5)}`, 'YYYY-MM-DD', true);
    const color = ORDO_COLORS[item.color] ? colorInfo(item.color) : null;
    const feast = {
      ...item,
      id: item.optionId,
      calendarDate: item.routeDate,
      rankLabel: item.rank,
      placeLabels: item.badges,
      isDynamic: item.movable,
      isFixed: !item.movable,
      dayLabel: date.isValid() ? date.format('DD') : '—',
      monthLabel: date.isValid() ? date.format('MMM').replace('.', '') : 'рухомае',
      colorLabel: color?.label || '',
      swatch: color?.swatch || '',
      variantCount: 1,
    };
    feast.searchText = buildSearchText(feast, date);
    return feast;
  }));

const filteredFeasts = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('be-BY');
  return preparedFeasts.value.filter((feast) => {
    const sourceMatches = sourceFilter.value === 'all'
      || (sourceFilter.value === 'dynamic' && feast.isDynamic)
      || (sourceFilter.value === 'fixed' && feast.isFixed);
    return sourceMatches && (!query || feast.searchText.includes(query));
  });
});

const resultCountLabel = computed(() => {
  const count = filteredFeasts.value.length;
  if (count % 10 === 1 && count % 100 !== 11) return `${count} свята`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} святы`;
  return `${count} святаў`;
});




function buildSearchText(feast, date) {
  return [feast.title, feast.rankLabel, ...feast.placeLabels,
    date.isValid() ? `${date.format('DD.MM D MMMM')} ${date.format('MMMM')}` : 'рухомае', feast.date, feast.calendarDate]
    .join(' ')
    .toLocaleLowerCase('be-BY');
}


function canOpenFeast(feast) {
  return Boolean(feast.calendarDate && (props.mode === 'readings' ? feast.readingsAllowed : feast.hoursAllowed));
}

function selectFeast(feast) {
  if (!canOpenFeast(feast)) return;
  // The celebration's identity travels, not a `days` document id: Hours open
  // its Office, Readings its readings, in the diocese that keeps it.
  emit('feast-selected', {
    optionId: feast.optionId,
    date: feast.calendarDate,
    diocese: feast.dioceses.includes(ordoDiocese.value) ? ordoDiocese.value : feast.dioceses[0],
  });
}

function resetFilters() {
  searchQuery.value = '';
  sourceFilter.value = 'all';
}
</script>

<style scoped>
.feasts-picker {
  display: grid;
  gap: 14px;
}

.feast-tools {
  display: grid;
  gap: 10px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 0 14px 0 18px;
  border: 1px solid var(--nav-border);
  border-radius: 20px;
  background: var(--nav-surface);
  color: var(--nav-muted);
  box-shadow: 0 6px 22px var(--nav-button-shadow);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.search-field:focus-within {
  border-color: rgba(var(--chrome-accent-rgb), 0.42);
  box-shadow: 0 6px 22px var(--nav-button-shadow), 0 0 0 3px var(--focus-ring);
}

.search-field > svg {
  color: var(--chrome-accent);
}

.search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--nav-on-surface);
  font: inherit;
  font-size: 0.94rem;
}

.search-field input::placeholder {
  color: var(--nav-muted);
}

.search-field button {
  display: grid;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: var(--nav-active);
  color: var(--nav-on-surface);
  place-items: center;
  cursor: pointer;
}

.source-filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 1px 1px 3px;
  scrollbar-width: none;
}

.source-filters::-webkit-scrollbar { display: none; }

.source-filters button,
.empty-state button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--nav-border);
  border-radius: 999px;
  background: var(--nav-surface);
  color: var(--nav-muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 720;
  white-space: nowrap;
  cursor: pointer;
}

.source-filters .source-filter--active {
  border-color: rgba(var(--chrome-accent-rgb), 0.24);
  background: rgba(var(--chrome-accent-rgb), 0.11);
  color: var(--chrome-accent);
}

.list-summary {
  display: flex;
  justify-content: space-between;
  padding: 2px 5px 0;
  color: var(--nav-muted);
  font-size: 0.74rem;
  font-weight: 700;
}

.feast-list,
.loading-list {
  display: grid;
  gap: 9px;
}

.feast-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background:
    linear-gradient(120deg, rgba(var(--chrome-accent-rgb), 0.04), transparent 64%),
    var(--nav-surface);
  color: var(--nav-on-surface);
  box-shadow: 0 5px 19px var(--nav-button-shadow);
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.feast-row:active {
  transform: scale(0.985);
}

.feast-row:disabled { cursor: default; }
.feast-row:disabled:active { transform: none; }

.feast-color {
  width: 10px;
  height: 10px;
  border: 1px solid var(--nav-muted);
  border-radius: 50%;
}

.feast-status {
  margin-top: 7px;
  color: var(--nav-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}

.date-tile {
  display: grid;
  width: 54px;
  height: 58px;
  border-radius: 17px;
  background: var(--nav-active);
  color: var(--nav-on-surface);
  place-content: center;
  text-align: center;
}

.date-tile--dynamic {
  background: rgba(var(--chrome-accent-rgb), 0.11);
  color: var(--chrome-accent);
  box-shadow: inset 0 0 0 1px rgba(var(--chrome-accent-rgb), 0.24);
}

.date-tile strong {
  font-size: 1.15rem;
  line-height: 1;
}

.date-tile span {
  margin-top: 4px;
  font-size: 0.65rem;
  font-weight: 760;
  text-transform: uppercase;
}

.feast-copy {
  min-width: 0;
}

.feast-source {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
  color: var(--nav-muted);
  font-size: 0.66rem;
  font-weight: 780;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.feast-copy h3 {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 720;
  line-height: 1.34;
  overflow-wrap: anywhere;
}

.feast-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 8px;
  margin-top: 7px;
  color: var(--nav-muted);
  font-size: 0.7rem;
}

.feast-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.rank-badge {
  color: var(--nav-on-surface);
  font-weight: 720;
}

.open-button {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--nav-active);
  color: var(--nav-on-surface);
  place-items: center;
}

.skeleton-row {
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
}

.empty-state {
  display: flex;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 1px solid var(--nav-border);
  border-radius: 26px;
  background: var(--nav-surface);
  color: var(--nav-muted);
  text-align: center;
}

.empty-state strong {
  margin-top: 12px;
  color: var(--nav-on-surface);
}

.empty-state p {
  margin: 5px 0 15px;
  font-size: 0.82rem;
}

@media (max-width: 420px) {
  .feast-row {
    grid-template-columns: 50px minmax(0, 1fr) 36px;
    gap: 10px;
    padding: 10px;
  }

  .date-tile {
    width: 50px;
    height: 55px;
  }

  .open-button {
    width: 36px;
    height: 36px;
  }
}
</style>
