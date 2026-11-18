import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';
import { omitEchoedPsalmOpening, addOpeningAntiphonFlexa } from '../src/utils/psalmOpening.js';

test('exact selected antiphon removes only the repeated opening through flexa', () => {
  const source = '<p>Псальм 10</p><p><b>Слава нашаму Пану <em>†</em> далей паём *</b> вечна.</p><p>Наступная страфа * заўсёды.</p>';
  const prepared = formatPsalmHtml(source);
  const result = omitEchoedPsalmOpening(prepared, '<p><span>1 ант.</span> Слава нашаму Пану.</p>');
  const root = parse(result);
  const strophes = root.querySelectorAll('p[data-psalm-strophe]');
  assert.equal(strophes.length, 2);
  assert.match(strophes[0].text.trim(), /^†\s*далей паём\s*\*\s*вечна/u);
  assert.equal(strophes[0].querySelectorAll('.psalm-opening-flexa').length, 1);
  assert.equal(strophes[0].querySelector('b')?.text.trim().startsWith('†'), true);
  assert.equal(strophes[1].text.trim(), 'Наступная страфа * заўсёды.');
  assert.doesNotMatch(strophes[0].text, /Слава нашаму Пану/u);
});

test('partial match, other antiphon and empty selection never remove psalm text', () => {
  const prepared = formatPsalmHtml('<p>Слава нашаму Пану † далей паём * вечна.</p>');
  for (const ant of ['Ант. Слава нашаму', 'Ант. Пану слава', '', null]) {
    assert.equal(omitEchoedPsalmOpening(prepared, ant), prepared);
  }
});

test('whole echo through * is removed; remaining verse and doxology survive', () => {
  const prepared = formatPsalmHtml('<p>Божа наш * благаслаўляем Цябе.</p><p>Хвала Айцу * Амэн.</p>');
  const result = omitEchoedPsalmOpening(prepared, 'Ант. Божа наш');
  const root = parse(result);
  assert.match(root.text, /благаслаўляем Цябе/u);
  assert.match(root.text, /Хвала Айцу/u);
  assert.doesNotMatch(root.text, /Божа наш/u);
  assert.equal(root.querySelector('.psalm-opening-flexa')?.text, '†');
});

test('opening antiphon gets one † at the end, inside its paragraph', () => {
  const antiphon = '<p><span class="ora-antiphon-label">1 ант.</span> Божа наш.</p>';
  const withDagger = addOpeningAntiphonFlexa(antiphon);
  const root = parse(withDagger);
  assert.equal(root.querySelector('p .psalm-antiphon-flexa')?.text, '†');
  assert.equal(root.querySelectorAll('.psalm-antiphon-flexa').length, 1);
  assert.equal(addOpeningAntiphonFlexa(withDagger), withDagger);
});

test('only first stanza gets opening †; later cadence and doxology stay intact', () => {
  const html = formatPsalmHtml(
    '<p>Божа наш † пасля антыфоны * канец.</p>' +
    '<p>Наступны верш † пасля крыжыка * адказ.</p>' +
    '<p>Хвала Айцу * Амэн.</p>',
  );
  const output = omitEchoedPsalmOpening(html, 'Ант. Божа наш');
  const root = parse(output);
  assert.equal(root.querySelectorAll('.psalm-opening-flexa').length, 1);
  const verses = root.querySelectorAll('p[data-psalm-strophe]');
  assert.match(verses[0].text.trim(), /^†\s*пасля антыфоны/u);
  assert.equal(verses[1].querySelectorAll('.psalm-opening-flexa').length, 0);
  assert.match(verses[1].text, /† пасля крыжыка/u);
  assert.match(verses[2].text, /Хвала Айцу/u);
});
