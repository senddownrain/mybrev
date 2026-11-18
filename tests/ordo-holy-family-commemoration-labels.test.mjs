import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBundledCalendarDefinitions, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';

const TITLE = 'Святой Сям’і: Езуса, Марыі і Юзафа';
const DIOCESES = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];

test('Holy Family uses the genitive title in the calendar for every diocese', () => {
  assert.equal(getBundledCalendarDefinitions().celebrations.find(c => c.id === 'holy-family')?.title, TITLE);
  for (const date of ['2026-12-27', '2027-12-26']) {
    for (const diocese of DIOCESES) {
      const day = resolveRuntimeDay(date, { diocese });
      assert.equal(day.primary.id, 'holy-family', `${date}/${diocese}`);
      assert.equal(day.primary.title, TITLE, `${date}/${diocese}`);
    }
  }
});

test('an older Firestore publication cannot restore the nominative Holy Family title', () => {
  const bundled = getBundledCalendarDefinitions();
  try {
    setCalendarDefinitions({
      ...bundled,
      revision: bundled.revision + 1,
      celebrations: bundled.celebrations.map(c => c.id === 'holy-family'
        ? { ...c, title: 'Святая Сям’я: Езус, Марыя і Юзаф' }
        : c),
    });
    assert.equal(resolveRuntimeDay('2026-12-27', { diocese: 'vitebsk' }).primary.title, TITLE);
  } finally {
    setCalendarDefinitions(null);
  }
});

test('Advent 17–24 December and Lent keep commemoration role, but the calendar shows a single optional memorial label', () => {
  for (const date of ['2026-12-21', '2027-03-17']) {
    const day = resolveRuntimeDay(date, { diocese: 'minsk-mohilev' });
    assert.ok(day.commemorations.length > 0, `expected an optional memorial on ${date}`);
    assert.ok(day.commemorations.every(c => c.role === 'commemoration'), date);
  }
  const month = readFileSync(new URL('../src/components/ordo/OrdoMonth.vue', import.meta.url), 'utf8');
  const day = readFileSync(new URL('../src/components/ordo/OrdoDay.vue', import.meta.url), 'utf8');
  assert.match(month, /commemoration: 'Неабавязковы ўспамін'/);
  assert.match(day, /commemoration: 'Неабавязковы ўспамін'/);
  assert.doesNotMatch(month + day, /успамін \(commemoratio\)/);
  assert.match(month, /row\.role === 'commemoration' \? ''/);
  assert.match(day, /row\.role === 'commemoration' \? ''/);
});
