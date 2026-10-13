/**
 * Lectionary / Liturgy of the Hours volume markers (final phase §13.1).
 *
 * The calendars print «Лекцыянарый т. III», «ЛГ - т. III», «ЛІТУРГІЯ
 * ГАДЗІНАЎ – т. І» next to the day or at the start of a period. These are
 * not «Асаблівыя заўвагі»: they become structured `books` metadata
 * (`{ lectionaryVolume, hoursVolume }`) shown above the notes in the Ordo
 * detail. Page numbers («(с. 321)») and the Sunday/weekday cycle (computed by
 * the engine) are dropped; any other text stays a normal note.
 */
import { clean } from './text.mjs';

const ROMAN = '[IVXІХ]+';
const LECTIONARY = new RegExp(`лекцыянар(?:ый|ыі)\\s*[-–—:]?\\s*т\\.\\s*(${ROMAN})\\.?(?:\\s*\\((?:с\\.|з)\\s*[^)]*\\))?`, 'iu');
const HOURS = new RegExp(`(?:ЛГ|літургія\\s+гадзін(?:аў)?)\\s*[-–—:]?\\s*т\\.\\s*(${ROMAN})\\.?(?:\\s*\\(с\\.\\s*[^)]*\\))?`, 'iu');
const CYCLE = /чытанні\s+ў\s+нядзелю\s*[-–—]\s*год\s+\S+,?\s*у\s+будні\s*[-–—]\s*год\s+[IVXІ]+\.?/iu;
const PERIOD_ONLY = /^(?:перыяд\s+[^.;]{1,24}\.?\s*)?$/iu;

/** Latin capitals for the volume number («ІІІ» with Cyrillic І → «III»). */
export function normalizeVolume(value) {
  return String(value || '').toUpperCase().replace(/І/g, 'I').replace(/Х/g, 'X');
}

