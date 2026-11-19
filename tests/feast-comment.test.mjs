import test from 'node:test';
import assert from 'node:assert/strict';
import { isRankOnlyFeastComment, visibleFeastComment } from '../src/utils/feastComment.js';

test('Christ the King and Christmas: the rank is not a second comment', () => {
  for (const text of [
    'Урачыстасць', ' Урачыстасць ', '<p>Урачыстасць</p>',
    'Урачыстасць.', '&nbsp;Урачыстасць&nbsp;',
  ]) {
    assert.equal(isRankOnlyFeastComment(text), true, text);
    assert.equal(visibleFeastComment(text), '', text);
  }
});

test('rank-only feast and memorial comments are also suppressed', () => {
  for (const text of ['Свята', 'Успамін', 'Неабавязковы ўспамін']) {
    assert.equal(visibleFeastComment(text), '');
  }
});

test('substantive comments and other one-word comments remain unchanged', () => {
  for (const text of [
    'Урачыстасць Пана нашага Езуса Хрыста.',
    '<p>Урачыстасць. У гэты дзень адпуст у святыні.</p>',
    'Апякун',
    'Урачыстасць і свята',
  ]) {
    assert.equal(isRankOnlyFeastComment(text), false, text);
    assert.equal(visibleFeastComment(text), text, text);
  }
});

test('empty and non-string values are not interpreted as rank labels', () => {
  for (const value of [null, undefined, 42, {}, '']) {
    assert.equal(isRankOnlyFeastComment(value), false);
    assert.equal(visibleFeastComment(value), '');
  }
});
