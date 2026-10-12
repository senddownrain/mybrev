<template>
  <!-- Outer safe-area wrapper -->
  <div class="pill-nav-outer">
    <div class="pill-nav-row">

      <!-- Prev-day arrow (day routes only) -->
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
        <!-- Picker -->
        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 0 }"
          aria-label="Выбраць"
          @click="navigateTo('/picker')"
        >
          <PhListBullets :size="23" />
        </button>

        <!-- Today / Home -->
        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 1 }"
          aria-label="Сёння"
          @click="goHome"
        >
          <PhSunHorizon :size="23" />
        </button>

        <!-- Calendar picker -->
        <button
          class="pill-item"
          :class="{ 'pill-item--active': activeIndex === 2 }"
          aria-label="Каляндар"
          @click="toggleCalendarDialog"
        >
          <PhCalendarBlank :size="23" />
        </button>
      </div>

      <!-- Next-day arrow (day routes only) -->
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
            show-options
            :diocese="effectiveOrdoDioceses"
            @select-option="openOption"
          />
        </v-card-text>
        <v-card-actions class="date-dialog-actions">
          <v-btn class="today-date-btn" variant="text" prepend-icon="mdi-calendar-today" @click="selectToday">Сёння</v-btn>
          <v-spacer />
          <v-btn class="choose-date-btn" variant="flat" color="primary" rounded="lg" data-test="choose-date" @click="chooseDate">Выбраць</v-btn>
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
import '@/styles/date-dialog.css';
import { effectiveOrdoDiocese, effectiveOrdoDioceses, ordoDiocese } from '@/utils/ordoDiocese';
import { pickerDateRoute, pickerRouteFor } from '@/utils/ordoDatePicker';
import moment from '@/utils/moment-be';
import { PhListBullets, PhSunHorizon, PhCalendarBlank, PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue';

const route  = useRoute();
const router = useRouter();
const { isCalendarDialogOpen, toggleCalendarDialog } = useAppBar();

const selectedDate = ref(new Date());

// Routes where date arrows appear
const DAY_ROUTES = new Set(['Today', 'SelectedDay']);
const showArrows = computed(() => DAY_ROUTES.has(route.name));

const currentRouteDate = computed(() => {
  if (route.name === 'Today' || route.path === '/') return moment().startOf('day');
  if (route.params.day) {
    const m = moment(route.params.day, 'YYYY-MM-DD');
    if (m.isValid()) return m.startOf('day');
  }
  return moment().startOf('day');
});

const today = computed(() => moment().startOf('day'));

const activeIndex = computed(() => {
  if (route.name === 'LiturgicalPicker') return 0;
  if (currentRouteDate.value.isSame(today.value, 'day')) return 1;
  return 2;
});

function navigateTo(path) { router.push(path); }

function goHome() {
  router.push('/');
}

function goToPrevDay() {
  const prev = currentRouteDate.value.clone().subtract(1, 'day');
  navigateToDate(prev);
}

function goToNextDay() {
  const next = currentRouteDate.value.clone().add(1, 'day');
  navigateToDate(next);
}

function navigateToDate(m) {
  if (m.isSame(today.value, 'day')) {
    router.push('/');
  } else {
    router.push(`/day/${m.format('YYYY-MM-DD')}`);
  }
}

function selectToday() { selectedDate.value = new Date(); }

// A date alone does not navigate: the user picks one of its legal options,
// resolved by the same engine as the screen it opens.
function openOption({ option, date }) {
  toggleCalendarDialog();
  router.push(pickerRouteFor(option, date, 'hours', {
    // An option of only some selected dioceses opens in its own diocese.
    today: moment().format('YYYY-MM-DD'), diocese: option.diocese || effectiveOrdoDiocese.value, defaultDiocese: ordoDiocese.value,
  }));
}

// «Выбраць»: the date alone opens the main screen of that day with every
// legal option; tapping an option above opens that option directly.
function chooseDate() {
  const date = moment(selectedDate.value).format('YYYY-MM-DD');
  toggleCalendarDialog();
  router.push(pickerDateRoute(date, 'hours', {
    today: moment().format('YYYY-MM-DD'), diocese: effectiveOrdoDiocese.value, defaultDiocese: ordoDiocese.value,
  }));
}

watch(isCalendarDialogOpen, (open) => {
  if (!open) return;
  try {
    const d = currentRouteDate.value;
    selectedDate.value = d.isValid() ? d.toDate() : new Date();
  } catch {
    selectedDate.value = new Date();
  }
});
</script>

<style scoped>
/* ── outer wrapper ── */
.pill-nav-outer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 8px);
  pointer-events: none; /* let clicks through where no interactive child */
}

/* ── row containing arrows + pill ── */
.pill-nav-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px 12px;
  pointer-events: none;
}

/* ── dark pill ── */
.pill {
  display: flex;
  align-items: center;
  height: 64px;
  background: var(--overlay-surface);
  border: 1px solid var(--nav-border);
  border-radius: 32px;
  padding: 0 4px;
  box-shadow: 0 10px 30px var(--nav-shadow);
  pointer-events: auto;
  backdrop-filter: blur(20px) saturate(1.08);
}

/* ── each icon slot inside pill ── */
.pill-item {
  position: relative;
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

.pill-item .v-icon { transition: color 0.18s ease; }

/* ── arrow buttons ── */
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

/* ── calendar dialog ── */
.choose-date-btn { min-width: 112px; font-weight: 720; letter-spacing: 0; text-transform: none; }
.date-dialog-hint {
  padding-right: 8px;
  color: var(--nav-muted);
  font-size: 0.76rem;
}
</style>
