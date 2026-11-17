import test from 'node:test';
import assert from 'node:assert/strict';
import {
  triduumWeekday, triduumAntiphon, triduumVespersNotice,
  triduumComplineNotice, goodFridayIntercessionsRubric,
  completoriumSolemnityPrayer, applyComplineRubrics,
} from '../src/utils/triduumCompline.js';

const day = (weekday, kind = 'triduum') => ({
  _dayOfWeek: weekday, _ordo: { officeKind: kind },
});

test('Triduum has three distinct source-grounded antiphons', () => {
  const antiphons = [5, 6, 7].map((d) => triduumAntiphon(day(d)));
  assert.equal(new Set(antiphons).size, 3);
  assert.match(antiphons[0], /ажо?но да смерці|ажно да смерці/);
  assert.match(antiphons[1], /смерці крыжовай/);
  assert.match(antiphons[2], /Таму Бог узвысіў Яго/);
  assert.equal(triduumAntiphon(day(1, 'sunday')), '');
});

test('Triduum and Good Friday rubrics remain day-specific', () => {
  assert.equal(triduumWeekday(day(5)), 5);
  assert.match(triduumVespersNotice(day(5)), /Вячэры Пана/);
  assert.match(triduumVespersNotice(day(6)), /Літургіі Мукі Пана/);
  assert.equal(triduumVespersNotice(day(7)), '');
  assert.match(goodFridayIntercessionsRubric(day(6)), /Імшале/);
  assert.equal(goodFridayIntercessionsRubric(day(5)), '');
  assert.match(triduumComplineNotice(day(7)), /Пасхальнай вігіліі/);
});

test('proper Compline prayer supersedes the template only where required', () => {
  const record = { id: 'lent-d1', compResp: 'old', compPr: 'ordinary' };
  for (const d of [5, 6, 7]) {
    const corrected = applyComplineRubrics(record, day(d));
    assert.match(corrected.compPr, /наведай гэты дом/);
    assert.match(corrected.compResp, /Хрыстус стаў/);
    assert.equal(record.compPr, 'ordinary');
  }
  const weekdaySolemnity = { _dayOfWeek: 4, _ordo: { officeKind: 'solemnity' } };
  assert.match(completoriumSolemnityPrayer(weekdaySolemnity), /наведай гэты дом/);
  assert.equal(completoriumSolemnityPrayer(day(1, 'sunday')), '');
  assert.deepEqual(applyComplineRubrics(record, day(2, 'weekday')), record);
});
