import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBundledCalendarDefinitions, setCalendarDefinitions, normalizeCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import definitions from '../src/data/ordo/calendar-definitions.json' with { type: 'json' };
import { fixedCalendar } from '../src/constants/fixedCalendar.js';
import { calendarAdditions, calendarAdditionFor } from '../src/data/documents/proper-calendar-additions.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';

const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];

test('CAL-01: 9 December keeps the Advent weekday and offers the optional memorial in all four dioceses', () => {
  const addition = calendarAdditions.find(item => item.id === 'sv-juan-diego');
  assert.ok(addition);
  assert.equal(addition.title, 'Св. Хуана Дыега Куаўтлатаацына');
  assert.equal(addition.ordoRank, 'memoria-ad-libitum');
  const printed = calendar.pages.flatMap(page => page.rows).find(row => row.month === 12 && row.date === 9);
  assert.ok(printed);
  assert.equal(printed.runs.length, 0, 'the original PDF extraction is unchanged');
  assert.equal(calendarAdditionFor(printed), addition, 'retain the existing editorial addendum');
  assert.equal(fixedCalendar.filter(item => item.date === '09.12' && item.title === addition.title).length, 1);
  assert.equal(definitions.celebrations.find(item => item.id === addition.id).rank, 'memoria-ad-libitum');
  for (const diocese of dioceses) for (const year of [2026, 2027]) {
    const day = resolveRuntimeDay(`${year}-12-09`, { diocese });
    assert.match(day.primary.id, /^temporal:advent-/, `${diocese} ${year}: the weekday stays primary`);
    const option = day.alternatives.find(item => item.id === addition.id);
    assert.equal(option?.rank, 'memoria-ad-libitum', `${diocese} ${year}`);
    assert.deepEqual(option.daysRef.dayIds, ['09-12-sv-juan-diego']);
  }
});

test('published calendar presents 9 December in italic with no optional-memorial rank caption', () => {
  const component = fs.readFileSync(new URL('../src/views/ProperCalendar.vue', import.meta.url), 'utf8');
  assert.match(component, /calendar-addition-title[^]*font-style: italic/);
  assert.match(component, /v-if="row\.rank\.length"/);
  assert.doesNotMatch(component, /Неабавязковы ўспамін|calendar-addition-rank/);
});

test('retained legacy source still has its canonical alias; a newer disabled server entry still wins', () => {
  const legacy = { id: 'sv-juan-diego', title: 'Св. Яна Дыега Куаўхтлатаацына', rank: 'memoria-ad-libitum', scope: 'universal', category: 'saint', dateRule: {type: 'fixed', month: 12, day: 9}, enabled: true };
  assert.equal(normalizeCalendarDefinitions({celebrations: [legacy]}).celebrations[0].title, 'Св. Хуана Дыега Куаўтлатаацына');
  const bundled = getBundledCalendarDefinitions();
  try {
    setCalendarDefinitions({...bundled, revision: bundled.revision + 1, celebrations: [...bundled.celebrations.filter(item => item.id !== legacy.id), {...legacy, enabled: false}]});
    for (const diocese of dioceses) {
      const day = resolveRuntimeDay('2027-12-09', {diocese});
      assert.equal([day.primary, ...day.alternatives, ...day.commemorations].some(item => item.id === legacy.id), false);
    }
  } finally { setCalendarDefinitions(null); }
});
