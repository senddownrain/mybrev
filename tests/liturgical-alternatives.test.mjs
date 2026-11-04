import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'node-html-parser';
import {
  formatIntercessions,
  getLiturgicalAlternatives,
  hasLiturgicalAlternatives,
} from '../src/utils/liturgicalAlternatives.js';

const templatesDirectory = path.resolve('patchs/feasts/common-texts');

function loadTemplate(name) {
  return JSON.parse(fs.readFileSync(path.join(templatesDirectory, name), 'utf8'));
}

test('names hymns by first verse and short readings by Scripture reference', () => {
  const mary = loadTemplate('blessed-virgin-mary.json');
  const hymns = getLiturgicalAlternatives(mary.laudesHymn, 'hymn');
  const readings = getLiturgicalAlternatives(mary.laudesR, 'reading');

  assert.equal(hymns.length, 4);
  assert.match(hymns[0].title, /^О Святая Валадарка/u);
  assert.equal(readings.length, 3);
  assert.deepEqual(readings.map(({ title }) => title), ['пар. Іс 61, 10', 'Гал 4, 4-5', 'Ап 12, 1']);
});

test('keeps category names but never uses a prayer or instruction as a tab title', () => {
  const martyr = loadTemplate('martyr-one.json');
  const mary = loadTemplate('blessed-virgin-mary.json');
  const categorized = getLiturgicalAlternatives(martyr.vesperPr, 'prayer');
  const prayers = getLiturgicalAlternatives(mary.laudesPr, 'prayer');

  assert.deepEqual(categorized.map(({ title }) => title), [
    'Варыянт 1',
    'Варыянт 2',
    'Пра панну мучаніцу',
    'Пра святую жанчыну',
  ]);
  assert.equal(prayers.length, 6);
  prayers.forEach(({ title }) => {
    assert.match(title, /^Варыянт \d+$/u);
    assert.ok(title.length <= 56);
  });
});

test('names alternative Marian antiphons by their first verse line', () => {
  const antiphons = [
    '<p>Дзева, Маці Адкупіцеля,<br />брама раю нябеснага.</p>',
    '<p><span>Або:</span></p><p>Вітай, неба Уладарка,<br />Вітай, Панна анёлаў.</p>',
    '<p><span>Або:</span></p><p>Вітай, Каралева,<br />Маці міласэрнасці.</p>',
  ].join('<hr />');

  const options = getLiturgicalAlternatives(antiphons, 'marian-antiphon');

  assert.deepEqual(options.map(({ title }) => title), [
    'Дзева, Маці Адкупіцеля',
    'Вітай, неба Уладарка',
    'Вітай, Каралева',
  ]);
});

test('recognizes structured choices and preserves shared content and suffixes', () => {
  const dead = loadTemplate('office-for-dead.json');
  const options = getLiturgicalAlternatives(dead.officeOfReadingsR1, 'reading');

  assert.equal(options.length, 3);
  assert.deepEqual(options.map(({ title }) => title), [
    '1 Кар 15, 12–34',
    '1 Кар 15, 35–57',
    '2 Кар 4, 16 — 5, 10',
  ]);
  assert.ok(options.every(({ html }) => html.includes('Першае чытанне')));
});

test('turns Gospel antiphons for years A, B, and C into selectable alternatives', () => {
  const antiphons = [
    '<p style="text-align: justify;"><strong>Ант. да песні Марыі</strong><br>',
    '<strong>Год А: Прыйдзе Сын Чалавечы ў славе.</strong><br>',
    '<strong>Год В: Слухайце і разумейце наказы.</strong><br>',
    '<strong>Год С: Калі наладжваеш гасціну, кліч убогіх.</strong></p>',
  ].join('');

  const options = getLiturgicalAlternatives(antiphons, 'gospel-antiphon');

  assert.deepEqual(options.map(({ title }) => title), ['Год А', 'Год В', 'Год С']);
  assert.match(options[0].html, /Прыйдзе Сын/u);
  assert.doesNotMatch(options[0].html, /Слухайце/u);
  assert.ok(options.every(({ html }) => html.includes('Ант. да песні Марыі')));
});

