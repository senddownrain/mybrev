import { ref, computed } from 'vue';
import { useLiturgicalStore } from '@/stores/liturgical';
import { logger } from '@/utils/logger';
import moment from '@/utils/moment-be';
import { useRoute } from 'vue-router';
import { normalizeOrdoDiocese, ordoDiocese } from '@/utils/ordoDiocese';

export function useReadings() {
  const liturgicalStore = useLiturgicalStore();
  const route = useRoute();

  const items    = ref([]);
  const context  = ref(null);
  const isLoading = ref(false);
  const error    = ref(null);

  const hasReadings = computed(() => items.value.length > 0);

  // The primary (highest-priority) reading document for the current date
  const primaryReading = computed(() => items.value[0] ?? null);
  let loadSequence = 0;

  /**
   * Several dioceses (Settings): each is planned on its own; the documents are
   * united by id and remember the dioceses that read them (`_dioceses`).
   */
  async function loadForDioceses(date, dioceses, options) {
    const sequence = ++loadSequence;
    const anyCached = dioceses.map((diocese) => liturgicalStore.getCachedReadings(date, { ...options, diocese }));
    if (anyCached.some((entry) => !entry)) isLoading.value = true;
    error.value = null;
    try {
      const results = await Promise.all(dioceses.map((diocese, index) => anyCached[index]
        || liturgicalStore.fetchReadingsByDate(date, { ...options, diocese })));
      if (sequence !== loadSequence) return null;
      const united = new Map();
      results.forEach((result, index) => (result?.items || []).forEach((item) => {
        const known = united.get(item.id);
        if (known) known._dioceses.push(dioceses[index]);
        else united.set(item.id, { ...item, _dioceses: [dioceses[index]] });
      }));
      items.value = [...united.values()];
      context.value = { ...results[0].context, dioceses };
      return { items: items.value, context: context.value };
    } catch (err) {
      if (sequence !== loadSequence) return null;
      logger.error('[useReadings] error:', err);
      error.value = err;
      items.value = [];
      context.value = null;
      return null;
    } finally {
      if (sequence === loadSequence) isLoading.value = false;
    }
  }

  async function loadForDate(date, options = {}) {
    options = { ...options, referenceOptionId: String(route?.query.reference || ''), periodOnly: route?.query.view === 'period' };
    if (['reference', 'period'].includes(route?.query.view)) options.dioceses = [normalizeOrdoDiocese(route.query.diocese || ordoDiocese.value)];
    if (options.dioceses?.length > 1) {
      const { dioceses, ...rest } = options;
      return loadForDioceses(date, dioceses, rest);
    }
    if (options.dioceses?.length === 1) options = { ...options, diocese: options.dioceses[0] };
    delete options.dioceses;
    const sequence = ++loadSequence;
    const mDate = moment(date).startOf('day');
    logger.log(`[useReadings] loading ${mDate.format('YYYY-MM-DD')}`);

    let cached = liturgicalStore.getCachedReadings(date, options);
    if (!cached) {
      const cacheWaitTimer = setTimeout(() => {
        if (sequence === loadSequence) isLoading.value = true;
      }, 100);
      await liturgicalStore.primeReadings(date, options);
      clearTimeout(cacheWaitTimer);
      if (sequence !== loadSequence) return null;
      cached = liturgicalStore.getCachedReadings(date, options);
    }
    if (cached) {
      items.value = cached.items;
      context.value = cached.context;
      isLoading.value = false;
      error.value = null;
      logger.log(`[useReadings] cache hit ${mDate.format('YYYY-MM-DD')}`);
      liturgicalStore.fetchReadingsByDate(date, options).catch((refreshError) => {
        logger.error('[useReadings] background refresh failed:', refreshError);
      });
      return cached;
    }

    isLoading.value = true;
    error.value     = null;

    try {
      const result = await liturgicalStore.fetchReadingsByDate(date, options);
      if (sequence !== loadSequence) return null;
      items.value   = result.items;
      context.value = result.context;
      return result;
    } catch (err) {
      if (sequence !== loadSequence) return null;
      logger.error('[useReadings] error:', err);
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
