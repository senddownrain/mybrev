import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReadingHighlights, saveReadingHighlights, readingHighlightDocumentKey, sentenceRanges, READING_HIGHLIGHTS_KEY } from '../src/utils/readingHighlights.js';
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
test('highlights are isolated by document, Mass set and cycle; saving and removing retains other documents', () => {
  const store = storage();
  const keys = [{ id: 'a' }, { id: 'b' }, { id: 'a', _setId: 'vigil' }, { id: 'a', _setId: 'vigil', year: 'A' }].map(readingHighlightDocumentKey);
  assert.equal(new Set(keys).size, 4);
  keys.forEach((key, index) => saveReadingHighlights(key, { sentence: ['amber', 'rose', 'sky', 'leaf'][index] }, store));
  assert.equal(Object.keys(loadReadingHighlights(store)).length, 4);
  saveReadingHighlights(keys[0], {}, store);
  assert.deepEqual(loadReadingHighlights(store)[keys[0]], {});
  assert.deepEqual(loadReadingHighlights(store)[keys[3]], { sentence: 'leaf' });
  assert.equal(readingHighlightDocumentKey({}), '');
});
test('invalid and inaccessible storage does not break reading; unknown colours are discarded', () => {
  const store = storage();
  for (const value of ['{', 'null', '[]', 'false']) {
    store.setItem(READING_HIGHLIGHTS_KEY, value);
    assert.deepEqual(loadReadingHighlights(store), {});
  }
  saveReadingHighlights('doc', { a: 'amber', b: 'red' }, store);
  assert.deepEqual(loadReadingHighlights(store).doc, { a: 'amber' });
  const broken = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
  assert.deepEqual(loadReadingHighlights(broken), {});
  assert.doesNotThrow(() => saveReadingHighlights('doc', { a: 'sky' }, broken));
});
test('Belarusian sentences retain exact text, punctuation and offsets', () => {
  const text = 'Ён сказаў: «Слухайце!» Другое сказанне.\nТрэцяе пытанне? Апошняе';
  const ranges = sentenceRanges(text);
  assert.equal(ranges.length, 4);
  assert.equal(ranges.map(({ start, end }) => text.slice(start, end)).join(''), text);
});
test('sentence fallback works on browsers without Intl.Segmenter', () => {
  const segmenter = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    const text = 'Першы сказ. Другі сказ? Апошні';
    const ranges = sentenceRanges(text);
    assert.equal(ranges.length, 3);
    assert.equal(ranges.map(({ start, end }) => text.slice(start, end)).join(''), text);
  } finally { Intl.Segmenter = segmenter; }
});
