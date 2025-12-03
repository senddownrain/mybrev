<template>
  <v-container class="items-list-container">
    <div class="d-flex align-center justify-space-between pa-2 mb-2 date-selector">
  <v-btn icon="mdi-chevron-left" @click="goToPrevDay" :disabled="loading"></v-btn>
  
  <div class="text-center flex-grow-1 mx-2" @click="toggleCalendarDialog" style="cursor: pointer;">
    <h2 class="text-h6 font-weight-regular text-wrap">
      Літургія
    </h2>
  </div>
  
  <v-btn icon="mdi-chevron-right" @click="goToNextDay" :disabled="loading"></v-btn>
</div>

    <v-row v-if="loading" class="justify-center mt-16">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
    </v-row>

    <v-row v-else-if="error" class="mt-8">
      <v-col>
        <v-alert type="error" prominent border="start" icon="mdi-alert-circle-outline">
          <div class="text-h6">Ошибка при загрузке</div>
          <p>{{ error }}</p>
        </v-alert>
      </v-col>
    </v-row>

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
    
    <v-row v-else class="text-center text-grey mt-10">
       <v-col>
          <v-icon size="48">mdi-book-remove-outline</v-icon>
          <p class="mt-2">Малітвы не знойдзены.</p>
          <p class="text-caption">Магчыма, іх не хапае ў базе.</p>
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
import { useAppBar } from '@/composables/useAppBar';
import { logger } from '@/utils/logger';
import { useNotifier } from '@/composables/useNotifier';

moment.locale('be');
const route = useRoute();
const router = useRouter();
const { getLiturgicalOptionsForDate } = useLiturgicalDay();
const { toggleCalendarDialog } = useAppBar();
const { error: notifyError } = useNotifier();

const days = ref([]);
const loading = ref(true);
const error = ref(null);
const currentDate = ref(moment().startOf('day'));

const fetchItemsForDate = async (date) => {
  logger.log(`[ItemsList] Запускаем загрузку для даты: ${date.format('YYYY-MM-DD')}`);
  loading.value = true;
  days.value = [];
  error.value = null;
  try {
     const result = await getLiturgicalOptionsForDate(date.toDate());
    if (result && result.items) {
      days.value = result.items;
    } else {
      days.value = [];
    }

    if (days.value.length === 0) {
      logger.warn(`[ItemsList] Для даты ${date.format('YYYY-MM-DD')} не найдено ни одного литургического элемента.`);
    }
  } catch (e) {
    logger.error("Произошла критическая ошибка при загрузке данных:", e);
    const errorMessage = e.message || "Не удалось загрузить данные. Попробуйте обновить страницу.";
    error.value = errorMessage;
    notifyError(errorMessage);
  } finally {
    loading.value = false;
  }
};

function navigateToDate(date) {
  const dateString = date.format('YYYY-MM-DD');
  router.push({ name: 'SelectedDay', params: { day: dateString } });
}
const goToNextDay = () => navigateToDate(currentDate.value.clone().add(1, 'day'));
const goToPrevDay = () => navigateToDate(currentDate.value.clone().subtract(1, 'day'));

const rankOrder = { 'solemnity': 1, 'feast': 2, 'memorial': 3 };

const sortedDays = computed(() => {
  return [...days.value].sort((a, b) => {
    const rankA = a._feastType ? rankOrder[a._feastType] || 99 : 100;
    const rankB = b._feastType ? rankOrder[b._feastType] || 99 : 100;
    return rankA - rankB;
  });
});

const getTitle = (day) => {
  if (day.title) return day.title;
  if (day._feastName) return day._feastName;

  const periodMap = {
    ordinary: 'звычайны',
    advent: 'адвэнту',
    lent: 'вялікага посту',
    easter: 'у велікодны перыяд',
    christmas: 'Божага нараджэння'
  };
  const periodName = periodMap[day._periodType] || 'Перыяд';
  const dayOfWeekMap = { 1: 'Нядзеля', 2: 'Панядзелак', 3: 'Аўторак', 4: 'Серада', 5: 'Чацвер', 6: 'Пятніца', 7: 'Субота' };
  const dayName = dayOfWeekMap[day._dayOfWeek] || '';

  return `${day._periodWeekNumber} тыдзень ${periodName}, ${dayName}`;
};

const getSubtitle = (day) => {
  const rankMap = {
    solemnity: 'Урачыстасць',
    feast: 'Свята',
    memorial: 'Успамін'
  };
  if (day._feastType) return rankMap[day._feastType] || 'Свята';
  return day._psalmWeek ? `${day._psalmWeek}` : '';
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

watch(
  () => route.params.day,
  (newDay) => {
    const targetDate = newDay ? moment(newDay, 'YYYY-MM-DD') : moment();
    currentDate.value = targetDate;
    fetchItemsForDate(targetDate);
  },
  { immediate: true }
);

</script>

<style scoped>
.items-list-container {
  max-width: 100%;
}

.date-selector h2 {
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-size: 1rem;
}

@media (max-width: 600px) {
  .items-list-container {
    padding: 8px 4px !important;
  }

  .date-selector {
    padding: 8px 4px !important;
    margin-bottom: 8px !important;
  }

  .date-selector h2 {
    font-size: 0.9rem !important;
  }

  .v-list-item {
    padding: 12px 8px !important;
    margin-bottom: 8px !important;
  }

  .v-list-item-title {
    font-size: 0.95rem !important;
    line-height: 1.4 !important;
  }

  .v-list-item-subtitle {
    font-size: 0.85rem !important;
  }
}
</style>