/**
 * Stage 4–5 integration: the Hours `dayOptions`, the Office descriptors and
 * the Readings plan are all built from ONE ResolvedLiturgicalDay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  complineWeekday, planReadings, resolveRuntimeDay,
} from '../src/utils/ordo/runtime.js';
import { orderReadingsByPlan, readingQueriesOfPlan } from '../src/utils/ordo/readingsPlan.js';
import { allowsOfficeForDead, buildOrdoDayOptions, findOptionByDayId } from '../src/utils/ordoDayOptions.js';
import { assembleFirstVespers, eveningVespersModel } from '../src/utils/liturgicalVespers.js';
import { getCompletoriumWeekday, shouldShowTeDeum } from '../src/utils/liturgicalOffice.js';
import { readFileSync } from 'node:fs';
import { generateLiturgicalYear } from '../src/utils/ordo/index.js';
import {
  buildYearOptions, compareStoredYearOptions, getGeneratableYears, isSupportedOrdoYear,
} from '../src/utils/liturgicalMovableDates.js';
import { daysFixture, templatesFixture } from './helpers/ordo-days-fixture.mjs';
import { celebrationTextContext } from '../src/utils/ordoScreen.js';

test('reference texts retain their own prayer and all Common choices in every diocese', () => {
  for (const [date, id, docId] of [
    ['2026-12-06', 'sv-nicholas', '06-12-sv-nicholas'],
    ['2026-03-17', 'sv-patryk', '17-03-sv-patryk'],
  ]) {
    const proper = JSON.parse(readFileSync(new URL(`../patchs/db-feasts/${docId}.json`, import.meta.url), 'utf8'));
    for (const diocese of ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']) {
      const resolved = celebrationTextContext(date, id, { diocese });
      const { context, daysResult } = daysFixture(resolved);
      const built = buildOrdoDayOptions({ resolved, context, date, diocese, templates: templatesFixture(), daysResult: {
        ...daysResult, properDays: [{ ...proper, id: docId }],
      } });
      const option = built.dayOptions.find((item) => item.ordo.optionId === id);
      assert.ok(option, `${id} ${diocese}`);
      assert.equal(option.ordo.optionId, id);
      assert.ok(option.templates.some((item) => item.choice === 'current-day'));
      assert.ok(option.templates.some((item) => item.choice === 'pastors'));
      for (const template of option.templates) {
        assert.deepEqual(template.day.laudesPr, proper.laudesPr || proper.officeOfReadingsPr, `${id} ${diocese} ${template.id}`);
        assert.equal(template.day._celebrationId, id);
      }
    }
  }
});

const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];

function content(date, diocese = 'minsk-mohilev') {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved);
  const built = buildOrdoDayOptions({ resolved, daysResult, context, date, diocese });
  return { resolved, context, ...built };
}

/** The Hours day as `useResolvedLiturgicalDay` returns it for a card. */
function hoursDay(built, index = 0) {
  const option = built.dayOptions[index];
  return { ...option.day, _ordo: findOptionByDayId(built, option.dayId)?.ordo };
}