export function booksText(books) {
  return [
    books.lectionaryVolume ? `Лекцыянарый т. ${books.lectionaryVolume}` : '',
    books.hoursVolume ? `Літургія гадзінаў т. ${books.hoursVolume}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * @returns {{ books: { lectionaryVolume?, hoursVolume? } | null, remainder: string }}
 *   `remainder`: the note text without the volume markers ('' when nothing else).
 */
export function extractBooks(text) {
  let rest = clean(text);
  const books = {};
  const lectionary = rest.match(LECTIONARY);
  if (lectionary) {
    books.lectionaryVolume = normalizeVolume(lectionary[1]);
    rest = rest.replace(lectionary[0], ' ');
  }
  const hours = rest.match(HOURS);
  if (hours) {
    books.hoursVolume = normalizeVolume(hours[1]);
    rest = rest.replace(hours[0], ' ');
  }
  if (!Object.keys(books).length) return { books: null, remainder: clean(text) };
  rest = clean(rest.replace(CYCLE, ' ').replace(/\s*[;,]\s*(?=[;,.]|$)/g, '').replace(/^[\s;,.:–—-]+|[\s;,:–—-]+$/g, ''));
  if (PERIOD_ONLY.test(rest) || /^[\s.;,]*$/.test(rest)) rest = '';
  return { books, remainder: rest };
}

// ---------------------------------------------------------------------------
// Period volumes (final phase recheck §13.1)
// ---------------------------------------------------------------------------

const MINSK = 'Liturg_kal-r_2026 Мінск.docx';
const GRODNO = 'каляндар 2027 Гродна.pdf';
const ALL_DIOCESES = Object.freeze(['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']);
const orderedWeeks = (from, to) => ({
  type: 'any',
  selectors: Array.from({ length: to - from + 1 }, (_, index) => ({ type: 'period-day', period: 'ordinary', week: from + index })),
});

/**
 * Volumes by period. The printed calendars give them where the book changes
 * and say nothing in between, so each row is valid until the next printed
 * heading (`inherited: true` marks the rows without a heading of their own).
 * Two independent calendars agree wherever they overlap (Minsk docx paragraphs,
 * Grodno pdf pages); the Lectionary and the Hours are the same books in every
 * diocese, so ONE Belarus-wide value is kept instead of four copies (§13.1).
 * Only the headings of the Minsk calendar were read by the extractor before:
 * three of its six (OT week 1, week 18, week 22) were lost in the paragraphs
 * of a day. Weeks 18–21: the Lectionary stays III (no heading between week 8
 * and week 22).
 */
export const PERIOD_VOLUMES = Object.freeze([
  {
    id: 'advent', selector: { type: 'period', period: 'advent' }, books: { lectionaryVolume: 'I', hoursVolume: 'I' },
    evidence: [{ file: MINSK, paragraphs: [8, 9] }, { file: GRODNO, page: 134 }],
  },
  {
    id: 'christmas', selector: { type: 'period', period: 'christmas' }, books: { lectionaryVolume: 'I', hoursVolume: 'I' }, inherited: true,
    evidence: [{ file: MINSK, paragraphs: [8, 9], note: 'no heading until Ordinary Time week 1' }],
  },
  {
    id: 'ordinary-before-lent', selector: { type: 'period-phase', period: 'ordinary', phase: 'before-lent' }, books: { lectionaryVolume: 'III', hoursVolume: 'III' },
    evidence: [{ file: MINSK, paragraphs: [463, 464] }, { file: GRODNO, page: 42 }],
  },
  {
    id: 'lent', selector: { type: 'period', period: 'lent' }, books: { lectionaryVolume: 'II', hoursVolume: 'II' },
    evidence: [{ file: MINSK, paragraphs: [817, 818] }, { file: GRODNO, page: 50 }],
  },
  {
    id: 'holyweek', selector: { type: 'period', period: 'holyweek' }, books: { lectionaryVolume: 'II', hoursVolume: 'II' }, inherited: true,
    evidence: [{ file: MINSK, paragraphs: [817, 818], note: 'no heading until Ordinary Time week 8' }],
  },
  {
    id: 'easter', selector: { type: 'period', period: 'easter' }, books: { lectionaryVolume: 'II', hoursVolume: 'II' }, inherited: true,
    evidence: [{ file: MINSK, paragraphs: [817, 818], note: 'no heading until Ordinary Time week 8' }],
  },
  {
    id: 'ordinary-weeks-8-17', selector: orderedWeeks(8, 17), books: { lectionaryVolume: 'III', hoursVolume: 'III' },
    evidence: [{ file: MINSK, paragraphs: [1728, 1729] }],
  },
  {
    id: 'ordinary-weeks-18-21', selector: orderedWeeks(18, 21), books: { lectionaryVolume: 'III', hoursVolume: 'IV' },
    evidence: [{ file: MINSK, paragraphs: [2419], note: 'Літургія гадзінаў т. IV from the XVIII Sunday; the Lectionary heading follows only at week 22' }],
  },
  {
    id: 'ordinary-weeks-22-34', selector: orderedWeeks(22, 34), books: { lectionaryVolume: 'V', hoursVolume: 'IV' },
    evidence: [{ file: MINSK, paragraphs: [2689] }, { file: GRODNO, page: 108 }],
  },
]);

/** Belarus-wide `books` notes of the period volumes (appended after every other note: no id moves). */
export function periodVolumeNotes() {
  return PERIOD_VOLUMES.map((row) => ({
    id: '',
    scope: { level: 'belarus', dioceseIds: [...ALL_DIOCESES] },
    selector: row.selector,
    category: 'books',
    tags: [],
    text: booksText(row.books),
    books: row.books,
    basis: 'period-volumes',
    occurrences: 0,
    displayOnly: false,
    classification: 'LIKELY_PERMANENT_RULE',
    confidence: row.inherited ? 'inherited-until-next-heading' : 'two-calendars',
    provenance: { kind: 'period-volumes', rule: row.id, evidence: row.evidence, ...(row.inherited ? { inherited: true } : {}) },
  }));
}
