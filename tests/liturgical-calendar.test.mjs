import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import {
  calculateBaptismOfLordDate,
  calculateDateForContext,
  calculateHolyFamilyDate,
  computeLiturgicalContext,
  getDynamicFeastCodesForDate,
} from '../src/utils/liturgicalCalendar.js';
import { FEAST_NAME_MAP } from '../src/constants/liturgicalFeastsMap.js';

const optionsFor = (year, ordinaryStart1) => ({
  year,
  firstAdventSunday: `${year}-11-29`,
  easterSunday: `${year}-04-05`,
  ashWednesday: `${year}-02-18`,
  pentecost: `${year}-05-24`,
  ordintaryStart1: ordinaryStart1,
  ordintaryWeeks1: 6,
  ordintaryWeeks2: 8,
});

test('places Holy Family on December 30 only when Christmas is Sunday', () => {
  assert.equal(calculateHolyFamilyDate(2022).format('YYYY-MM-DD'), '2022-12-30');
  assert.equal(calculateHolyFamilyDate(2026).format('YYYY-MM-DD'), '2026-12-27');
});

test('places Baptism of the Lord on the first Sunday after January 6', () => {
  const baptism2027 = calculateBaptismOfLordDate(2027);
  assert.equal(baptism2027.format('YYYY-MM-DD'), '2027-01-10');
  assert.equal(calculateBaptismOfLordDate(2025).format('YYYY-MM-DD'), '2025-01-12');
  assert.deepEqual(
    getDynamicFeastCodesForDate(baptism2027, { baptismOfLord: baptism2027 }),
    ['feast-buptismofthelord'],
  );
});

test('uses Firestore document IDs as canonical dynamic feast codes', () => {
  assert.ok(Object.values(FEAST_NAME_MAP).every((code) => code.startsWith('feast-')));
  assert.equal(FEAST_NAME_MAP.maryMotherChurch, 'feast-marymotherchurch');

  const date = moment('2026-05-14');
  const dynamicDates = { ascension: date.clone() };
  const context = computeLiturgicalContext(date, null, null, dynamicDates);

  assert.equal(context._feast, 'feast-ascension');
  assert.deepEqual(getDynamicFeastCodesForDate(date, dynamicDates), ['feast-ascension']);
});

test('resolves Mary, Mother of the Church through the dynamic feast map', () => {
  const date = moment('2026-05-25', 'YYYY-MM-DD');
  assert.deepEqual(
    getDynamicFeastCodesForDate(date, { maryMotherChurch: date }),
    ['feast-marymotherchurch'],
  );
});

test('uses actual weekdays, the December octave, and Christmas week 2 in January', () => {
  const opts = optionsFor(2026, '2026-01-11');
  const nextOpts = optionsFor(2027, '2027-01-11');

  const christmas = computeLiturgicalContext(moment('2026-12-25'), opts, nextOpts, {});
  assert.equal(christmas.periodType, 'christmas');
  assert.equal(christmas.periodWeek, 1);
  assert.equal(christmas.dayOfWeek, 6); // Friday

  const firstSunday = computeLiturgicalContext(moment('2026-12-27'), opts, nextOpts, {});
  assert.equal(firstSunday.periodWeek, 1);
  assert.equal(firstSunday.dayOfWeek, 1);

  const octaveTuesday = computeLiturgicalContext(moment('2026-12-29'), opts, nextOpts, {});
  assert.equal(octaveTuesday.periodWeek, 1);
  assert.equal(octaveTuesday.dayOfWeek, 3);

  const secondWeek = computeLiturgicalContext(
    moment('2027-01-02'),
    optionsFor(2027, '2027-01-11'),
    optionsFor(2028, '2028-01-10'),
    {},
  );
  assert.equal(secondWeek.periodWeek, 2);
  assert.equal(secondWeek.dayOfWeek, 7);
});

test('when Christmas is Sunday, December remains week 1 and January becomes week 2', () => {
  const opts = optionsFor(2022, '2022-01-10');
  const nextOpts = optionsFor(2023, '2023-01-09');

  const december30 = computeLiturgicalContext(moment('2022-12-30'), opts, nextOpts, {});
  assert.equal(december30.periodWeek, 1);
  assert.equal(december30.dayOfWeek, 6);

  const january2 = computeLiturgicalContext(
    moment('2023-01-02'),
    optionsFor(2023, '2023-01-09'),
    optionsFor(2024, '2024-01-08'),
    {},
  );
  assert.equal(january2.periodWeek, 2);
});

