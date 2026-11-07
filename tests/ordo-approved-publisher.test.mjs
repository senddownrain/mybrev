import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  APPROVED_OPERATIONS_HASH, validateSealedPlan, stateFromSnapshot, verifyBefore, buildForwardWrites,
  expectedAfter, verifyAfter, rollbackBlueprint, applyApprovedPlan,
} from '../scripts/ordo/publish-approved-calendar.mjs';

const plan = JSON.parse(await fs.readFile(new URL('../reports/ordo-approved/PRODUCTION_PATCH_PLAN.json', import.meta.url)));
const snapshot = process.env.APPROVED_CALENDAR_TEST_SNAPSHOT;
const baseline = snapshot ? await stateFromSnapshot(snapshot) : null;
const clone = value => structuredClone(value);
const timestamp = '2026-11-07T15:00:00.000Z';
const result = { commitTime: timestamp, writeResults: plan.operations.map((op, i) => ({ updateTime: timestamp,
  ...(i === 71 ? { transformResults: [{ timestampValue: timestamp }] } : {}) })) };
const post = () => {
  const state = expectedAfter(plan, baseline, timestamp);
  for (const op of plan.operations) { const [c, id] = op.path.split('/'); state.collections[c].find(x => x.id === id).updateTime = timestamp; }
  return state;
};
const withSnapshot = { skip: !baseline && 'Requires explicitly provided private local snapshot; never fetches Firestore for tests' };

test('sealed publisher accepts exactly 72 approved operations with strict masks and no deletes', () => {
  assert.deepEqual(validateSealedPlan(plan), { update: 26, create: 3, disable: 42, 'publish-meta': 1 });
  const writes = buildForwardWrites(plan);
  assert.equal(writes.length, 72);
  assert.ok(writes.every(x => x.update && x.currentDocument && !x.delete));
  assert.equal(writes.filter(x => x.currentDocument.exists === false).length, 3);
  assert.equal(writes[71].updateTransforms[0].setToServerValue, 'REQUEST_TIME');
});

test('altered hash, foreign project, revision, scope, extra fields and ignored-metadata injection all fail closed', () => {
  for (const mutate of [
    p => { p.operationsSha256 = 'bad'; },
    p => { p.projectId = 'other-project'; },
    p => { p.targetMeta.revision = 5; },
    p => { p.targetMeta.notesRevision = 6; },
    p => { p.operations[0].path = 'days/not-authorized'; },
    p => { p.operations[0].fields.userRole = { after: 'admin' }; },
    p => { const op = p.operations.find(x => x.fields.source); op.fields.source.after.updatedAt = 'injected'; },
    p => { p.operations[0].fields.title.after = 'unapproved'; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateSealedPlan(changed)); }
});

test('every baseline ID, hash, updateTime and every operation precondition matches offline', withSnapshot, () => {
  assert.deepEqual(verifyBefore(plan, baseline, baseline), []);
});

test('changed document, updateTime, ID or collection size prevents publication', withSnapshot, () => {
  for (const mutate of [
    s => { s.collections.liturgicalCelebrations[0].data.title = 'changed'; },
    s => { s.collections.liturgicalCelebrations[0].updateTime = timestamp; },
    s => { s.collections.liturgicalCelebrations[0].id = 'changed-id'; },
    s => { s.collections.liturgicalDioceseOverrides.pop(); },
    s => { s.collections.liturgicalCelebrations[0].data.importedAt = new Date(timestamp); },
  ]) { const changed = clone(baseline); mutate(changed); assert.ok(verifyBefore(plan, baseline, changed).length); }
});

test('already applied revision 4, independent notes revision 6 and wrong schema are refused', withSnapshot, () => {
  for (const patch of [{ revision: 4 }, { notesRevision: 6 }, { schemaVersion: 99 }]) {
    const changed = clone(baseline); Object.assign(changed.collections.liturgicalCalendarMeta[0].data, patch);
    assert.throws(() => verifyBefore(plan, baseline, changed));
  }
});

test('post-commit verifier checks all scoped documents and every one of the 72 outcomes', withSnapshot, () => {
  const state = post(); const manifest = verifyAfter(plan, baseline, state, result);
  assert.equal(manifest.operations.length, 72); assert.equal(manifest.operationsSha256, APPROVED_OPERATIONS_HASH);
  assert.ok(manifest.operations.every(x => x.result === 'VERIFIED'));
  state.collections.liturgicalYearOverrides.find(x => x.data.enabled === false).data.enabled = true;
  assert.throws(() => verifyAfter(plan, baseline, state, result));
  assert.throws(() => verifyAfter(plan, baseline, post(), { ...result, writeResults: result.writeResults.slice(1) }));
});

test('one atomic commit only; a failure of one write leaves the entire fake database unchanged', withSnapshot, async () => {
  let state = clone(baseline); const original = JSON.stringify(state); let commits = 0; let attempts = 0;
  const transport = { begin: async () => 'transaction', capture: async () => clone(state), release: async () => {},
    commit: async writes => { commits++; assert.equal(writes.length, 72); throw Error('one operation precondition failed atomically'); } };
  await assert.rejects(applyApprovedPlan({ plan, baseline, transport, recordAttempt: async () => { attempts++; } }));
  assert.equal(commits, 1); assert.equal(attempts, 1); assert.equal(JSON.stringify(state), original);
  commits = 0; state.collections.liturgicalCalendarMeta[0].data.notesRevision = 6;
  await assert.rejects(applyApprovedPlan({ plan, baseline, transport, recordAttempt: async () => { attempts++; } }));
  assert.equal(commits, 0);
});

test('success performs exactly one commit; readback failure never retries or automatically rolls back data', withSnapshot, async () => {
  let commits = 0; let captures = 0; let releases = 0;
  const transport = { begin: async () => 'transaction', capture: async () => ++captures === 1 ? clone(baseline) : post(), release: async () => { releases++; },
    commit: async () => { commits++; return result; } };
  const output = await applyApprovedPlan({ plan, baseline, transport, recordAttempt: async () => {} });
  assert.equal(output.manifest.revision, 4); assert.equal(commits, 1); assert.equal(releases, 0);
  captures = 0; transport.capture = async () => { if (++captures === 1) return clone(baseline); throw Error('readback failed'); };
  await assert.rejects(applyApprovedPlan({ plan, baseline, transport, recordAttempt: async () => {} }));
  assert.equal(commits, 2); assert.equal(releases, 0);
});

test('rollback blueprint restores old fields under revision 5, disables created IDs and preserves notes4 independently', withSnapshot, () => {
  const rollback = rollbackBlueprint(plan, baseline); const state = post();
  for (const op of rollback.operations) {
    const [c, id] = op.path.split('/'); const doc = state.collections[c].find(x => x.id === id);
    for (const [field, value] of Object.entries(op.fields)) {
      if (value.afterAbsent) delete doc.data[field]; else doc.data[field] = value.afterTransform ? new Date(timestamp) : clone(value.after);
    }
  }
  const meta = state.collections.liturgicalCalendarMeta[0].data;
  assert.equal(meta.revision, 5); assert.equal(meta.notesRevision, 4);
  for (const op of plan.operations.filter(x => x.action === 'create')) {
    const [c, id] = op.path.split('/'); assert.equal(state.collections[c].find(x => x.id === id).data.enabled, false);
  }
  for (const c of Object.keys(baseline.collections).filter(c => c !== 'liturgicalCalendarMeta')) {
    for (const doc of baseline.collections[c]) assert.deepEqual(state.collections[c].find(x => x.id === doc.id).data, doc.data);
  }
});
