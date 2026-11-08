import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionDigest, documentHash, storedDocument } from '../scripts/content/lib/app-content.mjs';
import { planSingleDayManifest } from '../scripts/content/publish-single-day-manifest.mjs';
import { TARGET, VESPER_FIELDS } from '../scripts/liturgy/lib/ordinary-friday-vespers.mjs';

function fixture() {
  const values = Object.fromEntries(VESPER_FIELDS.map(field => [field, 'Пятніца ІІ: ' + field]));
  const target = { _periodType: 'ordinary', _periodWeekNumber: 30, _dayOfWeek: 6, ...values };
  const source = { _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 6, ...values };
  const feast = Object.fromEntries(VESPER_FIELDS.map(field => [field.replace('vesper', 'vesper1'), 'Усіх Святых: ' + field]));
  const hashes = { [TARGET]: '0000000000000000', another: 'abcdefabcdefabcd' };
  const sizes = { [TARGET]: 777, another: 100 };
  const digest = collectionDigest(hashes);
  const index = { collection: 'days', digest, version: 3, hashes, sizes };
  const current = { schemaVersion: 1, contentVersion: 100, publishedAt: '2026-11-01T00:00:00Z',
    collections: { days: { count: 2, digest, version: 3, bytes: 877 },
      readings: { digest: 'do-not-touch', version: 5, count: 200 } } };
  return { current, index, target, source, feast, now: 1234567 };
}

test('single day patch does not publish unrelated pending documents', () => {
  const input = fixture();
  const original = structuredClone(input);
  const plan = planSingleDayManifest(input);
  assert.equal(plan.changed, true);
  assert.equal(plan.afterHash, documentHash(storedDocument(TARGET, input.target)));
  assert.equal(plan.nextIndex.hashes.another, input.index.hashes.another);
  assert.equal(plan.nextIndex.sizes.another, input.index.sizes.another);
  assert.equal(plan.nextCurrent.collections.readings.digest, 'do-not-touch');
  assert.equal(plan.nextCurrent.collections.days.digest, collectionDigest(plan.nextIndex.hashes));
  assert.equal(plan.nextCurrent.collections.days.version, 4);
  assert.deepEqual(input, original);
});

test('already published correction is a strict no-op', () => {
  const input = fixture();
  const first = planSingleDayManifest(input);
  const second = planSingleDayManifest({ ...input, current: first.nextCurrent, index: first.nextIndex });
  assert.equal(second.changed, false);
  assert.deepEqual(second.nextIndex, first.nextIndex);
  assert.deepEqual(second.nextCurrent, first.nextCurrent);
});

test('rejects still-polluted Friday and mismatch between current and index', () => {
  const input = fixture();
  input.target.vesperHymn = input.feast.vesper1Hymn;
  assert.throws(() => planSingleDayManifest(input), /Uncorrected or unexpected Friday/);
  const input2 = fixture();
  input2.current.collections.days.digest = 'stale';
  assert.throws(() => planSingleDayManifest(input2), /digests mismatch/);
});

test('rejects published manifest without target', () => {
  const input = fixture();
  delete input.index.hashes[TARGET];
  assert.throws(() => planSingleDayManifest(input), /Invalid published hashes|digests mismatch/);
});
