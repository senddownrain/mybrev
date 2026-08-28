import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPsalmHtml,
  markLeadingLiturgicalSubheadings,
  markPsalmCadenceSigns,
  removeBreakAfterAsterisk,
} from '../src/utils/liturgicalHtml.js';

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

test('marks asterisks and daggers with the rubric class', () => {
  assert.equal(
    markPsalmCadenceSigns('Першая * палова † заканчэнне.'),
    'Першая <span class="psalm-marker">*</span> палова <span class="psalm-marker">†</span> заканчэнне.',
  );
});

test('marks ordinary psalm paragraphs as strophes and keeps the heading separate', () => {
  const html = '<p style="text-align: center;">Псальм 1</p><p>Першая *<br>палова.</p><p>Другая *<br>палова.</p>';
  const formatted = formatPsalmHtml(html);

  assert.equal(
    formatted,
    '<p style="text-align: center;" data-liturgical-subheading>Псальм 1</p><p data-psalm-strophe>Першая <span class="psalm-marker">*</span> палова.</p><p data-psalm-strophe>Другая <span class="psalm-marker">*</span> палова.</p>',
  );
});

test('splits a legacy single-paragraph psalm into marked strophes', () => {
  const html = '<p>Радок †<br>сярэдзіна *<br>канец.<br>Наступны *<br>канец.</p>';
  const formatted = formatPsalmHtml(html);

  assert.equal(
    formatted,
    '<p data-psalm-strophe>Радок <span class="psalm-marker">†</span><br>сярэдзіна <span class="psalm-marker">*</span> канец.</p><p data-psalm-strophe>Наступны <span class="psalm-marker">*</span> канец.</p>',
  );
});

test('removes a trailing antiphon embedded in psalm HTML', () => {
  const html = '<p>Страфа *<br>канец.</p>\n<p><span style="color: #ff0000;">Ант.</span> Святыя жанчыны.</p>';

  assert.equal(
    formatPsalmHtml(html, { stripEmbeddedAntiphon: true }),
    '<p data-psalm-strophe>Страфа <span class="psalm-marker">*</span> канец.</p>\n',
  );
});

test('keeps an embedded antiphon when no separate antiphon is available', () => {
  const html = '<p>Страфа *<br>канец.</p><p><span>Ант.</span> Адзіны тэкст.</p>';

  assert.match(formatPsalmHtml(html), /Ант\./u);
});

test('marks the first two psalm subtitles without changing the psalm strophes', () => {
  const html = '<p style="text-align: center;"><span style="color: #ff0000;">Песня (Іс 45, 15-25)</span><br><span style="color: #ff0000;">Усе народы звернуцца да Пана</span></p><p><em>На імя Езуса няхай схіліцца кожнае калена (Флп 2, 10)</em></p><p>Пан *<br>валадарыць.</p>';

  assert.equal(
    formatPsalmHtml(html),
    '<p style="text-align: center;" data-liturgical-subheading><span style="color: #ff0000;">Песня (Іс 45, 15-25)</span><br><span style="color: #ff0000;">Усе народы звернуцца да Пана</span></p><p data-liturgical-subheading><em>На імя Езуса няхай схіліцца кожнае калена (Флп 2, 10)</em></p><p data-psalm-strophe>Пан <span class="psalm-marker">*</span> валадарыць.</p>',
  );
});

test('marks matching subtitles at the beginning of a reading only', () => {
  const html = '<p style="text-align: center;">Чытанне</p><p><em>Кароткі ўступ</em></p><p><em>Сам тэкст чытання.</em></p>';

  assert.equal(
    markLeadingLiturgicalSubheadings(html),
    '<p style="text-align: center;" data-liturgical-subheading>Чытанне</p><p data-liturgical-subheading><em>Кароткі ўступ</em></p><p><em>Сам тэкст чытання.</em></p>',
  );
});
