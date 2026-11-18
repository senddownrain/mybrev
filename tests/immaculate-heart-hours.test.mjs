/**
 * Regression: Immaculate Heart (13 June 2026) must never be an empty Office.
 * Both a missing movable days document and an incomplete legacy document
 * assemble via the same memorial rules as fixed celebrations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, findResolvedDayById } from '../src/utils/ordoDayOptions.js';
import { daysFixture, templatesFixture } from './helpers/ordo-days-fixture.mjs';
import calendar from '../src/data/ordo/calendar-definitions.json' with { type: 'json' };

const DATE = '2026-06-13';
const CODE = 'feast-heartofmary';
const DIOCESES = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];

function setup(diocese) {
  const resolved = resolveRuntimeDay(DATE, { diocese });
  const { context, daysResult } = daysFixture(resolved);
  return { resolved, context, daysResult };
}

function build(state, diocese) {
  return buildOrdoDayOptions({
    ...state, date: DATE, diocese, templates: templatesFixture(),
  });
}

test('calendar registers Marian Common for the movable memorial', () => {
  const heart = calendar.celebrations.find((item) => item.id === 'immaculate-heart');
  assert.deepEqual(heart.templates, ['blessed-virgin-mary']);
  assert.equal(heart.defaultTemplate, 'blessed-virgin-mary');
  assert.equal(heart.daysRef._feast, CODE);
});

test('missing movable Proper keeps canonical route and assembles non-empty Lauds', () => {
  for (const diocese of DIOCESES) {
    const state = setup(diocese);
    assert.ok([state.resolved.primary, ...state.resolved.alternatives].some((item) => item.id === 'immaculate-heart'));
    state.daysResult.dynamicDaysByFeast.set(CODE, []);
    const built = build(state, diocese);
    const heart = built.dayOptions.find((item) => item.ordo.optionId === 'immaculate-heart');
    assert.ok(heart, `missing heart card in ${diocese}`);
    assert.equal(heart.dayId, CODE);
    assert.equal(heart.ordo.missingProper, true);
    assert.equal(heart.day.laudesPs1, state.daysResult.periodFallback.laudesPs1);
    assert.ok(heart.day.laudesHymn, 'weekday hymn');
    assert.ok(heart.day.laudesPr, 'prayer from Marian Common');
    assert.equal(heart.day.officeOfReadingsTeDeum, '');
    assert.ok(heart.templates.some((item) => item.choice === 'blessed-virgin-mary'));
    assert.ok(findResolvedDayById({ dayOptions: built.dayOptions }, CODE));
    assert.ok(findResolvedDayById({ dayOptions: built.dayOptions }, 'immaculate-heart'), 'old route alias');
  }
});

test('incomplete legacy Proper retains its own texts but fills gaps from the correct source', () => {
  const state = setup('pinsk');
  const raw = {
    id: CODE, _feast: CODE, _feastName: 'Беззаганнае Сэрца Найсв. Панны Марыі',
    laudesHymn: '<p>Уласны гімн</p>', laudesPr: '<p>Уласная малітва</p>',
    laudesPs1: '', laudesR: '',
  };
  const inherited = {
    ...state.daysResult.periodFallback, ...raw,
    laudesPs1: state.daysResult.periodFallback.laudesPs1,
    laudesR: state.daysResult.periodFallback.laudesR,
  };
  state.daysResult.dynamicDaysByFeast.set(CODE, [inherited]);
  state.daysResult.rawDynamicDaysByFeast = new Map([[CODE, [raw]]]);
  const built = build(state, 'pinsk');
  const heart = built.dayOptions.find((item) => item.ordo.optionId === 'immaculate-heart');
  assert.ok(heart);
  assert.equal(heart.day.laudesHymn, raw.laudesHymn);
  assert.equal(heart.day.laudesPr, raw.laudesPr);
  assert.equal(heart.day.laudesPs1, state.daysResult.periodFallback.laudesPs1);
  assert.equal(heart.day.laudesR, state.daysResult.periodFallback.laudesR);
  assert.equal(heart.dayId, CODE);
  assert.equal(heart.ordo.missingProper, undefined);
  const marian = heart.templates.find((item) => item.choice === 'blessed-virgin-mary');
  assert.ok(marian);
  assert.equal(marian.day.laudesHymn, raw.laudesHymn);
  assert.notEqual(marian.day.laudesR, state.daysResult.periodFallback.laudesR);
});

test('13 June 2026 retains both memorial choices and the weekday option when both are optional', () => {
  const state = setup('pinsk');
  const built = build(state, 'pinsk');
  const ids = built.dayOptions.map((item) => item.ordo.optionId);
  assert.ok(ids.includes('immaculate-heart'));
  assert.ok(ids.includes('sv-anthony-padua'));
  // With two competing obligatory memorials the current approved calendar
  // makes both optional; the ordinary weekday also remains a legitimate choice.
  assert.ok(built.dayOptions.some((item) => item.ordo.kind === 'temporal'));
});

test('Sacred Heart solemnity still uses the legacy dynamic document path', () => {
  const date = '2026-06-12';
  const resolved = resolveRuntimeDay(date, { diocese: 'pinsk' });
  const { context, daysResult } = daysFixture(resolved);
  const built = buildOrdoDayOptions({ resolved, context, daysResult, date, diocese: 'pinsk' });
  const sacred = built.dayOptions.find((item) => item.ordo.optionId === 'sacred-heart');
  assert.ok(sacred);
  assert.equal(sacred.day.vesperHymn, 'hymn feast-heartofjesus');
});
