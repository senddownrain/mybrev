import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPsalmHtml,
  markLeadingLiturgicalSubheadings,
  markPsalmCadenceSigns,
  removeLectionSectionHeading,
  removeBreakAfterPsalmCadenceSign,
} from '../src/utils/liturgicalHtml.js';

test('removes a line break immediately after a psalm asterisk', () => {
  assert.equal(
    removeBreakAfterPsalmCadenceSign('Пане, пачуй мяне, *<br /> і адкажы мне.'),
    'Пане, пачуй мяне, * і адкажы мне.',
  );
});

test('handles an asterisk wrapped in a rubric span', () => {
  assert.equal(
    removeBreakAfterPsalmCadenceSign('слова <span style="color:red">*</span><br> працяг'),
    'слова <span style="color:red">*</span> працяг',
  );
});

test('removes a line break after literal and encoded dagger signs', () => {
  assert.equal(
    removeBreakAfterPsalmCadenceSign('радок †<br>працяг; радок &#8224;<br />працяг; радок &#x2020;</span><br>працяг'),
    'радок † працяг; радок &#8224; працяг; радок &#x2020;</span> працяг',
  );
});

test('preserves all other line breaks', () => {
  assert.equal(
    removeBreakAfterPsalmCadenceSign('Першы радок<br>Другі радок'),
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
    '<p data-psalm-strophe>Радок <span class="psalm-marker">†</span> сярэдзіна <span class="psalm-marker">*</span> канец.</p><p data-psalm-strophe>Наступны <span class="psalm-marker">*</span> канец.</p>',
  );
});

test('removes a trailing antiphon embedded in psalm HTML', () => {
  const html = '<p>Страфа *<br>канец.</p>\n<p><span style="color: #ff0000;">Ант.</span> Святыя жанчыны.</p>';

  assert.equal(
    formatPsalmHtml(html, { stripEmbeddedAntiphon: true, antiphon: '<p>1 ант. Святыя жанчыны.</p>' }),
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

test('does not shrink a reading paragraph just because its heading is red', () => {
  const html = '<p style="text-align: justify;"><span style="color: #ff0000;">КАРОТКАЕ ЧЫТАННЕ 2 Тэс 2, 13-14</span><br>Мы заўсёды павінны дзякаваць Богу за вас.</p>';

  assert.equal(markLeadingLiturgicalSubheadings(html), html);
});

test('marks a centred reading theme after the mixed reading heading', () => {
  const html = '<p><span style="color: red;">ДРУГОЕ ЧЫТАННЕ</span><br>Гамілія святога Яна</p><p style="text-align: center;"><span style="color: red;">(Hom. 50, 3-4)</span><br><em>Аздабляючы святыню</em></p><p>Сам тэкст чытання.</p>';
  const formatted = markLeadingLiturgicalSubheadings(html);

  assert.doesNotMatch(formatted.split('</p>')[0], /data-liturgical-subheading/u);
  assert.match(formatted.split('</p>')[1], /data-liturgical-subheading/u);
});

test('does not shrink a psalm strophe containing red response markers', () => {
  const html = '<p style="text-align: justify;">Аллелюя.<br>Збаўленне і слава Богу, <span class="psalm-marker">*</span> <span style="color: #ff0000;">(Н.</span> Аллелюя.<span style="color: #ff0000;">)</span></p>';

  assert.equal(markLeadingLiturgicalSubheadings(html), html);
});

test('marks a paragraph whose complete content is rubric-coloured', () => {
  const html = '<p><span style="color: red;">Песня Марыі</span><br><span style="color: #ff0000;">Радасць душы ў Пану</span></p>';

  assert.match(markLeadingLiturgicalSubheadings(html), /data-liturgical-subheading/u);
});

test('marks centred psalm part and theme captions even after earlier subtitles', () => {
  const html = [
    '<p style="text-align: center;">Псальм 1</p>',
    '<p><em>Біблійная цытата</em></p>',
    '<p style="text-align: center;"><span style="color: red;">І (1-10)</span></p>',
    '<p style="text-align: center;"><span style="color: red; font-style: italic;">Тэма</span></p>',
    '<p>Тэкст псальма.</p>',
  ].join('');
  const formatted = markLeadingLiturgicalSubheadings(html);

  assert.equal((formatted.match(/data-liturgical-subheading/gu) || []).length, 4);
});

test('promotes standalone first and second reading labels to section headings', () => {
  const html = '<p data-liturgical-subheading=""><span style="color: red;">Першае чытанне</span></p><p>Тэкст.</p>';
  const formatted = markLeadingLiturgicalSubheadings(html);

  assert.match(formatted, /data-liturgical-heading/u);
  assert.doesNotMatch(formatted, /data-liturgical-subheading/u);
});

test('removes a standalone legacy lection heading before structural rendering', () => {
  const html = '<p><span style="color: red;">Першае чытанне</span></p><p>Тэкст.</p>';

  assert.equal(
    removeLectionSectionHeading(html, 'Першае чытанне'),
    '<p>Тэкст.</p>',
  );
});

test('treats encoded spaces after a legacy lection heading as whitespace', () => {
  const first = '<p><span style="color: red;">Першае чытанне &#x20;</span></p><p>Тэкст.</p>';
  const second = '<p><span style="color: red;">Другое чытанне &#32;</span></p><p>Тэкст.</p>';

  assert.equal(removeLectionSectionHeading(first, 'Першае чытанне'), '<p>Тэкст.</p>');
  assert.equal(removeLectionSectionHeading(second, 'Другое чытанне'), '<p>Тэкст.</p>');
});

test('removes only the legacy label from a mixed lection heading', () => {
  const html = [
    '<p style="text-align: justify;"><span style="color: #ff0000;">Другое чытанне</span><br />',
    'Гамілія св. Бэды Вялебнага<br />',
    '<span style="color: #ff0000;">(Hom. 23)</span></p>',
    '<p>Тэкст.</p>',
  ].join('');

  const formatted = removeLectionSectionHeading(html, 'Другое чытанне');
  assert.doesNotMatch(formatted, /Другое чытанне/iu);
  assert.match(formatted, /Гамілія св\. Бэды/iu);
  assert.match(formatted, /\(Hom\. 23\)/u);
});

test('marks an inline bibliography in a mixed reading heading', () => {
  const html = [
    '<p style="text-align: justify;"><span style="color: red;">Другое чытанне</span><br>',
    'Гамілія св. Бэды Вялебнага<br>',
    '<span style="color: red;">(Hom. 23: CCL 122, 354. 356-357)</span></p>',
    '<p style="text-align: center;"><em>Вястун нараджэння і смерці Хрыста</em></p>',
  ].join('');
  const formatted = markLeadingLiturgicalSubheadings(html);

  assert.match(formatted, /data-liturgical-reference/u);
  assert.match(formatted, /data-liturgical-subheading/u);
});
