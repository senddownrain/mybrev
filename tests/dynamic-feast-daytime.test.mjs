import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { applyHighPriestDaytimeProper, assembleDaysResult } from '../src/utils/daysResult.js';
import { getDaytimeHourField, resolveDayAgainstPeriod } from '../src/utils/liturgicalDayResolution.js';
import highPriestSource from '../src/data/liturgical/christ-high-priest-daytime-by.json' with { type: 'json' };

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

test('Belarusian supplied source contains three distinct daytime readings, antiphons and responses', () => {
  const { fields } = highPriestSource;
  assert.equal(highPriestSource.feastCode, 'feast-christthehighpriest');
  assert.equal(Object.keys(fields).length, 15);
  assert.match(fields.sext1R, /Гбр 7, 26-27/);
  assert.match(fields.sext2R, /1 П 2, 4-5/);
  assert.match(fields.sext3R, /1 П 2, 9-10/);
  assert.match(fields.sext1R, /Паколькі вы прымаеце ўдзел/);
  assert.match(fields.sext2R, /Укаранёныя і збудаваныя/);
  assert.match(fields.sext3R, /Да якога вы пакліканыя/);
  assert.match(fields.sext1Pr, /Божа, Ты дзеля хвалы Тваёй велічы/);
  HOURS.forEach((hour) => {
    assert.ok(fields[`sext${hour}R`].includes('КАРОТКАЕ ЧЫТАННЕ'));
    assert.ok(fields[`sext${hour}R`].includes('К.</span>'));
    assert.ok(fields[`sext${hour}R`].includes('Н.</span>'));
    assert.ok(fields[`sext${hour}Ant1`].includes('Ант.</span>'));
    assert.equal(fields[`sext${hour}Ant2`], '');
    assert.equal(fields[`sext${hour}Ant3`], '');
    assert.equal(fields[`sext${hour}Pr`], fields.sext1Pr);
  });
});

test('High Priest feast uses supplied Proper, with weekday psalms and hymn for each hour', () => {
  const feast = {
    id: 'feast-christthehighpriest',
    _feast: 'feast-christthehighpriest',
    _rank: 'festum',
    _feastName: 'Езус Хрыстус, Найвышэйшы і Вечны Святар',
    laudesHymn: '',
    sext1Hymn: '',
    sext1R: 'from-day',
    sext2R: 'from-day',
    sext3R: '[from-day]',
    sext1Ant2: '<p>stale second antiphon</p>',
    sext1Ps1: null,
    sext1Ps2: '',
    sext1Ps3: 'from-day',
    _fromDayFields: ['sext1R', 'sext2R', 'sext3R'],
  };
  const weekday = periodDay();
  const day = forDate('feast-christthehighpriest', feast, weekday);
  assert.equal(day.id, feast.id);
  assert.equal(day._feastName, feast._feastName);
  assert.equal(day.laudesHymn, '', 'non-daytime text must remain unchanged');
  HOURS.forEach((hour) => {
    assert.equal(getDaytimeHourField(day, hour, 'Hymn'), `<p>weekday:${hour}:Hymn</p>`);
    ['Ps1', 'Ps2', 'Ps3'].forEach((suffix) => {
      assert.equal(getDaytimeHourField(day, hour, suffix), `<p>weekday:${hour}:${suffix}</p>`);
    });
    ['Ant1', 'Ant2', 'Ant3', 'R', 'Pr'].forEach((suffix) => {
      assert.equal(getDaytimeHourField(day, hour, suffix),
        highPriestSource.fields[`sext${hour}${suffix}`], `${hour}.${suffix}`);
    });
  });

  // The hour component may re-resolve the day: own Proper stays own.
  const rerendered = resolveDayAgainstPeriod(day, weekday);
  assert.equal(getDaytimeHourField(rerendered, 1, 'Ant2'), '');
  assert.equal(getDaytimeHourField(rerendered, 2, 'R'), highPriestSource.fields.sext2R);
  assert.equal(getDaytimeHourField(rerendered, 3, 'Pr'), highPriestSource.fields.sext3Pr);
});

test('the canonical Proper is only overlaid on the High Priest feast, not other feasts', () => {
  const original = { id: 'feast-other', sext1R: '<p>unrelated proper reading</p>' };
  assert.equal(applyHighPriestDaytimeProper(original, 'feast-other'), original);
  assert.equal(applyHighPriestDaytimeProper(null, 'feast-christthehighpriest'), null);
  const otherDay = forDate('feast-other', {
    ...original,
    _rank: 'festum',
    sext1Hymn: '',
    sext1Ant1: '<p>Other proper antiphon</p>',
    sext2Pr: '',
  });
  assert.equal(otherDay.sext1R, '<p>unrelated proper reading</p>');
  assert.equal(otherDay.sext1Ant1, '<p>Other proper antiphon</p>');
  assert.equal(otherDay.sext1Hymn, '<p>weekday:1:Hymn</p>');
  assert.equal(otherDay.sext2Pr, '');
});

test('missing daytime collect of another movable feast inherits its own Lauds, not the weekday', () => {
  const day = forDate('feast-other', {
    id: 'feast-other',
    _rank: 'festum',
    laudesPr: '<p>Proper collect from Lauds</p>',
    sext1Pr: '',
    sext2Pr: '',
  });
  HOURS.forEach((hour) => {
    assert.equal(getDaytimeHourField(day, hour, 'Pr'), '<p>Proper collect from Lauds</p>');
  });
});

test('dynamic solemnities keep their own missing-field semantics (no weekday psalter fallback)', () => {
  const day = forDate('feast-corpuschristi', {
    id: 'feast-corpuschristi',
    _rank: 'solemnitas',
    sext1Ps1: '',
    sext2Pr: '',
  });
  assert.equal(day.sext1Ps1, '');
  assert.equal(day.sext2Pr, '');
});
