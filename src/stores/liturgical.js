/** Persistent, versioned public content. Auth and editor document reads bypass it. */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import { useCalendarStore } from '@/stores/calendar';
import { computeLiturgicalContext } from '@/utils/liturgicalCalendar';
import { logger } from '@/utils/logger';
import {
  dynamicFeastCodesOf, legacyContextOf, planReadings, resolveRuntimeDay,
} from '@/utils/ordo/runtime';
import { currentOrdoDiocese } from '@/utils/ordoDiocese';
import { currentOrdoLocalChurch, localChurchCacheKey } from '@/utils/ordoLocalChurch';
import { FEAST_NAME_MAP } from '@/constants/liturgicalFeastsMap';
import { fetchContentForDate } from '@/services/liturgicalContentService';
import { fetchDaysForDate, findDayByPeriod, getAllFeastDays } from '@/services/liturgicalDayService';
import { getReadingsForDate } from '@/services/readingsService';
import { createReadSession } from '@/utils/contentCache';
import {
  publicContentCache, publicContentKey, contentKey, readingsKey, requestContentRefresh,
} from '@/utils/publicContentCache';

const dateKey = (date) => moment(date).startOf('day').format('YYYY-MM-DD');

export const useLiturgicalStore = defineStore('liturgical', () => {
  const calendarStore = useCalendarStore();
  const isLoading = ref(false);
  const error = ref(null);
  let pending = 0;

  /**
   * ONE ResolvedLiturgicalDay per (date, diocese) for Hours and Readings.
   * The period context used for `days`/`readings` lookups is the engine's;
   * a stored `yearOptions` document may override it (the discrepancy is
   * logged), but never the resolved celebrations.
   */
  async function resolveContext(mDate, session, diocese = currentOrdoDiocese(), localChurch = currentOrdoLocalChurch()) {
    const year = mDate.year();
    const resolved = resolveRuntimeDay(mDate.format('YYYY-MM-DD'), { diocese, localChurch });
    const engineContext = legacyContextOf(resolved);
    let context = engineContext;
    try {
      const [opts, nextOpts] = await Promise.all([
        calendarStore.getYearOptions(year, session),
        calendarStore.getYearOptions(year + 1, session),
      ]);
      const dynamicDates = await calendarStore.getDynamicDates(year, session);
      const stored = computeLiturgicalContext(mDate, opts, nextOpts, dynamicDates);
      const differs = ['periodType', 'periodWeek', 'dayOfWeek'].some((key) => stored[key] !== engineContext[key]);
      if (differs) {
        logger.warn(`[liturgicalStore] ${resolved.date}: stored yearOptions give ${stored.periodType}-w${stored.periodWeek}-d${stored.dayOfWeek}, engine ${engineContext.periodType}-w${engineContext.periodWeek}-d${engineContext.dayOfWeek}; using the stored override`);
        context = { ...stored, _feast: engineContext._feast };
      }
    } catch (error) {
      logger.warn('[liturgicalStore] year options unavailable, using the engine context:', error?.message || error);
    }
    return { context, resolved, diocese, dynamicFeastCodes: dynamicFeastCodesOf(resolved) };
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
    const localChurch = currentOrdoLocalChurch();
    return readResource(contentKey(dateKey(date), diocese, localChurch), async (session) => {
      const { context, dynamicFeastCodes, resolved } = await resolveContext(mDate, session, diocese, localChurch);
      return fetchContentForDate(mDate, context, dynamicFeastCodes, session, { resolved, diocese });
    }, options);
  }

  async function fetchDaysByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    const localChurch = currentOrdoLocalChurch();
    const localKey = localChurchCacheKey(localChurch);
    return readResource(publicContentKey('days', dateKey(date), diocese, ...(localKey ? [localKey] : [])), async (session) => {
      const { context, dynamicFeastCodes, resolved } = await resolveContext(mDate, session, diocese, localChurch);
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

  async function fetchAllFeasts(year, options = {}) {
    return readResource(publicContentKey('feasts', Number(year)), async (session) => {
      await calendarStore.getDynamicDates(year, session);
      const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
      const allFeastDays = await getAllFeastDays(session);
      const normalize = (value) => String(value || '').replace(/^feast-/, '');
      return allFeastDays.map((feast) => {
        const dynamicEntry = Object.entries(FEAST_NAME_MAP).find(([key, code]) => (
          normalize(code) === normalize(feast._feast) && dynamicDates[key]
        ));
        const dynamicDate = dynamicEntry ? dynamicDates[dynamicEntry[0]] : null;
        const isDynamic = Boolean(dynamicDate);
        return {
          ...feast,
          isDynamic,
          isFixed: !isDynamic && Boolean(feast._date),
          calendarDate: dynamicDate?.format('YYYY-MM-DD') || null,
        };
      }).filter((feast) => feast.isDynamic || feast.isFixed);
    }, options);
  }

  async function fetchReadingsByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    const localChurch = currentOrdoLocalChurch();
    return readResource(readingsKey(dateKey(date), { ...options, diocese, localChurch }), async (session) => {
      const { context, resolved } = await resolveContext(mDate, session, diocese, localChurch);
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
      };
      const items = await getReadingsForDate(mDate, fullContext, plan, {
        ...options, readSession: session,
      });
      return { context: fullContext, items };
    }, options);
  }

  // Used by editor/picker: intentional online-first access, not immutable cache.
  const fetchDayByPeriod = (type, week, day) => findDayByPeriod(type, week, day);

  return {
    isLoading, error,
    fetchContentByDate, fetchDaysByDate, fetchAllFeasts, fetchReadingsByDate, fetchDayByPeriod,
    getCachedContent: (date) => publicContentCache.peek(contentKey(dateKey(date))) ?? null,
    resolveOrdoDay: (date, diocese = currentOrdoDiocese()) => resolveRuntimeDay(dateKey(date), { diocese, localChurch: currentOrdoLocalChurch() }),
    getCachedReadings: (date, options) => publicContentCache.peek(readingsKey(dateKey(date), options)) ?? null,
    primeContent: (date) => publicContentCache.prime([contentKey(dateKey(date))]),
    primeReadings: (date, options) => publicContentCache.prime([readingsKey(dateKey(date), options)]),
    // Compatibility: invalidate instead of deleting precious offline content.
    clearCache: requestContentRefresh,
  };
});
