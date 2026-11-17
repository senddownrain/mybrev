import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleOrdinarySundayFirstVespers,
  eveningVespersModel,
  findTomorrowFirstVespers,
  findTomorrowRegularVespers,
  getTomorrowFirstVespersOptions,
  hasFirstVespers,
  hasFirstVespersRank,
  isLocalFirstVespers,
  isSolemnity,
  normalizeFirstVespers,
  usesOwnVespers,
  vespersHourTitle,
} from '../src/utils/liturgicalVespers.js';

test('recognizes and normalizes the first Vespers fields', () => {
  const day = { id: 'tomorrow-feast', vesper1Hymn: '<p>Першы гімн</p>', vesper1Pr: '<p>Малітва</p>' };
  assert.equal(hasFirstVespers(day), true);
  assert.equal(normalizeFirstVespers(day).vesperHymn, '<p>Першы гімн</p>');
  assert.equal(normalizeFirstVespers(day).vesperPr, '<p>Малітва</p>');
  assert.equal(normalizeFirstVespers({ vesper1Hymn: '  ' }), null);
});

test('can use tomorrow regular Vespers for Saturday evening', () => {
  const result = findTomorrowRegularVespers({
    dayOptions: [
      {
        title: 'Мясцовая ўрачыстасць',
        day: { id: 'local', _place: 'pinsk', vesperHymn: '<p>Мясцовы гімн</p>' },
      },
      { title: 'XXI Звычайная нядзеля', day: { id: 'sunday', vesperHymn: '<p>Гімн</p>' } },
    ],
  });
  assert.equal(result.title, 'XXI Звычайная нядзеля');
  assert.equal(result.day.id, 'sunday');
  assert.equal(isSolemnity({ _rank: 'solemnitas' }), true);
  assert.equal(isSolemnity({ _rank: 'festum' }), false);
});

test('uses the highest-priority tomorrow option that has first Vespers', () => {
  const result = findTomorrowFirstVespers({
    dayOptions: [
      { title: 'Перыяд', day: { vesperHymn: 'regular' } },
      {
        title: 'Урачыстасць Пана',
        templates: [
          { day: { id: 'local-a' } },
          { day: { id: 'local-b', _rank: 'solemnitas', vesper1Ant1: '<p>Першая антыфона</p>' } },
        ],
      },
    ],
  });
  assert.equal(result.title, 'Урачыстасць Пана');
  assert.equal(result.day.id, 'local-b');
  assert.equal(result.day.vesperAnt1, '<p>Першая антыфона</p>');
});

test('never takes first Vespers from a memorial or a saint feast', () => {
  const content = {
    dayOptions: [
      {
        title: 'Успамін святога',
        day: { id: 'memorial', _rank: 'memoria', vesper1Hymn: '<p>Не браць</p>' },
      },
      {
        title: 'Мясцовае свята',
        day: { id: 'feast', _rank: 'festum', _place: 'grodno', vesper1Hymn: '<p>Браць</p>' },
      },
    ],
  };
  const options = getTomorrowFirstVespersOptions(content);
  assert.deepEqual(options, []);
  assert.equal(isLocalFirstVespers({ places: ['grodno'] }), true);
  assert.equal(hasFirstVespersRank(content.dayOptions[0].day), false);
  assert.equal(hasFirstVespersRank(content.dayOptions[1].day), false);
});

test('office for the dead retains its own Vespers', () => {
  assert.equal(usesOwnVespers({ _kind: 'office-for-dead' }), true);
  assert.equal(usesOwnVespers({ _kind: 'period' }), false);
});

