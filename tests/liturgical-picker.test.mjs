import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAdventDateOptions,
  buildChristmasDateOptions,
} from '../src/utils/liturgicalPicker.js';

test('period selection emits the reader directly without an intermediate options list', () => {
  const picker = readFileSync(new URL('../src/components/liturgical/PeriodPicker.vue', import.meta.url), 'utf8');
  const template = picker.split('<script setup>')[0];
  assert.doesNotMatch(template, /result-card|result-list|варыянты|readingCount/);
  assert.match(picker, /fetchReadingsByDate\(date, \{ periodOnly: true \}\)/);
  assert.match(picker, /getLiturgicalContentForDate\(date, currentOrdoDiocese\(\), \{ periodOnly: true \}\)/);
  assert.match(picker, /emit\('day-selected', \{ dayId: option\.dayId, date, periodOnly: true/);
  for (const file of ['components/oraparts/DayTitle.vue', 'components/readings/ReadingsView.vue', 'components/liturgical/FeastsPicker.vue']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), /Апорная дата|Даведачны рэжым|Прагляд тэкстаў, а не/);
  }
});

test('offers every privileged Advent date from 17 through 24 December', () => {
  const dates = buildAdventDateOptions(2026);
  assert.equal(dates.length, 8);
  assert.equal(dates[0].isoDate, '2026-12-17');
  assert.equal(dates.at(-1).isoDate, '2026-12-24');
});

test('offers Christmas exclusively as dates from 25 December through the Baptism', () => {
  const dates = buildChristmasDateOptions(2026);
  assert.equal(dates.length, 17);
  assert.equal(dates[0].isoDate, '2026-12-25');
  assert.equal(dates[6].isoDate, '2026-12-31');
  assert.equal(dates[7].isoDate, '2027-01-01');
  assert.equal(dates.at(-1).isoDate, '2027-01-10');
  assert.deepEqual(
    [...new Set(dates.map((item) => `${item.monthFull} ${item.year}`))],
    ['снежань 2026', 'студзень 2027'],
  );
  assert.equal(new Set(dates.map((item) => item.isoDate)).size, dates.length);
});
