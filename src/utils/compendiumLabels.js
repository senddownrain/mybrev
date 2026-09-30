// Product-facing level labels of the Compendium (see docs/compendium.md).
//
// The canonical data keeps the Catholic.by wording (`chapterLabel: "ГЛАВА
// ПЕРШАЯ"`). The UI names the levels ЧАСТКА → РАЗДЗЕЛ → ПАДРАЗДЗЕЛ, and the
// label of a РАЗДЗЕЛ / ПАДРАЗДЗЕЛ is generated from its number, because both
// words are masculine («ГЛАВА ПЕРШАЯ» must become «ПАДРАЗДЗЕЛ ПЕРШЫ»).
//
// Pure module: no Vue or `@/` imports, shared with `node --test`.

/** Masculine Belarusian ordinals 1–10 (the same table is used by the Flutter app). */
export const MASCULINE_ORDINALS = Object.freeze([
  'ПЕРШЫ', 'ДРУГІ', 'ТРЭЦІ', 'ЧАЦВЁРТЫ', 'ПЯТЫ',
  'ШОСТЫ', 'СЁМЫ', 'ВОСЬМЫ', 'ДЗЯВЯТЫ', 'ДЗЯСЯТЫ',
]);

export const COMPENDIUM_LEVEL_WORDS = Object.freeze({ part: 'ЧАСТКА', section: 'РАЗДЗЕЛ', chapter: 'ПАДРАЗДЗЕЛ' });

/** "ПЕРШЫ" for 1 … "ДЗЯСЯТЫ" for 10; null outside the table. */
export function masculineOrdinal(number) {
  return Number.isInteger(number) ? MASCULINE_ORDINALS[number - 1] || null : null;
}

/**
 * Visible label of a structural level.
 * - part: the source label (ЧАСТКА is feminine and is printed that way);
 * - section / chapter: level word + masculine ordinal built from `number`,
 *   or the plain number beyond the table ("ПАДРАЗДЗЕЛ 11").
 */
export function compendiumLevelLabel(kind, number, sourceLabel = null) {
  const word = COMPENDIUM_LEVEL_WORDS[kind];
  if (!word) return sourceLabel || '';
  if (kind === 'part') return sourceLabel || (Number.isInteger(number) ? `${word} ${number}` : word);
  if (!Number.isInteger(number)) return word;
  return `${word} ${masculineOrdinal(number) || number}`;
}
