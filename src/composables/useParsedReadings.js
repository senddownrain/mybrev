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

  async function loadForDate(date) {
    const mDate = moment(date).startOf('day');
    logger.log(`[useParsedReadings] loading ${mDate.format('YYYY-MM-DD')}`);

    isLoading.value = true;
    error.value     = null;

    try {
      const result = await liturgicalStore.fetchParsedReadingsByDate(date);
      items.value   = result.items;
      context.value = result.context;
    } catch (err) {
      logger.error('[useParsedReadings] error:', err);
      error.value = err;
      items.value  = [];
      context.value = null;
    } finally {
      isLoading.value = false;
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