function* daysOf(year) {
  for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 86400000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

test('Hours and Readings receive the same resolved identity for a date', () => {
  ['2026-01-28', '2026-02-18', '2026-04-05', '2026-06-13', '2026-08-15', '2026-11-12', '2026-12-21', '2027-01-10']
    .forEach((date) => DIOCESES.forEach((diocese) => {
      const built = content(date, diocese);
      const plan = planReadings(resolveRuntimeDay(date, { diocese }));
      assert.equal(built.dayOptions[0].ordo.optionId, plan.primaryOptionId, `${date} ${diocese}`);
      assert.equal(built.ordo.primary.id, plan.primaryOptionId);
      assert.deepEqual(
        built.dayOptions.filter((option) => option.ordo.role !== 'votive').map((option) => option.ordo.optionId),
        plan.options.map((option) => option.optionId).filter((id) => built.dayOptions.some((o) => o.ordo.optionId === id)),
      );
      // Choosing a card routes the readings to the same option.
      built.dayOptions.filter((option) => option.ordo.role !== 'votive').forEach((option) => {
        const selected = planReadings(resolveRuntimeDay(date, { diocese }), { dayId: option.dayId });
        if (option.ordo.kind !== 'temporal' || !option.ordo.missingProper) {
          assert.ok([option.ordo.optionId, plan.primaryOptionId].includes(selected.selectedOptionId), `${date} ${option.dayId}`);
        }
      });
    }));
});

test('dayOptions only contain legal Offices; a weekday never competes with an obligatory memorial or feast', () => {
  DIOCESES.forEach((diocese) => {
    for (const date of daysOf(2026)) {
      const built = content(date, diocese);
      const { resolved } = built;
      const legal = new Set([resolved.primary, ...resolved.alternatives].map((item) => item.id));
      const cards = built.dayOptions.filter((option) => option.ordo.role !== 'votive');
      cards.forEach((option) => assert.ok(legal.has(option.ordo.optionId), `${diocese} ${date} ${option.ordo.optionId}`));
      assert.equal(cards[0].ordo.optionId, resolved.primary.id, `${diocese} ${date} primary first`);
      if (resolved.primary.kind !== 'temporal') {
        assert.ok(!cards.some((option) => option.ordo.kind === 'temporal'), `${diocese} ${date}: weekday card next to ${resolved.primary.id}`);
      }
      // Suppressed candidates and commemorations never become cards.
      [...resolved.suppressed, ...resolved.commemorations].forEach((item) => {
        assert.ok(!cards.some((option) => option.ordo.optionId === item.id), `${diocese} ${date} ${item.id}`);
      });
      // A fixed document of another diocese is never offered.
      cards.forEach((option) => option.templates.forEach((template) => {
        const places = [template.day?._place].flat().filter(Boolean);
        assert.ok(!places.length || places.includes(diocese), `${diocese} ${date} ${template.id}`);
      }));
    }
  });
});

test('display resolver cases on real days documents', () => {
  const aquinas = content('2026-01-28');
  assert.deepEqual(aquinas.dayOptions.map((option) => option.ordo.optionId), ['sv-thomas-aquinas']);
  const hilary = content('2026-01-13');
  assert.deepEqual(hilary.dayOptions.map((option) => option.ordo.optionId).slice(0, 2), ['temporal:ordinary-w1-d3', 'sv-hilary']);
  // Common variants of one celebration are template choices of ONE card.
  const basil = content('2027-01-02');
  assert.equal(basil.dayOptions.filter((option) => option.ordo.optionId === 'sv-basil-gregory-nazianzen').length, 1);
  assert.ok(basil.dayOptions[0].templates.length >= 2);
  // 17–24 December: the seasonal date document is the Office; the saint is a commemoration.
  const canisius = content('2026-12-21');
  assert.equal(canisius.dayOptions[0].day.id, 'advent-21-12');
  assert.deepEqual(canisius.dayOptions[0].ordo.commemorations.map((item) => item.id), ['sv-peter-canisius']);
  assert.ok(!canisius.dayOptions.some((option) => option.ordo.optionId === 'sv-peter-canisius'));
  // Sunday + feast: Advent Sunday only (St Andrew is omitted).
  assert.deepEqual(content('2025-11-30').dayOptions.map((option) => option.ordo.optionId), ['temporal:advent-w1-d1']);
});

test('Office for the Dead is a votive option only on ordinary weekdays', () => {
  assert.ok(content('2026-01-13').dayOptions.some((option) => option.key === 'office-for-dead'));
  assert.ok(!content('2026-01-28').dayOptions.some((option) => option.key === 'office-for-dead'));
  assert.ok(!content('2026-03-04').dayOptions.some((option) => option.key === 'office-for-dead'));
  assert.ok(!content('2026-02-01').dayOptions.some((option) => option.key === 'office-for-dead'));
  const allSouls = content('2026-11-02');
  assert.equal(allSouls.dayOptions[0].ordo.optionId, 'all-faithful-departed');
  assert.ok(allowsOfficeForDead(allSouls.resolved));
});

test('I Vespers by liturgical right, II vs I Vespers conflict', () => {
  // Saturday → Sunday.
  const saturday = hoursDay(content('2026-01-17'));
  assert.equal(saturday._ordo.vespers.type, 'first');
  const sunday = content('2026-01-18');
  const model = eveningVespersModel(saturday, sunday, { isoWeekday: 6 });
  assert.equal(model.firstVespers.sourceDayId, sunday.dayOptions[0].day.id);
  // A weekday feast has no I Vespers (Mary Magdalene, Wednesday 22.07.2026).
  const eveOfFeast = hoursDay(content('2026-07-21'));
  assert.notEqual(eveOfFeast._ordo.vespers.type, 'first');
  assert.equal(eveningVespersModel(eveOfFeast, content('2026-07-22'), { isoWeekday: 2 }).firstVespers, null);
  // A solemnity has them (Assumption 15.08.2026 is Saturday; eve is Friday).
  const eveOfAssumption = hoursDay(content('2026-08-14'));
  assert.equal(eveOfAssumption._ordo.vespers.type, 'first');
  assert.equal(eveOfAssumption._ordo.vespers.celebrationId, 'assumption-blessed-virgin-mary');
  // Assumption on Saturday: its II Vespers outrank I Vespers of the Sunday.
  const assumption = hoursDay(content('2026-08-15'));
  assert.equal(assumption._ordo.vespers.type, 'second');
  assert.equal(eveningVespersModel(assumption, content('2026-08-16'), { isoWeekday: 6 }).second, true);
  // A feast of the Lord on a Sunday has I Vespers (Transfiguration, 6.08.2028).
  assert.equal(hoursDay(content('2028-08-05'))._ordo.vespers.celebrationId, 'transfiguration-lord');
  // An optional memorial alternative keeps its own Vespers; tomorrow's I Vespers still win.
  const hilary = content('2026-01-13');
  const memorial = hoursDay(hilary, hilary.dayOptions.findIndex((option) => option.ordo.optionId === 'sv-hilary'));
  assert.equal(memorial._ordo.vespers.type, 'of-the-day');
});

test('I Vespers are assembled from Proper/Common when no vesper1 texts exist', () => {
  const proper = { id: 'x', vesperHymn: 'H', vesperAnt1: 'A1', vesperPr: 'P' };
  const built = assembleFirstVespers(proper);
  assert.equal(built.vesperHymn, 'H');
  assert.equal(built._firstVespersSource, 'proper');
  const mixed = assembleFirstVespers({ ...proper, vesper1Hymn: 'H1' });
  assert.equal(mixed.vesperHymn, 'H1');
  assert.equal(mixed.vesperAnt1, 'A1');
  assert.equal(mixed._firstVespersSource, 'vesper1+proper');
});

test('Compline and Te Deum follow the descriptor flags', () => {
  const weekday = (date, index = 0) => hoursDay(content(date), index);
  assert.equal(getCompletoriumWeekday(weekday('2026-08-15'), 7), 1); // solemnity → after II Vespers
  assert.equal(getCompletoriumWeekday(weekday('2026-08-14'), 6), 7); // eve → after I Vespers
  assert.equal(getCompletoriumWeekday(weekday('2026-04-02'), 5), 1); // Holy Thursday
  assert.equal(getCompletoriumWeekday(weekday('2026-04-07'), 3), 1); // Easter octave
  assert.equal(getCompletoriumWeekday(weekday('2026-07-22'), 4), 4); // feast → weekday
  assert.equal(getCompletoriumWeekday(weekday('2026-12-29'), 3), 1); // Christmas octave (Sunday Compline)
  assert.equal(getCompletoriumWeekday(weekday('2026-11-18'), 4), 4); // ordinary weekday
  assert.equal(complineWeekday('current-weekday', 5), 5);
  assert.equal(shouldShowTeDeum(weekday('2026-01-28')), false); // memorial
  assert.equal(shouldShowTeDeum(weekday('2026-07-22')), true); // feast
  assert.equal(shouldShowTeDeum(weekday('2026-03-08')), false); // Lent Sunday
  assert.equal(shouldShowTeDeum(weekday('2026-12-29')), true); // Christmas octave
});

test('same date in two dioceses gives different Offices and readings plans', () => {
  const vitebsk = content('2026-11-12', 'vitebsk');
  const grodno = content('2026-11-12', 'grodno');
  assert.equal(vitebsk.dayOptions[0].ordo.officeKind, 'solemnity');
  assert.equal(grodno.dayOptions[0].ordo.officeKind, 'memorial');
  assert.ok(vitebsk.dayOptions[0].templates.every((template) => [template.day._place].flat().includes('vitebsk')));
  const pinsk = content('2026-08-22', 'pinsk');
  const minsk = content('2026-08-22', 'minsk-mohilev');
  assert.equal(pinsk.ordo.primary.id, 'our-lady-queen');
  assert.equal(minsk.ordo.primary.id, 'our-lady-queen');
  assert.equal(planReadings(pinsk.resolved).primaryOptionId, planReadings(minsk.resolved).primaryOptionId);
});

test('readings follow the engine lookup order (no independent priority)', () => {
  const resolved = resolveRuntimeDay('2026-01-28', { diocese: 'minsk-mohilev' });
  const plan = planReadings(resolved);
  const specs = readingQueriesOfPlan(plan).map((spec) => spec.field);
  assert.ok(specs.includes('period') && specs.includes('_date'));
  const docs = [
    { id: 'saint', _date: '28.01', title: 'Св. Тамаша Аквінскага, прэзбітэра і доктара Касцёла' },
    { id: 'other-saint', _date: '28.01', title: 'Св. Іншага' },
    { id: 'weekday', _periodType: 'ordinary', _periodWeekNumber: 3, _dayOfWeek: 4, year: '2' },
    { id: 'weekday-1', _periodType: 'ordinary', _periodWeekNumber: 3, _dayOfWeek: 4, year: '1' },
  ];
  const selectVariants = (list) => list.filter((doc) => !doc.year || doc.year === plan.cycle);
  // Obligatory memorial: weekday readings first, the saint's as a choice (GIRM 357, all four calendars).
  assert.deepEqual(orderReadingsByPlan(plan, docs, { selectVariants }).map((doc) => doc.id), ['weekday']);
  assert.deepEqual(
    orderReadingsByPlan(plan, docs, { includeAlternatives: true, selectVariants }).map((doc) => doc.id),
    ['weekday', 'weekday-1', 'saint'],
  );
  // A document explicitly linked to the chosen Hours card comes first.
  const linked = [...docs, { id: 'linked', _date: '28.01', _dayIds: ['28-01-sv-thomas-aquinas'] }];
  assert.equal(orderReadingsByPlan(plan, linked, { dayId: '28-01-sv-thomas-aquinas', includeAlternatives: true })[0].id, 'linked');
  // Sunday + suppressed feast: the feast's readings are not offered.
  const andrew = planReadings(resolveRuntimeDay('2025-11-30', { diocese: 'vitebsk' }));
  assert.ok(!andrew.options.some((option) => option.optionId === 'sv-andrew-apostle'));
  assert.equal(andrew.cycle, 'A');
});

test('Firestore yearOptions never override computed dates; a discrepancy is only reported', () => {
  assert.deepEqual(compareStoredYearOptions(2026).discrepancies, []);
  const same = compareStoredYearOptions(2026, { year: 2026, easterSunday: '2026-04-05' });
  assert.deepEqual(same.discrepancies, []);
  const stale = compareStoredYearOptions(2026, { year: 2026, ascension: '2026-05-17' });
  assert.equal(stale.options.ascension, '2026-05-14', 'computed value wins');
  assert.equal(stale.source, 'computed');
  assert.deepEqual(stale.discrepancies, [{ field: 'ascension', computed: '2026-05-14', stored: '2026-05-17' }]);
});

test('any future year is generated without a stored yearOptions document', () => {
  for (const year of [2031, 2050, 2100, 2199]) {
    const options = buildYearOptions(year);
    assert.equal(options.year, year);
    assert.match(options.easterSunday, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number(options.ordintaryWeeks1) >= 4 && Number(options.ordintaryWeeks2) <= 34);
    const days = generateLiturgicalYear(year, { diocese: 'minsk-mohilev' });
    assert.equal(days.length, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
    assert.equal(days.find((day) => day.date === options.easterSunday).primary.feastCode, 'feast-eastersunday');
  }
  const years = getGeneratableYears(2026);
  assert.equal(years[0], 2036);
  assert.ok(years.includes(2026) && years.includes(2020));
  assert.equal(isSupportedOrdoYear(2150), true);
  assert.equal(isSupportedOrdoYear(1500), false);
  // Runtime stores do not read the legacy collection any more.
  for (const file of ['src/stores/calendar.js', 'src/stores/liturgical.js', 'src/utils/refreshSavedContent.js']) {
    assert.ok(!/['"]yearOptions['"]/.test(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')), file);
  }
});
