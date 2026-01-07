import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { logger } from '@/utils/logger';
import * as readingsService from '@/services/readingsService';
import moment from '@/utils/moment-be';

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
      
      logger.log('[readingsStore] Атрымана чытанняў:', results.length);
      
      // Если найдено одно чтение, сохраняем его как текущее
      if (results.length === 1) {
        currentReading.value = results[0];
        logger.log('[readingsStore] Выбрана адно чытанне:', results[0].id, 'з крыніцы:', results[0]._source);
      } else if (results.length > 1) {
        // Если несколько, выбираем наиболее подходящее:
        // 1. Приоритет чтениям из новой коллекции readings
        // 2. Затем чтениям с точной датой (_date или day)
        // 3. Затем чтениям по празднику (_feast)
        // 4. Затем чтениям по периоду
        const prioritized = results.sort((a, b) => {
          // Сначала по источнику ('new' > readingsData)
          if ((a._source === 'new' || a._source === 'newReadings' || a._source === 'readings') && b._source === 'readingsData') return -1;
          if (a._source === 'readingsData' && (b._source === 'new' || b._source === 'newReadings' || b._source === 'readings')) return 1;
          // Затем по точной дате
          if ((a._date || a.day) && !(b._date || b.day)) return -1;
          if (!(a._date || a.day) && (b._date || b.day)) return 1;
          // Затем по празднику (_feast)
          if (a._feast && !b._feast) return -1;
          if (!a._feast && b._feast) return 1;
          return 0;
        });
        currentReading.value = prioritized[0];
        logger.log('[readingsStore] Знойдзена некалькі чытанняў для даты:', date, results.length, 'Выбрана:', prioritized[0].id, 'з крыніцы:', prioritized[0]._source);
      } else {
        currentReading.value = null;
        logger.log('[readingsStore] Чытанні не знойдзены для даты:', date);
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

  /**
   * Установить состояние загрузки
   * @param {boolean} loading - Состояние загрузки
   */
  function setLoading(loading) {
    isLoading.value = loading;
  }

  /**
   * Установить чтения из результатов поиска
   * Используется для установки чтений, найденных через useLiturgicalReadings
   * @param {Array} results - Массив найденных чтений
   */
  function setReadingsFromResults(results) {
    readings.value = results;
    isLoading.value = false;
    error.value = null;
    
    if (results.length === 1) {
      currentReading.value = results[0];
      logger.log('[readingsStore] Выбрана адно чытанне:', results[0].id, 'з крыніцы:', results[0]._source);
    } else if (results.length > 1) {
          // Приоритет: 'new' > readingsData, затем по точной дате, затем по празднику (_feast)
          const prioritized = results.sort((a, b) => {
            if ((a._source === 'new' || a._source === 'newReadings' || a._source === 'readings') && b._source === 'readingsData') return -1;
            if (a._source === 'readingsData' && (b._source === 'new' || b._source === 'newReadings' || b._source === 'readings')) return 1;
        if ((a._date || a.day) && !(b._date || b.day)) return -1;
        if (!(a._date || a.day) && (b._date || b.day)) return 1;
        if (a._feast && !b._feast) return -1;
        if (!a._feast && b._feast) return 1;
        return 0;
      });
      currentReading.value = prioritized[0];
      logger.log('[readingsStore] Знойдзена некалькі чытанняў, выбрана:', prioritized[0].id, 'з крыніцы:', prioritized[0]._source);
    } else {
      currentReading.value = null;
      logger.log('[readingsStore] Чытанні не знойдзены');
    }
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
    setReadingsFromResults,
    setLoading,
  };
});