test('13 June 2026: I Vespers of XI Sunday use Saturday psalter, never Sunday II Vespers', async () => {
  const { resolveRuntimeDay } = await import('../src/utils/ordo/runtime.js');
  const { buildOrdoDayOptions } = await import('../src/utils/ordoDayOptions.js');
  const { daysFixture, templatesFixture } = await import('./helpers/ordo-days-fixture.mjs');
  for (const diocese of ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']) {
    const saturday = resolveRuntimeDay('2026-06-13', { diocese });
    const sunday = resolveRuntimeDay('2026-06-14', { diocese });
    const sat = daysFixture(saturday);
    const sun = daysFixture(sunday);
    const satContent = buildOrdoDayOptions({
      resolved: saturday, daysResult: sat.daysResult, context: sat.context,
      diocese, date: '2026-06-13', templates: templatesFixture(),
    });
    const sunContent = buildOrdoDayOptions({
      resolved: sunday, daysResult: sun.daysResult, context: sun.context,
      diocese, date: '2026-06-14', templates: templatesFixture(),
    });
    const heart = satContent.dayOptions.find((option) => option.ordo.optionId === 'immaculate-heart');
    const sundayCard = sunContent.dayOptions.find((option) => option.ordo.officeKind === 'sunday');
    assert.ok(heart, diocese);
    assert.ok(sundayCard, diocese);
    assert.equal(heart.ordo.vespers.type, 'first', diocese);
    const saturdayPsalter = sat.daysResult.periodFallback;
    assert.ok(saturdayPsalter.id.endsWith('-d7'), diocese);
    const evening = eveningVespersModel(
      { ...heart.day, _ordo: heart.ordo }, sunContent,
      { isoWeekday: 6, periodDay: saturdayPsalter },
    );
    assert.ok(evening.firstVespers, diocese);
    assert.equal(evening.firstVespers.sourceDayId, sundayCard.day.id, diocese);
    assert.equal(evening.firstVespers.day.vesperHymn, saturdayPsalter.vesperHymn, diocese);
    assert.notEqual(evening.firstVespers.day.vesperHymn, sundayCard.day.vesperHymn, diocese);
    assert.equal(evening.firstVespers.day.vesperAntMag, saturdayPsalter.vesperAntMag, diocese);
    assert.equal(evening.firstVespers.day._firstVespersSource, 'saturday-psalter', diocese);
    assert.deepEqual(evening.firstVespers.day._missingFirstVespersFields, [], diocese);
    const second = eveningVespersModel({ ...sundayCard.day, _ordo: sundayCard.ordo }, null, { isoWeekday: 7 });
    assert.equal(second.second, true, diocese);
    assert.equal(second.firstVespers, null, diocese);
  }
});

test('Sunday I Vespers preserve explicit first-Vespers Propers and never borrow II Vespers', () => {
  const sunday = {
    id: 'ordinary-sunday',
    vesper1AntMag: '<p>I Ант. да песні Марыі</p>',
    vesperHymn: 'II Vespers hymn',
    vesperR: 'II Vespers reading',
  };
  const saturdayPsalter = {
    id: 'ordinary-saturday', vesperHymn: 'I Vespers hymn',
    vesperR: 'I Vespers reading', vesperAntMag: 'I Vespers psalter antiphon',
  };
  const first = assembleOrdinarySundayFirstVespers(sunday, saturdayPsalter);
  assert.equal(first.vesperHymn, 'I Vespers hymn');
  assert.equal(first.vesperR, 'I Vespers reading');
  assert.equal(first.vesperAntMag, sunday.vesper1AntMag);
  assert.equal(first.vesperPr, '', 'missing source must not silently borrow II Vespers');
  assert.ok(first._missingFirstVespersFields.includes('Pr'));
  assert.equal(first._firstVespersSource, 'vesper1+saturday-psalter');
});

test('non-Sunday celebrations preserve their existing first Vespers fallback', () => {
  const current = { id: 'sat', _ordo: { vespers: { type: 'first', celebrationId: 'saint-solemnity' } } };
  const tomorrow = { dayOptions: [{ title: 'Saint solemnity', day: { id: 'saint', vesperHymn: 'solemnity own hymn' }, ordo: { role: 'primary', optionId: 'saint-solemnity' } }] };
  const evening = eveningVespersModel(current, tomorrow, {
    isoWeekday: 6, periodDay: { vesperHymn: 'Saturday psalter hymn' },
  });
  assert.equal(evening.firstVespers.day.vesperHymn, 'solemnity own hymn');
  assert.equal(evening.firstVespers.day._firstVespersSource, 'proper');
});

test('Vespers names are built into hour titles rather than a detached rubric', () => {
  assert.equal(vespersHourTitle({ firstVespers: { day: {} }, second: true }), 'I Нешпары');
  assert.equal(vespersHourTitle({ firstVespers: { day: {} } }, true), 'I НЕШПАРЫ');
  assert.equal(vespersHourTitle({ second: true }), 'II Нешпары');
  assert.equal(vespersHourTitle({ second: true }, true), 'II НЕШПАРЫ');
  assert.equal(vespersHourTitle({ firstVespers: null, second: false }), 'Нешпары');
  assert.equal(vespersHourTitle(null, true), 'НЕШПАРЫ');
});
