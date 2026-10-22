import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedWording, PROPER_ID, PROPER_COLLECTION, verifyLiveDocument,
} from '../scripts/ordo/patch-john-paul-ii-2026.mjs';

test('22 October: owner-approved text agrees in both source copies', () => {
  const patch = expectedWording();
  assert.equal(PROPER_ID, '22-10-sv-john-paul-ii');
  assert.equal(PROPER_COLLECTION, 'liturgicalProperTexts');
  assert.deepEqual(Object.keys(patch).sort(), ['officeOfReadingsPr', 'officeOfReadingsR2']);
  assert.ok(patch.officeOfReadingsPr.after.includes('паводле Тваёй волі святы Ян Павел ІІ, папа, кіраваў усім Касцёлам'));
  assert.ok(patch.officeOfReadingsR2.after.includes('Адчыніце дзверы Хрысту!'));
  assert.ok(patch.officeOfReadingsPr.before.includes('святога Ян Павел ІІ, папа'));
  assert.ok(patch.officeOfReadingsR2.before.includes('Адчыніце дзверы Хрусту!'));
});

test('single-document update accepts only old or already-corrected fields', () => {
  const patch = expectedWording();
  const old = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v.before]));
  const updated = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v.after]));
  assert.deepEqual(verifyLiveDocument(old, patch).sort(), Object.keys(patch).sort());
  assert.deepEqual(verifyLiveDocument(updated, patch), []);
  assert.deepEqual(verifyLiveDocument({ ...old, officeOfReadingsPr: updated.officeOfReadingsPr }, patch), ['officeOfReadingsR2']);
  assert.throws(() => verifyLiveDocument({ ...old, officeOfReadingsPr: 'unverified prayer' }, patch), /Unexpected production/);
  assert.throws(() => verifyLiveDocument(null, patch), /Missing/);
});
