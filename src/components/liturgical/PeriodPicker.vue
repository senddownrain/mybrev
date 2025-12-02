<template>
  <div>
    <!-- Блок выбора периода -->
    <div class="mb-6">
      <h3 class="text-subtitle-1 mb-3">Літургічны перыяд</h3>
      <v-chip-group
        v-model="selectedPeriod"
        mandatory
        column
      >
        <v-chip
          v-for="period in periodOptions"
          :key="period.value"
          :value="period.value"
          :color="period.color"
          filter
          variant="outlined"
          class="ma-1"
        >
          {{ period.title }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Блок выбора недели -->
    <div v-if="selectedPeriod" class="mb-6">
      <h3 class="text-subtitle-1 mb-3">Тыдзень</h3>
      <v-chip-group
        v-model="selectedWeek"
        mandatory
        column
      >
        <v-chip
          v-for="week in availableWeeks"
          :key="week"
          :value="week"
          filter
          variant="outlined"
          class="ma-1"
        >
          {{ week }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Блок выбора дня недели -->
    <div v-if="selectedPeriod && selectedWeek" class="mb-6">
      <h3 class="text-subtitle-1 mb-3">Дзень тыдня</h3>
      <v-chip-group
        v-model="selectedDayOfWeek"
        mandatory
        column
      >
        <v-chip
          v-for="day in dayOfWeekOptions"
          :key="day.value"
          :value="day.value"
          filter
          variant="outlined"
          class="ma-1"
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
import moment from 'moment';
import 'moment/dist/locale/be';

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

const periodOptions = [
  { value: 'ordinary', title: 'Звычайны перыяд', color: 'success' }, // Зеленый
  { value: 'advent', title: 'Адвэнт', color: 'purple' }, // Фиолетовый
  { value: 'christmas', title: 'Перыяд Божага Нараджэння', color: 'amber' }, // Золотой/желтый
  { value: 'lent', title: 'Вялікі Пост', color: 'purple' }, // Фиолетовый
  { value: 'holyweek', title: 'Вялікі тыдзень', color: 'purple' }, // Фиолетовый
  { value: 'easter', title: 'Велікодны перыяд', color: 'amber' }, // Золотой/желтый
];

const dayOfWeekOptions = [
  { value: 1, title: 'Нядзеля' },
  { value: 2, title: 'Панядзелак' },
  { value: 3, title: 'Аўторак' },
  { value: 4, title: 'Серада' },
  { value: 5, title: 'Чацвер' },
  { value: 6, title: 'Пятніца' },
  { value: 7, title: 'Субота' },
];

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
  const periodMap = {
    ordinary: 'Звычайны перыяд',
    advent: 'Адвэнт',
    lent: 'Вялікі Пост',
    easter: 'Велікодны перыяд',
    christmas: 'Перыяд Нараджэння Пана',
    holyweek: 'Вялікі тыдзень'
  };
  const periodName = periodMap[day._periodType] || 'Перыяд';
  const dayName = dayOfWeekOptions.find(d => d.value === parseInt(day._dayOfWeek))?.title || '';
  return `${periodName}, ${day._periodWeekNumber} тыдзень, ${dayName}`;
}

function getRankName(rank) {
  const rankMap = {
    solemnity: 'Урачыстасць',
    feast: 'Свята',
    memorial: 'Успамін'
  };
  return rankMap[rank] || rank;
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

