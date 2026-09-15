import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { formatStanzaHymn } from '../scripts/format-sorrows-hymns.mjs';

const root = path.resolve(import.meta.dirname, '..');
const generatedDir = path.join(root, 'patchs', 'db-feasts');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('Marian feast references contain the requested texts', async () => {
  const [holyName, common, nativity, sorrows, rosary] = await Promise.all([
    readJson(path.join(generatedDir, '12-09-holy-name-mary.json')),
    readJson(path.join(root, 'patchs', 'feasts', 'common-texts', 'blessed-virgin-mary.json')),
    ...['08-09-nativity-blessed-virgin-mary', '15-09-our-lady-sorrows', '07-10-our-lady-rosary']
      .map((name) => readJson(path.join(generatedDir, `${name}.json`))),
  ]);

  for (const feast of [nativity, sorrows, rosary]) {
    for (const index of [1, 2, 3]) {
      assert.equal(feast[`laudesPs${index}`], holyName[`laudesPs${index}`]);
    }
  }
  for (const feast of [nativity, sorrows]) {
    assert.equal(feast.laudesInter, common.laudesInter);
  }
  for (const field of [
    'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
    'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
    'officeOfReadingsVers', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3',
  ]) {
    assert.equal(nativity[field], common[field]);
  }
  for (const field of ['vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1Inter']) {
    assert.equal(sorrows[field], common[field]);
  }
  for (const field of ['vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperInter']) {
    assert.equal(rosary[field], common[field]);
  }
  assert.equal(nativity.officeOfReadingsHymn, nativity.vesper1Hymn);
  for (const hour of [1, 2, 3]) {
    for (const index of [1, 2, 3]) {
      assert.equal(nativity[`sext${hour}Ps${index}`], 'from-day');
    }
  }
});

test('all generated Marian feasts are free of unresolved text instructions', async () => {
  const files = (await readdir(generatedDir)).filter((file) => file.endsWith('.json'));
  let checked = 0;
  for (const file of files) {
    const feast = await readJson(path.join(generatedDir, file));
    if (!feast._templates?.includes('blessed-virgin-mary')) continue;
    checked += 1;
    for (const [field, value] of Object.entries(feast)) {
      if (field === '_templates') continue;
      assert.equal(Array.isArray(value), false, `${file}: ${field}`);
    }
  }
  assert.ok(checked > 0);
});

test('the new Sorrows hymns keep three lines within each stanza', async () => {
  const [source, generated] = await Promise.all([
    readJson(path.join(root, 'patchs', 'feasts', '15-09-our-lady-sorrows.json')),
    readJson(path.join(generatedDir, '15-09-our-lady-sorrows.json')),
  ]);
  for (const [field, stanzaCount] of [['laudesHymn', 7], ['vesperHymn', 6]]) {
    const html = source[field];
    assert.equal(generated[field], html);
    assert.equal((html.match(/<p>/g) || []).length, stanzaCount);
    assert.equal((html.match(/<br \/>/g) || []).length, stanzaCount * 2);
    assert.doesNotMatch(html, /<p>\s*<br\s*\/?\s*>\s*<\/p>/);
    for (const stanza of html.match(/<p>.*?<\/p>/gs) || []) {
      assert.equal((stanza.match(/<br \/>/g) || []).length, 2);
    }
  }
});

test('hymn formatter joins verse lines without joining separate stanzas', () => {
  const before = '<p>A</p><p>B</p><p>C</p><p><br></p><p>D</p><p>E</p><p>F</p>';
  assert.equal(formatStanzaHymn(before), '<p>A<br />B<br />C</p>\n<p>D<br />E<br />F</p>');
  assert.throws(() => formatStanzaHymn('<p>A</p><p><br></p><p>B</p>'));
});
