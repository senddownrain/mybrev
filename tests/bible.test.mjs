import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIBLE_BOOKS,
  getBibleBook,
  getParallelBibleBook,
} from '../src/constants/bible.js';
import { bibleVerseKey, normalizeBibleVerse } from '../src/utils/bible.js';

test('Bible catalogues contain the expected canon sizes', () => {
  assert.equal(BIBLE_BOOKS.bel.length, 73);
  assert.equal(BIBLE_BOOKS.ru.length, 73);
  assert.equal(BIBLE_BOOKS.bel.filter((book) => book.testament === 'new').length, 27);
  assert.equal(BIBLE_BOOKS.ru.filter((book) => book.testament === 'new').length, 27);
  assert.ok(BIBLE_BOOKS.bel.every((book) => book.shortName.length <= 6));
  assert.ok(BIBLE_BOOKS.ru.every((book) => book.shortName.length <= 6));
});

test('Belarusian catalogue follows the Chernyavski translation', () => {
  assert.equal(getBibleBook('bel', 'tob').chapterCount, 14);
  assert.equal(getBibleBook('bel', 'sir').chapterCount, 51);
  assert.equal(getBibleBook('bel', 'dn').chapterCount, 14);
  assert.equal(
    getParallelBibleBook('ru', 'wis', 'bel').id,
    'wis',
  );
});

test('Russian catalogue includes the supplied extended chapters', () => {
  assert.equal(getBibleBook('ru', 'dn').chapterCount, 14);
  assert.equal(getBibleBook('ru', 'ps').chapterCount, 151);
  assert.equal(getBibleBook('ru', 'bar').chapterCount, 6);
});

test('parallel language navigation maps different Firestore ids', () => {
  assert.equal(getParallelBibleBook('bel', 'jn', 'ru').id, 'jo');
  assert.equal(getParallelBibleBook('ru', 'act', 'bel').id, 'acts');
  assert.equal(getParallelBibleBook('bel', 'jon', 'ru').id, 'jn');
});

test('bottom navigation labels use language-specific abbreviations', () => {
  assert.equal(getBibleBook('bel', '1ti').shortName, '1 Цім');
  assert.equal(getBibleBook('ru', '1tm').shortName, '1 Тим');
});

test('verse normalisation supports both stored schemas', () => {
  assert.deepEqual(normalizeBibleVerse('Тэкст', 2), { num: 3, text: 'Тэкст' });
  assert.deepEqual(normalizeBibleVerse({ num: 7, text: 'Тэкст' }, 0), { num: 7, text: 'Тэкст' });
  assert.deepEqual(normalizeBibleVerse({ verse: 4, text: 'Текст' }, 0), { num: 4, text: 'Текст' });
});

test('highlight keys remain isolated by language and location', () => {
  assert.equal(bibleVerseKey('bel', 'gn', 1, 1), 'bel:gn:1:1');
  assert.notEqual(bibleVerseKey('bel', 'gn', 1, 1), bibleVerseKey('ru', 'gn', 1, 1));
});