test('does not split a reading at the narrative phrase "У тыя дні"', () => {
  const holyInnocents = [
    '<p><span>Першае чытанне</span><br />Кніга Зыходу<br />1, 8-16. 22</p>',
    '<p><em>Забойства габрэйскіх немаўлятаў у Егіпце</em></p>',
    '<p>У тыя дні: Над Егіптам пачаў валадарыць новы кароль.</p>',
    '<p><span>Рэспансорый</span><br />Больш не будзе чутны голас плачу.</p>',
  ].join('');

  const options = getLiturgicalAlternatives(holyInnocents, 'reading');
  assert.equal(options.length, 1);
  assert.match(options[0].html, /У тыя дні/u);
});

test('Office category boundaries require a heading line; quoted prose stays in its reading', () => {
  for (const prose of [
    'Пра гэта сведчыць нам і Дух Святы, бо сказана: «Вось запавет».',
    'Пра гэты келіх казалі мучанікі: «Келіх збаўлення ўзніму».',
    'Пра такія ганенні кажа Апостал: «Усе пераследаваныя будуць».',
  ]) {
    const html = `<p>Казанне св. Аўгустына</p><p>${prose}</p><p>Заканчэнне і рэспансорый.</p>`;
    const options = getLiturgicalAlternatives(html, 'office-reading');
    assert.equal(options.length, 1);
    assert.equal(parse(options[0].html).text.replace(/\s+/gu, ''), parse(html).text.replace(/\s+/gu, ''));
  }
  for (const boundary of ['<p>Пра прэзбітэра:</p>', '<p>Пра прэзбітэра:<br>Кніга Рут 1, 1-5</p>']) {
    const options = getLiturgicalAlternatives(`<p>Кніга Зыходу 1, 1-5</p><p>Тэкст адзін.</p>${boundary}<p>Тэкст два.</p>`, 'office-reading');
    assert.equal(options.length, 2, boundary);
    assert.match(options[1].html, /Тэкст два/u);
  }
});

test('all common-template rule-separated fields become selectable with short safe titles', () => {
  for (const filename of fs.readdirSync(templatesDirectory).filter((name) => name.endsWith('.json'))) {
    const template = loadTemplate(filename);
    for (const [field, html] of Object.entries(template)) {
      if (typeof html !== 'string' || !/<hr\b/iu.test(html)) continue;
      const options = getLiturgicalAlternatives(html, field.endsWith('Hymn') ? 'hymn' : field.endsWith('Pr') ? 'prayer' : 'generic');
      assert.ok(options.length > 1, `${filename}:${field}`);
      options.forEach(({ title }) => {
        assert.ok(title.length <= 56, `${filename}:${field}: ${title}`);
        assert.doesNotMatch(title, /Калі\s+няма\s+ўласнай/iu);
      });
      assert.equal(hasLiturgicalAlternatives(html), true, `${filename}:${field}`);
    }
  }
});

test('formats intercessions as intro, highlighted refrain and alternating petition pairs', () => {
  const mary = loadTemplate('blessed-virgin-mary.json');
  const [option] = getLiturgicalAlternatives(mary.laudesInter, 'intercession');
  const root = parse(formatIntercessions(option.html));

  assert.ok(root.querySelector('.intercessions__intro'));
  assert.ok(root.querySelector('.intercessions__refrain'));
  assert.ok(root.querySelector('.intercessions__petition'));
  assert.ok(root.querySelector('.intercessions__response'));
});

test('normalizes line-broken intercessions into the standard petition and response paragraphs', () => {
  const dedication = loadTemplate('church-dedication.json');
  const [option] = getLiturgicalAlternatives(dedication.laudesInter, 'intercession');
  const html = formatIntercessions(option.html);
  const root = parse(html);

  assert.equal(root.querySelector('.intercessions__refrain')?.text.trim(), 'Гэта Божы дом і брама нябёсаў.');
  assert.ok(root.querySelector('.intercessions__response'));
  assert.equal(root.querySelector('.intercessions__continuation'), null);
  assert.ok(root.querySelector('.intercessions__conclusion'));
});

