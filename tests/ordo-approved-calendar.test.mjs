import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCalendarLayers } from '../src/utils/ordo/layers.js';
import { generateLiturgicalYear, getYearPlan, resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { getBundledCalendarDefinitions, getDefinitionsEpoch, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { resolveRuntimeDay, planReadings, selectFixedDocuments, selectReadingDocuments } from '../src/utils/ordo/runtime.js';
import { LOCAL_CALENDAR_REFERENCES } from '../src/data/ordo/layers.js';
import { createCalendarRevalidator } from '../src/utils/ordoRevalidation.js';
import { selectCalendarSource, selectNotesSource } from '../src/utils/ordoCalendarSource.js';

const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const visible = day => [day.primary, ...day.alternatives, ...day.commemorations];
const refs = JSON.parse(fs.readFileSync(new URL('../docs/audits/belarus-own-calendar-2026/approved-evidence/reference-2026-11-06.json', import.meta.url)));

test('all 262 source rows produce 959 approved effective assignments, including source default optional ranks', () => {
  assert.equal(refs.length, 262);
  let count = 0;
  for (const diocese of dioceses) {
    const expected = new Map();
    for (const r of refs) if (!r.dioceses || r.dioceses.split(';').includes(diocese)) expected.set(r.celebration_id, r);
    if (diocese === 'vitebsk') expected.delete('nativity-blessed-virgin-mary');
    const actual = buildCalendarLayers({ diocese }).celebrations;
    for (const [id, r] of expected) {
      const c = actual.get(id);
      assert.ok(c && !c.suppressedBy, `${diocese}/${id}`);
      assert.equal(c.rank, r.rank, `${diocese}/${id}`);
      if (/^\d\d-\d\d$/.test(r.date)) {
        assert.deepEqual(c.date, { type: 'fixed', month: Number(r.date.slice(0, 2)), day: Number(r.date.slice(3)) }, `${diocese}/${id}`);
      }
      count++;
    }
  }
  assert.equal(count, 959);
});

test('2025–2035 × four dioceses: all roles, Vespers, Office and Mass refs; 23 scoped assignments absent', () => {
  assert.equal(LOCAL_CALENDAR_REFERENCES.length, 23);
  let count = 0; let hearts = 0;
  for (const diocese of dioceses) for (let year = 2025; year <= 2035; year++) {
    const excluded = new Set(LOCAL_CALENDAR_REFERENCES.filter(x => x.dioceseId === diocese).map(x => x.id));
    for (const day of generateLiturgicalYear(year, { diocese })) {
      count++;
      assert.equal(new Set(visible(day).map(x => x.id)).size, visible(day).length, `${diocese} ${day.date}`);
      assert.ok(!visible(day).some(x => excluded.has(x.id)), `${diocese} ${day.date}`);
      assert.ok(day.officeResolution.primary && day.officeResolution.evening.vespers);
      assert.equal(planReadings(day).primaryOptionId, day.primary.id);
      assert.ok(day.readingResolution.primary.lookup.length);
      if (day.appliedRules.some(x => x.rule === 'immaculate-heart-both-optional')) {
        hearts++;
        assert.equal(day.primary.kind, 'temporal');
        assert.ok(day.alternatives.filter(x => ['immaculate-heart', 'sv-boniface', 'sv-anthony-padua', 'sv-aloysius-gonzaga'].includes(x.id))
          .every(x => x.rank === 'memoria-ad-libitum'));
      }
    }
  }
  assert.equal(count, 16068);
  assert.equal(hearts, 20); // The 21st old case (Grodno Albert 17.06.2034) was an excluded annual assignment.
  const remaining = resolveLiturgicalDate('2034-06-17', { diocese: 'grodno' });
  assert.equal(remaining.primary.id, 'immaculate-heart');
  assert.equal(remaining.primary.rank, 'memoria');
  assert.ok(!visible(remaining).some(x => x.id === 'sv-albert-chmielowski'));
});

test('8 September is Braslau only in Vitebsk, Nativity elsewhere, with Nativity Office/Mass source', () => {
  for (const year of [2026, 2027, 2028]) for (const diocese of dioceses) {
    const day = resolveRuntimeDay(`${year}-09-08`, { diocese });
    assert.equal(day.primary.id, diocese === 'vitebsk' ? 'our-lady-braslau' : 'nativity-blessed-virgin-mary');
    assert.equal(day.primary.rank, 'festum');
    assert.equal(day.alternatives.length, 0);
    assert.equal(day.officeResolution.primary.firstVespers.byRight, false);
    const option = planReadings(day).options[0];
    assert.equal(option.readingsRef._date, '08.09');
    if (diocese === 'vitebsk') {
      assert.equal(option.readingsRef.celebrationId, 'nativity-blessed-virgin-mary');
      const docs = [{ id: 'nativity-reading', _date: '08.09', title: 'Нараджэнне Найсв. Панны Марыі', gospel: 'verified source' }];
      assert.deepEqual(selectReadingDocuments(option.lookup[0], day.primary, docs), docs);
      const own = { id: '08-09-our-lady-braslau-vitebsk', _schema: 2, _date: '08.09', _rank: 'festum', officeOfReadingsPr: 'own approved prayer' };
      const base = { id: '08-09-nativity-blessed-virgin-mary', _schema: 2, _date: '08.09', officeOfReadings1: 'verified Nativity text' };
      const selected = selectFixedDocuments(day.primary, [own, base], { diocese });
      assert.equal(selected[0].id, own.id);
      assert.equal(selected[0].officeOfReadingsPr, own.officeOfReadingsPr);
      assert.equal(selected[0].officeOfReadings1, base.officeOfReadings1);
    }
  }
});

test('16 November 2026/2027, Mother Church and cancelled manual moves', () => {
  for (const year of [2026, 2027]) for (const diocese of dioceses) {
    const day = resolveLiturgicalDate(`${year}-11-16`, { diocese });
    assert.equal(day.primary.id, 'our-lady-mother-mercy');
    assert.equal(day.primary.rank, diocese === 'grodno' ? 'solemnitas' : 'memoria');
    assert.equal(day.alternatives.length, 0);
  }
  for (const diocese of dioceses) {
    const day = resolveLiturgicalDate('2028-06-05', { diocese });
    assert.equal(day.primary.id, 'mary-mother-church');
    assert.equal(day.primary.rank, 'memoria');
    assert.deepEqual(day.alternatives, []);
    assert.ok(day.suppressed.some(x => x.id === 'sv-boniface'));
  }
  for (const row of getBundledCalendarDefinitions().yearOverrides) {
    assert.equal(row.enabled, false);
    assert.ok(!visible(resolveLiturgicalDate(row.effectiveDate, { diocese: row.dioceseId })).some(x => x.id === row.targetCelebrationId));
  }
  assert.ok(getYearPlan(2027, { diocese: 'minsk-mohilev' }).transfers.some(x => x.celebrationId === 'annunciation-lord' && x.to === '2027-04-05'));
  assert.ok(getYearPlan(2035, { diocese: 'minsk-mohilev' }).transfers.some(x => x.celebrationId === 'sv-joseph' && x.to === '2035-03-17'));
});

test('Newman starts in 2026 with no spurious Leonardi content; Sopocko is a Lent commemoration', () => {
  for (const diocese of dioceses) {
    assert.ok(!visible(resolveLiturgicalDate('2025-10-09', { diocese })).some(x => x.id === 'sv-john-henry-newman'));
    const newman = resolveLiturgicalDate('2026-10-09', { diocese }).alternatives.find(x => x.id === 'sv-john-henry-newman');
    assert.ok(newman);
    assert.deepEqual(newman.daysRef.dayIds || [], []);
    assert.equal(newman.contentStatus.proper, 'missing');
    assert.deepEqual(newman.templates, ['pastors', 'doctors-of-church']);
  }
  assert.ok(resolveLiturgicalDate('2027-02-15', { diocese: 'vitebsk' }).commemorations.some(x => x.id === 'bl-michal-sopocko'));
});

test('runtime memo invalidates for an already visited date; future schema is rejected, rollback has a larger revision', () => {
  const base = getBundledCalendarDefinitions();
  try {
    const old = resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' });
    const epoch = getDefinitionsEpoch();
    setCalendarDefinitions({ ...base, revision: base.revision + 1, dioceseOverrides: base.dioceseOverrides.map(x => x.celebrationId === 'our-lady-braslau' ? { ...x, title: 'Updated approved title' } : x) });
    const next = resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' });
    assert.notEqual(old, next); assert.ok(getDefinitionsEpoch() > epoch);
    assert.equal(next.primary.title, 'Updated approved title');
    setCalendarDefinitions(base);
    assert.equal(resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' }).primary.title, 'Updated approved title');
    setCalendarDefinitions({ ...base, revision: base.revision + 2 });
    assert.equal(resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' }).primary.title, old.primary.title);
    setCalendarDefinitions({ ...base, schemaVersion: 99, revision: 999 });
    assert.equal(resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' }).primary.title, old.primary.title);
    assert.equal(selectCalendarSource({ bundled: base, cached: { ...base, schemaVersion: 99, revision: 999 } }), 'bundled');
    assert.equal(selectNotesSource({ bundledRevision: 6, meta: { notesRevision: 4 } }), 'bundled');
  } finally { setCalendarDefinitions(null); }
});

test('online revalidation bypasses complete caches on a bound, shares concurrent calls and backs off offline/failure', async () => {
  let clock = 0; let online = true; let calls = 0;
  const check = createCalendarRevalidator({ now: () => clock, interval: 100, online: () => online, run: async options => {
    calls++; assert.equal(options.revalidate, true); return true;
  } });
  await Promise.all([check(), check()]); assert.equal(calls, 1);
  await check(); assert.equal(calls, 1);
  clock = 101; await check(); assert.equal(calls, 2);
  await check({ revalidate: true }); assert.equal(calls, 3);
  online = false; clock = 300; await check({ revalidate: true }); assert.equal(calls, 3);
  online = true; await check(); assert.equal(calls, 4);
  const fail = createCalendarRevalidator({ now: () => clock, interval: 100, online: () => true, run: async () => { throw Error('offline'); } });
  await assert.rejects(fail()); assert.equal(await fail(), false);
});

test('High Priest and Christ King are different days and both follow the general Table', () => {
  const high = resolveLiturgicalDate('2026-05-28', { diocese: 'vitebsk', dioceseLayer: { add: [{
    id: 'general-marian-feast', title: 'General Marian feast', rank: 'festum', category: 'mary', layer: 'universal',
    date: { type: 'fixed', month: 5, day: 28 },
  }] } });
  assert.equal(high.primary.id, 'general-marian-feast'); // general feast row7 precedes proper feast row8
  assert.ok(high.suppressed.some(x => x.id === 'christ-the-high-priest'));
  assert.equal(high.alternatives.length, 0);
  const king = resolveLiturgicalDate('2026-11-22', { diocese: 'vitebsk', dioceseLayer: { add: [{
    id: 'competing-feast', title: 'Other feast', rank: 'festum', category: 'saint', layer: 'diocese',
    date: { type: 'fixed', month: 11, day: 22 },
  }] } });
  assert.equal(king.primary.id, 'christ-king');
  assert.equal(king.primary.rank, 'solemnitas');
  assert.equal(king.alternatives.length, 0);
  assert.ok(king.suppressed.some(x => x.id === 'competing-feast'));
});

test('old Nativity/Braslau direct links follow the single current diocesan Office, never a stale raw document', async () => {
  const { findResolvedDayById, findOptionByDayId } = await import('../src/utils/ordoDayOptions.js');
  for (const [id, other] of [['our-lady-braslau', '08-09-nativity-blessed-virgin-mary'], ['nativity-blessed-virgin-mary', '08-09-our-lady-braslau-vitebsk']]) {
    const legal = { id: `legal-${id}`, _feastName: id };
    const content = { dayOptions: [{ ordo: { optionId: id }, day: legal, templates: [{ id: legal.id, day: legal }] }],
      itemsDays: [legal, { id: other, _feastName: 'stale raw title' }] };
    assert.equal(findOptionByDayId(content, other).ordo.optionId, id);
    assert.equal(findResolvedDayById(content, other)._feastName, id);
  }
});

test('old materialized auto dates cannot undo the corrected general transfer rule', () => {
  for (const [year, from, previous, computed] of [[2027, '2027-05-16', '2027-05-18', '2027-05-17'], [2032, '2032-05-16', '2032-05-18', '2032-05-17']]) {
    const plan = getYearPlan(year, { diocese: 'pinsk', yearOverrides: [{
      id: `auto-transfer-${year}-pinsk-sv-andrei-bobola`, year, scope: 'diocese', dioceseId: 'pinsk',
      targetCelebrationId: 'sv-andrei-bobola', action: 'transfer', originalDate: from,
      computedDate: previous, effectiveDate: previous, source: 'auto-transfer', status: 'needs-review', enabled: true,
    }] });
    assert.equal(plan.transfers.find(x => x.celebrationId === 'sv-andrei-bobola').to, computed);
  }
});

test('Braslau legacy fallback is not reported as a published Proper collection', async () => {
  const { buildOrdoDayOptions } = await import('../src/utils/ordoDayOptions.js');
  const { daysFixture } = await import('./helpers/ordo-days-fixture.mjs');
  const { buildFeastTargets } = await import('../scripts/ordo/import-feasts.mjs');
  const resolved = resolveRuntimeDay('2026-09-08', { diocese: 'vitebsk' });
  const { context, daysResult } = daysFixture(resolved, { migrated: true });
  const templates = new Map(buildFeastTargets().templates.map(({ id, data }) => [id, { id, ...data }]));
  const built = buildOrdoDayOptions({ resolved, context, daysResult, templates, date: resolved.date, diocese: 'vitebsk' });
  assert.equal(built.dayOptions[0].ordo.properSource, 'legacy-days');
});
