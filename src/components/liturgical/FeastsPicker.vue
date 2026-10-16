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
        <span>Незалежна ад года</span>
      </div>

      <div class="feast-list">
        <button
          v-for="feast in filteredFeasts"
          :key="feast.key"
          type="button"
          class="feast-row"
          @click="selectFeast(feast)"
        >
          <div class="date-tile">
            <strong>{{ feast.dateRule.type === 'fixed' ? feast.dateLabel.slice(0, 2) : '↔' }}</strong>
            <span>{{ feast.dateRule.type === 'fixed' ? feast.dateLabel.slice(3) : 'рухомае' }}</span>
          </div>

          <div class="feast-copy">
            <div class="feast-source">
              <PhCalendarBlank v-if="feast.isFixed" :size="14" />
              <PhCalendarDots v-else :size="14" />
              {{ feast.isDynamic ? 'Рухомае' : 'Нерухомае' }}
            </div>
            <h3>{{ feast.title }}</h3>
            <p>{{ feast.dateLabel }}</p>
            <VestmentMarker :color="feast.color || 'albus'" />
            <p>{{ catalogContentLabel(feast) }}</p>
            <div class="feast-meta">
              <span v-if="feast.rankLabel" class="rank-badge">{{ feast.rankLabel }}</span>
              <span v-for="place in feast.placeLabels" :key="place" class="place-badge">
                <PhMapPin :size="13" />{{ place }}
              </span>
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
import { computed, ref } from 'vue';
import { feastCatalog, catalogMatches, catalogContentLabel } from '@/utils/liturgicalCatalog';
import { ordoDioceses } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { useRoute, useRouter } from 'vue-router';
import VestmentMarker from './VestmentMarker.vue';
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

defineProps({
  mode: { type: String, default: 'oras' },
});

const emit = defineEmits(['feast-selected']);

const route = useRoute();
const router = useRouter();
const searchQuery = computed({ get: () => String(route.query.q || ''), set: (q) => router.replace({ query: { ...route.query, q: q || undefined } }) });
const sourceFilter = computed({ get: () => String(route.query.filter || 'all'), set: (filter) => router.replace({ query: { ...route.query, filter } }) });
// The list is computed by the Ordo engine on the device: no `days` read.
const loading = ref(false);

const sourceFilters = [
  { value: 'all', label: 'Усе' },
  { value: 'fixed', label: 'Нерухомыя' },
  { value: 'dynamic', label: 'Рухомыя' },
];

const openLabel = 'Падрабязнасці святкавання';

/** Active layered definitions, including celebrations impeded in any given year. */
const preparedFeasts = computed(() => (ordoCalendarEpoch.value, feastCatalog(ordoDioceses.value))
  .map((item) => ({ ...item, isDynamic: item.dateRule.type !== 'fixed', isFixed: item.dateRule.type === 'fixed' })));

const filteredFeasts = computed(() => preparedFeasts.value.filter((feast) => catalogMatches(feast, searchQuery.value, sourceFilter.value)));

const resultCountLabel = computed(() => {
  const count = filteredFeasts.value.length;
  if (count % 10 === 1 && count % 100 !== 11) return `${count} свята`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} святы`;
  return `${count} святаў`;
});
function selectFeast(feast) {
  emit('feast-selected', feast);
}

function resetFilters() {
  router.replace({ query: { ...route.query, q: undefined, filter: undefined } });
}
</script>

<style scoped>
.feasts-picker {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.feast-tools {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
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
  flex-wrap: wrap;
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
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
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
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
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
  overflow-wrap: anywhere;
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
  min-width: 0;
  max-width: 100%;
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
