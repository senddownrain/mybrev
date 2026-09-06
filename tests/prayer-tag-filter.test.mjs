import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPrayerTags } from '../src/utils/prayerTagFilter.js';

test('a multi-tag category includes prayers matching any of its tags', () => {
  const categoryTags = ['Сакрамэнты', 'Благаслаўленне'];

  assert.equal(matchesPrayerTags(['Сакрамэнты'], categoryTags), true);
  assert.equal(matchesPrayerTags(['Благаслаўленне'], categoryTags), true);
  assert.equal(matchesPrayerTags(['Сакрамэнты', 'Благаслаўленне'], categoryTags), true);
  assert.equal(matchesPrayerTags(['Іншае'], categoryTags), false);
});

test('an empty tag selection does not filter out prayers', () => {
  assert.equal(matchesPrayerTags(['Іншае'], []), true);
});
