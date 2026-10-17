import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDevotionalOfficeDocument, devotionalAntiphon, devotionalOfficeProfile,
  devotionalBlockHtml, devotionalPsalmHeading, devotionalReadingHeading,
  devotionalSourceBlocks, GADZINKI_PARTS,
} from '../src/utils/devotionalOffice.js';

const office = `# Ютрань за памерлых
## Ютрань
## Гімн
Першая страфа  
Другая страфа
## Псальмодыя
1\u2005ант.\u2005Пане, † дапамажы / нам.
### Псальм 51 (50)
Першая палова * другая палова.
Ант. Пане, † дапамажы / нам.
2 ант. Другая антыфона.
### Песня Іс 38, 10–14. 17–20
Тэкст песні * адказ.
2 ант. Другая антыфона.
3 ант. Трэцяя антыфона.
### Псальм 150
Тэкст псальма * адказ.
3 ант. Трэцяя антыфона.
## Кароткае чытанне
Кароткае чытанне 1 Кар 15, 55–57
Слова чытання.
Кароткі рэспансорый
К. Хвала Айцу. Н. Амэн.
## Просьбы
Прашэнне — адказ.
## Малітва
Малітва N.
`;

test('office blocks retain source spans and repeated antiphons', () => {
  const blocks = devotionalSourceBlocks(office, 'mybrev-markdown');
  const coveredLines = blocks.flatMap(block => Array.from(
    { length: block.span[1] - block.span[0] }, (_, offset) => block.span[0] + offset,
  ));
  const covered = new Set(coveredLines);
  assert.equal(coveredLines.length, covered.size, 'source spans do not overlap');
  office.split('\n').forEach((line, index) => {
    if (line.trim()) assert.ok(covered.has(index), `source line ${index + 1} is retained`);
  });
  const antiphons = blocks.filter(block => block.kind === 'antiphon');
  assert.equal(antiphons.length, 6);
  assert.equal(devotionalAntiphon(antiphons[0]).label, '1\u2005ант.');
  assert.equal(devotionalAntiphon(antiphons[0]).gap, '\u2005');
  assert.equal(devotionalAntiphon(antiphons[0]).text, 'Пане, † дапамажы / нам.');
  assert.equal(blocks.filter(block => block.kind === 'psalmTitle').length, 3);
  assert.equal(blocks.find(block => block.kind === 'psalmTitle' && block.text.includes('Іс')).text, 'Песня Іс 38, 10–14. 17–20');
  assert.deepEqual(devotionalPsalmHeading(blocks.find(block => block.text.includes('Іс'))), {
    workType: 'Песня', reference: 'Іс 38, 10–14. 17–20',
  });
  assert.equal(blocks.find(block => block.kind === 'readingTitle').text, 'Кароткае чытанне 1 Кар 15, 55–57');
  assert.deepEqual(devotionalReadingHeading('Кароткае чытанне 1 Кар 15, 55–57'), {
    label: 'Кароткае чытанне', reference: '1 Кар 15, 55–57',
  });
  assert.equal(blocks.find(block => block.kind === 'responseTitle').text, 'Кароткі рэспансорый');
});

test('office document assigns every source block exactly once', () => {
  const document = buildDevotionalOfficeDocument(office, 'mybrev-markdown', 'laudes');
  assert.equal(document.sections.flatMap(section => section.blocks).length, document.sourceBlockCount);
  assert.ok(document.sections.some(section => section.type === 'psalmody'));
  assert.ok(document.sections.some(section => section.type === 'responsory'));
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-laudes' }, office, 'mybrev-markdown'), 'laudes');
  assert.equal(devotionalOfficeProfile({ id: 'unrelated' }, office, 'mybrev-markdown'), null);
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-vesper' }, office, 'mybrev-markdown'), null);
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-laudes' }, '# Ютрань\nЗвычайная малітва', 'mybrev-markdown'), null);
});

test('Gospel canticle antiphon label is separate and markup is escaped', () => {
  const blocks = devotionalSourceBlocks('Ант. да песні Захарыі: Слова * адказ.\n\n<script>alert(1)</script>');
  assert.deepEqual(devotionalAntiphon(blocks[0]), {
    label: 'Ант. да песні Захарыі:', gap: ' ', text: 'Слова * адказ.',
  });
  assert.ok(devotionalBlockHtml(blocks[1]).includes('&lt;script&gt;'));
  assert.ok(!devotionalBlockHtml(blocks[1]).includes('<script>'));
});

test('Gadzinki keeps exactly eight ordered parts and nested headings', () => {
  const source = GADZINKI_PARTS.map((name, index) => `## ${name}\n### Гімн\nСтрафа ${index + 1}\n### Антыфона\n**К:** Слова ${index + 1}\n**Н.:** Амэн`).join('\n\n');
  assert.equal(devotionalOfficeProfile({}, source, 'mybrev-markdown', 'gadzinki'), 'gadzinki');
  const document = buildDevotionalOfficeDocument(source, 'mybrev-markdown', 'gadzinki');
  assert.deepEqual(document.sections.map(section => section.title), GADZINKI_PARTS);
  assert.equal(document.sections.flatMap(section => section.blocks).length, document.sourceBlockCount);
  assert.equal(devotionalOfficeProfile({}, source.replace('## Ахвяраванне Гадзінак', '## Іншая частка'), 'mybrev-markdown', 'gadzinki'), null);
});

test('provided Gadzinki source retains all lines and eight parts when available', {
  skip: !process.env.MYBREV_GADZINKI_SOURCE,
}, () => {
  const source = readFileSync(process.env.MYBREV_GADZINKI_SOURCE, 'utf8');
  const blocks = devotionalSourceBlocks(source, 'mybrev-markdown');
  const document = buildDevotionalOfficeDocument(source, 'mybrev-markdown', 'gadzinki');
  const coveredLines = blocks.flatMap(block => Array.from(
    { length: block.span[1] - block.span[0] }, (_, offset) => block.span[0] + offset,
  ));
  const covered = new Set(coveredLines);
  assert.equal(coveredLines.length, covered.size, 'source spans do not overlap');
  source.split('\n').forEach((line, index) => {
    if (line.trim()) assert.ok(covered.has(index), `source line ${index + 1} is retained`);
  });
  assert.equal(devotionalOfficeProfile({}, source, 'mybrev-markdown', 'gadzinki'), 'gadzinki');
  assert.deepEqual(document.sections.map(section => section.title), GADZINKI_PARTS);
  assert.equal(document.sections.flatMap(section => section.blocks).length, blocks.length);
  assert.equal(blocks.length, 118);
  assert.equal(blocks.filter(block => block.level === 3 && block.text === 'Гімн').length, 7);
  assert.equal(blocks.filter(block => block.level === 3 && block.text === 'Антыфона').length, 1);
  assert.ok(source.includes('**К:**'));
  assert.ok(source.includes('**Молiмся:**'));
  assert.ok(devotionalBlockHtml(blocks.find(block => block.source.startsWith('**К:**'))).includes('<strong>К:</strong>'));
});
