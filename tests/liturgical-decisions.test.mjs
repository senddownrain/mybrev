/**
 * Decisions of the Lectionary audit (owner's instructions of 2026-10-13):
 * Pentecost Saturday taken by a feast (31 May 2031), Our Lady of Budslav in
 * the four dioceses, the corrected Gospel citation, 24.06.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { createReadingsRuntime, screenFor } from '../scripts/lectionary/lib/runtime-sim.mjs';
import { pickerOptionsOf, pickerRouteFor } from '../src/utils/ordoDatePicker.js';
import { CITATION_CORRECTIONS, applySourceCorrections } from '../scripts/lectionary/lib/source-corrections.mjs';
import { selectReadingDocuments } from '../src/utils/ordo/runtime.js';

const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const reading = (bible) => ({ bible, text: `text of ${bible}` });
const options = (iso, diocese) => { const day = resolveLiturgicalDate(iso, { country: 'BY', diocese }); return [day.primary, ...day.alternatives]; };

test('Pentecost Saturday taken by the Visitation (31.05.2031): the feast Mass AND the evening Vigil Mass of Pentecost, vigil default', () => {
  for (const diocese of DIOCESES) {
    const day = resolveLiturgicalDate('2031-05-31', { country: 'BY', diocese });
    assert.equal(day.primary.id, 'visitation-blessed-virgin-mary');
    assert.equal(day.primary.officeKind, 'feast');
    // the Office: the evening is First Vespers of Pentecost (solemnity, row 2 of the Table > feast, row 7)
    assert.equal(day.officeResolution.evening.vespers.celebrationId, 'pentecost');
    const lookup = day.readingResolution.primary.lookup;
    assert.deepEqual(lookup.map((entry) => entry.where._variant || entry.purpose), ['proper', 'common', 'pentecost-vigil']);
  }
  const runtime = createReadingsRuntime([
    { id: '31-05-visitation', _date: '31.05', title: resolveLiturgicalDate('2031-05-31', { country: 'BY', diocese: 'minsk-mohilev' }).primary.title, reading1: reading('Саф 3, 14'), gospel: reading('Лк 1, 39') },
    { id: 'easter-w7-d7', _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7, title: 'Субота VII Велікоднага тыдня', reading1: reading('Дз 28, 16'), gospel: reading('Ян 21, 20') },
    { id: 'easter-w7-d7--pentecost-vigil', _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7, _variant: 'pentecost-vigil', title: 'Спасланне Духа Святога', reading1: reading('Быц 11, 1'), gospel: reading('Ян 7, 37') },
  ]);
  const loaded = runtime.load('2031-05-31', 'minsk-mohilev');
  const screen = screenFor(loaded, {});
  assert.equal(screen.groups.length, 2, 'both Masses are offered');
  assert.equal(screen.activeGroup.documents[0].id, 'easter-w7-d7--pentecost-vigil', 'the evening Vigil Mass is the default');
  assert.ok(screen.groups.some((group) => group.documents.some((doc) => doc.id === '31-05-visitation')), 'the morning Mass of the feast stays selectable');
  assert.ok(!screen.groups.some((group) => group.documents.some((doc) => doc.id === 'easter-w7-d7')), 'the weekday Mass of Saturday is not offered: the feast outranks it');
});

test('Pentecost Saturday in an ordinary year or with a memorial is unchanged (the Saturday document carries the morning and vigil sets)', () => {
  for (const [iso, diocese] of [['2026-05-23', 'minsk-mohilev'], ['2028-06-03', 'grodno'], ['2030-06-08', 'grodno']]) {
    const day = resolveLiturgicalDate(iso, { country: 'BY', diocese });
    const all = [day.readingResolution.primary, ...day.readingResolution.alternatives];
    assert.ok(all.every((resolution) => resolution.lookup.every((entry) => !entry.where?._variant)), `${iso}: no extra lookup`);
  }
});

test('the variant lookup selects only the variant document; a lookup without a variant is unchanged', () => {
  const docs = [
    { id: 'a', _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7 },
    { id: 'b', _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7, _variant: 'pentecost-vigil' },
  ];
  const where = { _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7 };
  assert.deepEqual(selectReadingDocuments({ purpose: 'weekday', where: { ...where, _variant: 'pentecost-vigil' } }, {}, docs).map((doc) => doc.id), ['b']);
  assert.deepEqual(selectReadingDocuments({ purpose: 'weekday', where }, {}, docs).map((doc) => doc.id), ['a', 'b']);
});

test('Our Lady of Budslav (02.07): rank and readings per diocese, from the diocesan calendars', () => {
  const kinds = Object.fromEntries(DIOCESES.map((diocese) => [diocese, options('2026-07-02', diocese).find((item) => item.id === 'our-lady-budslav').officeKind]));
  assert.deepEqual(kinds, { 'minsk-mohilev': 'solemnity', vitebsk: 'feast', pinsk: 'optional-memorial', grodno: 'optional-memorial' });
  const linked = { id: '02-07-our-lady-budslav-minsk', _date: '02.07', _dayId: '02-07-our-lady-budslav-minsk', _dayIds: ['02-07-our-lady-budslav-minsk', '02-07-our-lady-budslav-vitebsk', '02-07-our-lady-budslav'], _rank: 'solemnitas', _place: 'minsk-mohilev', title: '2 ліпеня — урачыстасць Маці Божай Будслаўскай', reading1: reading('Саф 3, 14–18'), reading2: reading('Рым 12, 9–16b'), gospel: reading('Лк 1, 39–56') };
  const weekday = { id: 'ordinary-w13-d5--2', _periodType: 'ordinary', _periodWeekNumber: 13, _dayOfWeek: 5, year: '2', title: 'Чацвер', reading1: reading('Быц 22, 1'), gospel: reading('Мц 9, 1') };
  const open = (docs, diocese) => {
    const loaded = createReadingsRuntime(docs).load('2026-07-02', diocese);
    const option = pickerOptionsOf('2026-07-02', diocese).find((item) => item.id === 'our-lady-budslav');
    const query = pickerRouteFor(option, '2026-07-02', 'readings', { today: '2000-01-01' }).query || {};
    return { screen: screenFor(loaded, query), loaded, default: screenFor(loaded, {}) };
  };
  // with the document linked to every Budslav option (_dayIds): the proper readings are used by Minsk, Vitebsk and Pinsk
  for (const diocese of ['minsk-mohilev', 'vitebsk']) {
    assert.equal(open([linked, weekday], diocese).screen.activeGroup.documents[0].id, linked.id, `${diocese} opens the Budslav readings`);
  }
  // Grodno (optional memorial; the 2027 calendar has a weekday): the weekday readings, Budslav as an alternative
  for (const diocese of ['grodno', 'pinsk']) {
    const optional = open([linked, weekday], diocese);
    assert.equal(optional.screen.activeGroup.documents[0].id, weekday.id);
    assert.ok(optional.screen.groups.some((group) => group.documents.some((doc) => doc.id === linked.id)));
  }
  // as published today (`_dayId` of Minsk only, no `_dayIds`): the other dioceses cannot find the document
  const { _dayIds: _unlinked, ...published } = linked;
  for (const diocese of ['vitebsk', 'pinsk', 'grodno']) {
    const groups = open([published, weekday], diocese).screen.groups;
    assert.ok(!groups.some((group) => group.documents.some((doc) => doc.id === linked.id)), `${diocese}: not reachable without the link`);
  }
  assert.ok(open([published, weekday], 'minsk-mohilev').screen.groups.some((group) => group.documents.some((doc) => doc.id === linked.id)));
});

test('source correction: «Мк 22, 1–10» printed under «паводле Мацвея» is read as «Мц 22, 1–10»; nothing else is touched', () => {
  assert.equal(CITATION_CORRECTIONS.length, 1);
  const parsed = { sets: [{ sections: [{ kind: 'gospel', bible: 'Мк 22, 1–10' }, { kind: 'reading', bible: 'Мк 22, 1–10', alternatives: [{ bible: 'Мк 22, 1–10' }] }] }] };
  assert.equal(applySourceCorrections('4865', parsed).length, 3);
  assert.equal(parsed.sets[0].sections[0].bible, 'Мц 22, 1–10');
  const other = { sets: [{ sections: [{ bible: 'Мк 22, 1–10' }] }] };
  assert.equal(applySourceCorrections('4866', other).length, 0);
  assert.equal(other.sets[0].sections[0].bible, 'Мк 22, 1–10');
});
