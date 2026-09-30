import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';

test('solemnity: Proper → Common fallbacks, no user choices', () => {
  const office = resolveLiturgicalDate('2026-08-15').officeResolution.primary;
  assert.equal(office.allowedChoices.length, 0);
  assert.deepEqual(office.hours.officeOfReadings.reading2.chain, ['proper', 'common']);
  assert.deepEqual(office.hours.lauds.psalmody.chain, ['sunday-week-1']);
  assert.deepEqual(office.sources.sundayWeek1, { template: 'sunday-week-1' });
  assert.deepEqual(office.sources.proper, { source: 'fixed', _date: '15.08', _rank: 'solemnitas', dayIds: ['15-08-assumption-blessed-virgin-mary'] });
  assert.deepEqual(office.firstVespers.chain, ['proper.vesper1', 'common.vesper1', 'proper', 'common']);
  // Daytime Prayer of a solemnity on Sunday uses the Sunday psalms.
  const sunday = resolveLiturgicalDate('2027-08-15').officeResolution.primary;
  assert.deepEqual(sunday.hours.daytime.psalmody.chain, ['sunday-week-1']);
});

test('memorial: current Psalter, current first reading, hagiographic second reading', () => {
  const day = resolveLiturgicalDate('2026-08-04'); // St John Vianney
  const office = day.officeResolution.primary;
  assert.equal(office.officeKind, 'memorial');
  assert.equal(office.sources.currentDay.id, 'ordinary-w18-d3');
  assert.equal(office.sources.currentDay.psalterDayId, 'ordinary-w2-d3');
  assert.deepEqual(office.hours.officeOfReadings.reading1.chain, ['current-day']);
  const reading2 = office.allowedChoices.find((item) => item.hour === 'officeOfReadings' && item.component === 'reading2');
  assert.deepEqual(reading2.after, ['proper']);
  assert.deepEqual(reading2.options, ['current-day', 'common']);
  assert.equal(reading2.default, 'current-day');
  assert.deepEqual(office.hours.daytime.psalmody.chain, ['current-day']);
  assert.equal(office.compline, 'current-weekday');
  assert.equal(office.teDeum, false);
});

test('readings use the same resolved identity as the Office', () => {
  const day = resolveLiturgicalDate('2026-08-04');
  const readings = day.readingResolution.primary;
  assert.equal(readings.celebrationId, day.officeResolution.primary.celebrationId);
  assert.deepEqual(readings.allowedChoices[0], { component: 'readings', options: ['weekday', 'proper', 'common'], default: 'weekday' });
  assert.deepEqual(readings.lookup[0].where, { _periodType: 'ordinary', _periodWeekNumber: 18, _dayOfWeek: 3 });
  assert.deepEqual(readings.cycle, { lectionary: 'weekday', year: '2' });

  const sunday = resolveLiturgicalDate('2026-08-09').readingResolution.primary;
  assert.deepEqual(sunday.cycle, { lectionary: 'sunday', year: 'A' });

  const pentecost = resolveLiturgicalDate('2026-05-24').readingResolution.primary;
  assert.deepEqual(pentecost.lookup[0].where, { _feast: 'feast-pentecost' });
  assert.equal(pentecost.vigilLookup._variant, 'pentecost-vigil');

  // Early Lent was imported as week 0 and null.
  const ashThursday = resolveLiturgicalDate('2026-02-19').readingResolution.primary;
  assert.deepEqual(ashThursday.lookup[0].where._periodWeekNumber, [0, null]);

  // Christmas date documents are selected by date only.
  const dec30 = resolveLiturgicalDate('2025-12-30').readingResolution.primary;
  assert.deepEqual(dec30.lookup[0].where, { _date: '30.12', dateOnly: true });
});

test('alternatives carry their own Office and Readings descriptors', () => {
  const day = resolveLiturgicalDate('2026-01-20');
  assert.deepEqual(day.officeResolution.alternatives.map((item) => item.officeKind), ['optional-memorial', 'optional-memorial']);
  assert.deepEqual(day.readingResolution.alternatives.map((item) => item.celebrationId), day.alternatives.map((item) => item.id));
  assert.deepEqual(day.officeResolution.primary.hours.lauds.psalmody.chain, ['current-day']);
});

test('Saturday memorial of the BVM is offered only without an obligatory memorial', () => {
  assert.ok(resolveLiturgicalDate('2026-10-10').alternatives.some((item) => item.id === 'saturday-blessed-virgin-mary'));
  assert.ok(!resolveLiturgicalDate('2026-01-17').alternatives.some((item) => item.id === 'saturday-blessed-virgin-mary'));
  assert.ok(!resolveLiturgicalDate('2026-03-14').alternatives.some((item) => item.id === 'saturday-blessed-virgin-mary'));
});

test('Immaculate Heart + another obligatory memorial: both become optional', () => {
  const day = resolveLiturgicalDate('2026-06-13');
  assert.equal(day.primary.kind, 'temporal');
  assert.deepEqual(day.alternatives.filter((item) => item.demotedFrom).map((item) => item.id).sort(), ['immaculate-heart', 'sv-anthony-padua']);
});

test('Advent 17–24 and Christmas keep their date-based documents', () => {
  const dec18 = resolveLiturgicalDate('2026-12-18').primary.daysRef;
  assert.equal(dec18.seasonalDateId, 'advent-18-12');
  assert.equal(dec18.id, 'advent-3-d6'.replace('advent-3', 'advent-w3'));
  const jan3 = resolveLiturgicalDate('2027-01-03');
  assert.equal(jan3.primary.officeKind, 'sunday');
  assert.equal(jan3.primary.daysRef.seasonalDateId, 'christmas-03-01');
  const christmas = resolveLiturgicalDate('2026-12-25');
  assert.equal(christmas.primary.id, 'nativity-lord');
  assert.equal(christmas.candidates.find((item) => item.kind === 'temporal').daysRef.fixedDateOnly, true);
});
