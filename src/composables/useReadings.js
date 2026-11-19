import { ref, computed } from 'vue';
import { useLiturgicalStore } from '@/stores/liturgical';
import { logger } from '@/utils/logger';
import { useRoute } from 'vue-router';
import { currentOrdoDiocese, normalizeOrdoDiocese, ordoDiocese } from '@/utils/ordoDiocese';

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
  async function loadForDate(date, options = {}) {
    const sequence = ++loadSequence;
    let { dioceses, ...request } = options;
    request = { ...request, referenceOptionId: String(route?.query.reference || ''), periodOnly: route?.query.view === 'period' };
    if (['reference', 'period'].includes(route?.query.view)) {
      dioceses = [normalizeOrdoDiocese(route.query.diocese || ordoDiocese.value)];
    }
    if (!dioceses?.length) dioceses = [request.diocese || currentOrdoDiocese()];

    const cached = dioceses.map(() => null);
    const show = (results) => {
      if (sequence !== loadSequence) return;
      if (dioceses.length === 1) {
        items.value = results[0].items;
        context.value = results[0].context;
      } else {
        const united = new Map();
        results.forEach((result, index) => result.items.forEach((item) => {
          const known = united.get(item.id);
          if (known) known._dioceses.push(dioceses[index]);
          else united.set(item.id, { ...item, _dioceses: [dioceses[index]] });
        }));
        items.value = [...united.values()];
        context.value = { ...results[0].context, dioceses };
      }
      isLoading.value = false;
    };

    isLoading.value = true;
    error.value = null;
    items.value = [];
    context.value = null;
    try {
      const results = await Promise.all(dioceses.map((diocese, index) =>
        liturgicalStore.fetchReadingsByDate(date, {
          ...request,
          diocese,
          onCached(result) {
            cached[index] = result;
            if (cached.every(Boolean)) show(cached);
          },
        })));
      if (sequence !== loadSequence) return null;
      if (results.some((result, index) => result !== cached[index])) show(results);
      return { items: items.value, context: context.value };
    } catch (err) {
      if (sequence !== loadSequence) return null;
      logger.error('[useReadings] error:', err);
      error.value = err;
      return null;
    } finally {
      if (sequence === loadSequence) isLoading.value = false;
    }
  }

  const loadForToday = () => loadForDate(new Date());

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
