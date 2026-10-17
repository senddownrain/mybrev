import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  buildDevotionalOfficeDocument, devotionalAntiphon, devotionalOfficeProfile,
  devotionalBlockHtml, devotionalDisplayItems, devotionalPsalmHeading, devotionalReadingHeading,
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
  assert.ok(document.sections.some(section => section.type === 'reading' && section.blocks.some(block => block.kind === 'responseTitle')));
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-laudes' }, office, 'mybrev-markdown'), null);
  assert.equal(devotionalOfficeProfile({ id: 'unrelated' }, office, 'mybrev-markdown'), null);
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-vesper' }, office, 'mybrev-markdown'), null);
  assert.equal(devotionalOfficeProfile({ id: 'mybrev-devotion-office-for-dead-laudes' }, '# Ютрань\nЗвычайная малітва', 'mybrev-markdown'), null);
});

const publishedShape = canticle => `# Малітва
## Пачатак
Пане, адкрый мае вусны.
## Гімн
Агульныя строфы.
## Псальмодыя
1 ант. Антыфона перад.
### Псальм 121 (120)
Першая страфа * адказ.

Другая страфа † адказ.
1 ант. Антыфона пасля.
## Кароткае чытанне і рэспансорый
Кароткае чытанне 1 Кар 15, 55–57
Тэкст чытання.
Кароткі рэспансорый
К. Адказ. Н. Амэн.
## ${canticle}
Ант. да песні ${canticle.includes('Захарыі') ? 'Захарыі' : 'Марыі'}: Перад.
Тэкст песні * адказ.
Ант. да песні ${canticle.includes('Захарыі') ? 'Захарыі' : 'Марыі'}: Пасля.
## Просьбы
Прашэнне і адказ.
## Ойча наш
Ойча наш.
## Малітва
Заключная малітва.
## Завяршэнне
Благаслаўленне.
## Іншыя варыянты частак Гадзіны
### За адну памерлую
Варыянт малітвы.`;

test('all five confirmed IDs gate on observed section structure', () => {
  for (const id of ['mybrev-devotion-office-for-dead-laudes', 'mybrev-devotion-blessed-virgin-mary-laudes']) {
    assert.equal(devotionalOfficeProfile({ id }, publishedShape('Песня Захарыі (Лк 1, 68–79)'), 'mybrev-markdown'), 'laudes');
    assert.equal(devotionalOfficeProfile({ id }, publishedShape('Песня Марыі (Лк 1, 46–55)'), 'mybrev-markdown'), null);
  }
  for (const id of ['mybrev-devotion-office-for-dead-vesper', 'mybrev-devotion-blessed-virgin-mary-vesper']) {
    assert.equal(devotionalOfficeProfile({ id }, publishedShape('Песня Марыі (Лк 1, 46–55)'), 'mybrev-markdown'), 'vesper');
    assert.equal(devotionalOfficeProfile({ id }, publishedShape('Песня Захарыі (Лк 1, 68–79)'), 'mybrev-markdown'), null);
  }
  const gadzinki = GADZINKI_PARTS.map(part => `## ${part}\nТэкст часткі.`).join('\n');
  assert.equal(devotionalOfficeProfile({ id: 'catholicby-yearcycle-100116' }, gadzinki, 'mybrev-markdown'), 'gadzinki');
  assert.equal(devotionalOfficeProfile({ id: 'unrelated' }, gadzinki, 'mybrev-markdown'), null);
});

test('real office headings form sections; one psalm body keeps all strophes', () => {
  const source = publishedShape('Песня Захарыі (Лк 1, 68–79)');
  const document = buildDevotionalOfficeDocument(source, 'mybrev-markdown', 'laudes');
  assert.deepEqual(document.sections.slice(1).map(section => section.title), [
    'Пачатак', 'Гімн', 'Псальмодыя', 'Кароткае чытанне і рэспансорый',
    'Песня Захарыі (Лк 1, 68–79)', 'Просьбы', 'Ойча наш', 'Малітва',
    'Завяршэнне', 'Іншыя варыянты частак Гадзіны',
  ]);
  const psalm = document.sections.find(section => section.type === 'psalmody');
  const items = devotionalDisplayItems(psalm);
  assert.equal(items.filter(item => item.kind === 'psalmBody').length, 1);
  assert.ok(items.find(item => item.kind === 'psalmBody').source.includes('Другая страфа'));
  assert.equal(items.filter(item => item.kind === 'antiphon').length, 2);
  const canticle = document.sections.find(section => section.type === 'canticle');
  const canticleItems = devotionalDisplayItems(canticle);
  assert.equal(canticleItems.filter(item => item.kind === 'antiphon').length, 2);
  assert.equal(canticleItems.filter(item => item.kind === 'psalmBody').length, 1);
  assert.ok(document.sections.find(section => section.type === 'alternatives')
    .blocks.some(block => block.text === 'За адну памерлую'));
  assert.equal(document.sections.flatMap(section => section.blocks).length, document.sourceBlockCount);
  assert.equal(devotionalReadingHeading('Кароткае чытанне і рэспансорый'), null);
});

