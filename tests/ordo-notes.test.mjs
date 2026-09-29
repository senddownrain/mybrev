import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { matchesSelector, selectOrdoNotes } from '../src/utils/ordo/notes.js';

const { notes } = JSON.parse(readFileSync(new URL('./fixtures/ordo-notes.fixture.json', import.meta.url), 'utf8'));
const noteIds = (date, context = {}) => resolveLiturgicalDate(date, { country: 'BY', notes, ...context })
  .ordoNotes.map((note) => note.id).sort();

test('celebration and fixed-date selectors', () => {
  assert.deepEqual(noteIds('2026-02-02'), ['candles-fixed-date', 'candles-presentation']);
  assert.deepEqual(noteIds('2026-02-02', { diocese: 'grodno' }), ['candles-fixed-date', 'candles-presentation', 'grodno-only']);
});

test('celebration selector follows a transfer; fixed-date does not', () => {
  const moved = [{
    id: 'annunciation-note', scope: { level: 'universal' }, category: 'mass',
    selector: { type: 'celebration', celebrationId: 'annunciation-lord' },
  }, {
    id: 'march-25', scope: { level: 'universal' }, category: 'other',
    selector: { type: 'fixed-date', month: 3, day: 25 },
  }];
  const onTransfer = resolveLiturgicalDate('2027-04-05', { notes: moved }).ordoNotes.map((note) => note.id);
  const onDate = resolveLiturgicalDate('2027-03-25', { notes: moved }).ordoNotes.map((note) => note.id);
  assert.deepEqual(onTransfer, ['annunciation-note']);
  assert.deepEqual(onDate, ['march-25']);
});

test('nth weekday with an exclusion, period and period-phase selectors', () => {
  assert.ok(noteIds('2026-05-01').includes('first-friday'));
  assert.ok(!noteIds('2026-05-08').includes('first-friday'));
  assert.ok(!noteIds('2026-04-03').includes('first-friday')); // Good Friday
  assert.ok(noteIds('2026-03-10').includes('lent-fasting'));
  assert.ok(noteIds('2026-12-18').includes('o-antiphons'));
  assert.ok(!noteIds('2026-12-16').includes('o-antiphons'));
});

test('period-day, relative, exact-date selectors and diocesan scope', () => {
  assert.ok(noteIds('2026-04-26').includes('vocations-sunday'));
  assert.ok(noteIds('2026-05-15').includes('ascension-novena'));
  assert.ok(noteIds('2028-04-08').includes('one-off-2028'));
  assert.ok(!noteIds('2027-04-08').includes('one-off-2028'));
  assert.ok(noteIds('2026-11-29', { diocese: 'vitebsk' }).includes('immaculate-novena-day-1'));
  assert.ok(!noteIds('2026-11-29', { diocese: 'minsk' }).includes('immaculate-novena-day-1'));
});

test('nth-weekday supports "last" and month restriction', () => {
  const day = { date: '2026-05-29', primary: { id: 'x' }, alternatives: [], commemorations: [], suppressed: [] };
  assert.equal(matchesSelector({ type: 'nth-weekday-of-month', weekday: 5, nth: -1 }, day), true);
  assert.equal(matchesSelector({ type: 'nth-weekday-of-month', weekday: 5, nth: -1, month: 6 }, day), false);
});

test('notes without a structured effect are display-only', () => {
  const day = resolveLiturgicalDate('2026-02-02', { notes });
  assert.ok(day.ordoNotes.every((note) => note.displayOnly === true));
  const [withEffect] = selectOrdoNotes([{
    id: 'e', scope: { level: 'universal' }, selector: { type: 'exact-date', date: '2026-02-02' }, effect: { type: 'x' },
  }], day);
  assert.equal(withEffect.displayOnly, false);
});
