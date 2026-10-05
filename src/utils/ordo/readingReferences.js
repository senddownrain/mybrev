/**
 * Biblical citations of the readings of every legal option of a day, for the
 * Ordo — without loading the readings texts.
 *
 * The same plan (`planReadings`) and the same selection (`orderReadingsByPlan`,
 * lectionary cycle, calendar weekday) as the Readings screen, run on the
 * generated reference index (`src/data/ordo/reading-references.json`, built
 * from `readings`). A celebration whose own readings are not in `readings`
 * shows the citation printed in the calendars (`reference-only`) or the
 * weekday readings when that is the rubrical default.
 *
 * Pure: the index is passed in.
 */
import { planReadings, selectReadingDocuments } from './runtime.js';
import { orderReadingsByPlan, readingQueriesOfPlan } from './readingsPlan.js';
import { selectCalendarDayVariants, selectReadingLectionaryVariants } from '../parsedReadingsIdentity.js';

export const READING_REFERENCE_STATUS = Object.freeze({
  PROPER: 'proper',            // the celebration's own readings
  WEEKDAY: 'weekday',          // weekday readings (temporal day, or a memorial's default)
  REFERENCE_ONLY: 'reference-only', // citation from the calendars, no text in `readings`
  MISSING: 'missing',
});

export const READING_LABELS = Object.freeze({
  reading1: 'Першае чытанне',
  psalm: 'Псальм',
  reading2: 'Другое чытанне',
  gospel: 'Евангелле',
});

// The index drops null fields: a missing week is Firestore's `== null`
// (lent-w0-d5…d7, the days after Ash Wednesday), not week 0.
const sameWeek = (value, wanted) => (wanted === null || wanted === undefined
  ? value === null || value === undefined
  : value !== null && value !== undefined && Number(value) === Number(wanted));

/** Entries of the index a Firestore query of the plan would return. */
function matching(index, spec) {
  switch (spec.field) {
    case '_feast': return index.filter((doc) => doc._feast === spec.value);
    case '_date': return index.filter((doc) => doc._date === spec.value);
    case '_dayId': return index.filter((doc) => doc._dayId === spec.value);
    case '_dayIds': return index.filter((doc) => doc._dayIds?.includes(spec.value));
    case 'period': return index.filter((doc) => doc._periodType === spec.value._periodType
      && sameWeek(doc._periodWeekNumber, spec.value._periodWeekNumber)
      && Number(doc._dayOfWeek) === Number(spec.value._dayOfWeek));
    default: return [];
  }
}

const citationRows = (doc) => ['reading1', 'psalm', 'reading2', 'gospel']
  .filter((key) => doc.citations?.[key])
  .map((key) => ({ key, label: READING_LABELS[key], citation: doc.citations[key] }));

/**
 * @param {object} resolved  ResolvedLiturgicalDay
 * @param {object[]} index   reading reference entries
 * @returns {Array<{ optionId, title, status, documents: Array<{ id, title, year, rows }>, reference?, weekdayDefault? }>}
 */
export function readingReferencesForDay(resolved, index) {
  const basePlan = planReadings(resolved);
  const context = { cycle: basePlan.cycle, sundayCycle: basePlan.sundayCycle };
  const docs = [...new Map(readingQueriesOfPlan(basePlan).flatMap((spec) => matching(index, spec))
    .map((doc) => [doc.id, doc])).values()];
  return basePlan.options.map((option) => {
    const plan = { ...basePlan, selectedOptionId: option.optionId };
    const ordered = orderReadingsByPlan(plan, docs, {
      selectCalendarDayVariants: (list) => selectCalendarDayVariants(list, basePlan.dayOfWeek),
      selectVariants: (list) => selectReadingLectionaryVariants(list, context),
    });
    const ownDocs = selectReadingLectionaryVariants([...new Map(option.lookup.filter((entry) => entry.purpose === 'proper')
      .flatMap((entry) => selectReadingDocuments(entry, option, docs)).map((doc) => [doc.id, doc])).values()], context);
    const memorial = ['memorial', 'optional-memorial'].includes(option.officeKind);
    const describe = (list) => list.map((doc) => ({
      id: doc.id, title: doc.title || '', ...(doc.year ? { year: doc.year } : {}), rows: citationRows(doc),
    }));
    let status;
    if (option.kind === 'temporal') status = ordered.length ? READING_REFERENCE_STATUS.WEEKDAY : READING_REFERENCE_STATUS.MISSING;
    else if (memorial) status = ordered.length ? READING_REFERENCE_STATUS.WEEKDAY : READING_REFERENCE_STATUS.MISSING;
    else if (ownDocs.length) status = READING_REFERENCE_STATUS.PROPER;
    else if (option.readingsReference) status = READING_REFERENCE_STATUS.REFERENCE_ONLY;
    else status = ordered.length ? READING_REFERENCE_STATUS.WEEKDAY : READING_REFERENCE_STATUS.MISSING;
    const ownIds = new Set(ownDocs.map((doc) => doc.id));
    return {
      optionId: option.optionId,
      title: option.title,
      officeKind: option.officeKind,
      status,
      // What the Readings screen opens for this option.
      documents: status === READING_REFERENCE_STATUS.REFERENCE_ONLY ? [] : describe(ordered),
      // A memorial keeps the weekday readings; its own ones are an option («Або ўласныя»).
      alternatives: memorial ? describe(ownDocs.filter((doc) => !ordered.some((item) => item.id === doc.id))) : [],
      ...(option.readingsReference && !ownIds.size ? { reference: option.readingsReference } : {}),
    };
  });
}

let indexPromise = null;
/** Lazy bundled index (separate chunk; never on the first render path). */
export function loadReadingReferenceIndex() {
  indexPromise ??= import('../../data/ordo/reading-references.json').then((module) => (module.default || module).references || []);
  return indexPromise;
}
