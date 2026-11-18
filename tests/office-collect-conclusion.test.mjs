import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import { expandOfficeCollectConclusion as expand, FULL_OFFICE_COLLECT_CONCLUSION as full } from '../src/utils/officeCollectConclusion.js';

const text = html => parse(html).text.replace(/\s+/gu, ' ').trim();
test('18 November basilicas Lauds collect receives the full liturgical ending', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../patchs/feasts/18-11-dedication-basilicas-peter-paul.json', import.meta.url), 'utf8')).laudesPr;
  assert.equal(text(source).endsWith('Праз Пана нашага.'), true);
  const formatted = expand(source);
  assert.ok(text(formatted).endsWith(full));
  assert.match(formatted, /захавай Твой Касцёл пад апекаю/);
  assert.equal(expand(formatted), formatted);
});
test('the chosen alternative is independent and each short ending is complete', () => {
  const short = '<p>Першы тэкст. Праз Пана нашага.</p><hr><p>Другі тэкст. Праз Пана нашага.</p>';
  const formatted = parse(expand(short));
  assert.equal(formatted.querySelectorAll('p').length, 2);
  for (const paragraph of formatted.querySelectorAll('p')) assert.ok(paragraph.text.endsWith(full));
  assert.equal((formatted.toString().match(/<hr/gu)||[]).length, 1);
});
test('preserves inline typography and rejects non-terminal or different formulas', () => {
  const source = '<p><em>Малітва.</em> Праз <span>Пана нашага.</span></p>';
  // A split-at-inline-tag formula is not reconstructed without source approval.
  assert.equal(expand(source), source);
  const styled = '<p><em>Малітва.</em> <span>Праз Пана нашага.</span></p>';
  assert.ok(text(expand(styled)).endsWith(full));
  for (const unchanged of [
    '<p>Малітва. Праз Хрыста, Пана нашага. Амэн.</p>',
    '<p>Малітва. Праз Пана нашага Езуса Хрыста, Твайго Сына, які з Табою жыве і валадарыць у еднасці Духа Святога, Бог, праз усе вякі вечныя. Амэн.</p>',
    '<p>Цытата: Праз Пана нашага. А цяпер працяг.</p>',
    '<p>Малітва. Праз Пана нашага. Амэн.</p>',
    '<p>Малітва. Які з Табою жыве і валадарыць.</p>',
  ]) assert.equal(expand(unchanged), unchanged);
});
test('plain text and a single html div work without repeating Amen', () => {
  const plain = 'Прымi, Пане, нашыя малітвы. Праз Пана нашага.';
  assert.equal(expand(plain), 'Прымi, Пане, нашыя малітвы. '+full);
  const wrapped = '<div>Прымi, Пане, нашыя малітвы. Праз Пана нашага.</div>';
  assert.ok(text(expand(wrapped)).endsWith(full));
});
