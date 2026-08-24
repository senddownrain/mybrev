import { ref, computed } from 'vue';
import { useLiturgicalStore } from '@/stores/liturgical';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

export function useParsedReadings() {
  const liturgicalStore = useLiturgicalStore();

  const items    = ref([]);
  const context  = ref(null);
  const isLoading = ref(false);
  const error    = ref(null);

  const hasReadings = computed(() => items.value.length > 0);

  // The primary (highest-priority) reading document for the current date
  const primaryReading = computed(() => items.value[0] ?? null);
  let loadSequence = 0;

  async function loadForDate(date, options = {}) {
    const sequence = ++loadSequence;
    const mDate = moment(date).startOf('day');
    logger.log(`[useParsedReadings] loading ${mDate.format('YYYY-MM-DD')}`);

    const cached = liturgicalStore.getCachedParsedReadings(date, options);
    if (cached) {
      items.value = cached.items;
      context.value = cached.context;
      isLoading.value = false;
      error.value = null;
      logger.log(`[useParsedReadings] cache hit ${mDate.format('YYYY-MM-DD')}`);
      liturgicalStore.fetchParsedReadingsByDate(date, options).catch((refreshError) => {
        logger.error('[useParsedReadings] background refresh failed:', refreshError);
      });
      return cached;
    }

    isLoading.value = true;
    error.value     = null;

    try {
      const result = await liturgicalStore.fetchParsedReadingsByDate(date, options);
      if (sequence !== loadSequence) return null;
      items.value   = result.items;
      context.value = result.context;
      return result;
    } catch (err) {
      if (sequence !== loadSequence) return null;
      logger.error('[useParsedReadings] error:', err);
      error.value = err;
      items.value  = [];
      context.value = null;
    } finally {
      if (sequence === loadSequence) isLoading.value = false;
    }
  }

  async function loadForToday() {
    return loadForDate(moment().toDate());
  }

  return {
    items,
    context,
    isLoading,
    error,
    hasReadings,
    primaryReading,
    loadForDate,
    loadForToday,
  };
}
