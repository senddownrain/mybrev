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

test('all Pastors common hymns assemble all and only the right stanzas', () => {
  for (const values of [source, generated]) {
    for (const [field, singleStanzas, pluralStanzas] of hours) {
      const original = values[field];
      const options = getLiturgicalAlternatives(preparePastorsHymn(original, 'Св. Яна Паўла ІІ, папы'), 'hymn');
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
  for (const [field] of hours) {
    const uncertain = getLiturgicalAlternatives(preparePastorsHymn(source[field], 'Св. Невядомага'), 'hymn');
    assert.equal(uncertain.length, 5);
    assert.equal(uncertain[0].title, 'Абярыце тып пастыра');
    assert.equal(uncertain[1].title, 'Пра Папу');
  }
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

// Seasonal variants store the same hymn flattened into ONE paragraph without <hr>.
// Before this was recognized, Advent/Christmas/Lent/Easter showed «Пра аднаго
// пастыра» (the opening stanza alone) and «Пра Папу» (everything else glued).
const SEASONS = ['advent', 'christmas', 'lent', 'easter'];
const textLines = (html) => html.replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
const HEADING = /^Пра (?:аднаго пастыра|Папу|біскупа|прэзбітэра|некалькіх пастыраў)\s*:?$/u;

test('seasonal Pastors hymns assemble the same four complete hymns as the base text', () => {
  for (const season of SEASONS) {
    for (const [field] of hours) {
      const flat = generated._seasonalVariants[season][field];
      assert.doesNotMatch(flat, /<hr\b/i, 'precondition: stored flattened layout');
      const options = getLiturgicalAlternatives(preparePastorsHymn(flat, 'Св. Яна Паўла ІІ, папы'), 'hymn');
      const where = season + ' ' + field;
      assert.deepEqual(options.map(({ title }) => title), labels, where);
      // Structure: exactly the line counts of the base hymn, which has real separators.
      const baseOptions = getLiturgicalAlternatives(preparePastorsHymn(generated[field], 'Св. Яна Паўла ІІ, папы'), 'hymn');
      options.forEach(({ html }, i) => {
        assert.equal(textLines(html).length, textLines(baseOptions[i].html).length, where + ': ' + labels[i]);
        assert.doesNotMatch(html, /Пра (?:аднаго пастыра|Папу|біскупа|прэзбітэра|некалькіх пастыраў)\s*:/u, where);
      });
      // Nothing invented, nothing lost: every non-heading source line is in an option and vice versa.
      const source = textLines(flat).filter((line) => !HEADING.test(line));
      const shown = options.flatMap(({ html }) => textLines(html));
      assert.deepEqual([...new Set(shown)].sort(), [...new Set(source)].sort(), where);
      // The three single-pastor hymns differ from each other on exactly the lines the base hymn differs on
      // (shared opening and conclusion, own middle stanza).
      const mask = (x, y) => x.map((line, k) => line === y[k]);
      const [pope, bishop, priest] = options.map(({ html }) => textLines(html));
      const [basePope, baseBishop, basePriest] = baseOptions.map(({ html }) => textLines(html));
      assert.deepEqual(mask(pope, bishop), mask(basePope, baseBishop), where + ' pope/bishop');
      assert.deepEqual(mask(pope, priest), mask(basePope, basePriest), where + ' pope/priest');
      assert.deepEqual(mask(bishop, priest), mask(baseBishop, basePriest), where + ' bishop/priest');
      assert.ok(mask(pope, bishop).includes(false) && mask(pope, bishop).includes(true), where);
      assert.match(options[0].html, /Амэн/u);
      assert.match(options[3].html, /Амэн/u);
    }
  }
});

test('a flattened hymn with an unrecognizable shape is left untouched', () => {
  const flat = generated._seasonalVariants.advent.laudesHymn;
  const missingHeading = flat.replace('Пра біскупа:', 'Пра святога:');
  assert.equal(preparePastorsHymn(missingHeading, 'папы'), missingHeading);
  const uneven = flat.replace('Святаром быў для народу<br />', '');
  assert.equal(preparePastorsHymn(uneven, 'папы'), uneven);
  const doubled = flat + '<p>Пра Папу:<br />Яшчэ</p>';
  assert.equal(preparePastorsHymn(doubled, 'папы'), doubled);
});

// Independent expectation: the plain-text volumes separate the opening, the three
// exclusive stanzas and the shared conclusion with a tab-only line. Expectations
// are parsed from those sources, not from the generated templates.
const readLines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/);
const sourceHymns = (file) => {
  const lines = readLines(file);
  const out = [];
  lines.forEach((line, i) => {
    if (line.trim() !== 'Пра аднаго пастыра:') return;
    let end = i;
    while (end < lines.length && !/^(?:Псальмодыя|\d\s*ант|Ант)/u.test(lines[end])) end += 1;
    const block = lines.slice(i, end);
    const parts = [[]];
    for (const line of block) {
      if (line.trim() === '' && line.includes('\t')) parts.push([]);
      else parts[parts.length - 1].push(line.trim());
    }
    const [opening, exclusive, ending] = parts;
    const at = (label) => exclusive.indexOf(label);
    const [iPope, iBishop, iPriest] = ['Пра Папу:', 'Пра біскупа:', 'Пра прэзбітэра:'].map(at);
    const manyAt = ending.indexOf('Пра некалькіх пастыраў:');
    out.push({
      opening: opening.slice(1),
      pope: exclusive.slice(iPope + 1, iBishop),
      bishop: exclusive.slice(iBishop + 1, iPriest),
      priest: exclusive.slice(iPriest + 1),
      ending: ending.slice(0, manyAt),
      many: ending.slice(manyAt + 1),
    });
  });
  return out;
};

test('seasonal Pastors hymns match the stanza layout of the source volumes', () => {
  const adventChristmas = sourceHymns('patchs/sources/common-seasons/01_advent_christmas_utf8.txt');
  const lentEaster = sourceHymns('patchs/sources/common-seasons/02_lent_easter_utf8.txt');
  assert.ok(adventChristmas.length >= 3 && lentEaster.length >= 3, 'sources parsed');
  const pairs = [
    ['advent', 'officeOfReadingsHymn', adventChristmas[0]], ['advent', 'laudesHymn', adventChristmas[1]],
    ['advent', 'vesperHymn', adventChristmas[2]], ['advent', 'vesper1Hymn', adventChristmas[2]],
    ['christmas', 'laudesHymn', adventChristmas[1]],
    ['lent', 'officeOfReadingsHymn', lentEaster[0]], ['lent', 'laudesHymn', lentEaster[1]],
    ['lent', 'vesperHymn', lentEaster[2]],
  ];
  for (const [season, field, expected] of pairs) {
    const html = generated._seasonalVariants[season][field];
    const options = getLiturgicalAlternatives(preparePastorsHymn(html, 'Св. Яна Паўла ІІ, папы'), 'hymn');
    const where = season + ' ' + field;
    const stanzas = ({ html: h }) => h.replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
      .split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const norm = (list) => list.map((l) => l.replace(/\s+/g, ' ').replace('Ўсё', 'Ўсё'));
    const want = [
      [...expected.opening, ...expected.pope, ...expected.ending],
      [...expected.opening, ...expected.bishop, ...expected.ending],
      [...expected.opening, ...expected.priest, ...expected.ending],
      expected.many,
    ];
    options.forEach((option, i) => assert.deepEqual(norm(stanzas(option)), norm(want[i]), where + ': ' + labels[i]));
  }
});
