<template>
  <div class="pill-nav-outer">
    <div class="pill-nav-row">

      <!-- Prev-day arrow (readings date routes only) -->
      <button
        v-if="showArrows"
        class="arrow-btn"
        aria-label="Папярэдні дзень"
        @click="goToPrevDay"
      >
        <PhCaretLeft :size="20" />
      </button>

      <!-- Dark pill -->
      <div class="pill">
        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 0 }"
          aria-label="Выбраць"
          @click="navigateTo('/readings/picker')"
        >
          <PhListBullets :size="23" />
        </button>

        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 1 }"
          aria-label="Сёння"
          @click="navigateTo('/readings')"
        >
          <PhSunHorizon :size="23" />
        </button>

        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 2 }"
          aria-label="Каляндар"
          @click="toggleCalendarDialog"
        >
          <PhCalendarBlank :size="23" />
        </button>
      </div>

      <!-- Next-day arrow -->
      <button
        v-if="showArrows"
        class="arrow-btn"
        aria-label="Наступны дзень"
        @click="goToNextDay"
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
      :z-index="110"
    >
      <v-card class="date-dialog-card" rounded="xl" elevation="18">
        <v-card-title class="date-dialog-title">
          <div>
            <div class="date-dialog-eyebrow">Каляндар</div>
            <div class="date-dialog-heading">Выбраць дату</div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Закрыць" @click="toggleCalendarDialog" />
        </v-card-title>
        <v-card-text class="pa-0">
          <CustomDatePicker
            v-model="selectedDate"
            color="primary"
            :first-day-of-week="1"
            show-adjacent-months
          />
        </v-card-text>
        <v-card-actions class="date-dialog-actions">
          <v-btn variant="text" prepend-icon="mdi-calendar-today" @click="selectToday">Сёння</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" rounded="lg" class="select-date-btn" @click="loadDay">Выбраць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppBar } from '@/composables/useAppBar';
import CustomDatePicker from '@/components/common/CustomDatePicker.vue';
import moment from '@/utils/moment-be';
import { PhListBullets, PhSunHorizon, PhCalendarBlank, PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';

const route  = useRoute();
const router = useRouter();
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar();
const selectedDate = ref(new Date());

const ARROW_ROUTES = new Set(['Readings', 'ReadingsByDate']);
const showArrows = computed(() => ARROW_ROUTES.has(route.name));

const currentRouteDate = computed(() => {
  if (route.name === 'Readings') return moment().startOf('day');
  if (route.params.date) {
    const m = moment(route.params.date, 'YYYY-MM-DD');
    if (m.isValid()) return m.startOf('day');
  }
  return moment().startOf('day');
});

const today = computed(() => moment().startOf('day'));

const activeIndex = computed(() => {
  if (route.name === 'ReadingsPicker') return 0;
  if (currentRouteDate.value.isSame(today.value, 'day')) return 1;
  return 2;
});

function navigateTo(path) { router.push(path); }

function goToPrevDay() {
  navigateToDate(currentRouteDate.value.clone().subtract(1, 'day'));
}
function goToNextDay() {
  navigateToDate(currentRouteDate.value.clone().add(1, 'day'));
}
function navigateToDate(m) {
  if (m.isSame(today.value, 'day')) {
    router.push('/readings');
  } else {
    router.push(`/readings/${m.format('YYYY-MM-DD')}`);
  }
}

function selectToday() { selectedDate.value = new Date(); }

watch(isCalendarDialogOpen, (open) => {
  if (!open) return;
  const d = currentRouteDate.value;
  selectedDate.value = d.isValid() ? d.toDate() : new Date();
});

function loadDay() {
  toggleCalendarDialog();
  if (!selectedDate.value) return;
  const m = moment(selectedDate.value);
  if (!m.isValid()) return;
  navigateToDate(m.startOf('day'));
}
</script>

<style scoped>
.pill-nav-outer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 8px);
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
  height: 64px;
  background: #1f1f1f;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 32px;
  padding: 0 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  pointer-events: auto;
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
  color: rgba(255, 255, 255, 0.45);
}
.pill-item:active {
  opacity: 0.72;
  transform: scale(0.94);
}
.pill-item--active {
  background: #FFFFFF;
  color: #111111;
}

.arrow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border: none;
  background: #1f1f1f;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  transition: opacity 0.15s ease, transform 0.15s ease;
  pointer-events: auto;
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

.date-dialog-card {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgb(var(--v-theme-surface));
}
.date-dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 8px !important;
}
.date-dialog-eyebrow {
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.date-dialog-heading {
  margin-top: 3px;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
}
.date-dialog-actions {
  padding: 10px 16px 16px !important;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
}
.select-date-btn {
  min-width: 112px;
  box-shadow: 0 5px 14px rgba(var(--v-theme-primary), 0.24);
}
</style>
