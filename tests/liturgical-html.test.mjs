import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPsalmHtml, removeBreakAfterAsterisk } from '../src/utils/liturgicalHtml.js';

test('removes a line break immediately after a psalm asterisk', () => {
  assert.equal(
    removeBreakAfterAsterisk('Пане, пачуй мяне, *<br /> і адкажы мне.'),
    'Пане, пачуй мяне, * і адкажы мне.',
  );
});

test('handles an asterisk wrapped in a rubric span', () => {
  assert.equal(
    removeBreakAfterAsterisk('слова <span style="color:red">*</span><br> працяг'),
    'слова <span style="color:red">*</span> працяг',
  );
});

test('preserves all other line breaks', () => {
  assert.equal(
    removeBreakAfterAsterisk('Першы радок<br>Другі радок'),
    'Першы радок<br>Другі радок',
  );
});

test('marks ordinary psalm paragraphs as strophes without marking headings', () => {
  const html = '<p style="text-align: center;">Псальм 1</p><p>Першая *<br>палова.</p><p>Другая *<br>палова.</p>';
  const formatted = formatPsalmHtml(html);

  assert.equal(
    formatted,
    '<p style="text-align: center;">Псальм 1</p><p data-psalm-strophe>Першая * палова.</p><p data-psalm-strophe>Другая * палова.</p>',
  );
});

test('splits a legacy single-paragraph psalm into marked strophes', () => {
  const html = '<p>Радок †<br>сярэдзіна *<br>канец.<br>Наступны *<br>канец.</p>';
  const formatted = formatPsalmHtml(html);

  assert.equal(
    formatted,
    '<p data-psalm-strophe>Радок †<br>сярэдзіна * канец.</p><p data-psalm-strophe>Наступны * канец.</p>',
  );
});

test('removes a trailing antiphon embedded in psalm HTML', () => {
  const html = '<p>Страфа *<br>канец.</p>\n<p><span style="color: #ff0000;">Ант.</span> Святыя жанчыны.</p>';

  assert.equal(
    formatPsalmHtml(html, { stripEmbeddedAntiphon: true }),
    '<p data-psalm-strophe>Страфа * канец.</p>\n',
  );
});

test('keeps an embedded antiphon when no separate antiphon is available', () => {
  const html = '<p>Страфа *<br>канец.</p><p><span>Ант.</span> Адзіны тэкст.</p>';

  assert.match(formatPsalmHtml(html), /Ант\./u);
});
