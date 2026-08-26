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

test('formats line-broken intercessions with an indented continuation', () => {
  const dedication = loadTemplate('church-dedication.json');
  const [option] = getLiturgicalAlternatives(dedication.laudesInter, 'intercession');
  const html = formatIntercessions(option.html);
  const root = parse(html);

  assert.equal(root.querySelector('.intercessions__refrain')?.text.trim(), 'Гэта Божы дом і брама нябёсаў.');
  assert.ok(root.querySelector('.intercessions__continuation'));
  assert.ok(root.querySelector('.intercessions__conclusion'));
});
