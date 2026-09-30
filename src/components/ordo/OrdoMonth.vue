<template>
  <section class="ordo-month" aria-labelledby="ordo-month-title">
    <header class="month-header">
      <button type="button" class="month-arrow" aria-label="Папярэдні месяц" @click="go(-1)"><PhCaretLeft :size="18" weight="bold" /></button>
      <h2 id="ordo-month-title">{{ title }}</h2>
      <button type="button" class="month-arrow" aria-label="Наступны месяц" @click="go(1)"><PhCaretRight :size="18" weight="bold" /></button>
    </header>

    <ol class="month-list">
      <li v-for="item in days" :key="item.date" :ref="(element) => registerDay(item.date, element)">
        <router-link
          :to="ordoRouteFor(item.date)"
          class="month-day"
          :class="{ 'month-day--today': item.date === today, 'month-day--sunday': item.isSunday }"
          :aria-current="item.date === today ? 'date' : undefined"
        >
          <span class="month-day__date"><strong>{{ item.dayOfMonth }}</strong><small>{{ item.weekday }}</small></span>
          <span class="month-day__rows">
            <span
              v-for="row in item.rows"
              :key="row.key"
              class="month-row"
              :class="[`month-row--${row.role}`, { 'month-row--celebration': row.isCelebration }]"
            >
              <span class="color-dot" :style="{ '--dot': colorInfo(row.color).swatch }" :title="colorInfo(row.color).label" aria-hidden="true"></span>
              <span class="month-row__copy">
                <span class="month-row__title">{{ row.title }}</span>
                <small v-if="rowMeta(row)">{{ rowMeta(row) }}</small>
              </span>
              <span v-if="row.badges.length" class="month-row__badges">
                <span v-for="badge in row.badges" :key="badge" class="badge">{{ badge }}</span>
              </span>
            </span>
          </span>
        </router-link>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';
import moment from '@/utils/moment-be';
import { ordoDioceseFilter } from '@/utils/ordoMonthFilter';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import {
  buildMonthUnion, colorInfo, ordoMonthKey, ordoMonthRoute, ordoRouteFor, parseOrdoMonth, shiftOrdoMonth,
} from '@/utils/ordoScreen';

const route = useRoute();
const router = useRouter();
const today = moment().format('YYYY-MM-DD');

// One month at a time: the current month, or the one named by `?month=`.
const cursor = computed(() => parseOrdoMonth(route.query.month, today));
const days = computed(() => (ordoCalendarEpoch.value, buildMonthUnion(cursor.value.year, cursor.value.month, ordoDioceseFilter.value)));
const title = computed(() => {
  const text = moment({ year: cursor.value.year, month: cursor.value.month - 1, day: 1 }).format('MMMM YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
});

const ROLE_LABELS = { alternative: 'на выбар', commemoration: 'успамін (commemoratio)' };
const rowMeta = (row) => [row.isCelebration || row.role !== 'primary' ? row.rank : '', ROLE_LABELS[row.role] || '']
  .filter(Boolean).join(' · ');

function go(delta) {
  router.push(ordoMonthRoute(shiftOrdoMonth(cursor.value, delta), today));
}

const dayElements = new Map();
function registerDay(date, element) {
  if (element) dayElements.set(date, element); else dayElements.delete(date);
}
// Opening the current month lands on today.
async function scrollToToday() {
  if (ordoMonthKey(cursor.value) !== today.slice(0, 7)) return;
  await nextTick();
  // After the router has reset the scroll position of the new page.
  window.setTimeout(() => dayElements.get(today)?.scrollIntoView({ block: 'center' }), 80);
}
onMounted(scrollToToday);
watch(() => ordoMonthKey(cursor.value), scrollToToday);
defineExpose({ scrollToToday });
</script>

<style scoped>
.ordo-month { margin: 0 12px 14px; overflow: hidden; border: 1px solid var(--nav-border); border-radius: 24px; background: var(--nav-surface); box-shadow: 0 5px 20px var(--nav-button-shadow); }
.month-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; }
.month-header h2 { margin: 0; color: var(--nav-on-surface); font-family: var(--reader-display-font-family); font-size: 1.25rem; font-weight: 700; letter-spacing: -.01em; }
.month-arrow { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid var(--nav-border); border-radius: 12px; background: transparent; color: var(--nav-on-surface); cursor: pointer; }
.month-arrow:active { transform: scale(.95); }
.month-list { margin: 0; padding: 0 10px 12px; list-style: none; }
.month-day { display: flex; align-items: flex-start; gap: 12px; padding: 9px 10px; border-radius: 14px; color: var(--nav-on-surface); text-decoration: none; -webkit-tap-highlight-color: transparent; }
.month-day:hover { background: var(--nav-active); }
.month-day--today { background: rgba(var(--chrome-accent-rgb), .11); }
.month-day__date { display: grid; flex: 0 0 34px; justify-items: center; padding-top: 1px; line-height: 1.05; }
.month-day__date strong { font-size: 1.02rem; font-weight: 750; }
.month-day__date small { color: var(--nav-muted); font-size: .64rem; font-weight: 700; text-transform: uppercase; }
.month-day--today .month-day__date strong { color: var(--chrome-accent); }
.month-day--sunday .month-day__date strong, .month-day--sunday .month-day__date small { color: var(--rubric-color); }
.month-day__rows { display: grid; flex: 1; min-width: 0; gap: 6px; }
.month-row { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
.month-row .color-dot { display: inline-block; flex: 0 0 11px; width: 11px; height: 11px; margin-top: 4px; border: 1px solid rgba(0, 0, 0, .18); border-radius: 50%; background: var(--dot); }
:global(.v-theme--dark) .month-row .color-dot { border-color: rgba(255, 255, 255, .28); }
.month-row__copy { display: grid; flex: 1; min-width: 0; gap: 1px; }
.month-row__title { font-size: .86rem; line-height: 1.3; overflow-wrap: anywhere; }
.month-row--celebration.month-row--primary .month-row__title { font-weight: 680; }
.month-row--alternative .month-row__title, .month-row--commemoration .month-row__title { color: var(--nav-muted); }
.month-row__copy small { color: var(--nav-muted); font-size: .72rem; }
.month-row__badges { display: flex; flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 46%; }
.badge { padding: 2px 7px; border-radius: 99px; background: rgba(var(--chrome-accent-rgb), .12); color: var(--chrome-accent); font-size: .63rem; font-weight: 750; white-space: nowrap; }
@media (max-width: 359px) { .ordo-month { margin-inline: 8px; } }
</style>
