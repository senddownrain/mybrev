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
   * Атрымаць чытанні для канкрэтнай даты
   */
  async function getReadingsForDate(date, options = {}) {
    isLoading.value = true;
    error.value = null;
    
    try {
      const results = await readingsService.getReadingsForDate(date, options);
      readings.value = results;
      
      logger.log('[readingsStore] Readings received:', results.length);
      
      // Калі знойдзена адно чытанне, захоўваем яго як бягучае
      if (results.length === 1) {
        currentReading.value = results[0];
        logger.log('[readingsStore] Single reading selected:', results[0].id, 'from source:', results[0]._source);
      } else if (results.length > 1) {
        // Прыярытэт: чытанні з калекцыі readings, затым па дакладнай даце, свяце, перыядзе
        const prioritized = results.sort((a, b) => {
          const aPrimary = (a._source === 'readings');
          const bPrimary = (b._source === 'readings');
          if (aPrimary && !bPrimary) return -1;
          if (!aPrimary && bPrimary) return 1;
          if ((a._date || a.day) && !(b._date || b.day)) return -1;
          if (!(a._date || a.day) && (b._date || b.day)) return 1;
          if (a._feast && !b._feast) return -1;
          if (!a._feast && b._feast) return 1;
          return 0;
        });
        currentReading.value = prioritized[0];
        logger.log('[readingsStore] Multiple readings found for date:', date, results.length, 'Selected:', prioritized[0].id, 'from source:', prioritized[0]._source);
      } else {
        currentReading.value = null;
        logger.log('[readingsStore] No readings found for date:', date);
      }
      
      return results;
    } catch (err) {
      logger.error('[readingsStore] Error loading readings:', err);
      error.value = err;
      currentReading.value = null;
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Дадаць чытанне
   */
  async function addReading(data) {
    try {
      const docRef = await readingsService.addReading(data);
      // Абнаўляем спіс пасля дадання
      if (currentReading.value) {
        await getReadingsForDate(
          currentReading.value._date || 
          moment().format('YYYY-MM-DD')
        );
      }
      return docRef;
    } catch (err) {
      logger.error('[readingsStore] Error adding reading:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Абнавіць чытанне
   */
  async function updateReading(id, data) {
    try {
      await readingsService.updateReading(id, data);
      // Абнаўляем бягучае чытанне, калі гэта яно
      if (currentReading.value && currentReading.value.id === id) {
        currentReading.value = { ...currentReading.value, ...data };
      }
    } catch (err) {
      logger.error('[readingsStore] Error updating reading:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Выдаліць чытанне
   */
  async function deleteReading(id) {
    try {
      await readingsService.deleteReading(id);
      // Выдаляем са спісу
      readings.value = readings.value.filter(r => r.id !== id);
      if (currentReading.value && currentReading.value.id === id) {
        currentReading.value = null;
      }
    } catch (err) {
      logger.error('[readingsStore] Error deleting reading:', err);
      error.value = err;
      throw err;
    }
  }

  /**
   * Ачысціць бягучае чытанне
   */
  function clearCurrentReading() {
    currentReading.value = null;
    readings.value = [];
  }

  /**
   * Усталяваць стан загрузкі
   * @param {boolean} loading - Стан загрузкі
   */
  function setLoading(loading) {
    isLoading.value = loading;
  }

  /**
   * Усталяваць чытанні з вынікаў пошуку
   * Выкарыстоўваецца для ўсталёўкі чытанняў, знойдзеных праз useLiturgicalReadings
   * @param {Array} results - Масіў знойдзеных чытанняў
   */
  function setReadingsFromResults(results) {
    readings.value = results;
    isLoading.value = false;
    error.value = null;
    
    if (results.length === 1) {
      currentReading.value = results[0];
      logger.log('[readingsStore] Single reading selected:', results[0].id, 'from source:', results[0]._source);
    } else if (results.length > 1) {
        // Прыярытэт: readings, затым па дакладнай даце, свяце
        const prioritized = results.sort((a, b) => {
          if ((a._source === 'readings') && b._source !== 'readings') return -1;
          if ((a._source !== 'readings') && (b._source === 'readings')) return 1;
          if ((a._date || a.day) && !(b._date || b.day)) return -1;
          if (!(a._date || a.day) && (b._date || b.day)) return 1;
          if (a._feast && !b._feast) return -1;
          if (!a._feast && b._feast) return 1;
          return 0;
        });
      currentReading.value = prioritized[0];
      logger.log('[readingsStore] Multiple readings found, selected:', prioritized[0].id, 'from source:', prioritized[0]._source);
    } else {
      currentReading.value = null;
      logger.log('[readingsStore] No readings found');
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
