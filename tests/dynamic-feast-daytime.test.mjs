import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { assembleDaysResult } from '../src/utils/daysResult.js';
import { getDaytimeHourField, resolveDayAgainstPeriod } from '../src/utils/liturgicalDayResolution.js';

const HOURS = [1, 2, 3];
const SUFFIXES = ['Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'Pr'];

function periodDay() {
  return {
    id: 'ordinary-w8-d5',
    _periodType: 'ordinary',
    _periodWeekNumber: 8,
    _dayOfWeek: 5,
    laudesHymn: '<p>Weekday Lauds</p>',
    ...Object.fromEntries(HOURS.flatMap((hour) => SUFFIXES.map((suffix) => (
      [`sext${hour}${suffix}`, `<p>weekday:${hour}:${suffix}</p>`]
    )))),
  };
}

function forDate(code, proper, weekday = periodDay()) {
  return assembleDaysResult({
    mDate: moment('2026-05-28'),
    context: { periodType: 'ordinary', periodWeek: 8, dayOfWeek: 5 },
    dynamicFeastCodes: [code],
    periodDay: weekday,
    dynamicEntries: [[code, [proper]]],
  }).dynamicDaysByFeast.get(code)[0];
}

test('28 May 2026 is the feast of Christ the Eternal High Priest in Pinsk', () => {
  const day = resolveLiturgicalDate('2026-05-28', { diocese: 'pinsk' });
  assert.equal(day.primary.id, 'christ-the-high-priest');
  assert.equal(day.primary.officeKind, 'feast');
});

test('High Priest feast completes all three daytime hours without replacing its proper texts', () => {
  const feast = {
    id: 'feast-christthehighpriest',
    _feast: 'feast-christthehighpriest',
    _rank: 'festum',
    _feastName: 'Езус Хрыстус, Найвышэйшы і Вечны Святар',
    laudesHymn: '', // Missing in the feast source: not an invitation to rewrite Lauds.
    sext1Hymn: '',
    sext1Ant1: '<p>One proper antiphon</p>',
    sext1Ant2: '[from-day]',
    sext1Ant3: '',
    sext1Ps1: null,
    sext1Ps2: '',
    sext1Ps3: 'from-day',
    sext1R: '<p>Proper daytime reading</p>',
    sext1Pr: '<p>Proper collect</p>',
    sext2R: '',
    sext2Pr: '',
    sext3Pr: null,
  };
  const weekday = periodDay();
  const day = forDate('feast-christthehighpriest', feast, weekday);

  assert.equal(day.id, feast.id);
  assert.equal(day._feastName, feast._feastName);
  assert.equal(day.laudesHymn, '', 'do not change fields outside Daytime Prayer');
  HOURS.forEach((hour) => {
    assert.equal(getDaytimeHourField(day, hour, 'Hymn'), `<p>weekday:${hour}:Hymn</p>`);
    ['Ps1', 'Ps2', 'Ps3'].forEach((suffix) => {
      assert.equal(getDaytimeHourField(day, hour, suffix), `<p>weekday:${hour}:${suffix}</p>`);
    });
    assert.equal(getDaytimeHourField(day, hour, 'Ant1'), '<p>One proper antiphon</p>');
    assert.equal(getDaytimeHourField(day, hour, 'Ant2'), '');
    assert.equal(getDaytimeHourField(day, hour, 'Ant3'), '');
    assert.equal(getDaytimeHourField(day, hour, 'R'), '<p>Proper daytime reading</p>');
    assert.equal(getDaytimeHourField(day, hour, 'Pr'), '<p>Proper collect</p>');
  });

  // The hour component resolves the day against the period a second time.
  // That must not reintroduce Ant2/Ant3 after a single proper antiphon.
  const rerendered = resolveDayAgainstPeriod(day, weekday);
  assert.equal(getDaytimeHourField(rerendered, 1, 'Ant2'), '');
  assert.equal(getDaytimeHourField(rerendered, 2, 'Ant1'), '<p>One proper antiphon</p>');
  assert.equal(getDaytimeHourField(rerendered, 3, 'Pr'), '<p>Proper collect</p>');
});

test('missing proper fields fall back to the matching weekday hour; explicit references stay explicit', () => {
  const weekday = periodDay();
  const day = forDate('feast-christthehighpriest', {
    id: 'feast-christthehighpriest',
    _feast: 'feast-christthehighpriest',
    _rank: 'festum',
    sext1Hymn: '',
    sext1R: '',
    sext2R: 'from-day',
    sext3Ps2: '<p>Proper None psalm</p>',
  }, weekday);
  HOURS.forEach((hour) => {
    assert.equal(getDaytimeHourField(day, hour, 'Hymn'), `<p>weekday:${hour}:Hymn</p>`);
  });
  assert.equal(getDaytimeHourField(day, 1, 'R'), '<p>weekday:1:R</p>');
  assert.equal(getDaytimeHourField(day, 2, 'R'), '<p>weekday:2:R</p>');
  assert.equal(getDaytimeHourField(day, 3, 'Ps2'), '<p>Proper None psalm</p>');
  assert.equal(getDaytimeHourField(day, 2, 'Ps2'), '<p>weekday:2:Ps2</p>');
});

test('dynamic solemnities keep their own missing-field semantics (not weekday Daytime Prayer)', () => {
  const day = forDate('feast-corpuschristi', {
    id: 'feast-corpuschristi',
    _rank: 'solemnitas',
    sext1Ps1: '',
    sext2Pr: '',
  });
  assert.equal(day.sext1Ps1, '');
  assert.equal(day.sext2Pr, '');
});
