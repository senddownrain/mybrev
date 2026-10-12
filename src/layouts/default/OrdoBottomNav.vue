<template>
  <div class="pill-nav-outer">
    <div class="pill-nav-row">

      <!-- Prev-day arrow -->
      <button
        class="arrow-btn"
        :aria-label="isMonth ? 'Папярэдні месяц' : 'Папярэдні дзень'"
        @click="goToPrev"
      >
        <PhCaretLeft :size="20" />
      </button>

      <!-- Dark pill -->
      <div class="pill">
        <button
          class="pill-item"
          :class="{ 'pill-item--active': isMonth }"
          aria-label="Месяц"
          @click="openMonth"
        >
          <PhListBullets :size="23" />
        </button>

        <button
          class="pill-item"
          :class="{ 'pill-item--active': !isMonth && activeIndex === 1 }"
          aria-label="Сёння"
          @click="goToday"
        >
          <PhSunHorizon :size="23" />
        </button>

        <button
          class="pill-item"
          :class="{ 'pill-item--active': !isMonth && activeIndex === 2 }"
          aria-label="Каляндар"
          @click="toggleCalendarDialog"
        >
          <PhCalendarBlank :size="23" />
        </button>
      </div>

      <!-- Next-day arrow -->
      <button
        class="arrow-btn"
        :aria-label="isMonth ? 'Наступны месяц' : 'Наступны дзень'"
        @click="goToNext"
      >
        <PhCaretRight :size="20" />
      </button>

    </div>

    <!-- Calendar dialog -->
    <v-dialog
      v-model="isCalendarDialogOpen"
      width="calc(100% - 24px)"
      max-width="420"
      scrim="black"
      :persistent="false"
      class="liturgical-date-dialog"
      scroll-strategy="block"
    >
      <v-card class="date-dialog-card" rounded="xl" elevation="18">
        <v-card-title class="date-dialog-title">
          <div>
            <div class="date-dialog-eyebrow">Каляндар</div>
            <div class="date-dialog-heading">Выбраць дату</div>
          </div>
          <v-btn class="date-dialog-close" icon="mdi-close" variant="text" size="small" aria-label="Закрыць" @click="toggleCalendarDialog" />
        </v-card-title>
        <v-card-text class="date-dialog-content pa-0">
          <CustomDatePicker
            v-model="selectedDate"
            color="primary"
            :first-day-of-week="1"
            show-adjacent-months
            liturgical
            :diocese="ordoDioceseFilter"
          />
        </v-card-text>
        <v-card-actions class="date-dialog-actions">
          <v-btn class="today-date-btn" variant="text" prepend-icon="mdi-calendar-today" @click="selectToday">Сёння</v-btn>
          <v-spacer />
          <v-btn variant="flat" rounded="lg" class="select-date-btn" @click="loadDay">Выбраць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import CustomDatePicker from '@/components/common/CustomDatePicker.vue';
import '@/styles/date-dialog.css';
import moment from '@/utils/moment-be';
import { PhListBullets, PhSunHorizon, PhCalendarBlank, PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';
import { ordoMonthRoute, ordoRouteFor, parseOrdoMonth, shiftOrdoMonth } from '@/utils/ordoScreen';
import { ordoDioceseFilter } from '@/utils/ordoMonthFilter';

// Navigation of the Ordo screen: on `/ordo` the arrows page months, on
// `/ordo/:date` days. The same pill and date dialog as the Hours and Readings.
const route = useRoute();
const router = useRouter();
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar();
const selectedDate = ref(new Date());

const today = computed(() => moment().startOf('day'));

const currentRouteDate = computed(() => {
  const m = route.params.date ? moment(route.params.date, 'YYYY-MM-DD', true) : null;
  return m?.isValid() ? m.startOf('day') : moment().startOf('day');
});

const activeIndex = computed(() => (currentRouteDate.value.isSame(today.value, 'day') ? 1 : 2));

const isMonth = computed(() => route.name === 'Ordo');
const todayIso = computed(() => today.value.format('YYYY-MM-DD'));
const monthCursor = computed(() => parseOrdoMonth(route.query.month, todayIso.value));

function navigateToDate(m) {
  router.push(ordoRouteFor(m.format('YYYY-MM-DD')));
}

function goToPrev() {
  if (isMonth.value) router.push(ordoMonthRoute(shiftOrdoMonth(monthCursor.value, -1), todayIso.value));
  else navigateToDate(currentRouteDate.value.clone().subtract(1, 'day'));
}
function goToNext() {
  if (isMonth.value) router.push(ordoMonthRoute(shiftOrdoMonth(monthCursor.value, 1), todayIso.value));
  else navigateToDate(currentRouteDate.value.clone().add(1, 'day'));
}

/** Month view: the current month, scrolled to today. Day view: today's detail. */
async function goToday() {
  if (!isMonth.value) { navigateToDate(today.value); return; }
  await router.push({ name: 'Ordo' });
  await nextTick();
  document.querySelector('.month-day--today')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** The month of the day being viewed (from the month view: back to today's). */
function openMonth() {
  const date = isMonth.value ? today.value : currentRouteDate.value;
  router.push(ordoMonthRoute({ year: date.year(), month: date.month() + 1 }, todayIso.value));
}

function selectToday() { selectedDate.value = new Date(); }

watch(isCalendarDialogOpen, (open) => {
  if (open) selectedDate.value = currentRouteDate.value.toDate();
});

function loadDay() {
  toggleCalendarDialog();
  const m = moment(selectedDate.value);
  if (m.isValid()) navigateToDate(m.startOf('day'));
}
</script>

<style scoped>
.pill-nav-outer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-bottom: var(--bottom-nav-inset);
  pointer-events: none;
}

.pill-nav-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px 12px;
  pointer-events: none;
}

.pill {
  display: flex;
  align-items: center;
  height: var(--bottom-nav-height);
  background: var(--overlay-surface);
  border: 1px solid var(--nav-border);
  border-radius: 32px;
  padding: 0 4px;
  box-shadow: 0 10px 30px var(--nav-shadow);
  pointer-events: auto;
  backdrop-filter: blur(20px) saturate(1.08);
}

.pill-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 52px;
  border: none;
  background: transparent;
  border-radius: 26px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.16s ease;
  color: var(--nav-muted);
}
.pill-item:active {
  opacity: 0.72;
  transform: scale(0.94);
}
.pill-item--active {
  background: rgba(var(--chrome-accent-rgb), 0.12);
  color: var(--chrome-accent);
}

.arrow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border: none;
  background: var(--overlay-surface);
  border-radius: 50%;
  cursor: pointer;
  color: var(--nav-on-surface);
  border: 1px solid var(--nav-border);
  box-shadow: 0 8px 24px var(--nav-shadow);
  transition: opacity 0.15s ease, transform 0.15s ease;
  pointer-events: auto;
  backdrop-filter: blur(18px);
}
.arrow-btn:active {
  opacity: 0.68;
  transform: scale(0.94);
}

@media (max-width: 359px) {
  .pill-nav-row {
    gap: 8px;
    padding-inline: 8px;
  }

  .arrow-btn {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
  }
}

</style>
