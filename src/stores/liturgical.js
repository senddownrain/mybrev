/** Persistent, versioned public content. Auth and editor document reads bypass it. */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import {
  dynamicFeastCodesOf, legacyContextOf, planReadings, resolveRuntimeDay,
} from '@/utils/ordo/runtime';
import { currentOrdoDiocese } from '@/utils/ordoDiocese';
import { celebrationTextContext, periodTextContext } from '@/utils/ordoScreen';
import { fetchContentForDate } from '@/services/liturgicalContentService';
import { fetchDaysForDate, findDayByPeriod } from '@/services/liturgicalDayService';
import { getReadingsForDate } from '@/services/readingsService';
import { createReadSession } from '@/utils/contentCache';
import {
  publicContentCache, publicContentKey, contentKey, readingsKey, requestContentRefresh,
} from '@/utils/publicContentCache';

const dateKey = (date) => moment(date).startOf('day').format('YYYY-MM-DD');

export const useLiturgicalStore = defineStore('liturgical', () => {
  const isLoading = ref(false);
  const error = ref(null);
  let pending = 0;

  /**
   * ONE ResolvedLiturgicalDay per (date, diocese) for Hours and Readings.
   * The period context used for `days`/`readings` lookups is the engine's;
   * nothing stored in Firestore can override the computed year.
   */
  function resolveContext(mDate, diocese = currentOrdoDiocese(), referenceOptionId = '', periodOnly = false) {
    const resolved = periodOnly ? periodTextContext(mDate.format('YYYY-MM-DD'), { diocese }) : referenceOptionId
      ? celebrationTextContext(mDate.format('YYYY-MM-DD'), referenceOptionId, { diocese })
      : resolveRuntimeDay(mDate.format('YYYY-MM-DD'), { diocese });
    return { context: legacyContextOf(resolved), resolved, diocese, dynamicFeastCodes: dynamicFeastCodesOf(resolved) };
  }

  async function readResource(key, loader, options = {}) {
    const entry = await publicContentCache.read(key, async () => {
      const blocking = publicContentCache.peek(key) === undefined;
      if (blocking) { pending += 1; isLoading.value = true; error.value = null; }
      const session = createReadSession();
      try {
        const data = await loader(session);
        return { data, complete: session.complete };
      } catch (err) {
        if (blocking) error.value = err;
        throw err;
      } finally {
        if (blocking) { pending -= 1; isLoading.value = pending > 0; }
      }
    }, options);
    if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася атрымаць поўныя абноўленыя даныя. Захаваная копія засталася даступнай.');
    return entry.data;
  }

  async function fetchContentByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    return readResource(contentKey(dateKey(date), diocese, options.referenceOptionId, options.periodOnly), async (session) => {
      const { context, dynamicFeastCodes, resolved } = resolveContext(mDate, diocese, options.referenceOptionId, options.periodOnly);
      return fetchContentForDate(mDate, context, dynamicFeastCodes, session, { resolved, diocese });
    }, options);
  }

  async function fetchDaysByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    return readResource(publicContentKey('days', dateKey(date), diocese), async (session) => {
      const { context, dynamicFeastCodes, resolved } = resolveContext(mDate, diocese);
      const { periodDays, fixedDateDays, dynamicDaysByFeast } = await fetchDaysForDate(
        mDate, context, dynamicFeastCodes, session,
      );
      const all = [...periodDays, ...fixedDateDays, ...[...dynamicDaysByFeast.values()].flat()];
      return {
        context,
        ordoPrimaryId: resolved.primary.id,
        items: [...new Map(all.map((item) => [item.id, item])).values()],
      };
    }, options);
  }

  async function fetchReadingsByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    return readResource(readingsKey(dateKey(date), { ...options, diocese }), async (session) => {
      const { context, resolved } = resolveContext(mDate, diocese, options.referenceOptionId, options.periodOnly);
      // The same ResolvedLiturgicalDay as the Hours: identity, cycles and
      // lookup order all come from the engine.
      const plan = planReadings(resolved, { dayId: options.dayId || '' });
      const fullContext = {
        ...context,
        cycle: plan.cycle,
        sundayCycle: plan.sundayCycle,
        ordoPrimaryId: plan.primaryOptionId,
        ordoSelectedId: plan.selectedOptionId,
        diocese,
        ...(resolved.referenceOnly ? { referenceOption: resolved.primary } : {}),
        ...(resolved.periodOnly ? { periodOption: resolved.primary } : {}),
      };
      const items = await getReadingsForDate(mDate, fullContext, plan, {
        ...options, readSession: session,
      });
      return { context: { ...fullContext, readingsNotice: items.notice || null }, items: [...items] };
    }, options);
  }

  // Used by editor/picker: intentional online-first access, not immutable cache.
  const fetchDayByPeriod = (type, week, day) => findDayByPeriod(type, week, day);

  return {
    isLoading, error,
    fetchContentByDate, fetchDaysByDate, fetchReadingsByDate, fetchDayByPeriod,
    getCachedContent: (date, diocese, referenceOptionId, periodOnly) => publicContentCache.peek(contentKey(dateKey(date), diocese, referenceOptionId, periodOnly)) ?? null,
    resolveOrdoDay: (date, diocese = currentOrdoDiocese()) => resolveRuntimeDay(dateKey(date), { diocese }),
    getCachedReadings: (date, options) => publicContentCache.peek(readingsKey(dateKey(date), options)) ?? null,
    primeContent: (date, diocese, referenceOptionId, periodOnly) => publicContentCache.prime([contentKey(dateKey(date), diocese, referenceOptionId, periodOnly)]),
    primeReadings: (date, options) => publicContentCache.prime([readingsKey(dateKey(date), options)]),
    // Compatibility: invalidate instead of deleting precious offline content.
    clearCache: requestContentRefresh,
  };
});
