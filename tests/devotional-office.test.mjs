import assert from 'node:assert/strict';
import test from 'node:test';
import { devotionalOfficeProfile } from '../src/utils/devotionalOffice.js';
import { prayerMarkdownToPlainText, renderPrayerMarkdown } from '../src/utils/prayerMarkdown.js';

test('devotional-office presentation applies only to the intended five kinds of prayer', () => {
  const names = [
    ['Ютрань за памерлых', 'dead-lauds'],
    ['Нешпары за памерлых', 'dead-vespers'],
    ['Ютрань да Маці Божай', 'marian-lauds'],
    ['Нешпары да Найсвяцейшай Панны Марыі', 'marian-vespers'],
    ['Гадзінкі аб Беззаганным Зачацці Найсвяцейшай Панны Марыі', 'marian-little-hours'],
  ];
  names.forEach(([name, kind]) => assert.equal(devotionalOfficeProfile(name), kind, name));
  [
    'Святая Імша', 'Літанія да Маці Божай', 'Малітва за памерлых',
    'Нешпары', 'Ютрань', 'Гадзінкі да Святога Юзафа',
  ].forEach((name) => assert.equal(devotionalOfficeProfile(name), null, name));
});

test('devotional office renders red antiphon labels without recolouring spoken words', () => {
  const source = `## ПСАЛЬМОДЫЯ

**1 ант.** Радасна спявайце Пану.

### Псальм 103

Ант. 2. Слаўце Бога.

V. Пане, адкрый мае вусны.
R. І вусны мае будуць абвяшчаць хвалу Тваю.`;
  const html = renderPrayerMarkdown(source, '', { presentation: 'devotional-office' });
  assert.match(html, /class="office-heading"/);
  assert.match(html, /<span class="office-antiphon-label">1 ант\.<\/span>/);
  assert.match(html, /<span class="office-antiphon-label">Ант\. 2\.<\/span>/);
  assert.match(html, /class="office-antiphon"/);
  assert.match(html, /Радасна спявайце Пану\./);
  assert.match(html, /class="prayer-speaker" data-role="versicle">V\.<\/span>/);
  assert.match(html, /class="prayer-speaker" data-role="response">R\.<\/span>/);
  assert.equal(prayerMarkdownToPlainText(source).includes('Радасна спявайце Пану.'), true);
});

test('standalone unmarked section labels become headings for display only', () => {
  const source = `КАРОТКАЕ ЧЫТАННЕ

Тэкст чытання.

КАРОТКІ РЭСПАНСОРЫЙ

V. Слова Божае.
R. Дзякуем Богу.

ДАДАТКОВЫЯ ВАРЫЯНТЫ

Альбо:

Іншы тэкст.`;
  const html = renderPrayerMarkdown(source, '', { presentation: 'devotional-office' });
  assert.match(html, /<h2 class="office-heading">КАРОТКАЕ ЧЫТАННЕ<\/h2>/);
  assert.match(html, /<h2 class="office-heading">КАРОТКІ РЭСПАНСОРЫЙ<\/h2>/);
  assert.match(html, /<h2 class="office-heading office-extra-heading">ДАДАТКОВЫЯ ВАРЫЯНТЫ<\/h2>/);
  assert.match(html, /class="office-alternative-label"/);
  assert.equal(renderPrayerMarkdown(source).includes('office-heading'), false);
});

test('explicit rubric, links and text remain intact in the office profile', () => {
  const source = `:::rubric
Ант. 1. Усе ўстаюць.
:::

**Ант. 1.** Тэкст антыфоны.

[Іншая малітва](/prayer/abc123)`;
  const html = renderPrayerMarkdown(source, '', { presentation: 'devotional-office' });
  assert.match(html, /class="prayer-rubric"/);
  assert.match(html, /Ант\. 1\. Усе ўстаюць\./);
  assert.equal((html.match(/office-antiphon-label/g) || []).length, 1);
  assert.match(html, /href="\/prayer\/abc123"/);
});

test('source-shaped rubric headings and narrow-space antiphons keep their words', () => {
  const source = `## Нешпары

### Гімн

1 ант. Пан захавае цябе ад усякага зла.

Кароткае чытанне 1 Кар 15, 55–57

Тэкст чытання.

Ант. да песні Марыі: Кожны, каго дае Мне Айцец.`;
  const html = renderPrayerMarkdown(source, '', { presentation: 'devotional-office' });
  assert.match(html, /<h2 class="office-heading">Нешпары<\/h2>/);
  assert.match(html, /<h3 class="office-heading">Гімн<\/h3>/);
  assert.match(html, /<span class="office-antiphon-label">1 ант\.<\/span>/);
  assert.match(html, /<h2 class="office-heading office-reading-heading">Кароткае чытанне 1 Кар 15, 55–57<\/h2>/);
  assert.match(html, /<span class="office-antiphon-label">Ант\. да песні Марыі:<\/span>/);
  assert.equal(prayerMarkdownToPlainText(source).includes('Кожны, каго дае Мне Айцец.'), true);
});
