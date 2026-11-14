import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import reviewed from '../src/data/liturgical/advent-benedictus-by.json' with { type: 'json' };
import { adventSundayBenedictus, selectAdventBenedictus } from '../src/utils/adventBenedictus.js';
import { resolveAdventDateAgainstPeriod } from '../src/utils/liturgicalDayResolution.js';
import { contentFor } from '../scripts/liturgy/lib/snapshot-content.mjs';
import { checkAdventProvenance } from '../scripts/liturgy/lib/advent-provenance.mjs';
import { parseLhPage, plain, extractPageFields } from '../scripts/liturgy/lib/lh-catholic-by.mjs';
import { fixedDocsFor, templatesFixture } from './helpers/ordo-days-fixture.mjs';

const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/advent-vespers-days.json.gz', import.meta.url))));
const source = {
  days: fixture.days, daysById: new Map(fixture.days.map((day) => [day.id, day])),
  readings: [], properDocs: fixedDocsFor('25.12', { migrated: true }), templates: templatesFixture(),
};
const dioceses = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const cases = [
  ['2025-12-21', 'A', 'advent-21-12'],
  ['2026-12-20', 'B', 'advent-w4-d1'],
  ['2027-12-19', 'C', 'advent-w4-d1'],
  ['2028-12-24', 'A', 'advent-24-12'],
  ['2029-12-23', 'B', 'advent-23-12'],
  ['2030-12-22', 'C', 'advent-w4-d1'],
  ['2031-12-21', 'A', 'advent-21-12'],
  ['2032-12-19', 'B', 'advent-w4-d1'],
];
const sourceHtml = (date) => fs.readFileSync(new URL(`../docs/sources/issue-216/${date}-lauds.html`, import.meta.url), 'utf8');
// Independent oracle: the raw source line with its explicit label, not the
// runtime alternatives parser or the assembled document's nonempty value.
const lines = reviewed.value.split(/<br\s*\/?>/iu);
const cycleLine = (cycle) => lines.find((line) => plain(line).startsWith(`Год ${cycle === 'A' ? 'А' : cycle}:`));

test('reviewed Belarusian ABC field is verbatim from two independently dated source pages', () => {
  for (const date of ['2022-12-18', '2024-12-22']) {
    const blocks = parseLhPage(sourceHtml(date)).hours.lauds.blocks.filter((b) => /Год А:/.test(b.text));
    assert.equal(blocks.length, 2, 'antiphon printed before and after the canticle');
    blocks.forEach((block) => assert.equal(block.html, reviewed.value));
  }
  const manifest = JSON.parse(fs.readFileSync(new URL('../docs/sources/issue-216/manifest.json', import.meta.url)));
  for (const entry of manifest.sources) assert.equal(createHash('sha256').update(sourceHtml(entry.date)).digest('hex'), entry.sha256);
  assert.equal(reviewed.legacyValue, source.daysById.get('advent-w4-d1').laudesAntBen);
});

for (const [date, cycle, document] of cases) {
  test(`${date}: ${cycle}, ${document}, all four dioceses`, () => {
    for (const diocese of dioceses) {
      const content = contentFor(source, date, { diocese });
      const day = content.dayOptions.find((o) => o.ordo.role === 'primary').day;
      assert.equal(content.resolved.readingCycle.sunday, cycle, `${diocese}: actual Ordo cycle`);
      assert.equal(content.resolved.week, 4);
      const origin = day._fieldSources.laudesAntBen;
      assert.equal(origin.document, document);
      assert.equal(origin.field, 'laudesAntBen');
      if (document === 'advent-w4-d1') {
        assert.equal(origin.cycle, cycle);
        assert.equal(origin.edition, reviewed.source.file);
        assert.equal(plain(day.laudesAntBen), `${plain(lines[0])} ${plain(cycleLine(cycle))}`);
        for (const other of ['A', 'B', 'C'].filter((c) => c !== cycle)) assert.ok(!day.laudesAntBen.includes(cycleLine(other).trim()));
        assert.notEqual(plain(day.laudesAntBen), plain(source.daysById.get(`advent-${date.slice(-2)}-12`).laudesAntBen));
      } else {
        assert.equal(day.laudesAntBen, source.daysById.get(document).laudesAntBen);
        assert.equal(origin.cycle, undefined);
      }
      assert.equal(checkAdventProvenance(source, date, diocese, content).fields.every((r) => r.status === 'PASS'), true);
    }
  });
}

