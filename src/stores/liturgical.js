/** Persistent, versioned public content. Auth and editor document reads bypass it. */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import moment from '@/utils/moment-be';
import {
  dynamicFeastCodesOf, legacyContextOf, planReadings, resolveRuntimeDay,
} from '@/utils/ordo/runtime';
import { currentOrdoDiocese } from '@/utils/ordoDiocese';
import { createReadSession } from '@/utils/contentCache';
import { afterContentPaint } from '@/utils/afterContentPaint';
import {
  publicContentCache, publicContentKey, contentKey, readingsKey, requestContentRefresh,
  resolveReaderDay, legacyReaderKey, hasCorrectedHours,
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
    const resolved = resolveReaderDay(mDate.format('YYYY-MM-DD'), diocese, referenceOptionId, periodOnly);
    return { context: legacyContextOf(resolved), resolved, diocese, dynamicFeastCodes: dynamicFeastCodesOf(resolved) };
  }

  async function readResource(key, loader, options = {}) {
    const legacyKey = options.cacheFirst ? legacyReaderKey(key) : undefined;
    const entry = await publicContentCache.read(key, async () => {
      const blocking = !publicContentCache.hasComplete(key, options.acceptCached)
        && !publicContentCache.hasComplete(legacyKey, options.acceptCached);
      if (blocking) { pending += 1; isLoading.value = true; error.value = null; }
      const session = createReadSession();
      let timer;
      try {
        const data = await Promise.race([
          loader(session),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('Liturgical content timed out'), {
              code: 'deadline-exceeded',
            })), 11000);
          }),
        ]);
        return { data, complete: session.complete };
      } catch (err) {
        if (blocking) {
          error.value = err;
          if (typeof window !== 'undefined') window.malitounikStartup?.recoverModuleError(err);
        }
        throw err;
      } finally {
        clearTimeout(timer);
        if (blocking) { pending -= 1; isLoading.value = pending > 0; }
      }
    }, {
      ...options,
      legacyKey,
      revalidateInBackground: options.cacheFirst && !options.requireFresh ? afterContentPaint : undefined,
    });
    if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася атрымаць поўныя абноўленыя даныя. Захаваная копія засталася даступнай.');
    return entry.data;
  }

  async function fetchContentByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    const { context, dynamicFeastCodes, resolved } = resolveContext(mDate, diocese, options.referenceOptionId, options.periodOnly);
    return readResource(contentKey(dateKey(date), diocese, options.referenceOptionId, options.periodOnly, resolved), async (session) => {
      const { fetchContentForDate } = await import('@/services/liturgicalContentService');
      const content = await fetchContentForDate(mDate, context, dynamicFeastCodes, session, { resolved, diocese });
      // SDK snapshots can contain raw text from before the editorial migration.
      // Offline Hours use the independently saved, fully assembled reader copy.
      if (!session.complete) throw new Error('Не ўдалося атрымаць поўны тэкст гадзінаў. Праверце злучэнне і паспрабуйце зноў.');
      return content;
    }, { ...options, fresh: true, cacheFirst: true, acceptCached: hasCorrectedHours });
  }

  async function fetchDaysByDate(date, options = {}) {
    const mDate = moment(date).startOf('day');
    const diocese = options.diocese || currentOrdoDiocese();
    return readResource(publicContentKey('days', dateKey(date), diocese), async (session) => {
      const { context, dynamicFeastCodes, resolved } = resolveContext(mDate, diocese);
      const { fetchDaysForDate } = await import('@/services/liturgicalDayService');
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
    const { context, resolved } = resolveContext(mDate, diocese, options.referenceOptionId, options.periodOnly);
    return readResource(readingsKey(dateKey(date), { ...options, diocese, resolved }), async (session) => {
      const { getReadingsForDate } = await import('@/services/readingsService');
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
      if (!session.complete && !items.length) {
        throw new Error('Не ўдалося атрымаць чытанні. Праверце злучэнне і паспрабуйце зноў.');
      }
      return { context: { ...fullContext, readingsNotice: items.notice || null }, items: [...items] };
    }, { ...options, cacheFirst: true });
  }

  // Used by editor/picker: intentional online-first access, not immutable cache.
  const fetchDayByPeriod = async (type, week, day) => {
    const { findDayByPeriod } = await import('@/services/liturgicalDayService');
    return findDayByPeriod(type, week, day);
  };

  return {
    isLoading, error,
    fetchContentByDate, fetchDaysByDate, fetchReadingsByDate, fetchDayByPeriod,
    resolveOrdoDay: (date, diocese = currentOrdoDiocese()) => resolveRuntimeDay(dateKey(date), { diocese }),
    // Compatibility: invalidate instead of deleting precious offline content.
    clearCache: requestContentRefresh,
  };
});
