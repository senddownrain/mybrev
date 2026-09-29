/**
 * Execute a readings plan (`planReadings`) on `readings` documents.
 * Pure: `readingsService` runs the queries, this module decides nothing
 * about priority beyond the engine's lookup order.
 */
import { selectReadingDocuments } from './runtime.js';

const feastVariants = (code) => {
  const bare = String(code || '').replace(/^feast-/, '');
  return bare ? [`feast-${bare}`, bare] : [];
};

/** Firestore query specs needed by a plan (deduplicated). */
export function readingQueriesOfPlan(plan, { dayId = '' } = {}) {
  const specs = new Map();
  const add = (field, value) => specs.set(JSON.stringify([field, value]), { field, value });
  if (dayId) {
    add('_dayId', dayId);
    add('_dayIds', dayId);
  }
  plan.options.forEach((option) => option.lookup.forEach((entry) => {
    const where = entry.where || {};
    if (where._feast) feastVariants(where._feast).forEach((value) => add('_feast', value));
    else if (where._date) add('_date', where._date);
    else if (where._periodType) {
      const weeks = Array.isArray(where._periodWeekNumber) ? where._periodWeekNumber : [where._periodWeekNumber];
      weeks.forEach((week) => add('period', {
        _periodType: where._periodType,
        _periodWeekNumber: week === null ? null : Number(week),
        _dayOfWeek: Number(where._dayOfWeek),
      }));
    }
  }));
  return [...specs.values()];
}

function linkedTo(dayId, docs) {
  return docs.filter((doc) => doc._dayId === dayId || doc._dayIds?.includes(dayId));
}

/**
 * Documents of one option in the engine's lookup order. Weekday documents of
 * date-based seasons keep the calendar-weekday variant (`_calendarDayOfWeek`).
 */
export function optionReadings(plan, option, docs, { selectCalendarDayVariants = (list) => list } = {}) {
  return option.lookup.map((entry) => {
    const found = selectReadingDocuments(entry, option, docs);
    return entry.where?._date ? selectCalendarDayVariants(found, plan.dayOfWeek) : found;
  });
}

/**
 * Order the fetched documents by the plan.
 * - `includeAlternatives`: every document of every legal option, grouped in
 *   engine order (primary, then alternatives), a linked selection first.
 * - otherwise: the selected option's first lookup that has documents.
 */
export function orderReadingsByPlan(plan, docs, {
  dayId = '', includeAlternatives = false, selectVariants = (list) => list, selectCalendarDayVariants,
} = {}) {
  const linked = dayId ? linkedTo(dayId, docs) : [];
  if (includeAlternatives) {
    const ordered = [...linked];
    plan.options.forEach((option) => optionReadings(plan, option, docs, { selectCalendarDayVariants })
      .forEach((list) => ordered.push(...list)));
    return [...new Map(ordered.map((doc) => [doc.id, doc])).values()];
  }
  if (linked.length) {
    const selected = selectVariants(linked);
    if (selected.length) return selected;
  }
  const selectedOption = plan.options.find((option) => option.optionId === plan.selectedOptionId) || plan.options[0];
  const chain = [selectedOption, ...plan.options.filter((option) => option !== selectedOption)];
  for (const option of chain) {
    for (const list of optionReadings(plan, option, docs, { selectCalendarDayVariants })) {
      const selected = selectVariants(list);
      if (selected.length) return selected;
    }
  }
  return [];
}
