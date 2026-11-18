import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFourDevotions, validateContent } from '../scripts/validate-four-devotions.mjs';

test('four liturgical PDF extracts pass offline Markdown structure and SHA checks', async () => {
  const report = await prepareFourDevotions();
  assert.equal(report.mode, 'OFFLINE_DRY_RUN');
  assert.equal(report.writesPerformed, 0);
  assert.equal(report.snapshotChecked, false);
  assert.equal(report.candidates.length, 4);
  assert.deepEqual(report.candidates.map(({ decision }) => decision), Array(4).fill('PENDING_SNAPSHOT'));
  assert.ok(report.candidates.every(({ errors }) => errors.length === 0));
  assert.ok(report.blockers.some((value) => value.includes('No local snapshot')));
  assert.equal(new Set(report.candidates.map(({ id }) => id)).size, 4);
});

test('validator rejects unsafe / malformed rubrics, missing stations and H1 duplicates', () => {
  const errors = validateContent('# Duplicate title\n\n:::rubric\n:::rubric\n:::\n## Heading\n', 'devotion-euharystychnaja-pracesija');
  assert.ok(errors.some((message) => message.includes('nested rubric')));
  assert.ok(errors.some((message) => message.includes('redundant title')));
  assert.ok(errors.some((message) => message.includes('Першы прыпынак')));
});
