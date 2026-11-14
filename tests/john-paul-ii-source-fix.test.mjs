import fs from 'node:fs';
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

test('the old responsory differs only in the second occurrence, not the heading', () => {
  const { before, after } = expectedWording().officeOfReadingsR2;
  const correctPhrase = 'Адчыніце дзверы Хрысту!';
  const originalTypo = 'Адчыніце дзверы Хрусту!';
  const marker = 'Рэспансорый</span>';
  const count = (value, phrase) => value.split(phrase).length - 1;

  // Approved text legitimately uses the exact same phrase twice.
  assert.equal(count(after, correctPhrase), 2);
  assert.equal(count(after, originalTypo), 0);
  // Prior text had an already-correct heading and an incorrect responsory.
  assert.equal(count(before, correctPhrase), 1);
  assert.equal(count(before, originalTypo), 1);
  const pivot = before.indexOf(marker);
  assert.ok(pivot > 0);
  assert.ok(before.slice(0, pivot).includes(correctPhrase));
  assert.ok(!before.slice(0, pivot).includes(originalTypo));
  assert.ok(before.slice(pivot).includes(originalTypo));
  // The exact minimal edit returns the approved text with no changes elsewhere.
  assert.equal(before.replace(originalTypo, correctPhrase), after);
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

test('historical migration refuses the newer editorial responsory instead of overwriting it',()=>{
 const current=JSON.parse(fs.readFileSync('patchs/db-feasts/22-10-sv-john-paul-ii.json'));
 assert.throws(()=>verifyLiveDocument(current,expectedWording()),/Unexpected production/);
});
