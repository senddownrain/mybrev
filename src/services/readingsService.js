import { collection, query, where } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { logger } from '@/utils/logger';
import {
  hasReadingDocumentContent,
  selectCalendarDayVariants,
  selectReadingLectionaryVariants,
} from '@/utils/parsedReadingsIdentity';
import { orderReadingsByPlan, readingQueriesOfPlan } from '@/utils/ordo/readingsPlan';

const COLLECTION = 'readings';

function col() {
  return collection(db, COLLECTION);
}

function firestoreQuery(spec) {
  switch (spec.field) {
    case '_feast': return query(col(), where('_feast', '==', spec.value));
    case '_date': return query(col(), where('_date', '==', spec.value));
    case '_dayId': return query(col(), where('_dayId', '==', spec.value));
    case '_dayIds': return query(col(), where('_dayIds', 'array-contains', spec.value));
    case 'period': return query(
      col(),
      where('_periodType', '==', spec.value._periodType),
      where('_periodWeekNumber', '==', spec.value._periodWeekNumber),
      where('_dayOfWeek', '==', Number(spec.value._dayOfWeek)),
    );
    default: return null;
  }
}

/**
 * Fetch structured readings for a liturgical date.
 *
 * The celebration identity, the lectionary cycles and the lookup order come
 * from the Ordo engine (`planReadings` on the SAME ResolvedLiturgicalDay as
 * the Hours). This service only runs the planned Firestore queries; it has no
 * priority logic of its own.
 *
 * @param {import('moment').Moment} mDate
 * @param {{ cycle: string, sundayCycle: string, dayOfWeek: number }} context
 * @param {object} plan   `planReadings(resolvedDay, { dayId })`
 * @param {{ dayId?: string, includeAlternatives?: boolean, readSession?: object }} options
 * @returns {Promise<Object[]>}
 */
export async function getReadingsForDate(mDate, context, plan, options = {}) {
  async function queryDocs(q) {
    const snapshot = await getDocsOfflineAware(q, options.readSession);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter(hasReadingDocumentContent);
  }
  const specs = readingQueriesOfPlan(plan, { dayId: options.dayId || '' });
  const results = await Promise.all(specs.map(async (spec) => {
    const q = firestoreQuery(spec);
    return q ? queryDocs(q) : [];
  }));
  const documents = [...new Map(results.flat().map((document) => [document.id, document])).values()];
  const ordered = orderReadingsByPlan(plan, documents, {
    dayId: options.dayId || '',
    includeAlternatives: Boolean(options.includeAlternatives),
    selectCalendarDayVariants,
    selectVariants: (list) => selectReadingLectionaryVariants(list, context),
  });
  logger.log(
    `[readingsService] ${mDate.format('YYYY-MM-DD')} ${plan.diocese} option=${plan.selectedOptionId} `
      + `cycle=${context.cycle}/${context.sundayCycle}: ${ordered.length}`,
  );
  return ordered;
}
