/**
 * Final phase §13: Grodno / Pinsk general notes recovered, exclusions kept,
 * Lectionary / Liturgy of the Hours volumes as structured `books` metadata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { booksFromNotes } from '../src/utils/ordo/notes.js';
import { booksLabel, groupOrdoNotes } from '../src/utils/ordoScreen.js';
import { findExcludedStrings } from '../scripts/ordo/lib/exclusions.mjs';
import { extractBooks } from '../scripts/ordo/lib/books.mjs';
import { extractGeneralNotes, paragraphsOf } from '../scripts/ordo/lib/general-notes.mjs';

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../src/data/ordo/${file}`, import.meta.url), 'utf8'));
const NOTES = read('notes.json').notes;
const resolve = (date, diocese) => resolveLiturgicalDate(date, { country: 'BY', diocese, notes: NOTES });
const dioceseOf = (note) => note.scope.dioceseIds || [note.scope.dioceseId];
const texts = (day) => day.ordoNotes.map((note) => note.text);

test('no clergy personal data and no collections in the published notes', () => {
  const published = NOTES.map(({ observed: _observed, ...note }) => note);
  assert.deepEqual(findExcludedStrings(published), []);
  NOTES.forEach((note) => {
    assert.doesNotMatch(note.text, /імянін|дзень нараджэння (?:кс\.|біскупа|святара)|рукапалажэнн|гадавін\S* святарск/iu, note.id);
    assert.doesNotMatch(note.text, /збор\S*\s+(?:ахвяраванн|сродкаў|на\s+патрэбы)|сённяшнія\s+зборы/iu, note.id);
  });
});

test('Grodno and Pinsk general notes are recovered from the front matter', () => {
  const general = NOTES.filter((note) => note.basis === 'general-notes');
  const of = (diocese) => general.filter((note) => dioceseOf(note).includes(diocese));
  assert.ok(of('grodno').length >= 100, `grodno ${of('grodno').length}`);
  assert.ok(of('pinsk').length >= 10, `pinsk ${of('pinsk').length}`);
  general.forEach((note) => assert.equal(note.provenance?.kind, 'general-notes', note.id));
  // Good Friday rubrics (Grodno 2027: 26 March), incl. the plenary indulgence.
  const goodFriday = texts(resolve('2027-03-26', 'grodno'));
  assert.ok(goodFriday.some((text) => /поўны адпуст за ўдзел у адарацыі Крыжа/u.test(text)));
  assert.ok(goodFriday.some((text) => /не цэлебруе Эўхарыстыі/u.test(text)));
  // Lent period introduction.
  const lent = groupOrdoNotes(resolve('2027-03-02', 'grodno').ordoNotes, { date: '2027-03-02', diocese: 'grodno' });
  assert.ok(lent.periodNotes.some((note) => /алтар не ўпрыгожваецца кветкамі/u.test(note.text)));
  // Pinsk quarterly prayer days: Rogation days before the Ascension (11–13 May 2026).
  ['2026-05-11', '2026-05-12', '2026-05-13'].forEach((date) => {
    assert.ok(texts(resolve(date, 'pinsk')).some((text) => /Крыжовыя дні/u.test(text)), date);
  });
  assert.ok(!texts(resolve('2026-05-14', 'pinsk')).some((text) => /Крыжовыя дні/u.test(text)));
  // First Friday of the month (Pinsk customs).
  assert.ok(texts(resolve('2026-11-06', 'pinsk')).some((text) => /першую пятніцу месяца/u.test(text)));
});

test('general-notes extraction skips tables, pro populo obligations and money', () => {
  const evidence = read('evidence/grodno.json');
  const { notes, skipped } = extractGeneralNotes({ diocese: 'grodno', rules: evidence.rules });
  const reasons = new Set(skipped.map((item) => item.reason));
  ['table', 'pastor-mass-pro-populo-obligation', 'excluded:money'].forEach((reason) => assert.ok(reasons.has(reason), reason));
  notes.forEach((note) => assert.doesNotMatch(note.text, /пробашч\S* .* за парафіян|стыпенд|\.{6,}/u));
  // Lines of the PDF are merged into paragraphs.
  const merged = paragraphsOf([
    { id: 'x:rule:1', section: 's', text: '1. Калі не прадпісана нейкая цэлебрацыя,' },
    { id: 'x:rule:2', section: 's', text: 'святар можа выбраць:' },
    { id: 'x:rule:3', section: 's', text: 'а) альбо адну з нядзельных Імшаў;' },
    { id: 'x:rule:4', section: 's', text: '2. Другі пункт.' },
  ]);
  assert.deepEqual(merged.map((item) => item.ids.length), [3, 1]);
  assert.equal(extractGeneralNotes({ diocese: 'vitebsk', rules: [] }).notes.length, 0);
});

test('Lectionary / Hours volumes are structured metadata, not «Асаблівыя заўвагі»', () => {
  NOTES.filter((note) => note.category !== 'books').forEach((note) => {
    assert.doesNotMatch(note.text, /^\s*(?:Лекцыянарый|ЛЕКЦЫЯНАРЫЙ)\s*[–-]?\s*т\.|ЛГ\s*-\s*т\.|ЛІТУРГІЯ ГАДЗІНАЎ\s*[–-]\s*т\./u, note.id);
  });
  const books = NOTES.filter((note) => note.category === 'books');
  assert.ok(books.length >= 40);
  books.forEach((note) => assert.ok(note.books.lectionaryVolume || note.books.hoursVolume, note.id));
  // Grodno: proper of saints (vol. VI) and Ordinary Time from week 10 (vol. IV).
  assert.deepEqual(resolve('2027-06-06', 'grodno').books, { lectionaryVolume: 'IV', noteIds: resolve('2027-06-06', 'grodno').books.noteIds });
  assert.equal(resolve('2027-08-15', 'grodno').books.lectionaryVolume, 'VI');
  // Minsk: period markers give both volumes for the whole of Advent.
  const advent = resolve('2026-12-01', 'minsk-mohilev');
  assert.equal(advent.books.lectionaryVolume, 'I');
  assert.equal(advent.books.hoursVolume, 'I');
  assert.equal(booksLabel(advent), 'Лекцыянарый т. I · Літургія гадзінаў т. I');
  assert.ok(!advent.ordoNotes.some((note) => note.category === 'books'));
  // The more specific selector wins; identical volumes are one value.
  const merged = booksFromNotes([
    { id: 'a', category: 'books', selector: { type: 'period', period: 'ordinary' }, books: { lectionaryVolume: 'III', hoursVolume: 'III' } },
    { id: 'b', category: 'books', selector: { type: 'celebration', celebrationId: 'x' }, books: { lectionaryVolume: 'VI' } },
  ]);
  assert.deepEqual(merged, { lectionaryVolume: 'VI', hoursVolume: 'III', noteIds: ['b', 'a'] });
  assert.equal(booksFromNotes([]), null);
  // Parser: page numbers and the engine-computed cycle are dropped, other text stays.
  assert.deepEqual(extractBooks('Лекцыянарый т. ІV (с. 321).'), { books: { lectionaryVolume: 'IV' }, remainder: '' });
  assert.deepEqual(extractBooks('Перыяд Звычайны. Лекцыянарый т. III; чытанні ў нядзелю – Год В, у будні – Год I; ЛГ - т. III.'),
    { books: { lectionaryVolume: 'III', hoursVolume: 'III' }, remainder: '' });
  assert.equal(extractBooks('У гэтым годзе няма ўспаміну св. Схаластыкі, Пн. Лекцыянарый т. II; ЛГ - т. II.').remainder,
    'У гэтым годзе няма ўспаміну св. Схаластыкі, Пн.');
});

test('the same volume value is stored once per selector (no duplicates across dioceses)', () => {
  const keys = NOTES.filter((note) => note.category === 'books')
    .map((note) => JSON.stringify([note.selector, note.books]));
  const counts = keys.reduce((acc, key) => acc.set(key, (acc.get(key) || 0) + 1), new Map());
  assert.ok([...counts.values()].every((count) => count === 1));
});
