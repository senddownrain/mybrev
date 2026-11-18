import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { expandOfficeResponsoryRepeats as expand } from '../src/utils/officeResponsoryRepeats.js';

const turns = html => parse(html).querySelectorAll('p').map(p => p.text.replace(/\s+/gu, ' ').trim());
test('Office of Readings expands only the local starred repeat', () => {
  const source = '<p>РЭСПАНСОРЫЙ</p><p><span>Н.</span> Перш, чым убачыш * Жыві паводле веры, каб змог убачыць.</p><p>К. Калі вера не будзе тваім суцяшэннем.</p><p><span style="color:red">Н.</span> Жыві.</p>';
  const output = expand(source);
  assert.equal(turns(output).at(-1), 'Н. Жыві паводле веры, каб змог убачыць.');
  assert.equal(expand(output), output);
  assert.match(output, /style="color:red"/);
});
test('Belarusian initial ў becomes У only at the start of the repeated response', () => {
  const source = '<p>Н. Чакай * ў жыцці ў Пану будзем разам.</p><p>К. Пакуль час.</p><p>Н. У жыцці.</p>';
  const output = expand(source);
  assert.equal(turns(output).at(-1), 'Н. У жыцці ў Пану будзем разам.');
  assert.equal(expand(output), output);
});
test('actual second screenshot and independent alternatives do not cross', () => {
  const source = '<div data-alternative-title="З дня"><p>Н. Я ўратую іх * І развесяліцца сэрца іхняе ў Пану.</p><p>К. У гэты дзень.</p><p>Н. І развесяліцца.</p></div><hr><div data-alternative-title="З агульных"><p>Н. Адказ * іншы хвост.</p><p>К. Іншы верш.</p><p>Н. І развесяліцца.</p></div>';
  const out = expand(source);
  const blocks = parse(out).querySelectorAll('[data-alternative-title]');
  assert.equal(turns(blocks[0].toString()).at(-1), 'Н. І развесяліцца сэрца іхняе ў Пану.');
  assert.equal(turns(blocks[1].toString()).at(-1), 'Н. І развесяліцца.');
});
test('no star, ambiguous prefix, already full, or missing verse stays untouched', () => {
  for (const source of [
    '<p>Н. Веры.</p><p>К. Верш.</p><p>Н. Веры.</p>',
    '<p>Н. Вера * Жыві паводле веры.</p><p>К. Верш.</p><p>Н. Іншае.</p>',
    '<p>Н. Вера * Жыві паводле веры.</p><p>К. Верш.</p><p>Н. Жыві паводле веры.</p>',
    '<p>Н. Вера * Жыві паводле веры.</p><hr><p>К. Верш.</p><p>Н. Жыві.</p>',
  ]) assert.equal(expand(source), source);
});
test('short responsory repeats are expanded and Gloria remains untouched', () => {
  const source = '<p>К. Мой Бог – мая дапамога, * я на Яго спадзяюся.</p><p>Н. Мой Бог.</p><p>К. Прыстанішча маё.</p><p>Н. Я на.</p><p>К. Хвала Айцу і Сыну.</p><p>Н. Мой Бог.</p>';
  const actual = turns(expand(source));
  assert.equal(actual[1], 'Н. Мой Бог – мая дапамога, * я на Яго спадзяюся.');
  assert.equal(actual[3], 'Н. Я на Яго спадзяюся.');
  assert.equal(actual[4], 'К. Хвала Айцу і Сыну.');
});
