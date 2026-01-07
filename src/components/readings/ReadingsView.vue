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
      <!-- Информация о чтении (цикл, источник) - только для админов или в режиме разработки -->
      <div v-if="readingInfo" class="text-caption text-medium-emphasis mb-2">
        <v-chip v-if="readingCycle" size="x-small" variant="outlined" class="mr-1">
          Цыкл: {{ readingCycle }}
        </v-chip>
        <v-chip v-if="readingSource" size="x-small" variant="outlined" class="mr-1">
          {{ readingSource === 'new' || readingSource === 'newReadings' || readingSource === 'readings' ? 'Новая база' : 'Старая база' }}
        </v-chip>
      </div>
      
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
import { onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useReadings } from '@/composables/useReadings';
import { useLiturgicalReadings } from '@/composables/useLiturgicalReadings';
import { useReadingsStore } from '@/stores/readings';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

const route = useRoute();
const { 
  readingText, 
  readingCycle,
  hasReading, 
  isLoading, 
  error, 
  currentReading
} = useReadings();

const readingsStore = useReadingsStore();
const { getLiturgicalReadingsForDate } = useLiturgicalReadings();

// Информация о чтении для отображения
const readingInfo = computed(() => {
  return currentReading.value && (readingCycle.value || currentReading.value._source);
});

const readingSource = computed(() => {
  return currentReading.value?._source || null;
});

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
  
  logger.log('[ReadingsView] Загрузка чытанняў для літургічнага дня:', moment(date).format('YYYY-MM-DD'));
  
  try {
    readingsStore.setLoading(true);
    
    // Используем новый composable, который работает аналогично useLiturgicalDay
    const liturgicalReadings = await getLiturgicalReadingsForDate(date);
    
    // Обновляем store с найденными чтениями (метод сам выберет наиболее подходящее)
    readingsStore.setReadingsFromResults(liturgicalReadings.items);
  } catch (err) {
    logger.error('[ReadingsView] Памылка загрузкі чытанняў:', err);
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

