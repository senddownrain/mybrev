import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useReadingsStore } from '@/stores/readings';
import moment from 'moment';

/**
 * Composable для работы с чтениями (readings)
 * Предоставляет удобный интерфейс к readingsStore
 */
export function useReadings() {
  const readingsStore = useReadingsStore();
  
  // Используем storeToRefs для сохранения реактивности
  const { readings, currentReading, isLoading, error } = storeToRefs(readingsStore);

  /**
   * Получить текст текущего чтения
   */
  const readingText = computed(() => {
    if (!currentReading.value) return '';
    
    // Поддержка разных полей для текста (text, content)
    return currentReading.value.text || currentReading.value.content || '';
  });

  /**
   * Получить цикл текущего чтения
   */
  const readingCycle = computed(() => {
    return currentReading.value?.cycle || null;
  });

  /**
   * Проверить, есть ли чтение для текущей даты
   */
  const hasReading = computed(() => {
    return !!currentReading.value;
  });

  /**
   * Загрузить чтения для даты
   */
  async function loadReadingsForDate(date, options = {}) {
    return await readingsStore.getReadingsForDate(date, options);
  }

  /**
   * Получить чтения для сегодняшнего дня
   */
  async function loadReadingsForToday(options = {}) {
    return await loadReadingsForDate(moment().toDate(), options);
  }

  return {
    readings,
    currentReading,
    readingText,
    readingCycle,
    hasReading,
    isLoading,
    error,
    
    loadReadingsForDate,
    loadReadingsForToday,
    
    addReading: readingsStore.addReading,
    updateReading: readingsStore.updateReading,
    deleteReading: readingsStore.deleteReading,
    clearCurrentReading: readingsStore.clearCurrentReading,
  };
}

