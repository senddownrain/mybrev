<template>
  <v-container class="readings-container">
    <div v-if="isLoading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <p class="mt-4 text-grey">Загрузка чытанняў...</p>
    </div>

    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі чытанняў</div>
      <p>{{ error.message || error }}</p>
    </v-alert>

    <div v-else-if="hasReading" class="readings-content">
      <div class="prayer-content-area" v-html="readingText"></div>
    </div>

    <div v-else class="text-center py-16">
      <v-icon size="64" color="grey-lighten-1">mdi-book-open-variant-outline</v-icon>
      <p class="text-h6 mt-4 text-grey">Чытанні для гэтага дня не знойдзены</p>
      <p class="text-caption mt-2 text-grey-darken-1">
        Магчыма, яны яшчэ не дададзены ў базу даных
      </p>
    </div>
  </v-container>
</template>

<script setup>
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useReadings } from '@/composables/useReadings';
import { useLiturgicalDay } from '@/composables/useLiturgicalDay';
import { getLiturgicalYear, getCycleForDate } from '@/utils/liturgicalCycle';
import { logger } from '@/utils/logger';
import moment from 'moment';

const route = useRoute();
const { 
  readingText, 
  hasReading, 
  isLoading, 
  error, 
  loadReadingsForDate 
} = useReadings();

const { getLiturgicalOptionsForDate } = useLiturgicalDay();

/**
 * Загрузить чтения для текущей даты
 */
async function loadReadings() {
  const dateParam = route.params.date || route.query.date;
  const date = dateParam ? moment(dateParam, 'YYYY-MM-DD').toDate() : moment().toDate();
  
  try {
    // Получаем литургический контекст для даты
    const liturgicalData = await getLiturgicalOptionsForDate(date);
    const context = liturgicalData?.context || {};
    
    // Определяем цикл (используем calendarStore для точности)
    const liturgicalYear = await getLiturgicalYear(date, { useCalendarStore: true });
    const cycle = await getCycleForDate(date, liturgicalYear, context.dayOfWeek, { useCalendarStore: true });
    
    // Загружаем чтения с контекстом
    await loadReadingsForDate(date, {
      cycle,
      periodType: context.periodType,
      periodWeekNumber: context.periodWeek,
      dayOfWeek: context.dayOfWeek,
      feastId: liturgicalData?.items?.[0]?._feastId,
    });
  } catch (err) {
    logger.error('[ReadingsView] Памылка загрузкі чытанняў:', err);
  }
}

onMounted(() => {
  loadReadings();
});

watch(() => route.params.date || route.query.date, () => {
  loadReadings();
});
</script>

<style scoped>
.readings-container {
  max-width: 100%;
}

.readings-content {
  width: 100%;
}
</style>

