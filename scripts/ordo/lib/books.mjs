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
    books.hoursVolume ? `Літургія гадзін т. ${books.hoursVolume}` : '',
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