test('keeps early January in the Christmas season of the previous year', () => {
  const opts = optionsFor(2027, '2027-01-11');
  const nextOpts = optionsFor(2028, '2028-01-10');

  const january = computeLiturgicalContext(moment('2027-01-09'), opts, nextOpts, {});
  assert.equal(january.periodType, 'christmas');
  assert.equal(january.periodWeek, 2);
  assert.equal(january.dayOfWeek, 7);

  const ordinary = computeLiturgicalContext(moment('2027-01-11'), opts, nextOpts, {});
  assert.notEqual(ordinary.periodType, 'christmas');
});

test('ends Christmas with Baptism even when stored ordinary start is later', () => {
  const opts = optionsFor(2027, '2027-01-13');
  const nextOpts = optionsFor(2028, '2028-01-10');
  const baptism = calculateBaptismOfLordDate(2027);
  const dynamicDates = { baptismOfLord: baptism };

  const baptismContext = computeLiturgicalContext(baptism, opts, nextOpts, dynamicDates);
  assert.equal(baptismContext.periodType, 'christmas');
  assert.equal(baptismContext._feast, 'feast-buptismofthelord');

  const monday = computeLiturgicalContext(moment('2027-01-11'), opts, nextOpts, dynamicDates);
  assert.equal(monday.periodType, 'ordinary');
});

test('counts the final Ordinary Time weeks backward from Advent', () => {
  const options = {
    ...optionsFor(2023, '2023-01-09'),
    firstAdventSunday: '2023-12-03',
    easterSunday: '2023-04-09',
    ashWednesday: '2023-02-22',
    pentecost: '2023-05-28',
    ordintaryWeeks2: 9,
  };
  const week33 = computeLiturgicalContext(moment('2023-11-19'), options, null, {});
  const week34 = computeLiturgicalContext(moment('2023-11-27'), options, null, {});
  assert.deepEqual(
    { period: week33.periodType, week: week33.periodWeek, day: week33.dayOfWeek },
    { period: 'ordinary', week: 33, day: 1 },
  );
  assert.deepEqual(
    { period: week34.periodType, week: week34.periodWeek, day: week34.dayOfWeek },
    { period: 'ordinary', week: 34, day: 2 },
  );
  assert.equal(calculateDateForContext(2023, 'ordinary', 34, 2, options, null), '2023-11-27');
});

test('calculates Christmas week 2 inside January and rejects dates after Baptism', () => {
  const options = optionsFor(2026, '2026-01-11');

  assert.equal(calculateDateForContext(2026, 'christmas', 2, 2, options, null), '2027-01-04');
  assert.equal(calculateDateForContext(2026, 'christmas', 2, 7, options, null), '2027-01-02');
  assert.equal(calculateDateForContext(2026, 'christmas', 3, 1, options, null), null);
});

test('does not invent Ordinary Time weeks skipped by Lent and Easter', () => {
  const options = {
    ...optionsFor(2023, '2023-01-09'),
    firstAdventSunday: '2023-12-03',
    ordintaryWeeks1: 6,
    ordintaryWeeks2: 9,
  };

  assert.equal(calculateDateForContext(2023, 'ordinary', 6, 1, options, null), '2023-02-12');
  assert.equal(calculateDateForContext(2023, 'ordinary', 7, 1, options, null), null);
  assert.equal(calculateDateForContext(2023, 'ordinary', 8, 1, options, null), null);
  assert.equal(calculateDateForContext(2023, 'ordinary', 9, 1, options, null), '2023-06-04');
});

test('round-trips valid picker positions through calendar dates', () => {
  const options = {
    ...optionsFor(2023, '2023-01-09'),
    firstAdventSunday: '2023-12-03',
    easterSunday: '2023-04-09',
    ashWednesday: '2023-02-22',
    pentecost: '2023-05-28',
    ordintaryWeeks1: 6,
    ordintaryWeeks2: 9,
  };

  const positions = [
    ['ordinary', 6, 1],
    ['ordinary', 9, 1],
    ['ordinary', 34, 2],
    ['advent', 2, 4],
    ['lent', 3, 6],
    ['holyweek', 1, 5],
    ['easter', 4, 3],
    ['christmas', 1, 7],
    ['christmas', 2, 2],
  ];

  positions.forEach(([periodType, periodWeek, dayOfWeek]) => {
    const isoDate = calculateDateForContext(2023, periodType, periodWeek, dayOfWeek, options, null);
    assert.ok(isoDate, `${periodType} ${periodWeek}/${dayOfWeek} should have a date`);
    const actualOptions = moment(isoDate).year() === 2023
      ? options
      : { ...optionsFor(2024, '2024-01-08'), ordintaryWeeks1: 6, ordintaryWeeks2: 9 };
    const context = computeLiturgicalContext(moment(isoDate), actualOptions, null, {});
    assert.deepEqual(
      [context.periodType, context.periodWeek, context.dayOfWeek],
      [periodType, periodWeek, dayOfWeek],
      isoDate,
    );
  });
});
