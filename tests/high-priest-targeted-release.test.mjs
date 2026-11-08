import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  HIGH_PRIEST_ID, HIGH_PRIEST_FIELDS, HIGH_PRIEST_BEFORE, HIGH_PRIEST_AFTER,
  planHighPriestTargetedRelease,
} from '../scripts/content/high-priest-targeted-plan.mjs';

const digest = hashes => createHash('sha256')
  .update(Object.keys(hashes).sort().map(id => id + '\t' + hashes[id] + '\n').join(''))
  .digest('hex').slice(0, 16);
const hashDay = day => HIGH_PRIEST_FIELDS.every(k => day[k] === 'from-day')
  ? HIGH_PRIEST_AFTER : HIGH_PRIEST_BEFORE;
const ops = {
  schemaVersion: 1, documentHash: hashDay, collectionDigest: digest,
  validateDay: () => true,
};
function fixture() {
  const day = {
    id: HIGH_PRIEST_ID, _feast: HIGH_PRIEST_ID, _rank: 'festum',
    sext1R: 'Гбр 7, 26-27', sext1Pr: 'Full Lauds conclusion. Амэн.',
    sext2R: '1 П 2, 4-5', sext3R: '1 П 2, 9-10',
    ...Object.fromEntries(HIGH_PRIEST_FIELDS.map(k => [k, null])),
  };
  const hashes = { [HIGH_PRIEST_ID]: HIGH_PRIEST_BEFORE, 'ordinary-w8-d5': 'abcd' };
  const sizes = { [HIGH_PRIEST_ID]: 400, 'ordinary-w8-d5': 200 };
  const days = { collection: 'days', hashes, sizes, digest: digest(hashes), version: 9 };
  const current = {
    schemaVersion: 1, contentVersion: 1800000000000, publishedAt: 'old-date',
    collections: {
      days: { digest: days.digest, count: 2, bytes: 600, version: 9 },
      prayers: { digest: 'untouched', count: 30, version: 4 },
    },
  };
  return { day, days, current, now: 1800000000100, ops };
}
test('one-document release contains only 12 explicit references', () => {
  const input = fixture();
  const old = structuredClone(input);
  const plan = planHighPriestTargetedRelease(input);
  assert.equal(plan.kind, 'safe-targeted-patch');
  assert.deepEqual(plan.changed, [HIGH_PRIEST_ID]);
  assert.equal(Object.keys(plan.set).length, 12);
  assert.deepEqual(new Set(Object.values(plan.set)), new Set(['from-day']));
  assert.equal(plan.after, HIGH_PRIEST_AFTER);
  assert.equal(plan.nextDays.hashes['ordinary-w8-d5'], 'abcd');
  assert.equal(plan.nextDays.sizes['ordinary-w8-d5'], 200);
  assert.equal(plan.nextCurrent.collections.prayers.digest, 'untouched');
  assert.equal(plan.nextDays.version, 10);
  assert.equal(plan.nextCurrent.collections.days.count, 2);
  assert.equal(plan.nextCurrent.collections.days.digest, plan.nextDigest);
  assert.equal(plan.nextDigest, digest(plan.nextDays.hashes));
  assert.deepEqual(input.day, old.day);
  assert.deepEqual(input.days, old.days);
  assert.deepEqual(input.current, old.current);
});
test('already published state is idempotent and never writes again', () => {
  const input = fixture();
  const proposed = planHighPriestTargetedRelease(input);
  input.day = { ...input.day, ...proposed.set };
  input.days = proposed.nextDays;
  input.current = proposed.nextCurrent;
  const plan = planHighPriestTargetedRelease(input);
  assert.equal(plan.kind, 'already-published');
  assert.deepEqual(plan.changed, []);
});
test('refuses unexpected edits in the actual day', () => {
  const input = fixture();
  input.day.sext1Hymn = 'unexpected proper';
  assert.throws(() => planHighPriestTargetedRelease(input), /one of the 12/);
});
test('refuses target that differs from published baseline', () => {
  const input = fixture();
  input.days.hashes[HIGH_PRIEST_ID] = 'someone-else';
  input.days.digest = digest(input.days.hashes);
  input.current.collections.days.digest = input.days.digest;
  assert.throws(() => planHighPriestTargetedRelease(input), /published hash differs/);
});
test('refuses inconsistent manifest summary, digest and version', () => {
  for (const change of [
    x => { x.current.collections.days.bytes = 1; },
    x => { x.days.digest = 'incorrect'; },
    x => { x.current.collections.days.version++; },
    x => { x.days.sizes['extra-document'] = 2; },
    x => { x.current.schemaVersion++; },
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => planHighPriestTargetedRelease(input), /REFUSED/);
  }
});
test('refuses patch if day already changed but manifest is stale', () => {
  const input = fixture();
  input.day = { ...input.day, ...Object.fromEntries(HIGH_PRIEST_FIELDS.map(k => [k, 'from-day'])) };
  assert.throws(() => planHighPriestTargetedRelease(input), /live day hash changed/);
});
test('current content version remains monotonic', () => {
  const input = fixture();
  input.current.contentVersion = input.now + 9999;
  const plan = planHighPriestTargetedRelease(input);
  assert.equal(plan.contentVersion, input.current.contentVersion + 1);
});
