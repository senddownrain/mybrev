import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import {
  buildDevotionalOfficeDocument, devotionalDisplayItems, devotionalHeading,
  devotionalBlockHtml, devotionalResponsoryHtml, devotionalSourceBlocks, devotionalSelectedBlocks,
} from '../src/utils/devotionalOffice.js';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';
import { fixtures, hymn, reading, canticleBody } from './fixtures/devotional-office/reader.mjs';

const documentFor = fixture => buildDevotionalOfficeDocument(fixture.text, 'mybrev-markdown', fixture.profile);

test('Gadzinki hymn headings use section presentation and preserve all strophes', () => {
  const fixture = fixtures.at(-1);
  const document = documentFor(fixture);
  assert.equal(document.sections.length, 8);
  for (const section of document.sections) {
    const snapshot = JSON.stringify(section);
    const items = devotionalDisplayItems(section);
    assert.deepEqual(items.filter(b => b.kind === 'sectionHeading').map(b => b.text), ['Гімн']);
    assert.equal(items.filter(b => b.kind === 'text').slice(0, 2).map(b => b.source).join('\n\n'), hymn);
    assert.equal(JSON.stringify(section), snapshot, 'display never rewrites source AST');
  }
});

test('four office readings have a single section title, separate reference and ordinary body', () => {
  for (const fixture of fixtures.slice(0, 4)) {
    const section = documentFor(fixture).sections.find(s => s.type === 'reading');
    const items = devotionalDisplayItems(section);
    assert.equal(devotionalHeading(section, fixture.profile).title, '');
    assert.deepEqual(items.filter(b => b.kind === 'sectionHeading').map(b => [b.text, b.reference]), [
      ['Кароткае чытанне', '1 Тэс 4, 14'], ['Кароткі рэспансорый', ''],
    ]);
    assert.equal(items.find(b => b.text === reading).kind, 'text');
    assert.equal(items.filter(b => b.kind === 'responsoryBody').length, 1);
    const sourceWithDuplicate = { ...section, blocks: devotionalSourceBlocks('## Кароткае чытанне\nКароткае чытанне 1 Тэс 4, 14\n' + reading) };
    assert.equal(devotionalDisplayItems(sourceWithDuplicate).filter(b => b.kind === 'sectionHeading').length, 1);
  }
});

test('responsories preserve every label and response, with one compact line per reply', () => {
  for (const label of ['К.', 'Н.', 'К.:', 'Н.:']) {
    for (const wrap of ['', '**', '__']) {
      for (const space of ['', ' ', '\u00a0']) {
        for (const separator of [' ', '\n', '\n\n']) {
          const source = `${wrap}${label}${wrap}${space}Першы адказ.${separator}${wrap}Н.${wrap}${space}Другі адказ.`;
          const html = devotionalResponsoryHtml({ source });
          const root = parse(html);
          assert.deepEqual(root.querySelectorAll('[data-office-speaker]').map(n => n.text), [label, 'Н.'], source);
          assert.equal(root.querySelectorAll('p').length, 1, source);
          assert.equal(root.querySelectorAll('br').length, 1, source);
          const text = root.text.replace(/\s+/gu, '');
          assert.equal(text, `${label}Першыадказ.Н.Другіадказ.`, source);
        }
      }
    }
  }
  assert.ok(!devotionalResponsoryHtml({ source: '<script>alert(1)</script>' }).includes('<script>'));
});

test('all responsory alternatives get compact replies without changing the selected reading', () => {
  const section = documentFor(fixtures[0]).sections.find(s => s.type === 'reading');
  const original = JSON.stringify(section.blocks);
  section.alternatives = [{ title: 'Іншы рэспансорый', blocks: [
    ...devotionalSourceBlocks('### Варыянт'), section.blocks[1], section.blocks[2],
    ...devotionalSourceBlocks('Кароткі рэспансорый\nК.Іншы адказ. Н.Амэн.'),
  ] }];
  const selected = devotionalSelectedBlocks(section, 1);
  assert.equal(selected[1], section.blocks[1]);
  assert.equal(selected[2], section.blocks[2]);
  const body = devotionalDisplayItems({ ...section, blocks: selected }).find(b => b.kind === 'responsoryBody');
  assert.equal(parse(devotionalResponsoryHtml(body)).querySelectorAll('[data-office-speaker]').length, 2);
  assert.equal(JSON.stringify(section.blocks), original);
});

test('Mary, Zechariah and Simeon bodies use the same psalm formatter and keep antiphons', () => {
  for (const caption of ['Песня Марыі (Лк 1, 46–55)', 'Песня Захарыі (Лк 1, 68–79)', 'Песня Сімеона (Лк 2, 29–32)']) {
    const text = `## ${caption}\nАнт. Нязменны антыфон.\n${canticleBody}\nАнт. Нязменны антыфон.`;
    const section = buildDevotionalOfficeDocument(text, 'mybrev-markdown', 'vesper').sections[0];
    assert.equal(devotionalHeading(section, 'vesper').title, 'Песня з Евангелля');
    assert.equal(devotionalHeading(section, 'vesper').caption, caption);
    const items = devotionalDisplayItems(section);
    const body = items.find(b => b.kind === 'psalmBody');
    assert.equal(body.source, canticleBody);
    const formatted = formatPsalmHtml(devotionalBlockHtml(body));
    assert.equal(parse(formatted).querySelectorAll('[data-psalm-strophe]').length, 2);
    assert.equal(parse(formatted).querySelectorAll('.psalm-marker').length, 3);
    assert.deepEqual(items.filter(b => b.kind === 'antiphon').map(b => b.text), ['Ант. Нязменны антыфон.', 'Ант. Нязменны антыфон.']);
  }
});

test('ordinary prayer blocks and inline К./Н. outside a responsory keep their display', () => {
  const blocks = devotionalSourceBlocks('## Малітва\nЗвычайны тэкст К. без новага радка. Н. Амэн.');
  assert.deepEqual(devotionalDisplayItems({ type: 'prayer', blocks }), blocks);
});
