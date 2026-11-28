import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyPlan, planFieldPatch, valueHash } from '../scripts/liturgy/lib/field-patch.mjs';

const change = (field, before, after) => ({
  collection: 'days', document: 'a', field, before, after,
  beforeSha256: valueHash(before), afterSha256: valueHash(after),
});
const patch = { changes: [change('x', 'old', 'new'), change('y', null, 'added')] };
const docs = (data) => new Map([['days/a', data]]);

test('field patch: updates only listed fields, is idempotent and reversible', () => {
  const state = docs({ x: 'old', keep: 1 });
  const plan = planFieldPatch(patch, state);
  assert.deepEqual(plan.summary, { documents: 1, fields: 2, noop: 0, create: 0, delete: 0 });
  applyPlan(plan, state);
  assert.deepEqual(state.get('days/a'), { x: 'new', y: 'added', keep: 1 });
  assert.equal(planFieldPatch(patch, state).summary.noop, 2);
  const rollback = { changes: [change('x', 'new', 'old'), change('y', 'added', null)] };
  applyPlan(planFieldPatch(rollback, state), state);
  assert.deepEqual(state.get('days/a'), { x: 'old', keep: 1 });
});

test('field patch: a changed or missing target blocks everything', () => {
  for (const state of [docs({ x: 'edited meanwhile' }), docs(undefined)]) {
    const plan = planFieldPatch(patch, state);
    assert.ok(plan.conflicts.length);
    assert.throws(() => applyPlan(plan, state), /nothing applied/);
  }
});

test('reviewed Advent manifest: calendar revision matches the bundled definitions', () => {
  const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  const manifest = read('../reports/liturgy/advent-christmas-2026/manifest.json');
  const revision = manifest.changes.find((item) => item.document === 'current' && item.field === 'revision');
  assert.equal(revision.afterSha256, valueHash(read('../src/data/ordo/calendar-definitions.json').revision));
});
