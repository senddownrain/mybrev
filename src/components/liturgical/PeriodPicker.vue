<template>
  <section class="period-picker">
    <label>Перыяд
      <select v-model="period" aria-label="Перыяд">
        <option value="">Усе перыяды</option>
        <option v-for="(label, key) in PERIOD_LABEL_MAP" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <label>Пошук пазіцыі
      <input v-model="query" type="search" aria-label="Пошук пазіцыі" placeholder="Тыдзень, дзень або дата">
    </label>
    <p>Літургічныя пазіцыі не залежаць ад года. Даступныя крыніцы можна праглядзець асобна.</p>
    <p aria-live="polite">Знойдзена: {{ entries.length }}</p>
    <div class="period-results">
      <button v-for="entry in entries" :key="entry.id" type="button" @click="$emit('day-selected', entry)">
        {{ entry.title }} <span aria-hidden="true">→</span>
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PERIOD_LABEL_MAP } from '@/constants/liturgical';
import { periodCatalog } from '@/utils/liturgicalCatalog';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
defineEmits(['day-selected']);
const route = useRoute(), router = useRouter();
const period = computed({ get: () => String(route.query.period || ''), set: (value) => router.replace({ query: { ...route.query, period: value || undefined } }) });
const query = computed({ get: () => String(route.query.position || ''), set: (value) => router.replace({ query: { ...route.query, position: value || undefined } }) });
const entries = computed(() => (ordoCalendarEpoch.value, periodCatalog()).filter((entry) => (!period.value || entry.periodKey === period.value)
  && entry.title.toLocaleLowerCase('be').includes(query.value.trim().toLocaleLowerCase('be'))));
</script>
<style scoped>
.period-picker, label, .period-results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; min-width: 0; }
input, select, button { color: rgb(var(--v-theme-on-surface)); background: var(--nav-surface); border: 1px solid var(--nav-border); border-radius: 16px; padding: 14px; font: inherit; width: 100%; min-width: 0; }
option { background: rgb(var(--v-theme-surface)); }
button { text-align: left; cursor: pointer; overflow-wrap: anywhere; }
p { color: var(--nav-muted); }
button:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 2px; }
</style>
