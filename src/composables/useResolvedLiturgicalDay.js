import { effectiveOrdoDiocese } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import moment from '@/utils/moment-be';
import { useLiturgicalContent } from '@/composables/useLiturgicalContent';
import { logger } from '@/utils/logger';
import { firestoreErrorMessage } from '@/utils/firestoreErrors.mjs';
import {
  getPeriodDayDocumentId,
  resolveDayAgainstPeriod,
} from '@/utils/liturgicalDayResolution';
import { resolveComplineDescriptor } from '@/utils/ordo/runtime';
import { findOptionByDayId, findResolvedDayById } from '@/utils/ordoDayOptions';

export const hourLoadError = Symbol('hourLoadError');

/**
 * Resolve the route's day from the date-aware service instead of reading a raw
 * Firestore document. This guarantees from-day and seasonal inheritance in
 * every hour component.
 */
export function useResolvedLiturgicalDay({ forCompline = false, enabled } = {}) {
  const route = useRoute();
  const { getLiturgicalContentForDate } = useLiturgicalContent();
  const day = ref(null);
  const dayOptions = ref([]);
  const context = ref(null);
  const periodDay = ref(null);
  const pending = ref(false);
  const error = ref('');
  const loadStatus = inject(hourLoadError, null);
  let sequence = 0;
  onScopeDispose(() => {
    sequence += 1;
    if (loadStatus?.value?.retry === load) loadStatus.value = null;
  });

  async function load() {
    const currentSequence = ++sequence;
    const date = moment(String(route.params.day), ['YYYY-MM-DD', 'DD-MM-YYYY'], true);
    const id = String(route.params.id || '');
    pending.value = false;
    error.value = '';
    day.value = null;
    dayOptions.value = [];
    context.value = null;
    periodDay.value = null;
    if (enabled?.value === false) return;
    if (loadStatus?.value?.retry === load) loadStatus.value = null;
    if (!date.isValid()) {
      error.value = 'Няправільная дата літургічнага дня.';
      reportLoadError(error.value);
      pending.value = false;
      return;
    }

    const canResolveCompline = forCompline && id !== 'office-for-dead' && route.query.view !== 'reference';
    const resolveDay = (content) => {
      dayOptions.value = content.dayOptions || [];
      context.value = content.context || null;
      const selected = findResolvedDayById(content, id);
      if (!selected && !canResolveCompline) return null;

      // A fixed celebration may have been loaded before its regular period
      // day. `_fromDayFields` preserves the exact references, so if that day
      // is already present in the assembled content we can safely reapply it
      // without filling fields that were intentionally left empty.
      const periodId = getPeriodDayDocumentId(
        content.context?.periodType,
        content.context?.periodWeek,
        content.context?.dayOfWeek,
      );
      const currentPeriodDay = content.itemsDays?.find((item) => item.id === periodId) || null;
      periodDay.value = currentPeriodDay;
      const resolved = selected && currentPeriodDay ? resolveDayAgainstPeriod(selected, currentPeriodDay) : selected;
      // Office descriptor of the legal option that owns this document
      // (officeKind, Te Deum, Compline, I/II Vespers, fallbacks vs choices).
      // A document reached by an old link that is not a legal Office keeps
      // `_ordo: null` and the components use their legacy fallbacks.
      const option = findOptionByDayId(content, id);
      let ordo = option?.ordo || null;
      if (canResolveCompline) {
        // Cached options and legacy links use the current Ordo.
        ordo = resolveComplineDescriptor(date.format('YYYY-MM-DD'), {
          diocese: effectiveOrdoDiocese.value,
          optionId: ordo?.optionId,
        });
      }
      return {
        ...resolved,
        ...(ordo?.celebrationId ? { _feastName: ordo.title, _rank: ordo.rank } : {}),
        ...(canResolveCompline ? {
          _periodType: content.context?.periodType || resolved?._periodType,
          _periodWeekNumber: content.context?.periodWeek ?? resolved?._periodWeekNumber,
          _dayOfWeek: (date.day() + 1),
        } : {}),
        _calendarDate: date.format('YYYY-MM-DD'),
        _contextPeriodType: content.context?.periodType || '',
        _ordo: ordo,
      };
    };

    let displayed;
    const show = (content) => {
      if (currentSequence !== sequence || displayed === content) return;
      displayed = content;
      day.value = resolveDay(content);
      error.value = day.value ? '' : 'Літургічны дзень не знойдзены.';
      if (error.value) reportLoadError(error.value);
      else if (loadStatus?.value?.retry === load) loadStatus.value = null;
      pending.value = false;
    };
    pending.value = true;
    try {
      show(await getLiturgicalContentForDate(date.toDate(), undefined, { onCached: show, onUpdated: show }));
    } catch (loadError) {
      logger.error('[useResolvedLiturgicalDay] load failed:', loadError);
      if (currentSequence === sequence) {
        if (canResolveCompline) day.value = resolveDay({});
        error.value = firestoreErrorMessage(loadError);
        reportLoadError(error.value);
      }
    } finally {
      if (currentSequence === sequence) pending.value = false;
    }
  }

  function reportLoadError(message) {
    if (loadStatus) loadStatus.value = { message, retry: load };
  }

  watch([() => enabled?.value, ordoCalendarEpoch, effectiveOrdoDiocese, () => route.params.day, () => route.params.id, () => route.query.reference, () => route.query.diocese, () => route.query.view], load, { immediate: true });
  return {
    day,
    dayOptions,
    context: computed(() => context.value),
    periodDay: computed(() => periodDay.value),
    pending: computed(() => pending.value),
    error: computed(() => error.value),
    reload: load,
  };
}
