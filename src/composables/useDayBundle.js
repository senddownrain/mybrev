import { ref, computed } from 'vue';
import { useLiturgicalStore } from '@/stores/liturgical';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';

/**
 * Unified composable that fetches liturgical hours and Mass readings
 * for a given date in a single store round-trip.
 *
 * Resolves the liturgical context once and fetches fixedDays + parsedData
 * in parallel, so subsequent calls to useLiturgicalContent / useParsedReadings
 * for the same date are served from cache.
 *
 * Usage:
 *   const { hours, readings, context, isLoading, error, loadForDate } = useDayBundle();
 *   await loadForDate(someDate);
 */
export function useDayBundle() {
  const liturgicalStore = useLiturgicalStore();

  const hours    = ref([]);
  const readings = ref([]);
  const context  = ref(null);
  const dynamicFeastCodes = ref([]);
  const isLoading = ref(false);
  const error     = ref(null);

  const hasHours    = computed(() => hours.value.length > 0);
  const hasReadings = computed(() => readings.value.length > 0);

  // Primary (highest-priority) reading document
  const primaryReading = computed(() => readings.value[0] ?? null);

  // Whether the day is a dynamic feast
  const isDynamicFeast = computed(() => dynamicFeastCodes.value.length > 0);

  async function loadForDate(date) {
    const mDate = moment(date).startOf('day');
    logger.log(`[useDayBundle] loading ${mDate.format('YYYY-MM-DD')}`);

    isLoading.value = true;
    error.value     = null;

    try {
      const result = await liturgicalStore.fetchDayBundle(date);
      context.value           = result.context;
      dynamicFeastCodes.value = result.dynamicFeastCodes;
      hours.value             = result.hours;
      readings.value          = result.readings;
    } catch (err) {
      logger.error('[useDayBundle] error:', err);
      error.value    = err;
      hours.value    = [];
      readings.value = [];
      context.value  = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadForToday() {
    return loadForDate(moment().toDate());
  }

  return {
    hours,
    readings,
    context,
    dynamicFeastCodes,
    isLoading,
    error,
    hasHours,
    hasReadings,
    primaryReading,
    isDynamicFeast,
    loadForDate,
    loadForToday,
  };
}
