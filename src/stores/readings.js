import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { logger } from '@/utils/logger';
import * as readingsService from '@/services/readingsService';
import moment from 'moment';

export const useReadingsStore = defineStore('readings', () => {
  const readings = ref([]);
  const currentReading = ref(null);
  const isLoading = ref(false);
  const error = ref(null);

  /**
   * Получить чтения для конкретной даты
   */
  async function getReadingsForDate(date, options = {}) {
    isLoading.value = true;
    error.value = null;
    
    try {
      const results = await readingsService.getReadingsForDate(date, options);
      readings.value = results;
      
      // Если найдено одно чтение, сохраняем его как текущее
      if (results.length === 1) {
        currentReading.value = results[0];
      } else if (results.length > 1) {
        // Если несколько, выбираем наиболее подходящее:
        // 1. Приоритет чтениям с точной датой (_date)
        // 2. Затем чтениям по празднику (feastId)
        // 3. Затем чтениям по периоду
        const prioritized = results.sort((a, b) => {
          if (a._date && !b._date) return -1;
          if (!a._date && b._date) return 1;
          if (a.feastId && !b.feastId) return -1;
          if (!a.feastId && b.feastId) return 1;
          return 0;
        });
        currentReading.value = prioritized[0];
        logger.warn('[readingsStore] Знойдзена некалькі чытанняў для даты:', date, results.length, 'Выбрана:', prioritized[0].id);
      } else {
        currentReading.value = null;
      }
      
      return results;
    } catch (err) {
      logger.error('[readingsStore] Памылка загрузкі чытанняў:', err);
      error.value = err;
      currentReading.value = null;
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Добавить чтение
   */
  async function addReading(data) {
    try {
      const docRef = await readingsService.addReading(data);
      // Обновляем список после добавления
      if (currentReading.value) {
        await getReadingsForDate(
          currentReading.value._date || 
          moment().format('YYYY-MM-DD')
        );
      }
      return docRef;
    } catch (err) {
      logger.error('[readingsStore] Памылка дадавання чытання:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Обновить чтение
   */
  async function updateReading(id, data) {
    try {
      await readingsService.updateReading(id, data);
      // Обновляем текущее чтение если это оно
      if (currentReading.value && currentReading.value.id === id) {
        currentReading.value = { ...currentReading.value, ...data };
      }
    } catch (err) {
      logger.error('[readingsStore] Памылка абнаўлення чытання:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Удалить чтение
   */
  async function deleteReading(id) {
    try {
      await readingsService.deleteReading(id);
      // Удаляем из списка
      readings.value = readings.value.filter(r => r.id !== id);
      if (currentReading.value && currentReading.value.id === id) {
        currentReading.value = null;
      }
    } catch (err) {
      logger.error('[readingsStore] Памылка выдалення чытання:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Очистить текущее чтение
   */
  function clearCurrentReading() {
    currentReading.value = null;
    readings.value = [];
  }

  return {
    readings: computed(() => readings.value),
    currentReading: computed(() => currentReading.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    
    getReadingsForDate,
    addReading,
    updateReading,
    deleteReading,
    clearCurrentReading,
  };
});

