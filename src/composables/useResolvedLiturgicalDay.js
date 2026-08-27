import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { logger } from '@/utils/logger';
import {
  getPeriodDayDocumentId,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';

/**
 * Resolve the route's day from the date-aware service instead of reading a raw
 * Firestore document. This guarantees from-day and seasonal inheritance in
 * every hour component.
 */
export function useResolvedLiturgicalDay() {
  const route = useRoute();
  const {
    getLiturgicalContentForDate,
    getCachedLiturgicalContentForDate,
  } = useLiturgicalContent();
  const day = ref(null);
  const context = ref(null);
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
    context.value = null;
    if (!date.isValid()) {
      error.value = 'Няправільная дата літургічнага дня.';
      pending.value = false;
      return;
    }

    const resolveDay = (content) => {
      context.value = content.context || null;
      const selected = content.itemsDays?.find((item) => item.id === id)
        || content.dayOptions?.find((item) => item.templates?.some((template) => (
          template.id === id || template.dayIds?.includes(id)
        )))?.templates.find((template) => (
          template.id === id || template.dayIds?.includes(id)
        ))?.day
        || null;
      if (!selected) return null;

      // A fixed celebration may have been loaded before its regular period
      // day. `_fromDayFields` preserves the exact references, so if that day
      // is already present in the assembled content we can safely reapply it
      // without filling fields that were intentionally left empty.
      const periodId = getPeriodDayDocumentId(
        content.context?.periodType,
        content.context?.periodWeek,
        content.context?.dayOfWeek,
      );
      const periodDay = content.itemsDays?.find((item) => item.id === periodId) || null;
      const resolved = periodDay ? resolveDayAgainstPeriod(selected, periodDay) : selected;
      return {
        ...resolved,
        _calendarDate: date.format('YYYY-MM-DD'),
        _contextPeriodType: content.context?.periodType || '',
      };
    };

    const cached = getCachedLiturgicalContentForDate(date.toDate());
    if (cached) {
      day.value = resolveDay(cached);
      if (!day.value) error.value = 'Літургічны дзень не знойдзены.';
      pending.value = false;
      return;
    }

    try {
      const content = await getLiturgicalContentForDate(date.toDate());
      if (currentSequence !== sequence) return;
      day.value = resolveDay(content);
      if (!day.value) error.value = 'Літургічны дзень не знойдзены.';
    } catch (loadError) {
      logger.error('[useResolvedLiturgicalDay] load failed:', loadError);
      if (currentSequence === sequence) error.value = loadError?.message || 'Не атрымалася загрузіць дзень.';
    } finally {
      if (currentSequence === sequence) pending.value = false;
    }
  }

  watch([() => route.params.day, () => route.params.id], load, { immediate: true });
  return {
    day,
    context: computed(() => context.value),
    pending: computed(() => pending.value),
    error: computed(() => error.value),
    reload: load,
  };
}
