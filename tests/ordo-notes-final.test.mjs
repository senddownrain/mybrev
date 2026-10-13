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
  // (the Hours volume of the period table completes the printed Lectionary volume of the day).
  assert.deepEqual(resolve('2027-06-06', 'grodno').books, { lectionaryVolume: 'IV', hoursVolume: 'III', noteIds: resolve('2027-06-06', 'grodno').books.noteIds });
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

test('recheck §13: every extracted Grodno / Pinsk general note is published (none is lost in a cross-diocese cluster)', () => {
  const published = new Set(NOTES.flatMap((note) => [note.text, ...(note.variants || []).map((variant) => variant.text)]));
  ['grodno', 'pinsk'].forEach((diocese) => {
    const evidence = read(`evidence/${diocese}.json`);
    const { notes } = extractGeneralNotes({ diocese, rules: evidence.rules });
    assert.ok(notes.length > 10, diocese);
    const lost = notes.filter((note) => !published.has(note.text)).map((note) => note.text.slice(0, 80));
    assert.deepEqual(lost, [], `${diocese}: general notes not published`);
  });
  // The Grodno Advent rule about the Rorate Mass (it was hidden with a Vitebsk cluster lead).
  const rorate = NOTES.find((note) => /Традыцыйна ва ўсе дні Адвэнту/u.test(note.text));
  assert.ok(rorate, 'the Rorate rule is published');
  assert.deepEqual(rorate.scope, { level: 'diocese', dioceseId: 'grodno' });
  assert.deepEqual(rorate.selector, { type: 'period', period: 'advent' });
  assert.ok(texts(resolve('2026-12-02', 'grodno')).some((text) => /Раратнюю/u.test(text)));
  assert.ok(!texts(resolve('2026-12-02', 'vitebsk')).some((text) => /Раратнюю/u.test(text)));
});

test('recheck §13.1: period volumes are Belarus-wide structured metadata for every diocese (Minsk + Grodno calendars)', () => {
  const volumes = (date, diocese) => {
    const { books } = resolve(date, diocese);
    return books ? `${books.lectionaryVolume || '-'}/${books.hoursVolume || '-'}` : null;
  };
  const expected = {
    '2025-11-30': 'I/I', // Advent (Minsk ¶8–9, Grodno 28.11.2027 p. 134)
    '2025-12-25': 'I/I', // Christmas: no new heading
    '2026-01-12': 'III/III', // Ordinary Time week 1 (Minsk ¶463–464, Grodno 11.01.2027 p. 42)
    '2026-02-18': 'II/II', // Lent (Minsk ¶817–818, Grodno 10.02.2027 p. 50)
    '2026-04-01': 'II/II', // Holy Week
    '2026-04-15': 'II/II', // Easter: no new heading
    '2026-05-25': 'III/III', // week 8 (Minsk ¶1728–1729)
    '2026-08-01': 'III/III', // week 17
    '2026-08-02': 'III/IV', // XVIII Sunday: Hours vol. IV (Minsk ¶2419)
    '2026-08-30': 'V/IV', // XXII Sunday: Lectionary vol. V (Minsk ¶2689, Grodno 29.08.2027 p. 108)
    '2026-11-15': 'V/IV',
  };
  ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'].forEach((diocese) => {
    Object.entries(expected).forEach(([date, volume]) => assert.equal(volumes(date, diocese), volume, `${diocese} ${date}`));
  });
  // Volumes are never «Асаблівыя заўвагі»; a celebration-specific volume (Grodno: Lectionary vol. VI) still wins.
  assert.ok(!texts(resolve('2026-08-02', 'minsk-mohilev')).some((text) => /т\.\s*(?:III|IV)/u.test(text)));
  assert.equal(resolve('2027-11-01', 'grodno').books.lectionaryVolume, 'VI');
  assert.equal(resolve('2027-11-01', 'grodno').books.hoursVolume, 'IV');
  // Provenance: every period row cites the calendar paragraphs / pages.
  const rows = NOTES.filter((note) => note.provenance?.kind === 'period-volumes');
  assert.equal(rows.length, 9);
  rows.forEach((note) => {
    assert.deepEqual(note.scope, { level: 'belarus', dioceseIds: ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'] });
    assert.ok(note.provenance.evidence.length, note.id);
  });
  // The headings the extractor did read agree with the table (Advent I/I, Lent II/II, week 8 III/III).
  const minsk = read('evidence/minsk-mohilev.json').rules.map((rule) => rule.text);
  assert.ok(minsk.includes('ЛЕКЦЫЯНАРЫЙ – т. І') && minsk.includes('ЛЕКЦЫЯНАРЫЙ – т. ІІ') && minsk.includes('ЛЕКЦЫЯНАРЫЙ – т. ІІІ'));
});