test('gives all supported intercession source shapes the same paragraph structure', () => {
  const lineBroken = [
    '<p>Молімся да Бога:<br><em>Пане, ахоўвай свой народ.</em></p>',
    '<p>Божа, захавай нас,<br><span style="color: #ff0000;">–</span>&nbsp;ахоўвай свой Касцёл.</p>',
  ].join('');
  const separateWithDash = [
    '<p>Разам вызнаём Збаўцу і клічам:</p>',
    '<p>Прыйдзі, Пане Езу.</p>',
    '<p>Пане Езу, Ты нас палюбіў,</p>',
    '<p>–даруй нам нашыя грахі.</p>',
  ].join('');
  const separateWithoutDash = [
    '<p>Узнясём нашыя малітвы:</p>',
    '<p><em>Пане, выслухай нас.</em></p>',
    '<p>Езу, Сонца справядлівасці,</p>',
    '<p>дапамажы нам жыць у Тваім святле.</p>',
  ].join('');

  for (const source of [lineBroken, separateWithDash, separateWithoutDash]) {
    const root = parse(formatIntercessions(source));
    const paragraphs = root.querySelectorAll('p');

    assert.equal(paragraphs.length, 4);
    assert.ok(paragraphs[0].classList.contains('intercessions__intro'));
    assert.ok(paragraphs[1].classList.contains('intercessions__refrain'));
    assert.ok(paragraphs[2].classList.contains('intercessions__petition'));
    assert.ok(paragraphs[3].classList.contains('intercessions__response'));
  }

  const dashedResponse = parse(formatIntercessions(separateWithDash))
    .querySelector('.intercessions__response');
  assert.equal(dashedResponse.querySelector('.intercessions__marker')?.text, '–');
  assert.match(dashedResponse.innerHTML, /<\/span>&nbsp;даруй/u);

  const initialResponse = parse(formatIntercessions(separateWithoutDash))
    .querySelector('.intercessions__response');
  assert.equal(initialResponse.querySelector('.intercessions__marker'), null);
  assert.match(initialResponse.text, /^дапамажы/u);
});


test('keeps Psalm 26:7-14 whole when verse 8 begins with “Пра ...:”', () => {
  const psalm = [
    '<p>II (7-14)</p>',
    '<p>Пачуй, Пане, мой голас, калі я клічу, * змілуйся нада мною і адкажы мне.</p>',
    '<p>Пра Цябе кажа маё сэрца: † «Шукай Ягонага аблічча!» * Буду шукаць Твайго аблічча, Пане.</p>',
    '<p>Не хавай ад мяне свайго твару.</p>',
  ].join('');
  const options = getLiturgicalAlternatives(psalm, 'psalm');

  assert.equal(options.length, 1);
  assert.match(options[0].html, /Пачуй, Пане, мой голас/u);
  assert.match(options[0].html, /Пра Цябе кажа маё сэрца:/u);
  assert.match(options[0].html, /Не хавай ад мяне/u);
  assert.equal(getLiturgicalAlternatives(psalm, 'psalm').length, 1);
});

test('keeps genuine explicit psalm alternatives selectable', () => {
  const options = getLiturgicalAlternatives(
    '<p>Псальм 1.</p><hr><p>Або:</p><p>Іншы псальм.</p>',
    'psalm',
  );
  assert.equal(options.length, 2);
});

test('a hymn stanza that begins with «Для …» and ends a later line with a colon is verse, not a heading', () => {
  const generated = JSON.parse(fs.readFileSync(path.resolve('patchs/db-templates/holy-men.json'), 'utf8'));
  const stanza = 'Для адданых слугаў Божых';
  for (const season of ['advent', 'christmas', 'lent', 'easter']) {
    for (const field of ['vesperHymn', 'vesper1Hymn']) {
      const html = generated._seasonalVariants[season][field];
      const options = getLiturgicalAlternatives(html, 'hymn');
      assert.deepEqual(options.map(({ title }) => title), ['Пра аднаго святога', 'Пра некалькіх святых'], `${season} ${field}`);
      assert.match(options[1].html, new RegExp(stanza, 'u'), `${season} ${field}: the stanza stays inside the plural hymn`);
      assert.match(options[1].html, /Бо сусветам Ён кіруе\. Амэн/u, `${season} ${field}: the plural hymn is complete`);
    }
  }
  // A real heading on the first line still opens a choice.
  const headings = '<p>Пра адну панну:<br />Першы радок<br />Другі радок</p><p>Для адданых слугаў:<br />Трэці радок</p>';
  assert.equal(getLiturgicalAlternatives(headings, 'hymn').length, 2);
});
