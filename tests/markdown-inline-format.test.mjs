import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleMarkdownInlineFormat } from '../src/utils/markdownInlineFormat.js';

function apply(source, transaction) {
  const { from, to, insert } = transaction.changes;
  return `${source.slice(0, from)}${insert}${source.slice(to)}`;
}

test('bold formatting toggles off when the visible text remains selected', () => {
  const source = '**слова**';
  const transaction = toggleMarkdownInlineFormat(source, { from: 2, to: 7 }, '**');

  assert.equal(apply(source, transaction), 'слова');
  assert.deepEqual(transaction.selection, { anchor: 0, head: 5 });
  assert.equal(transaction.formatted, false);
});

test('bold formatting toggles off when Markdown markers are selected too', () => {
  const source = 'Да **слова** пасля';
  const transaction = toggleMarkdownInlineFormat(source, { from: 3, to: 12 }, '**');

  assert.equal(apply(source, transaction), 'Да слова пасля');
  assert.deepEqual(transaction.selection, { anchor: 3, head: 8 });
});

test('unformatted text receives one pair of delimiters and stays selected', () => {
  const source = 'Да слова пасля';
  const transaction = toggleMarkdownInlineFormat(source, { from: 3, to: 8 }, '**');

  assert.equal(apply(source, transaction), 'Да **слова** пасля');
  assert.deepEqual(transaction.selection, { anchor: 5, head: 10 });
  assert.equal(transaction.formatted, true);
});

test('italic formatting uses the same toggle behavior', () => {
  const source = '_слова_';
  const transaction = toggleMarkdownInlineFormat(source, { from: 1, to: 6 }, '_');

  assert.equal(apply(source, transaction), 'слова');
  assert.deepEqual(transaction.selection, { anchor: 0, head: 5 });
});

test('an empty selection inserts and selects fallback text', () => {
  const transaction = toggleMarkdownInlineFormat('', { from: 0, to: 0 }, '**', '**', 'тэкст');

  assert.equal(apply('', transaction), '**тэкст**');
  assert.deepEqual(transaction.selection, { anchor: 2, head: 7 });
});
