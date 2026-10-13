/**
 * Defects of the SOURCE pages that are corrected in the canonical data
 * (owner decision) and therefore must be corrected in the parsed page too:
 * otherwise the audit would call the corrected document a mismatch and the
 * resync would restore the defect.
 */
export const CITATION_CORRECTIONS = Object.freeze([
  {
    id: 'ordinary-w28-d1--A', field: 'gospel', key: 'bible', from: 'Мк 22, 1–10', to: 'Мц 22, 1–10', pageId: '4865',
    evidence: 'Catholic.by 4865 prints «Мк 22, 1–10» above «+ Чытанне святога Евангелля паводле Мацвея»; page 4873 (Monday of week 28) cites the same parable as «Мц 22, 1–14»',
  },
]);

/** Corrects the citations of a parsed page in place; returns the corrections applied. */
export function applySourceCorrections(pageId, parsed) {
  const applied = [];
  if (!parsed?.sets) return applied;
  for (const fix of CITATION_CORRECTIONS.filter((item) => item.pageId === String(pageId))) {
    for (const set of parsed.sets) {
      for (const section of set.sections || []) {
        for (const holder of [section, ...(section.alternatives || [])]) {
          if (holder.bible === fix.from) { holder.bible = fix.to; applied.push({ page: String(pageId), from: fix.from, to: fix.to }); }
        }
      }
    }
  }
  return applied;
}
