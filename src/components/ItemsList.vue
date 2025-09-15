<template>
  <v-container>
    <!-- Панель навигации по датам -->
    <v-row class="d-flex align-center justify-center mb-4">
      <v-col cols="auto">
        <v-btn icon="mdi-chevron-left" @click="goToPrevDay" :disabled="loading"></v-btn>
      </v-col>
      <v-col cols="auto" class="text-center" style="width: 280px;">
        <h2 class="text-h5 font-weight-regular">
          {{ formattedCurrentDate }}
        </h2>
      </v-col>
      <v-col cols="auto">
        <v-btn icon="mdi-chevron-right" @click="goToNextDay" :disabled="loading"></v-btn>
      </v-col>
    </v-row>

    <!-- Состояние загрузки -->
    <v-row v-if="loading" class="justify-center mt-16">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
    </v-row>

    <!-- Состояние ошибки -->
    <v-row v-else-if="error" class="mt-8">
      <v-col>
        <v-alert type="error" prominent border="start" icon="mdi-alert-circle-outline">
          <div class="text-h6">Ошибка при загрузке</div>
          <p>{{ error }}</p>
        </v-alert>
      </v-col>
    </v-row>

    <!-- Основной список доступных служб -->
    <v-row v-else-if="days.length > 0">
      <v-col>
        <v-list lines="two" bg-color="transparent">
          <v-list-item
            v-for="day in sortedDays"
            :key="day.id"
             :to="`/day/${currentDate.format('YYYY-MM-DD')}/ora/${day.id}`"
            :title="getTitle(day)"
            :subtitle="getSubtitle(day)"
            class="mb-2"
            border
            rounded
          >
            <template v-slot:prepend>
              <v-icon :icon="getIcon(day)" :color="getColor(day)"></v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-col>
    </v-row>
    
    <!-- Состояние, когда для дня нет данных -->
    <v-row v-else class="text-center text-grey mt-10">
       <v-col>
          <v-icon size="48">mdi-book-remove-outline</v-icon>
          <p class="mt-2">Для этого дня не найдено служб.</p>
          <p class="text-caption">Возможно, данные еще не были импортированы в базу.</p>
       </v-col>
    </v-row>

  </v-container>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import moment from 'moment';
import 'moment/locale/be';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';

// --- Инициализация ---
moment.locale('be');
const route = useRoute();
const router = useRouter();
const { getLiturgicalOptionsForDate } = useLiturgicalDay();

// --- Реактивное состояние ---
const days = ref([]);
const loading = ref(true);
const error = ref(null);
const currentDate = ref(moment().startOf('day'));

const fetchItemsForDate = async (date) => {
  console.log(`[ItemsList] Запускаем загрузку для даты: ${date.format('YYYY-MM-DD')}`);
  loading.value = true;
  days.value = [];    // Очищаем 'days'
  error.value = null; // Сбрасываем ошибку
  try {
    const results = await getLiturgicalOptionsForDate(date.toDate());
    // Помещаем результат в 'days.value', а не в 'items.value'
    days.value = results; 
    if (days.value.length === 0) {
      console.warn(`[ItemsList] Для даты ${date.format('YYYY-MM-DD')} не найдено ни одного литургического элемента.`);
    }
  } catch (e) {
    console.error("Произошла критическая ошибка при загрузке данных:", e);
    error.value = e.message || "Не удалось загрузить данные. Попробуйте обновить страницу.";
  } finally {
    loading.value = false;
  }
};

// --- Навигация ---
function navigateToDate(date) {
  const dateString = date.format('YYYY-MM-DD');
  // Явно указываем имя маршрута 'SelectedDay'
  router.push({ name: 'SelectedDay', params: { day: dateString } });
}
const goToNextDay = () => navigateToDate(currentDate.value.clone().add(1, 'day'));
const goToPrevDay = () => navigateToDate(currentDate.value.clone().subtract(1, 'day'));

// --- Вычисляемые свойства для отображения (Computed) ---

// Форматированная дата для заголовка
const formattedCurrentDate = computed(() => {
  const dateStr = currentDate.value.format('dddd, D MMMM YYYY');
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
});

// Ранги для сортировки. Торжества и праздники всегда важнее дней периода.
const rankOrder = { 'solemnity': 1, 'feast': 2, 'memorial': 3 };

// Сортировка списка: сначала праздники по рангу, потом дни периода
const sortedDays = computed(() => {
  return [...days.value].sort((a, b) => {
    const rankA = a._feastType ? rankOrder[a._feastType] || 99 : 100;
    const rankB = b._feastType ? rankOrder[b._feastType] || 99 : 100;
    return rankA - rankB;
  });
});

// --- Функции для форматирования списка (UI Helpers) ---

const getTitle = (day) => {
  if (day.title) return day.title; // Если есть поле title, используем его
  if (day._feastName) return day._feastName;

  const periodMap = {
    ordinary: 'Рядовое время',
    advent: 'Адвент',
    lent: 'Великий Пост',
    easter: 'Пасхальное время',
    christmas: 'Рождественское время'
  };
  const periodName = periodMap[day._periodType] || 'Период';
  const dayOfWeekMap = { 1: 'Воскресенье', 2: 'Понедельник', 3: 'Вторник', 4: 'Среда', 5: 'Четверг', 6: 'Пятница', 7: 'Суббота' };
  const dayName = dayOfWeekMap[day._dayOfWeek] || '';

  return `${periodName}, ${day._periodWeekNumber} неделя, ${dayName}`;
};

const getSubtitle = (day) => {
  const rankMap = {
    solemnity: 'Торжество',
    feast: 'Праздник',
    memorial: 'Память'
  };
  if (day._feastType) return rankMap[day._feastType] || 'Праздник';
  return day._psalmWeek ? `Псалтырь: ${day._psalmWeek} нед.` : '';
};

const getIcon = (day) => {
  if (day._feastType === 'solemnity') return 'mdi-star-circle';
  if (day._feastType === 'feast') return 'mdi-star';
  if (day._feastType === 'memorial') return 'mdi-label';
  return 'mdi-calendar-blank';
};

const getColor = (day) => {
  if (day._feastType === 'solemnity') return 'red-darken-2';
  if (day._periodType === 'advent' || day._periodType === 'lent') return 'purple-darken-3';
  if (day._periodType === 'easter' || day._periodType === 'christmas') return 'yellow-darken-3';
  if (day._periodType === 'ordinary') return 'green-darken-2';
  return 'grey';
};


// --- Watcher: Сердце компонента, реагирующее на смену URL ---
watch(
  () => route.params.day,
  (newDay) => {
    const targetDate = newDay ? moment(newDay, 'DD-MM-YYYY') : moment();
    currentDate.value = targetDate;
    fetchItemsForDate(targetDate);
  },
  { immediate: true } // immediate: true заставляет его сработать сразу при загрузке компонента
);// immediate: true - для вызова при первой загрузке

</script>