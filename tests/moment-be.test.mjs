import assert from 'node:assert/strict';
import test from 'node:test';

import moment from '../src/utils/moment-be.js';

const expectedMonthsInDates = [
  'студзеня',
  'лютага',
  'сакавіка',
  'красавіка',
  'мая',
  'чэрвеня',
  'ліпеня',
  'жніўня',
  'верасня',
  'кастрычніка',
  'лістапада',
  'снежня',
];

test('uses the genitive form of every Belarusian month in a date', () => {
  expectedMonthsInDates.forEach((month, monthIndex) => {
    const date = moment.utc([2026, monthIndex, 25]);

    assert.equal(date.format('D MMMM YYYY'), `25 ${month} 2026`);
  });
});

test('keeps the nominative month form when the month is shown by itself', () => {
  assert.equal(moment.utc([2026, 7, 25]).format('MMMM'), 'жнівень');
  assert.equal(moment.utc([2026, 4, 25]).format('MMMM'), 'май');
});
