import test from 'node:test';
import assert from 'node:assert/strict';
import { getCompletoriumWeekday } from '../src/utils/liturgicalOffice.js';
import { resolveComplineDescriptor, resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, findOptionByDayId } from '../src/utils/ordoDayOptions.js';
import { daysFixture } from './helpers/ordo-days-fixture.mjs';
import {
  triduumWeekday, triduumAntiphon, triduumVespersNotice,
  triduumComplineNotice, goodFridayIntercessionsRubric,
  completoriumSolemnityPrayer, applyComplineRubrics,
} from '../src/utils/triduumCompline.js';

const day = (weekday, kind = 'triduum') => ({
  _dayOfWeek: weekday, _ordo: { officeKind: kind, complineSolemnityPrayer: kind === 'triduum' },
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
  const weekdaySolemnity = { _dayOfWeek: 4, _ordo: { officeKind: 'solemnity', complineSolemnityPrayer: true } };
  assert.match(completoriumSolemnityPrayer(weekdaySolemnity), /наведай гэты дом/);
  assert.equal(completoriumSolemnityPrayer(day(1, 'sunday')), '');
  assert.deepEqual(applyComplineRubrics(record, day(2, 'weekday')), record);
});

const dioceses = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];

test('both evenings of weekday solemnities use prayer 2, with distinct psalmody', () => {
  for (const diocese of dioceses) {
    for (const [date, weekday] of [
      ['2026-12-31', 7], ['2027-01-01', 1],
      ['2027-12-07', 7], ['2027-12-08', 1],
    ]) {
      const ordo = resolveComplineDescriptor(date, { diocese });
      const expected = weekday === 7 ? 'first' : 'second';
      assert.equal(ordo.vespers.type, expected, `${date} ${diocese}`);
      assert.equal(getCompletoriumWeekday({ _ordo: ordo }, 3), weekday);
      assert.match(completoriumSolemnityPrayer({ _ordo: ordo }), /наведай гэты дом/);
      const resolved = resolveRuntimeDay(date, { diocese });
      const { context, daysResult } = daysFixture(resolved);
      const built = buildOrdoDayOptions({ resolved, context, daysResult, date, diocese });
      const card = built.dayOptions[0];
      const restored = JSON.parse(JSON.stringify(built));
      assert.equal(findOptionByDayId(restored, card.dayId).ordo.complineDay, weekday);
      assert.deepEqual(resolveComplineDescriptor(date, { diocese, optionId: 'legacy-copy' }), ordo);
    }
    for (const date of ['2027-01-23', '2027-01-24', '2027-05-20']) {
      assert.equal(completoriumSolemnityPrayer({ _ordo: resolveComplineDescriptor(date, { diocese }) }), '');
    }
  }
});

test('Ordo delivers Triduum, Easter octave and the Word of God Sunday for 2026–2032', () => {
  const wordSundays = ['2026-01-25', '2027-01-24', '2028-01-23', '2029-01-21',
    '2030-01-27', '2031-01-26', '2032-01-25'];
  const easters = ['2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01',
    '2030-04-21', '2031-04-13', '2032-03-28'];
  const offset = (date, days) =>
    new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
  for (const diocese of dioceses) {
    for (const sunday of wordSundays) {
      const resolved = resolveRuntimeDay(sunday, { diocese });
      const { context, daysResult } = daysFixture(resolved);
      const built = buildOrdoDayOptions({ resolved, context, daysResult, date: sunday, diocese });
      assert.match(resolved.primary.title, /Нядзеля Божага Слова/);
      assert.match(built.dayOptions[0].title, /Нядзеля Божага Слова/);
      assert.equal(resolved.primary.officeKind, 'sunday');
      assert.doesNotMatch(resolveRuntimeDay(offset(sunday, 7), { diocese }).primary.title, /Нядзеля Божага Слова/);
    }
    for (const easter of easters) {
      for (let i = -3; i <= 8; i++) {
        const ordo = resolveComplineDescriptor(offset(easter, i), { diocese });
        if (i < 0) {
          assert.equal(ordo.complineDay, 1);
          assert.equal(ordo.complineSolemnityPrayer, true);
          assert.match(triduumAntiphon({ _dayOfWeek: i + 8, _ordo: ordo }), /Хрыстус стаў/);
        } else if (i <= 7) {
          assert.equal(ordo.complineDay, 1);
          assert.equal(ordo.complineChoice, true);
          assert.equal(ordo.complineSolemnityPrayer, false);
          const record = { compResp: 'original', compPr: 'from selected formula' };
          const display = applyComplineRubrics(record, { _ordo: ordo });
          assert.match(display.compResp, /Вось дзень, які Пан учыніў/);
          assert.equal(display.compPr, record.compPr);
        } else {
          assert.equal(ordo.complineChoice, false);
        }
      }
    }
  }
});
