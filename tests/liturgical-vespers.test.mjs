import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTomorrowFirstVespers,
  hasFirstVespers,
  normalizeFirstVespers,
} from '../src/utils/liturgicalVespers.js';

test('recognizes and normalizes the first Vespers fields', () => {
  const day = { id: 'tomorrow-feast', vesper1Hymn: '<p>Першы гімн</p>', vesper1Pr: '<p>Малітва</p>' };
  assert.equal(hasFirstVespers(day), true);
  assert.equal(normalizeFirstVespers(day).vesperHymn, '<p>Першы гімн</p>');
  assert.equal(normalizeFirstVespers(day).vesperPr, '<p>Малітва</p>');
  assert.equal(normalizeFirstVespers({ vesper1Hymn: '  ' }), null);
});

test('uses the highest-priority tomorrow option that has first Vespers', () => {
  const result = findTomorrowFirstVespers({
    dayOptions: [
      { title: 'Перыяд', day: { vesperHymn: 'regular' } },
      {
        title: 'Урачыстасць Пана',
        templates: [
          { day: { id: 'local-a' } },
          { day: { id: 'local-b', vesper1Ant1: '<p>Першая антыфона</p>' } },
        ],
      },
    ],
  });
  assert.equal(result.title, 'Урачыстасць Пана');
  assert.equal(result.day.id, 'local-b');
  assert.equal(result.day.vesperAnt1, '<p>Першая антыфона</p>');
});
