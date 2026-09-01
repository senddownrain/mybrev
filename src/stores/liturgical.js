/** Persistent, versioned public content. Auth and editor document reads bypass it. */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import { useCalendarStore } from '@/stores/calendar';
import { computeLiturgicalContext, getDynamicFeastCodesForDate } from '@/utils/liturgicalCalendar';
import { getLiturgicalYear, getCycleForDate } from '@/utils/liturgicalCycle';
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

  async function resolveContext(mDate, session) {
    const year = mDate.year();
    await Promise.all([
      calendarStore.getYearOptions(year, session),
      calendarStore.getYearOptions(year + 1, session),
    ]);
    await calendarStore.getDynamicDates(year, session);
    const opts = calendarStore.optionsForYear(year).value;
    const nextOpts = calendarStore.optionsForYear(year + 1).value;
    const dynamicDates = calendarStore.dynamicDatesForYear(year).value || {};
    return {
      context: computeLiturgicalContext(mDate, opts, nextOpts, dynamicDates),
      dynamicFeastCodes: getDynamicFeastCodesForDate(mDate, dynamicDates),
    };
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
    return readResource(contentKey(dateKey(date)), async (session) => {
      const { context, dynamicFeastCodes } = await resolveContext(mDate, session);
      return fetchContentForDate(mDate, context, dynamicFeastCodes, session);
    }, options);
  }

  async function fetchDaysByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    return readResource(publicContentKey('days', dateKey(date)), async (session) => {
      const { context, dynamicFeastCodes } = await resolveContext(mDate, session);
      const { periodDays, fixedDateDays, dynamicDaysByFeast } = await fetchDaysForDate(
        mDate, context, dynamicFeastCodes, session,
      );
      const all = [...periodDays, ...fixedDateDays, ...[...dynamicDaysByFeast.values()].flat()];
      return { context, items: [...new Map(all.map((item) => [item.id, item])).values()] };
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
    return readResource(readingsKey(dateKey(date), options), async (session) => {
      const { context, dynamicFeastCodes } = await resolveContext(mDate, session);
      // resolveContext has already restored/refreshed calendar dependencies.
      const liturgicalYear = await getLiturgicalYear(date, { useCalendarStore: true });
      const cycle = await getCycleForDate(date, liturgicalYear, context.dayOfWeek);
      const sundayCycle = await getCycleForDate(date, liturgicalYear, 1);
      const fullContext = { ...context, cycle, sundayCycle };
      const items = await getReadingsForDate(mDate, fullContext, dynamicFeastCodes, {
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
    getCachedReadings: (date, options) => publicContentCache.peek(readingsKey(dateKey(date), options)) ?? null,
    primeContent: (date) => publicContentCache.prime([contentKey(dateKey(date))]),
    primeReadings: (date, options) => publicContentCache.prime([readingsKey(dateKey(date), options)]),
    // Compatibility: invalidate instead of deleting precious offline content.
    clearCache: requestContentRefresh,
  };
});
