<template>
  <v-container class="readings-container">
    <div v-if="isLoading" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
      <p class="mt-4 text-grey">Загрузка чытанняў...</p>
    </div>

    <v-alert v-else-if="error" type="error" class="mb-4">
      <div class="text-h6">Памылка загрузкі чытанняў</div>
      <p>{{ error.message || error }}</p>
      <v-btn
        variant="tonal"
        color="white"
        class="mt-2"
        prepend-icon="mdi-refresh"
        @click="loadReadings"
      >
        Паўтарыць
      </v-btn>
    </v-alert>

    <div v-else-if="hasReading" class="readings-content">
      <!-- Текст чтения (включает заголовок) -->
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
import { useLiturgicalReadings } from '@/composables/useLiturgicalReadings';
import { useReadingsStore } from '@/stores/readings';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

const route = useRoute();
const { 
  readingText, 
  hasReading, 
  isLoading, 
  error,
} = useReadings();

const readingsStore = useReadingsStore();
const { getLiturgicalReadingsForDate } = useLiturgicalReadings();

/**
 * Загрузить чтения для текущей даты
 * Использует ту же логику, что и для литургических дней:
 * - По периоду (periodType, periodWeekNumber, dayOfWeek)
 * - По дате (фиксированные праздники)
 * - По ключевому слову (динамические праздники: Пасха, Пятидесятница и т.д.)
 */
async function loadReadings() {
  // Поддержка параметра date из роута или query
  const dateParam = route.params.date || route.query.date;
  const date = dateParam ? moment(dateParam, 'YYYY-MM-DD').toDate() : moment().toDate();
  
  logger.log('[ReadingsView] Loading readings for liturgical day:', moment(date).format('YYYY-MM-DD'));
  
  try {
    readingsStore.setLoading(true);
    
    // Используем новый composable, который работает аналогично useLiturgicalDay
    const liturgicalReadings = await getLiturgicalReadingsForDate(date);
    
    // Обновляем store с найденными чтениями (метод сам выберет наиболее подходящее)
    readingsStore.setReadingsFromResults(liturgicalReadings.items);
  } catch (err) {
    logger.error('[ReadingsView] Error loading readings:', err);
    readingsStore.setReadingsFromResults([]); // Устанавливаем пустой массив при ошибке
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
  text-align: left !important;
}

.readings-content :deep(*) {
  text-align: left !important;
}

.readings-content :deep([style*="text-align: justify"]),
.readings-content :deep([style*="text-align:justify"]) {
  text-align: left !important;
}
</style>
