import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import {
  calculateBaptismOfLordDate,
  calculateHolyFamilyDate,
  computeLiturgicalContext,
} from '../src/utils/liturgicalCalendar.js';
import {
  computeEasterSunday,
  computeSeason,
  computeYearAnchors,
  toYearOptions,
} from '../src/utils/ordo/index.js';
import { daysOfYear } from '../src/utils/ordo/dates.js';

// Published Roman-calendar dates (Easter tables; Belarusian Ordo 2025/26 and Grodno 2027).
const KNOWN = {
  2025: {
    easterSunday: '2025-04-20', ashWednesday: '2025-03-05', ascension: '2025-05-29', pentecost: '2025-06-08',
    trinity: '2025-06-15', corpusChristi: '2025-06-19', sacredHeart: '2025-06-27', christKing: '2025-11-23',
    firstAdventSunday: '2025-11-30', holyFamily: '2025-12-28', baptismOfLord: '2025-01-12',
  },
  2026: {
    easterSunday: '2026-04-05', ashWednesday: '2026-02-18', ascension: '2026-05-14', pentecost: '2026-05-24',
    trinity: '2026-05-31', corpusChristi: '2026-06-04', sacredHeart: '2026-06-12', christTheHighPriest: '2026-05-28',
    maryMotherChurch: '2026-05-25', immaculateHeart: '2026-06-13', christKing: '2026-11-22',
    firstAdventSunday: '2026-11-29', holyFamily: '2026-12-27', baptismOfLord: '2026-01-11',
  },
  2027: {
    easterSunday: '2027-03-28', ashWednesday: '2027-02-10', ascension: '2027-05-06', pentecost: '2027-05-16',
    trinity: '2027-05-23', corpusChristi: '2027-05-27', sacredHeart: '2027-06-04', christKing: '2027-11-21',
    firstAdventSunday: '2027-11-28', holyFamily: '2027-12-26', baptismOfLord: '2027-01-10',
  },
  2028: {
    easterSunday: '2028-04-16', ashWednesday: '2028-03-01', ascension: '2028-05-25', pentecost: '2028-06-04',
    corpusChristi: '2028-06-15', sacredHeart: '2028-06-23', christKing: '2028-11-26',
    firstAdventSunday: '2028-12-03', holyFamily: '2028-12-31', baptismOfLord: '2028-01-09',
  },
  2029: {
    easterSunday: '2029-04-01', ashWednesday: '2029-02-14', ascension: '2029-05-10', pentecost: '2029-05-20',
    corpusChristi: '2029-05-31', sacredHeart: '2029-06-08', christKing: '2029-11-25',
    firstAdventSunday: '2029-12-02', holyFamily: '2029-12-30', baptismOfLord: '2029-01-07',
  },
  2030: {
    easterSunday: '2030-04-21', ashWednesday: '2030-03-06', ascension: '2030-05-30', pentecost: '2030-06-09',
    corpusChristi: '2030-06-20', sacredHeart: '2030-06-28', christKing: '2030-11-24',
    firstAdventSunday: '2030-12-01', holyFamily: '2030-12-29', baptismOfLord: '2030-01-13',
  },
};

test('computes Easter and derived movable feasts for 2025–2030', () => {
  Object.entries(KNOWN).forEach(([year, expected]) => {
    const anchors = computeYearAnchors(Number(year));
    Object.entries(expected).forEach(([key, value]) => {
      assert.equal(anchors[key], value, `${year} ${key}`);
    });
    assert.equal(computeEasterSunday(Number(year)), expected.easterSunday);
  });
});

test('Easter computus matches reference dates across centuries', () => {
  assert.equal(computeEasterSunday(1818), '1818-03-22'); // earliest possible
  assert.equal(computeEasterSunday(1943), '1943-04-25'); // latest possible
  assert.equal(computeEasterSunday(2000), '2000-04-23');
  assert.equal(computeEasterSunday(2038), '2038-04-25');
  assert.equal(computeEasterSunday(2285), '2285-03-22');
});

test('Holy Family and Baptism agree with the existing moment-based rules', () => {
  for (let year = 2000; year <= 2045; year += 1) {
    const anchors = computeYearAnchors(year);
    assert.equal(anchors.holyFamily, calculateHolyFamilyDate(year).format('YYYY-MM-DD'), `holy family ${year}`);
    assert.equal(anchors.baptismOfLord, calculateBaptismOfLordDate(year).format('YYYY-MM-DD'), `baptism ${year}`);
  }
  // Christmas 2022 on Sunday: Holy Family on Friday 30 December.
  assert.equal(computeYearAnchors(2022).holyFamily, '2022-12-30');
});

test('Belarus keeps Ascension on Thursday and adds Christ the High Priest', () => {
  const anchors = computeYearAnchors(2026);
  assert.equal(moment(anchors.ascension).isoWeekday(), 4);
  assert.equal(anchors.christTheHighPriest, '2026-05-28'); // Vitebsk 2025/26: "28 мая – ЧАЦВЕР"
});

test('season identities match computeLiturgicalContext for every day 2020–2035', () => {
  let checked = 0;
  for (let year = 2020; year <= 2035; year += 1) {
    const options = toYearOptions(year);
    const nextOptions = toYearOptions(year + 1);
    daysOfYear(year).forEach((iso) => {
      const legacy = computeLiturgicalContext(moment(iso, 'YYYY-MM-DD'), options, nextOptions, {});
      const season = computeSeason(iso);
      assert.deepEqual(
        [season.period, season.periodWeek, season.dayOfWeek],
        [legacy.periodType, legacy.periodWeek, legacy.dayOfWeek],
        iso,
      );
      checked += 1;
    });
  }
  assert.ok(checked > 5800);
});

test('toYearOptions reproduces the stored 2026 yearOptions shape', () => {
  const options = toYearOptions(2026);
  assert.equal(options.ordintaryWeeks1, 6);
  assert.equal(options.ordintaryWeeks2, 8);
  assert.equal(options.ordintaryStart1, '2026-01-12');
});

test('computes phases, psalter weeks and lectionary cycles', () => {
  const lentSunday = computeSeason('2026-02-22');
  assert.deepEqual([lentSunday.period, lentSunday.periodWeek, lentSunday.psalterWeek], ['lent', 1, 1]);
  assert.equal(computeSeason('2026-02-19').psalterWeek, 4); // after Ash Wednesday
  assert.equal(computeSeason('2026-12-18').periodPhase, 'dec17-24');
  assert.equal(computeSeason('2026-12-16').periodPhase, 'advent-weekdays');
  assert.equal(computeSeason('2026-04-03').periodPhase, 'triduum');
  assert.equal(computeSeason('2026-04-12').periodPhase, 'octave');
  assert.equal(computeSeason('2026-05-20').periodPhase, 'after-ascension');
  assert.equal(computeSeason('2026-06-01').psalterWeek, 1); // Ordinary week IX
  // Liturgical year 2026 (Advent 2025 – Advent 2026): Sunday A, weekday II.
  assert.deepEqual(computeSeason('2026-06-01').readingCycle, { liturgicalYear: 2026, sunday: 'A', weekday: '2' });
  // From Advent 2026: year B, weekday I (Grodno 2027 calendar: "Год B").
  assert.deepEqual(computeSeason('2027-01-18').readingCycle, { liturgicalYear: 2027, sunday: 'B', weekday: '1' });
  assert.equal(computeSeason('2027-11-28').readingCycle.sunday, 'C');
});
