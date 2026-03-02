import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useReadingsStore } from '@/stores/readings';
import moment from '@/utils/moment-be';

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

}

