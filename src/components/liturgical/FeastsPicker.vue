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
              <span v-for="place in feast.placeLabels" :key="place" class="place-badge">
                <PhMapPin :size="13" />{{ place }}
              </span>
              <span v-if="feast.variantCount > 1">{{ feast.variantCount }} варыянты</span>
            </div>
          </div>

          <span class="open-button" :title="openLabel">
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
import { computed, onMounted, ref, watch } from 'vue';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
import { PLACE_LABEL_MAP, RANK_LABEL_MAP } from '@/constants/liturgical';
import { withoutObsoleteDocuments } from '@/utils/liturgicalDayResolution';
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
const { getAllFeasts } = useLiturgicalDay();

const searchQuery = ref('');
const sourceFilter = ref('all');
const allFeasts = ref([]);
const loading = ref(false);
let loadSequence = 0;

const sourceFilters = [
  { value: 'all', label: 'Усе' },
  { value: 'fixed', label: 'Нерухомыя' },
  { value: 'dynamic', label: 'Рухомыя' },
];

const openLabel = computed(() => (
  props.mode === 'readings' ? 'Адкрыць чытанні' : 'Адкрыць літургічныя гадзіны'
));

onMounted(loadFeasts);
watch(() => props.year, loadFeasts);

async function loadFeasts() {
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const result = await getAllFeasts(props.year);
    if (sequence === loadSequence) allFeasts.value = Array.isArray(result) ? result : [];
  } catch (error) {
    logger.error('Памылка пры загрузцы святаў:', error);
    if (sequence === loadSequence) allFeasts.value = [];
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

const preparedFeasts = computed(() => {
  const groups = new Map();

  // Cached feast lists may predate a migration that retired documents.
  withoutObsoleteDocuments(allFeasts.value).forEach((feast) => {
    const calendarDate = getCalendarDate(feast);
    if (!calendarDate) return;

    const title = cleanText(feast._title || feast._feastName || feast._dayName || 'Свята');
    const rank = feast._rank || feast._feastType || '';
    const rankLabel = RANK_LABEL_MAP[rank] || cleanText(rank);
    const places = normalizePlaces(feast._place);
    const placeLabels = places.map((place) => PLACE_LABEL_MAP[place] || cleanText(place));
    const groupKey = [
      feast.isDynamic ? 'dynamic' : 'fixed',
      calendarDate,
      title.toLocaleLowerCase('be-BY'),
      rank,
    ].join('|');
    const date = moment(calendarDate, 'YYYY-MM-DD', true);
    const existing = groups.get(groupKey);

    if (existing) {
      existing.variantCount += 1;
      existing.places = [...new Set([...existing.places, ...places])].sort();
      existing.placeLabels = existing.places
        .map((place) => PLACE_LABEL_MAP[place] || cleanText(place));
      existing.searchText = buildSearchText(existing, date);
      return;
    }

    groups.set(groupKey, {
      ...feast,
      key: groupKey,
      title,
      rankLabel,
      places,
      placeLabels,
      calendarDate,
      dayLabel: date.format('DD'),
      monthLabel: date.format('MMM').replace('.', ''),
      variantCount: 1,
      searchText: buildSearchText({ title, rankLabel, placeLabels }, date),
    });
  });

  return [...groups.values()].sort((a, b) => (
    a.calendarDate.localeCompare(b.calendarDate)
      || rankWeight(a._rank || a._feastType) - rankWeight(b._rank || b._feastType)
      || a.title.localeCompare(b.title, 'be')
  ));
});

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

function getCalendarDate(feast) {
  if (feast.calendarDate) return feast.calendarDate;
  if (!feast.isFixed || !feast._date) return '';
  const match = String(feast._date).match(/^(\d{1,2})[.-](\d{1,2})$/);
  if (!match) return '';
  const date = moment(`${props.year}-${match[2]}-${match[1]}`, 'YYYY-M-D', true);
  return date.isValid() ? date.format('YYYY-MM-DD') : '';
}

function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlaces(value) {
  return [...new Set((Array.isArray(value) ? value : [value])
    .map((place) => String(place || '').trim())
    .filter(Boolean))].sort();
}

function buildSearchText(feast, date) {
  return [feast.title, feast.rankLabel, ...feast.placeLabels, date.format('DD.MM.YYYY')]
    .join(' ')
    .toLocaleLowerCase('be-BY');
}

function rankWeight(rank) {
  return {
    solemnitas: 1,
    solemnity: 1,
    festum: 2,
    feast: 2,
    memoria: 3,
    memorial: 3,
    'memoria-ad-libitum': 4,
  }[rank] || 5;
}

function selectFeast(feast) {
  // Readings are resolved independently by calendar date.
  // Do not leak a days document id into that query path.
  emit('feast-selected', {
    dayId: props.mode === 'readings' ? '' : feast.id,
    date: feast.calendarDate,
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
