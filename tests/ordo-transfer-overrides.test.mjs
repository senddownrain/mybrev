/**
 * Final phase §11 (collisions) and §12 (transfers materialized as editable
 * Year Overrides).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateLiturgicalYear, getYearPlan, resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import {
  buildTransferOverrideTargets, computedTransfers, confirmTransferOverride, planTransferOverrides,
} from '../src/utils/ordo/transferOverrides.js';
import { normalizeYearOverride, validateYearOverride } from '../src/utils/ordo/yearOverrides.js';
import { DIOCESAN_SOLEMNITY_RANK_EVIDENCE } from '../src/data/ordo/transfer-rank-evidence.js';
import { automaticTransfers } from '../src/utils/ordo/overridePreview.js';

const BY = (diocese = 'minsk-mohilev', extra = {}) => ({ country: 'BY', diocese, ...extra });
const optionIds = (day) => [day.primary, ...day.alternatives].map((item) => item.id);

// ---------------------------------------------------------------------------
// §11 collisions
// ---------------------------------------------------------------------------

test('All Souls on a Sunday: Hours of the Sunday, Mass of All Souls with 3 reading sets (§11.1)', () => {
  const day = resolveLiturgicalDate('2025-11-02', BY());
  assert.equal(Number(day.dayOfWeek), 1);
  assert.equal(day.primary.id, 'all-faithful-departed');
  assert.equal(day.sources.split, true);
  assert.equal(day.sources.mass.optionId, 'all-faithful-departed');
  assert.equal(day.sources.office.kind, 'temporal');
  assert.equal(day.sources.office.officeKind, 'sunday');
  assert.equal(day.officeResolution.primary.officeKind, 'sunday');
  assert.equal(day.officeResolution.primary.teDeum, true);
  assert.deepEqual(day.officeOptions.map((item) => item.id), [day.sources.office.optionId]);
  assert.equal(day.officeResolution.evening.vespers.type, 'second');
  assert.equal(day.readingResolution.primary.optionId, 'all-faithful-departed');
  assert.equal(day.readingResolution.primary.variants.length, 3);
  assert.ok(day.appliedRules.some((rule) => rule.rule === 'all-souls-sunday-split'));
  // On a weekday nothing is split.
  const weekday = resolveLiturgicalDate('2026-11-02', BY());
  assert.equal(weekday.sources.split, false);
  assert.equal(weekday.officeResolution.primary.optionId, 'all-faithful-departed');
  assert.equal(weekday.readingResolution.primary.variants.length, 3);
});

test('Immaculate Heart + obligatory memorial: exactly two memorial choices, NO weekday (13.06.2026)', () => {
  ['minsk-mohilev', 'vitebsk', 'pinsk'].forEach((diocese) => {
    const day = resolveLiturgicalDate('2026-06-13', BY(diocese));
    assert.deepEqual(optionIds(day), ['immaculate-heart', 'sv-anthony-padua'], diocese);
    assert.ok([day.primary, ...day.alternatives].every((item) => item.rankKind === 'memorial'));
    assert.ok(!day.officeOptions.some((item) => item.kind === 'temporal'));
  });
  assert.deepEqual(optionIds(resolveLiturgicalDate('2027-06-05', BY('grodno'))), ['immaculate-heart', 'sv-boniface']);
});

test('Mary, Mother of the Church + obligatory memorial: both offered, Marian first, no weekday (§11.3)', () => {
  const day = resolveLiturgicalDate('2028-06-05', BY());
  assert.deepEqual(optionIds(day), ['mary-mother-church', 'sv-boniface']);
  assert.ok(!optionIds(day).some((id) => id.startsWith('temporal:')));
  // Also against a proper (row 11) obligatory memorial.
  const layer = {
    add: [{
      id: 'test-proper-memorial', title: 'Тэставы ўспамін', rank: 'memoria', category: 'saint', layer: 'diocese',
      dioceseId: 'minsk-mohilev', date: { type: 'fixed', month: 5, day: 25 }, color: 'albus',
    }],
  };
  const proper = resolveLiturgicalDate('2026-05-25', BY('minsk-mohilev', { dioceseLayer: layer }));
  assert.deepEqual(optionIds(proper), ['mary-mother-church', 'test-proper-memorial']);
});

test('Christ the High Priest + another feast: both kept, provisional (§11.4)', () => {
  const layer = {
    add: [{
      id: 'test-feast', title: 'Тэставае свята', rank: 'festum', category: 'saint', layer: 'diocese',
      dioceseId: 'minsk-mohilev', date: { type: 'fixed', month: 5, day: 28 }, color: 'albus',
    }],
  };
  const day = resolveLiturgicalDate('2026-05-28', BY('minsk-mohilev', { dioceseLayer: layer }));
  assert.deepEqual(optionIds(day).sort(), ['christ-the-high-priest', 'test-feast']);
  assert.ok(day.alternatives.every((item) => item.provisional));
  assert.ok(!day.suppressed.some((item) => item.id === 'christ-the-high-priest' || item.id === 'test-feast'));
  assert.ok(day.appliedRules.some((rule) => rule.rule === 'christ-high-priest-collision-both-options' && rule.status === 'provisional'));
});

// ---------------------------------------------------------------------------
// §12 transfers → Year Overrides
// ---------------------------------------------------------------------------

const targetOf = (targets, celebrationId, year) => targets.find((item) => item.targetCelebrationId === celebrationId && item.year === year);

test('St Joseph in Holy Week: computed transfer + materialized auto override (case B)', () => {
  const targets = buildTransferOverrideTargets({ years: [2035] });
  const joseph = targetOf(targets, 'sv-joseph', 2035);
  assert.equal(joseph.transferCase, 'joseph-holy-week');
  assert.equal(joseph.scope, 'belarus');
  assert.deepEqual([joseph.originalDate, joseph.computedDate, joseph.effectiveDate], ['2035-03-19', '2035-03-17', '2035-03-17']);
  assert.equal(joseph.source, 'auto-transfer');
  assert.equal(joseph.status, 'needs-review');
  assert.equal(joseph.enabled, true);
  assert.deepEqual(validateYearOverride(joseph), []);
  // The engine reads the record and keeps the same result.
  const day = resolveLiturgicalDate('2035-03-17', BY('minsk-mohilev', { yearOverrides: [joseph] }));
  assert.equal(day.primary.id, 'sv-joseph');
  assert.equal(day.primary.transferOverride.status, 'needs-review');
});

test('Annunciation impeded: computed transfer + materialized auto override (case C)', () => {
  const record = targetOf(buildTransferOverrideTargets({ years: [2027] }), 'annunciation-lord', 2027);
  assert.equal(record.transferCase, 'annunciation');
  assert.equal(record.computedDate, '2027-04-05');
  assert.equal(record.id, 'auto-transfer-2027-belarus-annunciation-lord');
});

test('diocesan patron transfers only with a source-confirmed solemnity rank (case A)', () => {
  const bobola = targetOf(buildTransferOverrideTargets({ years: [2027] }), 'sv-andrei-bobola', 2027);
  assert.equal(bobola.scope, 'diocese');
  assert.equal(bobola.dioceseId, 'pinsk');
  assert.equal(bobola.transferCase, 'diocesan-solemnity');
  assert.equal(bobola.computedDate, '2027-05-18');
  assert.deepEqual(bobola.rankEvidence, ['pinsk:2026-05-16:c0']);
  // An unconfirmed diocesan solemnity is impeded without transfer.
  const layer = {
    add: [{
      id: 'test-patron', title: 'Тэставы апякун', rank: 'solemnitas', category: 'saint', layer: 'diocese',
      dioceseId: 'pinsk', date: { type: 'fixed', month: 5, day: 16 }, color: 'albus',
    }],
  };
  const plan = getYearPlan(2027, BY('pinsk', { dioceseLayer: layer }));
  assert.ok(!plan.transfers.some((item) => item.celebrationId === 'test-patron'));
  const day = resolveLiturgicalDate('2027-05-16', BY('pinsk', { dioceseLayer: layer }));
  const patron = day.suppressed.find((item) => item.id === 'test-patron');
  assert.equal(patron.reason, 'impeded-without-transfer');
  assert.equal(patron.transferBlocked, 'rank-not-source-confirmed');
});

test('every rank confirmation is a solemnity printed by that diocese', () => {
  Object.entries(DIOCESAN_SOLEMNITY_RANK_EVIDENCE).forEach(([diocese, items]) => {
    const evidence = JSON.parse(fs.readFileSync(new URL(`../src/data/ordo/evidence/${diocese}.json`, import.meta.url), 'utf8'));
    const byId = new Map(evidence.days.flatMap((day) => day.celebrations).map((item) => [item.id, item]));
    Object.entries(items).forEach(([celebrationId, ids]) => ids.forEach((id) => {
      assert.equal(byId.get(id)?.rank, 'solemnitas', `${diocese} ${celebrationId} ${id}`);
    }));
  });
});

test('Lord solemnity collision: the Lord stays, the other solemnity transfers (case D)', () => {
  const record = targetOf(buildTransferOverrideTargets({ years: [2033] }), 'nativity-john-baptist', 2033);
  assert.equal(record.transferCase, 'coinciding-solemnities');
  assert.deepEqual([record.originalDate, record.computedDate], ['2033-06-24', '2033-06-25']);
  assert.equal(resolveLiturgicalDate('2033-06-24', BY()).primary.id, 'sacred-heart');
  assert.equal(resolveLiturgicalDate('2033-06-25', BY()).primary.id, 'nativity-john-baptist');
});

test('auto materialization is idempotent', () => {
  const years = [2027, 2028, 2033, 2035];
  const targets = buildTransferOverrideTargets({ years });
  const first = planTransferOverrides(targets, [], { years });
  assert.equal(first.counts.create, targets.length);
  const second = planTransferOverrides(buildTransferOverrideTargets({ years }), first.documents, { years });
  assert.equal(second.counts.create, 0);
  assert.equal(second.counts.update, 0);
  assert.equal(second.counts.unchanged, targets.length);
  assert.equal(second.documents.length, first.documents.length);
  // A stale computedDate of a pending auto record is updated (only that one).
  const docs = first.documents.map(({ id, data }) => ({
    id, data: id === 'auto-transfer-2027-belarus-annunciation-lord' ? { ...data, computedDate: '2027-04-06', effectiveDate: '2027-04-06' } : data,
  }));
  const third = planTransferOverrides(targets, docs, { years });
  assert.deepEqual(third.operations.filter((item) => item.action === 'update').map((item) => item.id), ['auto-transfer-2027-belarus-annunciation-lord']);
});

test('a manual-confirmed override survives regeneration and controls the effective date', () => {
  const years = [2027];
  const targets = buildTransferOverrideTargets({ years });
  const auto = targetOf(targets, 'annunciation-lord', 2027);
  const manual = confirmTransferOverride(auto, { effectiveDate: '2027-04-06', sourceNote: 'гадавы каляндар' });
  assert.equal(manual.source, 'manual');
  assert.equal(manual.status, 'confirmed');
  assert.equal(manual.computedDate, '2027-04-05');
  assert.equal(manual.effectiveDate, '2027-04-06');
  const plan = planTransferOverrides(targets, [{ id: auto.id, data: manual }], { years });
  const op = plan.operations.find((item) => item.id === auto.id);
  assert.equal(op.action, 'keep-manual');
  assert.equal(plan.documents.find((item) => item.id === auto.id).data.effectiveDate, '2027-04-06');
  // The engine follows the manual date, the transfer record keeps the computed one.
  const context = BY('minsk-mohilev', { yearOverrides: [manual] });
  assert.equal(resolveLiturgicalDate('2027-04-06', context).primary.id, 'annunciation-lord');
  assert.notEqual(resolveLiturgicalDate('2027-04-05', context).primary.id, 'annunciation-lord');
  const transfer = getYearPlan(2027, context).transfers.find((item) => item.celebrationId === 'annunciation-lord');
  assert.equal(transfer.to, '2027-04-06');
  assert.equal(transfer.computedDate, '2027-04-05');
  assert.equal(transfer.override.source, 'manual');
});

test('materialized auto records do not change the generated year', () => {
  const targets = buildTransferOverrideTargets({ years: [2027] });
  ['minsk-mohilev', 'pinsk'].forEach((diocese) => {
    const plain = generateLiturgicalYear(2027, BY(diocese));
    const withRecords = generateLiturgicalYear(2027, BY(diocese, { yearOverrides: targets }));
    plain.forEach((day, index) => assert.deepEqual(optionIds(withRecords[index]), optionIds(day), `${diocese} ${day.date}`));
  });
  const rows = automaticTransfers(2027, { diocese: 'pinsk' });
  assert.ok(rows.some((item) => item.celebrationId === 'sv-andrei-bobola' && item.computedDate === '2027-05-18'));
  assert.ok(computedTransfers(2027, { diocese: 'pinsk' }).every((item) => item.transferCase));
});

test('legacy from/to overrides normalize to one canonical representation', () => {
  const legacy = {
    year: 2026, scope: 'diocese', dioceseId: 'minsk-mohilev', targetCelebrationId: 'sv-stanislaus-bishop-martyr',
    action: 'move', from: '2026-04-11', to: '2026-04-16', reason: 'r', source: 'Мінскі каляндар 2026',
  };
  const canonical = normalizeYearOverride(legacy);
  assert.equal(canonical.originalDate, '2026-04-11');
  assert.equal(canonical.effectiveDate, '2026-04-16');
  assert.equal(canonical.source, 'manual');
  assert.equal(canonical.status, 'confirmed');
  assert.equal(canonical.sourceNote, 'Мінскі каляндар 2026');
  assert.deepEqual(validateYearOverride(legacy), []);
  const modern = { ...canonical, from: undefined, to: undefined };
  const a = resolveLiturgicalDate('2026-04-16', BY('minsk-mohilev', { dataYearOverrides: false, yearOverrides: [legacy] }));
  const b = resolveLiturgicalDate('2026-04-16', BY('minsk-mohilev', { dataYearOverrides: false, yearOverrides: [modern] }));
  assert.deepEqual(optionIds(a), optionIds(b));
  assert.ok(optionIds(a).includes('sv-stanislaus-bishop-martyr'));
  assert.ok(validateYearOverride({ ...modern, effectiveDate: undefined }).length);
  assert.ok(validateYearOverride({ ...canonical, source: 'auto-transfer', action: 'suppress' }).length);
});
