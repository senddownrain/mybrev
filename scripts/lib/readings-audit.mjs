/**
 * Readings audit (pure): Ordo expected readings ↔ `readingsRef` ↔ the
 * readings document actually found ↔ the citations inside it.
 *
 * Statuses
 *   MATCH            a document with content; its Gospel agrees with the calendars
 *                    (`verified: false` when no calendar prints the citation)
 *   WEEKDAY_DEFAULT  memorial without own readings: the weekday readings are
 *                    the rubrical default — normal, not missing
 *   REFERENCE_ONLY   no text, but the citation is known from the calendars
 *   MISSING_CONTENT  solemnity / feast with neither a document nor a citation
 *   WRONG_LINK       the document is linked (`_dayId`) to another celebration
 *   WRONG_CITATION   the document's Gospel differs from every calendar
 *   AMBIGUOUS        several unrelated documents answer the lookup
 */
import { collapseCoveredDocuments, massReadingSetsOf } from '../../src/utils/massReadingSets.js';

export const READING_STATUSES = Object.freeze([
  'MATCH', 'WEEKDAY_DEFAULT', 'REFERENCE_ONLY', 'MISSING_CONTENT', 'WRONG_LINK', 'WRONG_CITATION', 'AMBIGUOUS',
]);

const GOSPELS = new Set(['мц', 'мк', 'лк', 'ян']);
const CITATION = /((?:[1-3]\s*)?[А-ЯЁІЎ][а-яёіў’']{0,5})\.?\s*(\d{1,3})\s*,/gu;

/** `Лк 1, 39-56` → `{ book: 'лк', chapter: 1 }` for every citation of a text. */
export function citationsOf(text) {
  return [...String(text || '').matchAll(CITATION)].map((match) => ({
    book: match[1].replace(/\s+/g, '').toLocaleLowerCase('be'),
    chapter: Number(match[2]),
  }));
}

export const gospelKeysOf = (text) => [...new Set(citationsOf(text).filter((item) => GOSPELS.has(item.book))
  .map((item) => `${item.book} ${item.chapter}`))];

/**
 * Proper readings the calendars print for a celebration on a day.
 * On a memorial the first lines are the weekday readings; the proper ones
 * follow «Або:». On solemnities and feasts every line is proper.
 */
export function properReadingLines(sourceReadings, { memorial }) {
  const lines = (sourceReadings || []).map((item) => String(item.text || '').trim()).filter(Boolean);
  if (!memorial) return lines;
  const start = lines.findIndex((line) => /^або(?:[:\s]|$)/iu.test(line));
  return start < 0 ? [] : lines.slice(start).map((line) => line.replace(/^або:?\s*/iu, ''));
}

// Older imports have no `sectionsFound`; a Gospel citation means the text was parsed.
const fullSets = (doc) => massReadingSetsOf(doc).filter((set) => !set.referenceOnly);
const referenceSets = (doc) => massReadingSetsOf(doc).filter((set) => set.referenceOnly);
const hasContent = (doc) => fullSets(doc).length > 0
  || (!referenceSets(doc).length && ((Array.isArray(doc.sectionsFound) && doc.sectionsFound.includes('gospel')) || Boolean(doc.gospel?.bible)));
/** Gospel citations of a document: every set and cycle, or the flat field. */
const gospelCitations = (doc) => (massReadingSetsOf(doc).length
  ? massReadingSetsOf(doc).flatMap((set) => (set.sections || []).filter((section) => section.kind === 'gospel').map((section) => section.bible))
  : [doc.gospel?.bible]);
/** Sets imported from the Catholic.by Lectionary (source rank 2 > calendars, rank 3). */
const fromLectionary = (doc) => fullSets(doc).some((set) => /catholic\.by/.test(set.source?.url || ''));
const linkedIds = (doc) => [doc._dayId, ...(doc._dayIds || [])].filter(Boolean);

/**
 * @param {object} celebration   { id, title, rankKind, dayIds: string[] }
 * @param {object[]} documents   readings documents the runtime lookup returns
 * @param {string[]} expected    proper reading lines from the calendars
 */
export function auditCelebrationReadings(celebration, documents, expected) {
  const reference = expected.join(' ');
  const expectedGospels = gospelKeysOf(reference);
  const memorial = ['memorial', 'optional-memorial'].includes(celebration.rankKind);
  const base = { ...(reference ? { reference } : {}), documents: documents.map((doc) => doc.id) };

  documents = collapseCoveredDocuments(documents);
  if (!documents.length) {
    if (reference) return { status: 'REFERENCE_ONLY', ...base };
    return { status: memorial ? 'WEEKDAY_DEFAULT' : 'MISSING_CONTENT', ...base };
  }
  const withContent = documents.filter(hasContent);
  const references = documents.filter((doc) => referenceSets(doc).length);
  if (!withContent.length && references.length) {
    const citation = referenceSets(references[0])[0].sections.map((section) => [section.bible, ...(section.alternatives || []).map((item) => `або ${item.bible}`)].join(' ')).join('; ');
    return { status: 'REFERENCE_ONLY', ...base, reference: citation, detail: 'reference-only Mass reading set' };
  }
  if (!withContent.length) {
    return { status: reference ? 'REFERENCE_ONLY' : (memorial ? 'WEEKDAY_DEFAULT' : 'MISSING_CONTENT'), ...base, detail: 'document without texts' };
  }
  const foreign = withContent.filter((doc) => linkedIds(doc).length && !linkedIds(doc).some((id) => celebration.dayIds.includes(id)));
  if (foreign.length === withContent.length) {
    return { status: 'WRONG_LINK', ...base, detail: `linked to ${foreign.flatMap(linkedIds).join(', ')}` };
  }
  // Lectionary years (A/B/C) of one celebration are not an ambiguity.
  // Documents with structured sets gather the cycles/sets of one celebration.
  const unrelated = new Set(withContent.map((doc) => (doc.year || doc._massReadingsRef ? 'cycle' : doc.id)));
  if (unrelated.size > 1) return { status: 'AMBIGUOUS', ...base, detail: `${withContent.length} documents` };
  const found = [...new Set(withContent.flatMap((doc) => gospelCitations(doc).flatMap(gospelKeysOf)))];
  if (expectedGospels.length && found.length && !found.some((key) => expectedGospels.includes(key))) {
    if (withContent.some(fromLectionary)) {
      return { status: 'MATCH', ...base, verified: 'catholic.by', detail: `Catholic.by Lectionary ${found.join(' / ')}; calendars print ${expectedGospels.join(' / ')}` };
    }
    return { status: 'WRONG_CITATION', ...base, detail: `document ${found.join(' / ')}, calendars ${expectedGospels.join(' / ')}` };
  }
  return { status: 'MATCH', ...base, verified: Boolean(expectedGospels.length && found.length) };
}