test('24 December uses its verified complete Lauds; the psalm texts stay Sunday IV', () => {
  const fields = extractPageFields(parseLhPage(sourceHtml('2023-12-24'))).fields;
  for (const diocese of dioceses) {
    const day = contentFor(source, '2028-12-24', { diocese }).dayOptions[0].day;
    for (const field of Object.keys(fields).filter((f) => f.startsWith('laudes'))) {
      const psalm = /^laudesPs[123]$/.test(field);
      assert.equal(day._fieldSources[field].document, psalm ? 'advent-w4-d1' : 'advent-24-12', field);
      assert.equal(plain(day[field]), plain(fields[field]), field);
    }
    for (const field of ['laudesR', 'laudesInter', 'laudesPr', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3']) {
      assert.notEqual(day[field], source.daysById.get('advent-w4-d1')[field], field);
    }
  }
});

test('cycle selection handles Latin/Cyrillic labels, <br> and separate paragraphs, and A is reachable', () => {
  for (const cycle of ['A', 'B', 'C']) {
    const selected = selectAdventBenedictus(reviewed.value, cycle);
    assert.equal(plain(selected), `${plain(lines[0])} ${plain(cycleLine(cycle))}`);
    const paragraphs = reviewed.value.replace(/<br\s*\/?>/giu, '</p><p>')
      .replace('Год B:', 'Год В:').replace('Год C:', 'Год С:').replace('Год А:', 'Год A:');
    assert.ok(plain(selectAdventBenedictus(paragraphs, cycle)).endsWith(plain(cycleLine(cycle)).replace(/^Год [АBC]:/, `Год ${cycle === 'B' ? 'В' : cycle === 'C' ? 'С' : 'A'}:`)));
  }
  const c = contentFor(source, '2022-12-18');
  assert.equal(c.resolved.readingCycle.sunday, 'A');
  assert.equal(plain(c.dayOptions[0].day.laudesAntBen), `${plain(lines[0])} ${plain(cycleLine('A'))}`);
});

test('future editions win; missing or ambiguous variants do not silently fall back', () => {
  const sunday = source.daysById.get('advent-w4-d1');
  const future = reviewed.value.replace('Юзэфе', 'Юзафе');
  assert.equal(adventSundayBenedictus({ ...sunday, laudesAntBen: future }, 'A').value, selectAdventBenedictus(future, 'A'));
  for (const html of ['', '<p>unverified unlabelled value</p>', lines.slice(0, 3).join('<br />') + '</p>']) {
    const selected = adventSundayBenedictus({ ...sunday, laudesAntBen: html }, 'C');
    assert.equal(selected.value, '');
  }
  assert.equal(selectAdventBenedictus(reviewed.value, 'D'), '');
  assert.equal(selectAdventBenedictus(reviewed.value.replace('Год C:', 'Год B:'), 'B'), '', 'ambiguous cycle labels');
  assert.equal(selectAdventBenedictus('<p>Год А:</p><p>Год B:</p><p>Год C:</p>', 'B'), '', 'rubric without text');
  assert.equal(selectAdventBenedictus('<p>Год А:&nbsp;</p><p>Год B:&nbsp;</p><p>Год C:&nbsp;</p>', 'B'), '', 'HTML spacing is not a source text');
  const dated = source.daysById.get('advent-20-12');
  const missing = resolveAdventDateAgainstPeriod(dated, { ...sunday, laudesAntBen: '' }, 1, { sundayCycle: 'B' });
  assert.equal(missing.laudesAntBen, '');
  assert.equal(missing._fieldSources.laudesAntBen.status, 'missing-source-text');
  assert.equal(resolveAdventDateAgainstPeriod(dated, null, 1, { sundayCycle: 'B', periodWeek: 4 }).laudesAntBen, '');
  const days = structuredClone(fixture.days);
  days.find((d) => d.id === 'advent-w4-d1').laudesAntBen = '';
  days.find((d) => d.id === 'ordinary-w4-d1').laudesAntBen = reviewed.value;
  const wrongPsalter = { ...source, days, daysById: new Map(days.map((d) => [d.id, d])) };
  const incomplete = contentFor(wrongPsalter, '2026-12-20').dayOptions[0].day;
  assert.equal(incomplete.laudesAntBen, '', 'ABC labels from an Ordinary Time psalter fallback are not Sunday Advent proper');
  assert.equal(incomplete._fieldSources.laudesAntBen.status, 'missing-source-text');
  for (const id of ['advent-21-12', 'advent-23-12', 'advent-24-12']) {
    assert.equal(resolveAdventDateAgainstPeriod({ ...source.daysById.get(id), laudesAntBen: '' }, sunday, 1, { sundayCycle: 'A' }).laudesAntBen, '');
  }
});

test('semantic audit rejects wrong text, provenance, and cycle even when nonempty', () => {
  for (const mutation of [
    (day) => { day.laudesAntBen = source.daysById.get('advent-20-12').laudesAntBen; },
    (day) => { day.laudesAntBen = selectAdventBenedictus(reviewed.value, 'A'); },
    (day) => { day._fieldSources.laudesAntBen.document = 'advent-20-12'; },
    (day) => { day._fieldSources.laudesAntBen.cycle = 'A'; },
  ]) {
    const c = contentFor(source, '2026-12-20');
    mutation(c.dayOptions[0].day);
    assert.equal(checkAdventProvenance(source, '2026-12-20', dioceses[0], c).fields.find((r) => r.field === 'laudesAntBen').status, 'WRONG_SOURCE');
  }
});