test('observed alternative headings attach to the matching part without losing blocks', () => {
  const alternatives = [
    ['Гімн — За адну памерлую', 'hymn'],
    ['Трэці псальм — Псальм 150', 'psalmody'],
    ['Чытанне і рэспансорый — Гал 4, 4-5', 'reading'],
    ['Антыфона да песні Захарыі — Варыянт 2', 'canticle'],
    ['Просьбы — Варыянт 2', 'intercessions'],
    ['Малітва — Варыянт 2', 'prayer'],
  ];
  const source = publishedShape('Песня Захарыі (Лк 1, 68–79)').replace(
    '### За адну памерлую\nВарыянт малітвы.',
    alternatives.map(([title], index) => `### ${title}\nВарыянт ${index + 1}.`).join('\n'),
  );
  const document = buildDevotionalOfficeDocument(source, 'mybrev-markdown', 'laudes');
  for (const [title, type] of alternatives) {
    assert.ok(document.sections.find(section => section.type === type)
      .alternatives.some(option => option.title === title));
  }
  const assigned = document.sections.reduce((total, section) => total + section.blocks.length
    + (section.alternatives || []).reduce((count, option) => count + option.blocks.length, 0), 0);
  assert.equal(assigned, document.sourceBlockCount);
});

test('every alternative heading recorded by the five-document audit has a target', () => {
  const cases = [
    ['Песня Захарыі (Лк 1, 68–79)', [
      'Гімн — За адну памерлую', 'Гімн — За некалькіх',
      'Трэці псальм — Псальм 150',
      'Малітва — За аднаго памерлага або адну памерлую — 2',
      'Малітва — За аднаго памерлага або адну памерлую — 3',
      'Малітва — За некалькіх', 'Малітва — За братоў, блізкіх і дабрадзеяў',
    ]],
    ['Песня Марыі (Лк 1, 46–55)', [
      'Гімн — За адну памерлую', 'Гімн — За некалькіх',
      'Чытанне і рэспансорый — У міласэрнасці сваёй, Пане',
      'Малітва — За аднаго памерлага або адну памерлую — 2',
      'Малітва — За аднаго памерлага або адну памерлую — 3',
      'Малітва — За некалькіх', 'Малітва — За братоў, блізкіх і дабрадзеяў',
    ]],
    ['Песня Захарыі (Лк 1, 68–79)', [
      'Гімн — О Святая Валадарка · 2',
      'Гімн — О Ты, што святлом незвычайным яснееш',
      'Гімн — Вітай, Зорка мора',
      ...[2, 3, 4, 5, 6, 7].map(number => `Антыфона да песні Захарыі — Варыянт ${number}`),
      'Чытанне і рэспансорый — Гал 4, 4-5',
      'Чытанне і рэспансорый — Ап 12, 1',
      ...[2, 3, 4].map(number => `Просьбы — Варыянт ${number}`),
      'Малітва — Варыянт 2',
    ]],
    ['Песня Марыі (Лк 1, 46–55)', [
      'Просьбы — Варыянт 2',
      ...[2, 3, 4, 5, 6].map(number => `Малітва — Варыянт ${number}`),
    ]],
  ];
  for (const [canticle, names] of cases) {
    const source = publishedShape(canticle).replace(
      '### За адну памерлую\nВарыянт малітвы.',
      names.map(name => `### ${name}\nТэкст варыянту.`).join('\n'),
    );
    const document = buildDevotionalOfficeDocument(source, 'mybrev-markdown',
      canticle.includes('Захарыі') ? 'laudes' : 'vesper');
    const mapped = document.sections.flatMap(section => section.alternatives || []);
    assert.deepEqual(mapped.map(option => option.title).sort(), [...names].sort());
  }
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
  assert.equal(source.split(/\r?\n/u).filter(line => line.trim()).length, 281);
  assert.equal(createHash('sha256').update(source.replace(/\r?\n$/u, '')).digest('hex'),
    'e8c6693e882538a129a77d6439111f5b28719f6ba534df2fc70ffd4eba07784b');
  assert.equal(blocks.filter(block => block.level === 3 && block.text === 'Гімн').length, 7);
  assert.equal(blocks.filter(block => block.level === 3 && block.text === 'Антыфона').length, 1);
  assert.ok(source.includes('**К:**'));
  assert.ok(source.includes('**Молiмся:**'));
  assert.ok(devotionalBlockHtml(blocks.find(block => block.source.startsWith('**К:**'))).includes('<strong>К:</strong>'));
});
