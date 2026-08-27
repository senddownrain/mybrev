import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePsalterWeek,
  formatPsalterWeekLabel,
  normalizePsalterWeek,
} from '../src/utils/liturgicalPsalter.js';

test('repeats period weeks in a four-week psalter cycle', () => {
  assert.equal(normalizePsalterWeek(1), 1);
  assert.equal(normalizePsalterWeek(4), 4);
  assert.equal(normalizePsalterWeek(5), 1);
  assert.equal(normalizePsalterWeek(34), 2);
  assert.equal(normalizePsalterWeek(0), null);

  assert.equal(calculatePsalterWeek({ periodType: 'advent', periodWeek: 4 }), 4);
  assert.equal(calculatePsalterWeek({ periodType: 'ordinary', periodWeek: 29 }), 1);
  assert.equal(calculatePsalterWeek({ periodType: 'easter', periodWeek: 7 }), 3);
});

test('uses week IV before the first Lent Sunday and week II in Holy Week', () => {
  assert.equal(calculatePsalterWeek({ periodType: 'lent', periodWeek: 0 }), 4);
  assert.equal(calculatePsalterWeek({ periodType: 'lent', periodWeek: 1 }), 1);
  assert.equal(calculatePsalterWeek({ periodType: 'lent', periodWeek: 5 }), 1);
  assert.equal(calculatePsalterWeek({ periodType: 'holyweek', periodWeek: 1 }), 2);
});

test('keeps week IV from a weekday Christmas until Sunday starts week I', () => {
  assert.equal(calculatePsalterWeek({ date: '2026-12-25', periodType: 'christmas', periodWeek: 1 }), 4);
  assert.equal(calculatePsalterWeek({ date: '2026-12-26', periodType: 'christmas', periodWeek: 1 }), 4);
  assert.equal(calculatePsalterWeek({ date: '2026-12-27', periodType: 'christmas', periodWeek: 1 }), 1);
  assert.equal(calculatePsalterWeek({ date: '2027-01-02', periodType: 'christmas', periodWeek: 2 }), 1);
  assert.equal(calculatePsalterWeek({ date: '2027-01-03', periodType: 'christmas', periodWeek: 2 }), 2);
});

test('starts week I immediately when Christmas is Sunday', () => {
  assert.equal(calculatePsalterWeek({ date: '2022-12-25', periodType: 'christmas', periodWeek: 1 }), 1);
  assert.equal(calculatePsalterWeek({ date: '2022-12-31', periodType: 'christmas', periodWeek: 1 }), 1);
  assert.equal(calculatePsalterWeek({ date: '2023-01-01', periodType: 'christmas', periodWeek: 1 }), 2);
});

test('formats the compact Belarusian title label', () => {
  assert.equal(formatPsalterWeekLabel(4), 'IV тыдзень Псалтыра');
  assert.equal(formatPsalterWeekLabel(null), '');
});
