import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixedCalendar, normalizeFixedRank } from '../src/constants/fixedCalendar.js';
import { BELARUS_LAYER, DIOCESAN_LAYERS } from '../src/data/ordo/layers.js';
import { YEAR_OVERRIDES } from '../src/data/ordo/year-overrides.js';
import { resolveLiturgicalDate, getYearPlan } from '../src/utils/ordo/index.js';
import { getDiocesanFixedLayers, getUniversalFixedCelebrations } from '../src/utils/ordo/fixedCelebrations.js';
import { validateYearOverride } from '../src/utils/ordo/yearOverrides.js';

const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const evidence = Object.fromEntries(DIOCESES.map((id) => [
  id, JSON.parse(fs.readFileSync(new URL(`../src/data/ordo/evidence/${id}.json`, import.meta.url), 'utf8')),
]));
const items = new Map();
DIOCESES.forEach((diocese) => evidence[diocese].days.forEach((day) => day.celebrations.forEach((item) => {
  items.set(item.id, { ...item, date: day.date, diocese });
})));
const notes = JSON.parse(fs.readFileSync(new URL('../src/data/ordo/notes.json', import.meta.url), 'utf8')).notes;

test('every diocesan layer entry is proven by an evidence item with the same rank', () => {
  Object.entries(DIOCESAN_LAYERS).forEach(([diocese, layer]) => {
    [...layer.add, ...layer.modify].forEach((entry) => {
      assert.ok(entry.evidence?.length, `${diocese}:${entry.id} has no evidence`);
      entry.evidence.forEach((itemId) => {
        const item = items.get(itemId);
        assert.ok(item, `${itemId} missing`);
        assert.equal(item.diocese, diocese, itemId);
        if (entry.rank) assert.equal(item.rank, entry.rank, `${itemId} rank`);
        if (entry.mmdd) assert.equal(item.date.slice(5), entry.mmdd, `${itemId} date`);
      });
    });
  });
});

test('layers never copy the universal calendar', () => {
  const universal = new Set(getUniversalFixedCelebrations().map((item) => item.id));
  Object.values(DIOCESAN_LAYERS).forEach((layer) => layer.add.forEach((entry) => {
    assert.ok(!universal.has(entry.id), `${entry.id} is universal: use modify`);
  }));
  BELARUS_LAYER.modify.forEach((entry) => assert.ok(universal.has(entry.id), `${entry.id} modifies nothing`));
  Object.entries(DIOCESAN_LAYERS).forEach(([diocese, layer]) => layer.modify.forEach((entry) => {
    const derived = (getDiocesanFixedLayers()[diocese]?.add || []).some((item) => item.id === entry.id);
    assert.ok(universal.has(entry.id) || derived || entry.id === 'mary-mother-church', `${entry.id} modifies nothing`);
  }));
});

test('year overrides are valid, proven and not computable transfers', () => {
  YEAR_OVERRIDES.forEach((override) => {
    assert.deepEqual(validateYearOverride(override), []);
    override.evidence.forEach((itemId) => {
      const item = items.get(itemId);
      assert.ok(item, itemId);
      assert.equal(item.date, override.to);
      assert.equal(item.diocese, override.dioceseId);
    });
    const day = resolveLiturgicalDate(override.to, { diocese: override.dioceseId });
    const celebrated = [day.primary, ...day.alternatives, ...day.commemorations].map((item) => item.id);
    assert.ok(celebrated.includes(override.targetCelebrationId), `${override.targetCelebrationId} on ${override.to}`);
    // Without the override the engine would not place it there.
    const plain = resolveLiturgicalDate(override.to, { diocese: override.dioceseId, dataYearOverrides: false });
    assert.ok(![plain.primary, ...plain.alternatives, ...plain.commemorations].some((item) => item.id === override.targetCelebrationId));
  });
});

test('fixedCalendar fixes found by stage 2', () => {
  const find = (date, fragment) => fixedCalendar.filter((item) => item.date === date && item.title.includes(fragment));
  assert.equal(normalizeFixedRank(find('22.07', 'Магдалены')[0].rank), 'festum');
  assert.equal(normalizeFixedRank(find('02.11', 'памерлых')[0].rank), 'commemoratio-defunctorum');
  [
    ['27.02', 'Нарэцкага'], ['05.09', 'Калькуты'], ['17.09', 'Хільдэгарды'], ['05.10', 'Фаўстыны'],
    ['11.10', 'XXIII'], ['10.05', 'Авільскага'], ['29.07', 'Лазара'], ['09.12', 'Куаўхтлатаацына'], ['10.12', 'Ларэтанскай'], ['12.12', 'Гвадэлупы'],
  ].forEach(([date, fragment]) => assert.equal(find(date, fragment).length, 1, `${date} ${fragment}`));
  assert.equal(find('06.06', 'Баніфацыя').length, 0, 'Vitebsk keeps St Boniface on 5 June');
  const day = resolveLiturgicalDate('2026-07-22', { diocese: 'vitebsk' });
  assert.equal(day.primary.id, 'sv-mary-magdalene');
  assert.equal(day.primary.officeKind, 'feast');
});

test('diocesan data layers change only their diocese', () => {
  const pinsk = resolveLiturgicalDate('2026-08-22', { diocese: 'pinsk' });
  const minsk = resolveLiturgicalDate('2026-08-22', { diocese: 'minsk' });
  assert.equal(pinsk.primary.id, 'our-lady-lahishyn');
  assert.equal(pinsk.primary.officeKind, 'solemnity');
  assert.equal(minsk.primary.id, 'our-lady-queen');
  const grodno = resolveLiturgicalDate('2027-04-23', { diocese: 'grodno' });
  assert.equal(grodno.primary.id, 'sv-george-martyr');
  assert.equal(resolveLiturgicalDate('2027-04-24', { diocese: 'grodno' }).primary.id, 'sv-adalbert-wojciech-bishop-martyr');
  assert.equal(resolveLiturgicalDate('2027-04-23', { diocese: 'vitebsk' }).primary.kind, 'temporal');
  const plan = getYearPlan(2027, { diocese: 'grodno' });
  assert.equal(plan.celebrationDates.get('sv-stanislaus-bishop-martyr').date, '2027-05-08');
});

test('the real notes.json is accepted as context.notes', () => {
  const easter = resolveLiturgicalDate('2026-04-05', { diocese: 'pinsk', notes });
  assert.ok(easter.ordoNotes.length > 0);
  easter.ordoNotes.forEach((note) => assert.ok(!note.scope.dioceseId || note.scope.dioceseId === 'pinsk'));
  const christmas = resolveLiturgicalDate('2026-12-25', { diocese: 'minsk', notes });
  assert.ok(christmas.ordoNotes.some((note) => note.selector.celebrationId === 'naradzhenne-pana'
    || note.selector.type === 'fixed-date'));
  const firstFriday = resolveLiturgicalDate('2027-01-01', { diocese: 'vitebsk', notes });
  assert.ok(Array.isArray(firstFriday.ordoNotes));
});

test('Belarus layer changes are proven in every diocese that prints them', () => {
  BELARUS_LAYER.modify.filter((entry) => entry.rank).forEach((entry) => {
    assert.ok(entry.evidence.length >= 3, entry.id);
    entry.evidence.forEach((itemId) => assert.equal(items.get(itemId)?.rank, entry.rank, itemId));
  });
});
