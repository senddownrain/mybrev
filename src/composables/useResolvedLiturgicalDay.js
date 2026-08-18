import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { logger } from '@/utils/logger';

/**
 * Resolve the route's day from the date-aware service instead of reading a raw
 * Firestore document. This guarantees from-day and seasonal inheritance in
 * every hour component.
 */
export function useResolvedLiturgicalDay() {
  const route = useRoute();
  const { getLiturgicalContentForDate } = useLiturgicalContent();
  const day = ref(null);
  const pending = ref(true);
  const error = ref('');
  let sequence = 0;

  async function load() {
    const currentSequence = ++sequence;
    const date = moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    const id = String(route.params.id || '');
    pending.value = true;
    error.value = '';
    day.value = null;
    if (!date.isValid()) {
      error.value = 'Няправільная дата літургічнага дня.';
      pending.value = false;
      return;
    }
    try {
      const content = await getLiturgicalContentForDate(date.toDate());
      if (currentSequence !== sequence) return;
      day.value = content.itemsDays?.find((item) => item.id === id)
        || content.dayOptions?.find((item) => item.templates?.some((template) => template.id === id))
          ?.templates.find((template) => template.id === id)?.day
        || null;
      if (!day.value) error.value = 'Літургічны дзень не знойдзены.';
    } catch (loadError) {
      logger.error('[useResolvedLiturgicalDay] load failed:', loadError);
      if (currentSequence === sequence) error.value = loadError?.message || 'Не атрымалася загрузіць дзень.';
    } finally {
      if (currentSequence === sequence) pending.value = false;
    }
  }

  watch([() => route.params.day, () => route.params.id], load, { immediate: true });
  return { day, pending: computed(() => pending.value), error: computed(() => error.value), reload: load };
}
