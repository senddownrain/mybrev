import test from 'node:test';
import assert from 'node:assert/strict';
import moment from '../src/utils/moment-be.js';
import {
  applySeasonalWeekdayAntiphons,
  getFixedCelebrationKey,
  getDaytimeHourField,
  getSeasonalDateExceptionId,
  hasSingleAntiphonPsalmody,
  isSeasonalDateDocumentId,
  resolveDayAgainstPeriod,
} from '../src/utils/liturgicalDayResolution.js';

test('builds deterministic Advent and Christmas exception IDs', () => {
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-19')), 'advent-19-12');
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-25')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-26')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-27')), 'christmas-27-12');
  assert.equal(getSeasonalDateExceptionId(moment('2026-12-28')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-01')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-06')), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11')), 'christmas-11-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-12')), 'christmas-12-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11'), 'ordinary'), null);
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-11'), 'christmas'), 'christmas-11-01');
  assert.equal(getSeasonalDateExceptionId(moment('2027-01-13')), null);
  assert.equal(isSeasonalDateDocumentId('christmas-28-12'), true);
  assert.equal(isSeasonalDateDocumentId('28-12-holy-innocents'), false);
});

test('resolves legacy and canonical from-day markers without replacing identity', () => {
  const resolved = resolveDayAgainstPeriod({
    id: 'fixed',
    _feastName: 'Святы',
    laudesAnt1: 'from-day',
    laudesAnt2: '[from-day]',
    laudesPr: '<p>Уласная</p>',
  }, {
    id: 'period',
    _feastName: 'Перыяд',
    laudesAnt1: '<p>1</p>',
    laudesAnt2: '<p>2</p>',
    laudesPr: '<p>Перыяд</p>',
  });
  assert.equal(resolved.id, 'fixed');
  assert.equal(resolved._feastName, 'Святы');
  assert.equal(resolved.laudesAnt1, '<p>1</p>');
  assert.equal(resolved.laudesAnt2, '<p>2</p>');
  assert.equal(resolved.laudesPr, '<p>Уласная</p>');
});

test('never leaves unresolved from-day markers in assembled fields', () => {
  const withoutPeriod = resolveDayAgainstPeriod({
    id: 'fixed',
    laudesAnt1: 'from-day',
    laudesAnt2: '[from-day]',
    laudesAnt3: '<p>[from-day]</p>',
    laudesPr: '<p>Уласная</p>',
  }, null);

  assert.equal(withoutPeriod.laudesAnt1, '');
  assert.equal(withoutPeriod.laudesAnt2, '');
  assert.equal(withoutPeriod.laudesAnt3, '');
  assert.equal(withoutPeriod.laudesPr, '<p>Уласная</p>');

  const stalePeriod = resolveDayAgainstPeriod({
    id: 'fixed',
    laudesAnt1: 'from-day',
  }, {
    id: 'period',
    laudesAnt1: '<p>from-day</p>',
    laudesAnt2: 'from-day',
  });

  assert.equal(stalePeriod.laudesAnt1, '');
  assert.equal(stalePeriod.laudesAnt2, '');

  const periodOnly = resolveDayAgainstPeriod({
    id: 'period',
    vesperR: '<p>[from-day]</p>',
  }, null);
  assert.equal(periodOnly.vesperR, '');
});

test('seasonal resolution fills gaps and expands weekday antiphons', () => {
  const seasonal = resolveDayAgainstPeriod({
    id: 'advent-19-12',
    laudesHymn: '',
    thursday: '<p>Ант. 1</p><p>Ант. 2</p><p>Ант. 3</p>',
  }, {
    id: 'advent-w4-d5',
    laudesHymn: '<p>Гімн</p>',
  }, { fillMissing: true });
  const resolved = applySeasonalWeekdayAntiphons(seasonal, 5);
  assert.equal(resolved.id, 'advent-19-12');
  assert.equal(resolved.laudesHymn, '<p>Гімн</p>');
  assert.equal(resolved.laudesAnt2, '<p>Ант. 2</p>');
  assert.equal(resolved.vesperAnt3, '<p>Ант. 3</p>');
});

test('groups templates by celebration rank and place', () => {
  const base = {
    _date: '02.01',
    _feastName: 'Св. Базыля і Грыгорыя',
    _rank: 'memoria',
  };
  assert.equal(
    getFixedCelebrationKey({ ...base, _currentVersion: 'pastors' }),
    getFixedCelebrationKey({ ...base, _currentVersion: 'doctors-of-church' }),
  );
  assert.notEqual(
    getFixedCelebrationKey(base),
    getFixedCelebrationKey({ ...base, _place: 'vitebsk' }),
  );
});

test('daytime hours inherit each missing field from sext1', () => {
  const day = {
    sext1Hymn: '<p>Агульны гімн</p>',
    sext1Ant1: '<p>Агульная антыфона</p>',
    sext1Ps1: '<p>Агульны псалом</p>',
    sext2Hymn: '<p>Уласны гімн сэксты</p>',
    sext2Ant1: '',
    sext3Ps1: '   ',
  };

  assert.equal(getDaytimeHourField(day, 1, 'Hymn'), '<p>Агульны гімн</p>');
  assert.equal(getDaytimeHourField(day, 2, 'Hymn'), '<p>Уласны гімн сэксты</p>');
  assert.equal(getDaytimeHourField(day, 2, 'Ant1'), '<p>Агульная антыфона</p>');
  assert.equal(getDaytimeHourField(day, 3, 'Ps1'), '<p>Агульны псалом</p>');
  assert.equal(getDaytimeHourField({ sext1R: '[from-day]', sext2R: 'from-day' }, 2, 'R'), '');
});

test('detects one antiphon surrounding a complete group of three psalms', () => {
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона</p>', ant2: '', ant3: ' ', ps1: '1', ps2: '2', ps3: '3',
  }), true);
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона 1</p>', ant2: '<p>Антыфона 2</p>', ant3: '', ps1: '1', ps2: '2', ps3: '3',
  }), false);
  assert.equal(hasSingleAntiphonPsalmody({
    ant1: '<p>Антыфона</p>', ant2: '', ant3: '', ps1: '1', ps2: '', ps3: '3',
  }), false);
});
