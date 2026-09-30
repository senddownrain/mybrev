import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { formatStanzaHymn } from '../scripts/format-sorrows-hymns.mjs';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import { assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';

const root = path.resolve(import.meta.dirname, '..');
const generatedDir = path.join(root, 'patchs', 'db-feasts');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('Marian feast references are structured rules resolved from the Common', async () => {
  const [common, sundayWeek1, nativity, sorrows, rosary] = await Promise.all([
    readJson(path.join(root, 'patchs', 'db-templates', 'blessed-virgin-mary.json')),
    readJson(path.join(root, 'patchs', 'db-templates', 'sunday-week-1.json')),
    ...['08-09-nativity-blessed-virgin-mary', '15-09-our-lady-sorrows', '07-10-our-lady-rosary']
      .map((name) => readJson(path.join(generatedDir, `${name}.json`))),
  ]);
  const templates = new Map([['blessed-virgin-mary', common], ['sunday-week-1', sundayWeek1]]);
  const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`]));
  const officeOn = (date, id) => {
    const day = resolveLiturgicalDate(date);
    return [day.officeResolution.primary, ...day.officeResolution.alternatives].find((item) => item.optionId === id);
  };
  const assemble = (proper, office) => assembleOffice({ proper, office, templates, choice: 'blessed-virgin-mary', currentDay }).day;
  const marian = { source: 'template', template: 'blessed-virgin-mary' };

  // Lauds psalmody «з нядзелі І тыдня»: the explicit reusable source.
  const feastOffice = officeOn('2026-09-08', 'nativity-blessed-virgin-mary');
  const memorialOffice = officeOn('2026-09-15', 'our-lady-sorrows');
  const assembled = {
    nativity: assemble(nativity, feastOffice), sorrows: assemble(sorrows, memorialOffice), rosary: assemble(rosary, memorialOffice),
  };
  for (const day of Object.values(assembled)) {
    for (const index of [1, 2, 3]) assert.equal(day[`laudesPs${index}`], sundayWeek1[`laudesPs${index}`]);
  }
  for (const field of [
    'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
    'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
    'officeOfReadingsVers', 'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3',
  ]) {
    assert.deepEqual(nativity._fieldRules[field], marian, field);
    assert.equal(assembled.nativity[field], common[field], field);
  }
  for (const feast of ['nativity', 'sorrows']) assert.equal(assembled[feast].laudesInter, common.laudesInter);
  for (const field of ['vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1Inter']) {
    assert.equal(assembled.sorrows[field], common[field], field);
  }
  for (const field of ['vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperInter']) {
    assert.equal(assembled.rosary[field], common[field], field);
  }
  // «Ты гонар з Нешпараў»: the hymn of the Office of Readings is the Vespers hymn.
  assert.deepEqual(nativity._fieldRules.officeOfReadingsHymn, { ref: 'vesper1Hymn' });
  assert.equal(assembled.nativity.officeOfReadingsHymn, nativity.vesper1Hymn);
  // Daytime psalmody of the feast is of the current day, without a placeholder.
  for (const hour of [1, 2, 3]) {
    for (const index of [1, 2, 3]) {
      assert.ok(!(`sext${hour}Ps${index}` in nativity));
      assert.equal(assembled.nativity[`sext${hour}Ps${index}`], `day:sext${hour}Ps${index}`);
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
      if (field.startsWith('_')) continue;
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
