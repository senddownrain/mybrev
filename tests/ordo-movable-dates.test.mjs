import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import { computeLiturgicalContext } from '../src/utils/liturgicalCalendar.js';
import {
  buildYearOptions,
  computeEasterSunday,
  getMovableFeastDates,
  sundayCycleFor,
  toIsoDate,
  weekdayCycleFor,
} from '../src/utils/liturgicalMovableDates.js';

test('computes Gregorian Easter', () => {
  const expected = {
    2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2028: '2028-04-16', 2030: '2030-04-21', 2038: '2038-04-25',
  };
  Object.entries(expected).forEach(([year, date]) => assert.equal(toIsoDate(computeEasterSunday(Number(year))), date));
});

test('matches the movable dates printed by the Vitebsk 2025–2026 calendar', () => {
  const dates = getMovableFeastDates(2026);
  assert.equal(dates.baptismOfLord, '2026-01-11');
  assert.equal(dates.ashWednesday, '2026-02-18');
  assert.equal(dates.palmSunday, '2026-03-29');
  assert.equal(dates.ascension, '2026-05-14');
  assert.equal(dates.pentecost, '2026-05-24');
  assert.equal(dates.christTheHighPriest, '2026-05-28');
  assert.equal(dates.holyTrinity, '2026-05-31');
  assert.equal(dates.corpusChristi, '2026-06-04');
  assert.equal(dates.sacredHeartOfJesus, '2026-06-12');
  assert.equal(dates.christKing, '2026-11-22');
  assert.equal(getMovableFeastDates(2025).holyFamily, '2025-12-28');
  assert.equal(getMovableFeastDates(2025).firstAdventSunday, '2025-11-30');
});

test('matches the movable dates printed by the Grodno 2027 calendar', () => {
  const dates = getMovableFeastDates(2027);
  assert.equal(dates.ashWednesday, '2027-02-10');
  assert.equal(dates.easterSunday, '2027-03-28');
  assert.equal(dates.ascension, '2027-05-06');
  assert.equal(dates.pentecost, '2027-05-16');
  assert.equal(dates.corpusChristi, '2027-05-27');
  assert.equal(dates.firstAdventSunday, '2027-11-28');
});

test('Holy Family falls on 30 December when Christmas is a Sunday', () => {
  assert.equal(getMovableFeastDates(2029).holyFamily, '2029-12-30');
  assert.equal(getMovableFeastDates(2022).holyFamily, '2022-12-30');
});

test('derived year options drive the existing calendar context', () => {
  const opts = buildYearOptions(2026);
  assert.equal(opts.ordintaryWeeks1, 6);
  assert.equal(opts.ordintaryWeeks2, 8);
  const next = buildYearOptions(2027);
  const context = (date) => computeLiturgicalContext(moment(date, 'YYYY-MM-DD'), buildYearOptions(Number(date.slice(0, 4))), next, {});
  assert.deepEqual([context('2026-02-17').periodType, context('2026-02-17').periodWeek], ['ordinary', 6]);
  assert.deepEqual([context('2026-05-25').periodType, context('2026-05-25').periodWeek], ['ordinary', 8]);
  assert.deepEqual([context('2026-11-22').periodType, context('2026-11-22').periodWeek], ['ordinary', 34]);
});

test('lectionary cycles follow the liturgical year', () => {
  assert.equal(sundayCycleFor('2025-11-30'), 'A');
  assert.equal(sundayCycleFor('2027-06-06'), 'B');
  assert.equal(sundayCycleFor('2027-11-28'), 'C');
  assert.equal(weekdayCycleFor('2026-06-01'), 2);
  assert.equal(weekdayCycleFor('2027-06-01'), 1);
});
