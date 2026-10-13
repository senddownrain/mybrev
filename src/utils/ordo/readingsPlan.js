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
    // Every document remembers the legal option it belongs to (`_ordoOptionId`: the first one) and,
    // for each option, the role of the document in it (`_ordoOptionRoles`): so a screen opens
    // the DEFAULT readings of the option chosen in the calendar — the weekday readings of a
    // memorial, its own readings only where the Lectionary prescribes them.
    const planned = [];
    plan.options.forEach((option) => {
      const defaultPurpose = option.allowedChoices?.[0]?.default || option.lookup[0]?.purpose || '';
      optionReadings(plan, option, docs, { selectCalendarDayVariants }).forEach((list, index) => {
        const purpose = option.lookup[index]?.purpose || '';
        planned.push(...list.map((doc) => ({ ...doc, _ordoOptionId: option.optionId, _ordoOptionRoles: { [option.optionId]: { purpose, default: purpose === defaultPurpose } } })));
      });
    });
    // Documents of the Hours day link (`dayId`) come first, but only when the plan itself offers them: a
    // seasonal date document of a Sunday in a date-keyed window is not an option of that Sunday.
    const plannedIds = new Set(planned.map((doc) => doc.id));
    const ordered = [...linked.filter((doc) => plannedIds.has(doc.id)), ...planned];
    const unique = new Map();
    ordered.forEach((doc) => {
      const known = unique.get(doc.id);
      if (!known) unique.set(doc.id, doc);
      else {
        const merged = { ...known };
        if (!known._ordoOptionId && doc._ordoOptionId) merged._ordoOptionId = doc._ordoOptionId;
        if (doc._ordoOptionRoles) merged._ordoOptionRoles = { ...(known._ordoOptionRoles || {}), ...doc._ordoOptionRoles };
        unique.set(doc.id, merged);
      }
    });
    return [...unique.values()];
  }
  if (linked.length) {
    const selected = selectVariants(linked);
    if (selected.length) return selected;
  }
  const selectedOption = plan.options.find((option) => option.optionId === plan.selectedOptionId) || plan.options[0];
  const chain = [selectedOption, ...plan.options.filter((option) => option !== selectedOption)];
  for (const option of chain) {
    const lists = optionReadings(plan, option, docs, { selectCalendarDayVariants });
    for (const [index, list] of lists.entries()) {
      // The proper readings of ANOTHER celebration are never substituted:
      // from the other options only the weekday readings may be taken.
      if (option !== selectedOption && option.lookup[index]?.purpose !== 'weekday') continue;
      const selected = selectVariants(list);
      if (selected.length) return selected;
    }
  }
  return [];
}

/**
 * What to tell the reader when the selected celebration has no texts of its
 * own readings: the known citation (`reference-only`) or nothing (`missing`).
 * A memorial that keeps the weekday readings is normal and gives no notice.
 */
export function readingsNotice(plan, docs = []) {
  const option = plan.options.find((item) => item.optionId === plan.selectedOptionId) || plan.options[0];
  if (!option || option.kind === 'temporal') return null;
  if (['memorial', 'optional-memorial'].includes(option.officeKind)) return null;
  const proper = option.lookup
    .filter((entry) => entry.purpose === 'proper')
    .flatMap((entry) => selectReadingDocuments(entry, option, docs));
  if (proper.length) return null;
  return {
    status: option.readingsReference ? 'reference-only' : 'missing',
    optionId: option.optionId,
    title: option.title,
    ...(option.readingsReference ? { reference: option.readingsReference } : {}),
  };
}
