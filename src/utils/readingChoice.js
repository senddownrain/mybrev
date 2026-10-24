/**
 * Which of the legal readings of an Office field the user picked (D-1).
 *
 * One entry per field: `{ context, index }`. `context` names the day and the Office option the reader is
 * showing (`<date>|<option id>`), so a choice never leaks into another day, another period or another
 * Proper/Common assembly: asking with a different context gives the default and the next write replaces the entry.
 * Pure over a Storage-like object (sessionStorage in the browser); a broken or missing storage only means "no memory".
 */
export const READING_CHOICE_STORAGE_KEY = 'mybrev.readingChoice.v1';

export function readingChoiceContext(date, optionId) {
  return `${date || ''}|${optionId || ''}`;
}

export function createReadingChoiceStore(storage) {
  let entries = {};
  try {
    const parsed = JSON.parse(storage?.getItem(READING_CHOICE_STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) entries = parsed;
  } catch { entries = {}; }

  const persist = () => {
    try { storage?.setItem(READING_CHOICE_STORAGE_KEY, JSON.stringify(entries)); } catch { /* private mode: keep in memory */ }
  };

  return {
    get(field, context, count = Infinity) {
      const entry = entries[field];
      if (!entry || entry.context !== context) return 0;
      return Number.isInteger(entry.index) && entry.index >= 0 && entry.index < count ? entry.index : 0;
    },
    set(field, context, index) {
      if (!field || !Number.isInteger(index) || index < 0) return;
      if (index === 0) delete entries[field]; else entries[field] = { context, index };
      persist();
    },
  };
}
