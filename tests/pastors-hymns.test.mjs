import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { pastorKindFromTitle, preparePastorsHymn } from '../src/utils/pastorsHymn.js';

const source = JSON.parse(fs.readFileSync('patchs/feasts/common-texts/pastors.json', 'utf8'));
const generated = JSON.parse(fs.readFileSync('patchs/db-templates/pastors.json', 'utf8'));
const hours = [
  ['officeOfReadingsHymn', 5, 5],
  ['laudesHymn', 4, 4],
  ['vesper1Hymn', 6, 5],
  ['vesperHymn', 6, 5],
];
const labels = ['Пра Папу', 'Пра біскупа', 'Пра прэзбітэра', 'Пра некалькіх пастыраў'];
const markers = ['Пятров', 'біскупа', 'прэзбітэра'];

test('all Pastors common hymns assemble all and only the right stanzas', () => {
  for (const values of [source, generated]) {
    for (const [field, singleStanzas, pluralStanzas] of hours) {
      const original = values[field];
      const options = getLiturgicalAlternatives(preparePastorsHymn(original), 'hymn');
      assert.deepEqual(options.map(({ title }) => title), labels, field);
      options.forEach(({ html, title }, i) => {
        assert.equal((html.match(/<p>/g) || []).length, i === 3 ? pluralStanzas : singleStanzas, field + ': ' + title);
        assert.doesNotMatch(html, /Пра (?:Папу|біскупа|прэзбітэра|некалькіх пастыраў)\s*:/u);
        assert.doesNotMatch(html, /<hr\b/i);
      });
      assert.match(options[0].html, /Амэн/u);
      assert.match(options[1].html, /Амэн/u);
      assert.match(options[2].html, /Амэн/u);
      assert.match(options[3].html, /Амэн/u);
      assert.notEqual(options[0].html, options[1].html);
      assert.notEqual(options[1].html, options[2].html);
      assert.equal(options[0].html.split('<p>')[1], options[1].html.split('<p>')[1], field + ' shared opening');
      assert.equal(options[0].html.split('<p>').at(-1), options[2].html.split('<p>').at(-1), field + ' shared ending');
    }
  }
});

test('Pope John Paul II, bishops, presbyters and plural titles select the appropriate default', () => {
  assert.equal(pastorKindFromTitle('Св. Яна Паўла ІІ, папы'), 'pope');
  assert.equal(pastorKindFromTitle('Св. Марціна Турскага, біскупа'), 'bishop');
  assert.equal(pastorKindFromTitle('Св. Яна Марыі Віянэя, прэзбітэра'), 'priest');
  assert.equal(pastorKindFromTitle('Святых біскупаў і пастыраў'), 'many');
  assert.equal(pastorKindFromTitle('Св. Яна Паўла ІІ'), '');
  for (const [title, label] of [
    ['Св. Яна Паўла ІІ, папы', 'Пра Папу'],
    ['Св. Марціна, біскупа', 'Пра біскупа'],
    ['Св. Яна, прэзбітэра', 'Пра прэзбітэра'],
    ['Святых пастыраў', 'Пра некалькіх пастыраў'],
  ]) {
    for (const [field] of hours) {
      const options = getLiturgicalAlternatives(preparePastorsHymn(source[field], title), 'hymn');
      assert.equal(options[0].title, label, title + ': ' + field);
    }
  }
});

test('does not modify unrelated, unknown or malformed hymn data', () => {
  assert.equal(preparePastorsHymn('<p>Гімн іншаму святому</p>', 'папы'), '<p>Гімн іншаму святому</p>');
  const malformed = source.laudesHymn.replace('Пра аднаго пастыра:', 'Пра святых:');
  assert.equal(preparePastorsHymn(malformed, 'папы'), malformed);
});
