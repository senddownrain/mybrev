/**
 * Assembled Office ↔ legacy `days` copy: differences the rubric classifier
 * of `audit-hours-sources` cannot explain are decided by an attached
 * Belarusian source (final phase §9), never by "newer wins".
 *
 *   all-faithful-departed            lh.catholic.by 02.11.2026 (weekday)
 *   holy-innocents                   lh.catholic.by 28.12.2023
 *   sv-andrei-bobola                 lh.catholic.by 16.05.2025
 *   dedication-basilicas-peter-paul  «18 лістапада.docx» + GILH 236
 */
import { pageFields } from './hours-source-imports.mjs';
import { plain } from './lh-catholic-by.mjs';

const PAGE_SOURCES = Object.freeze({
  'all-faithful-departed': '2026-11-02.html',
  'holy-innocents': '2023-12-28.html',
  'sv-andrei-bobola': '2025-05-16.html',
});

/**
 * 18.11 (docx): «Агульныя тэксты пра Апосталаў … акрамя наступнага»: own
 * Office of Readings R2 + responsory, Lauds hymn, Benedictus antiphon,
 * prayer; Vespers: hymn from Lauds, Magnificat antiphon. Nothing for
 * Daytime Prayer → a memorial takes it from the weekday (GILH 236).
 */
export const DOCUMENT_SOURCES = Object.freeze({
  'dedication-basilicas-peter-paul': {
    source: '18 лістапада.docx',
    own: ['officeOfReadingsR2', 'laudesHymn', 'laudesAntBen', 'laudesPr', 'vesperHymn', 'vesperAntMag', 'vesperPr'],
    weekday: /^sext[123]/,
    rule: 'GILH 236: Daytime Prayer of a memorial is of the weekday; the source lists no Daytime element',
  },
});

const norm = (value) => plain(value).toLocaleLowerCase('be').replace(/[^\p{L}\p{N}]+/gu, '');

/** @returns {{ winner: 'assembled'|'legacy', source: string, reason: string } | null} */
export function reconcileLegacyDifference({ optionId, field, legacy, assembled }, root = process.cwd()) {
  const page = PAGE_SOURCES[optionId];
  if (page) {
    const value = pageFields(page, root).fields[field];
    const source = `lh.catholic.by ${page.replace('.html', '')}`;
    if (!value && !plain(assembled)) {
      return { winner: 'assembled', source, reason: `the source has no ${field}; the legacy value «${plain(legacy).slice(0, 40)}» is not a text of this Office` };
    }
    if (value && norm(value) === norm(assembled)) {
      const legacyHasMore = norm(legacy).startsWith(norm(value)) && norm(legacy) !== norm(value);
      return { winner: 'assembled', source, reason: legacyHasMore ? 'assembled = source; the legacy copy appended an alternative to the same field' : 'assembled = source' };
    }
    if (value && norm(value) === norm(legacy)) return { winner: 'legacy', source, reason: 'legacy = source: fix the assembly' };
    return null;
  }
  const doc = DOCUMENT_SOURCES[optionId];
  if (doc) {
    if (doc.weekday.test(field) && !doc.own.includes(field)) return { winner: 'assembled', source: doc.source, reason: doc.rule };
    return null;
  }
  return null;
}
