<template>
  <div>
    <!-- Блок выбора периода -->
    <div class="mb-8">
      <h3 class="text-h6 mb-4 font-weight-medium">Літургічны перыяд</h3>
      <v-chip-group
        v-model="selectedPeriod"
        mandatory
        column
        class="period-chip-group"
      >
        <v-chip
          v-for="period in periodOptions"
          :key="period.value"
          :value="period.value"
          :color="period.color"
          filter
          variant="outlined"
          size="large"
          class="ma-2 period-chip"
        >
          {{ period.title }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Блок выбора недели -->
    <div v-if="selectedPeriod" class="mb-8">
      <h3 class="text-h6 mb-4 font-weight-medium">Тыдзень</h3>
      <v-chip-group
        v-model="selectedWeek"
        mandatory
        column
        class="week-chip-group"
      >
        <v-chip
          v-for="week in availableWeeks"
          :key="week"
          :value="week"
          filter
          variant="outlined"
          size="large"
          class="ma-2 week-chip"
        >
          {{ week }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Блок выбора дня недели -->
    <div v-if="selectedPeriod && selectedWeek" class="mb-8">
      <h3 class="text-h6 mb-4 font-weight-medium">Дзень тыдня</h3>
      <v-chip-group
        v-model="selectedDayOfWeek"
        mandatory
        column
        class="day-chip-group"
      >
        <v-chip
          v-for="day in dayOfWeekOptions"
          :key="day.value"
          :value="day.value"
          filter
          variant="outlined"
          size="large"
          class="ma-2 day-chip"
        >
          {{ day.title }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Результат -->
    <div v-if="selectedPeriod && selectedWeek && selectedDayOfWeek">
      <v-card v-if="loading" class="pa-4">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
        <span class="ml-3">Пошук...</span>
      </v-card>

      <v-card v-else-if="foundDay" variant="outlined" class="pa-4">
        <v-card-title class="text-h6 mb-2">
          {{ getPeriodTitle(foundDay) }}
        </v-card-title>
        <v-card-subtitle>
          <div v-if="foundDay._feastName">{{ foundDay._feastName }}</div>
          <div v-if="foundDay._feastType">{{ getRankName(foundDay._feastType) }}</div>
          <div v-if="foundDay._psalmWeek">{{ foundDay._psalmWeek }}</div>
        </v-card-subtitle>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            variant="flat"
            @click="openDay"
          >
            Адкрыць малітвы
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card v-else variant="outlined" class="pa-4">
        <v-card-text>
          <p>Для абранага перыяду і дня няма запісу ў базе.</p>
          <v-btn
            v-if="isAdmin"
            color="primary"
            variant="outlined"
            class="mt-2"
            @click="createDay"
          >
            Стварыць гэты дзень
          </v-btn>
          <p v-else class="text-caption mt-2">
            Для абранага перыяду і дня няма запісу. Звярніцеся да адміністратара, каб дадаць гэты дзень.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { useAuthStore } from '@/stores/auth';
import { useCalendarStore } from '@/stores/calendar';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP, FEAST_TYPE_LABEL_MAP, PERIOD_COLORS } from '@/constants/liturgical';

const props = defineProps({
  year: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['day-selected']);

const router = useRouter();
const { findDayByPeriod, calculateDateForPeriod } = useLiturgicalDay();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();

const isAdmin = computed(() => authStore.isAdmin);

const selectedPeriod = ref(null);
const selectedWeek = ref(null);
const selectedDayOfWeek = ref(null);
const foundDay = ref(null);
const loading = ref(false);

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({
  value,
  title,
  color: PERIOD_COLORS[value] || 'grey',
}));

const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({
  value: parseInt(value, 10),
  title,
}));

// Максимальное количество недель для каждого периода
const maxWeeksForPeriod = {
  ordinary: 34,
  advent: 4,
  christmas: 6,
  lent: 6,
  holyweek: 1,
  easter: 7,
};

const availableWeeks = computed(() => {
  if (!selectedPeriod.value) return [];
  const maxWeeks = maxWeeksForPeriod[selectedPeriod.value] || 10;
  return Array.from({ length: maxWeeks }, (_, i) => i + 1);
});

// Сбрасываем неделю и день при смене периода
watch(selectedPeriod, () => {
  selectedWeek.value = null;
  selectedDayOfWeek.value = null;
  foundDay.value = null;
});

// Сбрасываем день при смене недели
watch(selectedWeek, () => {
  selectedDayOfWeek.value = null;
  foundDay.value = null;
});

// Ищем день при выборе всех параметров
watch([selectedPeriod, selectedWeek, selectedDayOfWeek], async ([period, week, day]) => {
  if (period && week && day) {
    await searchDay(period, week, day);
  }
});

async function searchDay(periodType, periodWeekNumber, dayOfWeek) {
  loading.value = true;
  foundDay.value = null;
  
  try {
    const day = await findDayByPeriod(periodType, periodWeekNumber, dayOfWeek);
    foundDay.value = day;
  } catch (error) {
    logger.error('Памылка пры пошуку дня:', error);
  } finally {
    loading.value = false;
  }
}

function getPeriodTitle(day) {
  const periodName = PERIOD_LABEL_MAP[day._periodType] || 'Перыяд';
  const dayName = dayOfWeekOptions.find(d => d.value === parseInt(day._dayOfWeek, 10))?.title || '';
  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
}

function getRankName(rank) {
  return FEAST_TYPE_LABEL_MAP[rank] || rank;
}

async function openDay() {
  if (!foundDay.value) return;
  
  // Вычисляем дату для этого дня
  const date = await getDateForPeriod();
  
  emit('day-selected', {
    dayId: foundDay.value.id,
    date: date
  });
}

async function getDateForPeriod() {
  const date = await calculateDateForPeriod(
    props.year,
    selectedPeriod.value,
    selectedWeek.value,
    selectedDayOfWeek.value
  );
  return date || moment().format('YYYY-MM-DD');
}

function createDay() {
  const queryParams = {
    _periodType: selectedPeriod.value,
    _periodWeekNumber: selectedWeek.value,
    _dayOfWeek: selectedDayOfWeek.value,
  };
  
  router.push({
    name: 'AdminDayEditor',
    params: { id: 'new' },
    query: queryParams
  });
}
</script>

<style scoped>
/* Увеличение размера текста в чипах для лучшей читаемости */
.period-chip,
.week-chip,
.day-chip {
  font-size: 1.1rem !important;
  font-weight: 500 !important;
  min-height: 48px !important;
  padding: 12px 20px !important;
  letter-spacing: 0.02em;
}

/* Увеличение размера заголовков */
.text-h6 {
  font-size: 1.25rem !important;
  font-weight: 600 !important;
}

/* Улучшение визуального восприятия для людей постарше */
.period-chip-group,
.week-chip-group,
.day-chip-group {
  gap: 8px;
}

/* Увеличение размера чипов на мобильных */
@media (max-width: 600px) {
  .period-chip,
  .week-chip,
  .day-chip {
    font-size: 1.05rem !important;
    min-height: 44px !important;
    padding: 10px 16px !important;
  }
  
  .text-h6 {
    font-size: 1.15rem !important;
  }
}
</style>

