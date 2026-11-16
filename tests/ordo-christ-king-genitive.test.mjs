import test from 'node:test';
import assert from 'node:assert/strict';
import { getBundledCalendarDefinitions, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildDayTitle } from '../src/utils/ordoDayOptions.js';
import { readingGroupsOf } from '../src/utils/readingsScreen.js';

const TITLE = 'Пана нашага Езуса Хрыста, Валадара Сусвету';
const DIOCESES = ['minsk-mohilev', 'vitebsk', 'grodno', 'pinsk'];
const DATES = ['2026-11-22', '2027-11-21', '2028-11-26'];

test('Christ the King uses the official genitive title in all dioceses and years', () => {
  const bundled = getBundledCalendarDefinitions();
  assert.equal(bundled.celebrations.find(item => item.id === 'christ-king')?.title, TITLE);
  for (const date of DATES) {
    for (const diocese of DIOCESES) {
      const day = resolveRuntimeDay(date, { diocese });
      assert.equal(day.primary.id, 'christ-king', `${date}/${diocese}`);
      assert.equal(day.primary.title, TITLE, `${date}/${diocese}`);
    }
  }
});

test('an old Firestore calendar title cannot override the approved genitive', () => {
  const bundled = getBundledCalendarDefinitions();
  try {
    setCalendarDefinitions({
      ...bundled,
      revision: bundled.revision + 1,
      celebrations: bundled.celebrations.map(item =>
        item.id === 'christ-king'
          ? { ...item, title: 'Езус Хрыстус, Валадар Сусвету' }
          : item),
    });
    for (const diocese of DIOCESES) {
      const day = resolveRuntimeDay('2026-11-22', { diocese });
      assert.equal(day.primary.title, TITLE, diocese);
    }
  } finally {
    setCalendarDefinitions(null);
  }
});

test('legacy feast documents do not leak an obsolete title into Office selectors', () => {
  for (const identity of [
    { id: 'feast-christking', _feastName: 'Езус Хрыстус, Валадар Сусвету' },
    { id: 'legacy', _feast: 'feast-christking', _feastName: 'Езус Хрыстус, Валадар Сусвету' },
    { id: 'legacy', _celebrationId: 'christ-king', _title: 'Езус Хрыстус, Валадар Сусвету' },
  ]) {
    assert.equal(buildDayTitle(identity, {}, new Date(2026, 10, 22)), TITLE);
  }
});


test('old Christ the King lectionary labels render in genitive', () => {
  const readings = [
    { id: 'king-a', _feast: 'feast-christking', title: 'Езус Хрыстус, Валадар Сусвету', year: 'A' },
    { id: 'king-b', _feast: 'feast-christking', title: 'Езус Хрыстус, Валадар Сусвету', year: 'B' },
  ];
  const groups = readingGroupsOf(readings);
  assert.ok(groups.length >= 1);
  assert.ok(groups.every(group => group.label === TITLE));
  assert.equal(
    readingGroupsOf([{ id: 'ordinary', title: 'XXIII нядзеля звычайная', _feast: 'feast-other' }])[0].label,
    'XXIII нядзеля звычайная',
  );
});
