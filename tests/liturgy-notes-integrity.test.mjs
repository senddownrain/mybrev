/**
 * Ordo notes: what a note says must agree with where it is shown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOrdoDay } from '../src/utils/ordoScreen.js';
import {
  bareFirstWeekdayMark, explicitDates, guardNote, isHeadingOrFragment, monthOfText,
} from '../scripts/ordo/lib/note-guards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', 'notes.json'), 'utf8')).notes;
const shown = (date, diocese) => resolveOrdoDay(date, { diocese, notes: NOTES }).ordoNotes.map((note) => note.text);
const JUNE = /Чэрвеньскае набажэнства/;

test('the June devotion never appears in September or October', () => {
  ['2026-09-27', '2026-09-28', '2026-09-30', '2026-10-04', '2026-10-05', '2026-10-11', '2027-10-03'].forEach((date) => {
    ['pinsk', 'minsk-mohilev', 'vitebsk', 'grodno'].forEach((diocese) => {
      assert.ok(!shown(date, diocese).some((text) => JUNE.test(text)), `${date} ${diocese}`);
    });
  });
});

test('the June devotion appears in June (where the calendar printed it)', () => {
  assert.ok(shown('2026-06-07', 'pinsk').some((text) => JUNE.test(text)));
  assert.ok(shown('2027-06-06', 'pinsk').some((text) => JUNE.test(text)), 'June of another year');
});

test('first Thursday / Friday / Saturday of the month in every diocese', () => {
  const cases = [['2026-10-01', 'Першы чацвер месяца.'], ['2026-10-02', 'Першая пятніца месяца.'], ['2026-10-03', 'Першая субота месяца.'],
    ['2027-03-04', 'Першы чацвер месяца.'], ['2027-03-05', 'Першая пятніца месяца.'], ['2027-03-06', 'Першая субота месяца.']];
  cases.forEach(([date, text]) => {
    ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'].forEach((diocese) => assert.ok(shown(date, diocese).includes(text), `${date} ${diocese}`));
  });
  assert.ok(!shown('2026-10-08', 'pinsk').includes('Першы чацвер месяца.'), 'second Thursday');
  const canonical = NOTES.filter((note) => note.provenance?.kind === 'app-normalization');
  assert.equal(canonical.length, 3);
  canonical.forEach((note) => assert.equal(note.scope.level, 'belarus'));
});

test('an Ordinary Time day unrelated to a month devotion does not inherit it', () => {
  assert.ok(!shown('2026-07-12', 'pinsk').some((text) => JUNE.test(text)), 'a July Sunday in Ordinary Time');
  assert.ok(!shown('2026-08-30', 'pinsk').some((text) => /майск|маёв/i.test(text)));
});

test('a year-instance note stays in its year and on its day', () => {
  const text = (list) => list.find((item) => /у чацвер, 1 кастрычніка/.test(item));
  assert.ok(text(shown('2026-10-01', 'pinsk')), 'printed day');
  assert.ok(!text(shown('2027-10-01', 'pinsk')), 'not the next year');
  assert.ok(!shown('2026-10-02', 'pinsk').some((item) => /4 верасня/.test(item)), 'merged dated notes keep their own day');
});

test('guards: explicit dates, month words, headings, bare marks', () => {
  assert.deepEqual(explicitDates('– у чацвер, 1 кастрычніка, — успамін').dates, [{ day: 1, month: 10, year: null }]);
  assert.equal(explicitDates('01.I.2028 -Сб- Урачыстасць').dates[0].year, 2028);
  assert.equal(monthOfText('Чэрвеньскае набажэнства (Аг 758–773).'), 6);
  assert.equal(monthOfText('Ружанцовыя набажэнствы'), null);
  assert.ok(isHeadingOrFragment('VIII ЗВЫЧАЙНЫ ТЫДЗЕНЬ'));
  assert.ok(isHeadingOrFragment('(пасля Велікоднага перыяду)'));
  assert.ok(!isHeadingOrFragment('Першая субота месяца.'));
  assert.equal(bareFirstWeekdayMark('І чацвер месяца.').isoWeekday, 4);
  assert.equal(bareFirstWeekdayMark('І чацвер месяца. Адарацыя Найсв. Сакрамэнту.'), null);
});

test('a month word that names the subject does not restrict the note', () => {
  const coverage = new Map([['minsk-mohilev', { from: '2025-11-30', to: '2026-11-28' }]]);
  const occurrence = { date: '2026-04-25', diocese: 'minsk-mohilev', origin: 'day', itemId: 'x', text: 'Аб’явіць расклад майскіх набажэнстваў.' };
  const { entry } = guardNote({ text: occurrence.text, selector: { type: 'celebration', celebrationId: 'sv-mark-evangelist' }, scope: {}, basis: 'fixed-celebration' }, [occurrence], coverage);
  assert.deepEqual(entry.selector, { type: 'celebration', celebrationId: 'sv-mark-evangelist' });
});

test('sparse occurrences are not generalized to the whole period', () => {
  const coverage = new Map([['pinsk', { from: '2025-12-28', to: '2026-12-31' }]]);
  const sundays = ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28'];
  const occurrences = sundays.map((date) => ({ date, diocese: 'pinsk', origin: 'day', itemId: date, text: 'Набажэнства.' }));
  const { entry } = guardNote({ text: 'Набажэнства.', selector: { type: 'period', period: 'ordinary', dayOfWeek: 1 }, scope: {}, basis: 'period-weekday' }, occurrences, coverage);
  assert.deepEqual(entry.selector, { type: 'all', selectors: [{ type: 'period', period: 'ordinary', dayOfWeek: 1 }, { type: 'months', months: [6] }] });
});
