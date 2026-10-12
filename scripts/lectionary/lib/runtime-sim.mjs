/**
 * Headless Readings runtime: the planned Firestore queries of the Ordo engine
 * are answered from a snapshot, then the SAME pure modules as the app
 * (`orderReadingsByPlan`, lectionary variant selection, `resolveReadingsScreen`)
 * produce what the Readings screen would show. No Firestore, no writes.
 */
import { resolveLiturgicalDate } from '../../../src/utils/ordo/index.js';
import { planReadings } from '../../../src/utils/ordo/runtime.js';
import { orderReadingsByPlan, readingQueriesOfPlan, readingsNotice } from '../../../src/utils/ordo/readingsPlan.js';
import {
  hasReadingDocumentContent, selectCalendarDayVariants, selectReadingLectionaryVariants,
} from '../../../src/utils/parsedReadingsIdentity.js';
import { resolveReadingsScreen } from '../../../src/utils/readingsScreen.js';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Equivalent of readingsService.firestoreQuery over an in-memory collection. */
export function queryReadings(docs, spec) {
  switch (spec.field) {
    case '_feast': return docs.filter((doc) => doc._feast === spec.value);
    case '_date': return docs.filter((doc) => doc._date === spec.value);
    case '_dayId': return docs.filter((doc) => doc._dayId === spec.value);
    case '_dayIds': return docs.filter((doc) => Array.isArray(doc._dayIds) && doc._dayIds.includes(spec.value));
    case 'period': return docs.filter((doc) => same(doc._periodType ?? undefined, spec.value._periodType)
      && (doc._periodWeekNumber ?? null) === spec.value._periodWeekNumber
      && doc._dayOfWeek === spec.value._dayOfWeek && doc._periodWeekNumber !== undefined);
    default: return [];
  }
}

export function createReadingsRuntime(rawDocs, { yearOverrides = [] } = {}) {
  const docs = rawDocs.map((doc) => ({ ...doc })).filter(hasReadingDocumentContent);
  const resolveCache = new Map();
  const resolve = (date, diocese) => {
    const key = `${date}|${diocese}`;
    if (!resolveCache.has(key)) resolveCache.set(key, resolveLiturgicalDate(date, { country: 'BY', diocese, yearOverrides }));
    return resolveCache.get(key);
  };
  return {
    docs,
    resolve,
    /** Items the Readings service returns for a date (all options, as the screen loads them). */
    load(date, diocese, { dayId = '' } = {}) {
      const day = resolve(date, diocese);
      const plan = planReadings(day, { dayId });
      const results = readingQueriesOfPlan(plan, { dayId }).map((spec) => queryReadings(docs, spec));
      const documents = [...new Map(results.flat().map((doc) => [doc.id, doc])).values()];
      const context = { cycle: plan.cycle, sundayCycle: plan.sundayCycle, dayOfWeek: plan.dayOfWeek };
      const items = orderReadingsByPlan(plan, documents, {
        dayId, includeAlternatives: true, selectCalendarDayVariants,
        selectVariants: (list) => selectReadingLectionaryVariants(list, context),
      });
      return { day, plan, items, context, notice: readingsNotice(plan, documents) };
    },
  };
}

/** What the screen shows for a date/option/set/cycle (route `?option=&set=&year=`). */
export function screenFor(loaded, query = {}) {
  return resolveReadingsScreen({ items: loaded.items, context: loaded.context, query });
}
