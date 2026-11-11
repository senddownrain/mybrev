import test from 'node:test';
import assert from 'node:assert/strict';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import definitions from '../src/data/ordo/calendar-definitions.json' with { type: 'json' };
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import { calendarAdditions, calendarAdditionFor } from '../src/data/documents/proper-calendar-additions.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';

const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];

test('9 December is an explicitly optional memorial in the liturgical data and published web addendum', () => {
  const addition = calendarAdditions.find(item => item.id === 'sv-juan-diego');
  assert.ok(addition);
  assert.equal(addition.rank, 'Неабавязковы ўспамін');
  assert.equal(addition.ordoRank, 'memoria-ad-libitum');
  const printed = calendar.pages.flatMap(page => page.rows).find(row => row.month === 12 && row.date === 9);
  assert.ok(printed, '9 December belongs to the original PDF');
  assert.equal(printed.runs.length, 0, 'original PDF remains unchanged and faithfully extracted');
  assert.equal(calendarAdditionFor(printed), addition, 'web display provides the explicit addendum');

  const fixed = fixedCalendar.find(item => item.date === '09.12' && item.title === addition.title);
  assert.ok(fixed, 'the Office liturgical source retains this memorial');
  assert.equal(fixed.rank, '', 'an empty fixed-calendar rank means optional memorial');
  const celebration = definitions.celebrations.find(item => item.id === addition.id);
  assert.ok(celebration?.enabled);
  assert.equal(celebration.rank, addition.ordoRank);
  assert.deepEqual(celebration.dateRule, { type: 'fixed', month: 12, day: 9 });
  assert.deepEqual(celebration.daysRef.dayIds, ['09-12-sv-juan-diego']);

  for (const diocese of dioceses) {
    for (const year of [2026, 2027]) {
      const date = `${year}-12-09`;
      const day = resolveRuntimeDay(date, { diocese });
      const choices = [day.primary, ...day.alternatives, ...day.commemorations];
      const juanDiego = choices.find(item => item.id === addition.id);
      assert.ok(juanDiego, `${date}/${diocese}: optional memorial must be available`);
      assert.equal(juanDiego.rank, addition.ordoRank, `${date}/${diocese}`);
    }
  }
});
