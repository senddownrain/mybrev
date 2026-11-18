import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLiturgicalPeriodTitle } from '../src/utils/liturgicalPeriodTitle.js';

test('uses dedicated Sunday titles for every liturgical period', () => {
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'ordinary', periodWeek: 3, dayOfWeek: 1 }), 'III нядзеля звычайная · Нядзеля Божага Слова');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'ordinary', periodWeek: 4, dayOfWeek: 1 }), 'IV нядзеля звычайная');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'advent', periodWeek: 3, dayOfWeek: 1 }), 'III нядзеля Адвэнту');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'lent', periodWeek: 3, dayOfWeek: 1 }), 'III нядзеля Вялікага посту');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'easter', periodWeek: 3, dayOfWeek: 1 }), 'III велікодная нядзеля');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'christmas', periodWeek: 2, dayOfWeek: 1 }), 'II нядзеля пасля Нараджэння Пана');
});

test('keeps the existing weekday title pattern', () => {
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'ordinary', periodWeek: 3, dayOfWeek: 2 }), 'III звычайны тыдзень, панядзелак');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'christmas', periodWeek: 1, dayOfWeek: 7, date: '2026-01-03' }), 'I тыдзень перыяду Божага Нараджэння, субота');
  assert.equal(formatLiturgicalPeriodTitle({ periodType: 'christmas', periodWeek: 1, dayOfWeek: 5, date: '2026-01-01' }), 'Чацвер у Актаве Нараджэння Пана');
});
