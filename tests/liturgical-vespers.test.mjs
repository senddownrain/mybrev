import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTomorrowFirstVespers,
  findTomorrowRegularVespers,
  getTomorrowFirstVespersOptions,
  hasFirstVespers,
  hasFirstVespersRank,
  isLocalFirstVespers,
  isSolemnity,
  normalizeFirstVespers,
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

test('never takes first Vespers from a memorial', () => {
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
  assert.deepEqual(options.map((item) => item.sourceDayId), ['feast']);
  assert.equal(options[0].day.vesperHymn, '<p>Браць</p>');
  assert.equal(isLocalFirstVespers(options[0]), true);
  assert.equal(hasFirstVespersRank(content.dayOptions[0].day), false);
  assert.equal(hasFirstVespersRank(content.dayOptions[1].day), true);
});
