import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBundledCalendarDefinitions, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import definitions from '../src/data/ordo/calendar-definitions.json' with { type: 'json' };
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import { calendarAdditions, calendarAdditionFor } from '../src/data/documents/proper-calendar-additions.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';

const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];

test('9 December is an explicitly optional memorial in the liturgical data and published web addendum', () => {
  const addition = calendarAdditions.find(item => item.id === 'sv-juan-diego');
  assert.ok(addition);
  assert.equal(addition.title, 'Св. Хуана Дыега Куаўтлатаацына');
  assert.equal(addition.rank, '', 'optional memorials have an empty rank column in the published calendar');
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
  assert.equal(celebration.title, addition.title);

  for (const diocese of dioceses) {
    for (const year of [2026, 2027]) {
      const date = `${year}-12-09`;
      const day = resolveRuntimeDay(date, { diocese });
      const choices = [day.primary, ...day.alternatives, ...day.commemorations];
      const juanDiego = choices.find(item => item.id === addition.id);
      assert.ok(juanDiego, `${date}/${diocese}: optional memorial must be available`);
      assert.equal(juanDiego.rank, addition.ordoRank, `${date}/${diocese}`);
      assert.equal(juanDiego.title, addition.title, `${date}/${diocese}`);
    }
  }
});

test('published calendar presents 9 December in italic with no optional-memorial rank caption', () => {
  const component = fs.readFileSync(new URL('../src/views/ProperCalendar.vue', import.meta.url), 'utf8');
  assert.match(component, /calendar-addition-title[^]*font-style: italic/);
  assert.match(component, /v-if="row\.rank\.length"/);
  assert.doesNotMatch(component, /Неабавязковы ўспамін|calendar-addition-rank/);
});

test('older Firestore titles are corrected by stable celebration ID at runtime', () => {
  const bundled = getBundledCalendarDefinitions();
  try {
    setCalendarDefinitions({
      ...bundled,
      revision: bundled.revision + 1,
      celebrations: bundled.celebrations.map(doc => doc.id === 'sv-juan-diego'
        ? { ...doc, title: 'Св. Яна Дыега Куаўхтлатаацына' } : doc),
    });
    for (const diocese of dioceses) {
      const day = resolveRuntimeDay('2027-12-09', { diocese });
      const item = [day.primary, ...day.alternatives, ...day.commemorations].find(option => option.id === 'sv-juan-diego');
      assert.equal(item?.title, 'Св. Хуана Дыега Куаўтлатаацына', diocese);
    }
  } finally {
    setCalendarDefinitions(null);
  }
});
