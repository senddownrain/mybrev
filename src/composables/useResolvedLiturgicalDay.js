import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { logger } from '@/utils/logger';
import {
  getPeriodDayDocumentId,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';
import { findOptionByDayId, findResolvedDayById } from '@/utils/ordoDayOptions';

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
    restoreCachedLiturgicalContentForDate,
  } = useLiturgicalContent();
  const day = ref(null);
  const context = ref(null);
  const pending = ref(false);
  const error = ref('');
  let sequence = 0;

  async function load() {
    const currentSequence = ++sequence;
    const date = moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    const id = String(route.params.id || '');
    pending.value = false;
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
      const selected = findResolvedDayById(content, id);
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
      // Office descriptor of the legal option that owns this document
      // (officeKind, Te Deum, Compline, I/II Vespers, fallbacks vs choices).
      // A document reached by an old link that is not a legal Office keeps
      // `_ordo: null` and the components use their legacy fallbacks.
      const option = findOptionByDayId(content, id);
      return {
        ...resolved,
        _calendarDate: date.format('YYYY-MM-DD'),
        _contextPeriodType: content.context?.periodType || '',
        _ordo: option?.ordo || null,
      };
    };

    let cached = getCachedLiturgicalContentForDate(date.toDate());
    let cacheWaitTimer;
    if (!cached) {
      cacheWaitTimer = setTimeout(() => {
        if (currentSequence === sequence) pending.value = true;
      }, 100);
      cached = await restoreCachedLiturgicalContentForDate(date.toDate());
      clearTimeout(cacheWaitTimer);
    }
    if (currentSequence !== sequence) return;
    if (cached) {
      day.value = resolveDay(cached);
      if (!day.value) error.value = 'Літургічны дзень не знойдзены.';
      pending.value = false;
      return;
    }

    pending.value = true;
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

  watch([() => route.params.day, () => route.params.id, () => route.query.reference, () => route.query.diocese, () => route.query.view], load, { immediate: true });
  return {
    day,
    context: computed(() => context.value),
    pending: computed(() => pending.value),
    error: computed(() => error.value),
    reload: load,
  };
}
