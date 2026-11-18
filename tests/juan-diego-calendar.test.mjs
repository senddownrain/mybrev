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

test('canonical source addendum is retained while the approved BY Ordo excludes the entry', () => {
  const addition = calendarAdditions.find(item => item.id === 'sv-juan-diego');
  assert.ok(addition);
  assert.equal(addition.title, 'Св. Хуана Дыега Куаўтлатаацына');
  assert.equal(addition.ordoRank, 'memoria-ad-libitum');
  const printed = calendar.pages.flatMap(page => page.rows).find(row => row.month === 12 && row.date === 9);
  assert.ok(printed);
  assert.equal(printed.runs.length, 0, 'the original PDF extraction is unchanged');
  assert.equal(calendarAdditionFor(printed), addition, 'retain the existing editorial addendum');
  assert.equal(fixedCalendar.some(item => item.date === '09.12' && item.title === addition.title), false);
  assert.equal(definitions.celebrations.some(item => item.id === addition.id), false);
  for (const diocese of dioceses) for (const year of [2026, 2027]) {
    const day = resolveRuntimeDay(`${year}-12-09`, { diocese });
    assert.equal([day.primary, ...day.alternatives, ...day.commemorations].some(item => item.id === addition.id), false);
  }
});

test('published calendar presents 9 December in italic with no optional-memorial rank caption', () => {
  const component = fs.readFileSync(new URL('../src/views/ProperCalendar.vue', import.meta.url), 'utf8');
  assert.match(component, /calendar-addition-title[^]*font-style: italic/);
  assert.match(component, /v-if="row\.rank\.length"/);
  assert.doesNotMatch(component, /Неабавязковы ўспамін|calendar-addition-rank/);
});

test('retained legacy source still has its canonical alias; disabled server entries cannot reappear', () => {
  const legacy = { id: 'sv-juan-diego', title: 'Св. Яна Дыега Куаўхтлатаацына', rank: 'memoria-ad-libitum', scope: 'universal', category: 'saint', dateRule: {type: 'fixed', month: 12, day: 9}, enabled: true };
  assert.equal(normalizeCalendarDefinitions({celebrations: [legacy]}).celebrations[0].title, 'Св. Хуана Дыега Куаўтлатаацына');
  const bundled = getBundledCalendarDefinitions();
  try {
    setCalendarDefinitions({...bundled, revision: bundled.revision + 1, celebrations: [...bundled.celebrations, {...legacy, enabled: false}]});
    for (const diocese of dioceses) {
      const day = resolveRuntimeDay('2027-12-09', {diocese});
      assert.equal([day.primary, ...day.alternatives, ...day.commemorations].some(item => item.id === legacy.id), false);
    }
  } finally { setCalendarDefinitions(null); }
});
