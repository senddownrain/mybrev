import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import decrees from '../src/data/documents/liturgy-hours-decrees.json' with { type: 'json' };
import apostolic from '../src/data/documents/apostolic-see-decrees.json' with { type: 'json' };
import introduction from '../src/data/documents/liturgy-hours-introduction.json' with { type: 'json' };
import { getSource } from '../src/constants/sources.js';
import bibliography from '../src/data/sourceBibliography.json' with { type: 'json' };
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const normalized = text => text.replace(/\s+/gu, ' ').trim();
const text = row => (row.runs || []).map(run => run.text).join('');
const rows = calendar.pages.flatMap(page => page.rows);


test('public sources page retains original editions and adds confirmed prayer sources', () => {
  assert.equal(bibliography.schemaVersion, 1);
  assert.deepEqual(bibliography.sections, ['Касцёльныя крыніцы', 'Іншыя крыніцы']);
  assert.equal(bibliography.entries.length, 24);
  assert.equal(new Set(bibliography.entries.map(entry => entry.id)).size, 24);
  assert.deepEqual(bibliography.sections.map(section => bibliography.entries.filter(entry => entry.section === section).length), [18, 6]);
  assert.equal(bibliography.entries[0].title, '«Новы запавет» (Мінск, 2017)');
  assert.equal(bibliography.entries[10].title, 'Спеўнік «Божа, мы Цябе ўслаўляем» (Мінск, 2026)');
  assert.deepEqual(bibliography.entries[11].notices, [
    '© Камісія Божага Культу і Дысцыпліны Сакрамэнтаў, 2022',
    '© Выдавецтва «Про Хрысто», 2022',
  ]);
  assert.equal(bibliography.entries[13].title, 'Малітоўнік «Бог Добры» (Пінск, 2018)');
  assert.equal(bibliography.entries[14].title, '«Бог Добры», ІІІ выданне (Пінск, 2022)');
  assert.equal(bibliography.entries[14].notices.length, 2);
  assert.equal(bibliography.entries[15].title, 'Малітоўнік «Каб пазналі Цябе» (Гродна, 2014)');
  assert.equal(bibliography.entries[16].title, '«Біблія» (Мінск, 2017)');
  assert.deepEqual(bibliography.entries[16].details, ['Стары Запавет - на падставе рукапісаў кс. У. Чарняўскага']);
  assert.deepEqual(bibliography.entries[16].notices, ['© «Біблійнае таварыства ў Рэспубліцы Беларусь», 2017']);
  assert.equal(bibliography.entries[17].title, '«Біблія» Синодальный перевод');
  assert.deepEqual(bibliography.entries[17].notices, []);
  assert.ok(bibliography.entries.every(entry => entry.title && Array.isArray(entry.notices)));
  const sourceComponent = read('src/components/SourceRights.vue');
  assert.match(sourceComponent, /bibliography\.sections/);
  assert.match(sourceComponent, /bibliography\.entries/);
  assert.match(sourceComponent, /source\.details/);
  assert.doesNotMatch(sourceComponent, /bindings\.bible|groups\.map/);
});

test('all four full decrees match the primary text, issuer, date and signature in order', () => {
  assert.deepEqual(decrees.documents.map(doc => [doc.number, doc.date]), [
    ['32/P/12', '2012-06-29'], ['70/P/13', '2013-08-15'], ['62/P/15', '2015-08-06'], ['04/P/20', '2020-02-02'],
  ]);
  const website = read('docs/sources/primary/lh-decrees-2026-11-05.txt');
  const primary = website.split('СВЯТАЯ КАНГРЭГАЦЫЯ')[0].split(/(?=КАНФЕРЭНЦЫЯ\n)/).filter(t => t.trim());
  primary.push(read('docs/sources/primary/decret-hours-IV.txt'));
  decrees.documents.forEach((doc, index) => {
    const rendered = [...doc.issuer, `№ ${doc.number}`, doc.heading, ...doc.paragraphs, ...doc.dateLines, ...doc.signature].join('\n');
    assert.equal(normalized(rendered), normalized(primary[index]));
    assert.equal(normalized(doc.fullText), normalized(primary[index]));
    assert.equal(doc.paragraphs.length, 3);
    assert.ok(doc.signature.includes('Каталіцкіх Біскупаў у Беларусі'));
    assert.equal(doc.volume, index + 1);
  });
  assert.match(decrees.documents[3].paragraphs[0], /Nr 15\/P\/19/);
  assert.match(decrees.documents[3].paragraphs[0], /28 кастрычніка 2019 года/);
  const fourth = getSource('liturgy-hours-2012-2020').decrees[3];
  assert.equal(fourth.status, 'verified');
  assert.equal(fourth.sourceUrl, null);
  const doc = fs.readFileSync(new URL(`../${fourth.sourceDocument}`, import.meta.url));
  assert.equal(crypto.createHash('sha256').update(doc).digest('hex'), fourth.sourceSha256);
  assert.ok(!getSource('liturgy-hours-2012-2020').verification.pending.some(note => note.startsWith('Чацвёрты дэкрэт')));
});

test('static calendar has the source title, all 13 sheets and 365 printed date rows', () => {
  assert.equal(calendar.title, 'Уласны каляндар дыяцэзій на Беларусі');
  assert.equal(calendar.pages.length, 13);
  assert.equal(calendar.months.length, 12);
  assert.equal(rows.length, 493);
  assert.equal(rows.filter(row => row.date).length, 365);
  for (let month = 1; month <= 12; month++) {
    const dates = rows.filter(row => row.month === month && row.date).map(row => row.date);
    const days = [31,28,31,30,31,30,31,31,30,31,30,31][month - 1];
    assert.deepEqual(dates, Array.from({ length: days }, (_, index) => index + 1));
    assert.equal(rows.filter(row => row.kind === 'month' && row.month === month).length, 1);
  }
  const pdf = fs.readFileSync(new URL('../public/documents/proper-calendar.pdf', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), calendar.sourceSha256);
  assert.ok(rows.filter(row => row.date && !row.runs.length).length > 100, 'blank dates retained');
});

test('protocols, printed styles, nested dioceses and movable celebrations survive', () => {
  const all = rows.map(text).join('\n');
  for (const protocol of ['2366/96/L', '2270/96/L', '796/03/L', '417/12/L', '371/00/L', '209/23']) assert.ok(all.includes(protocol));
  for (const wording of ['Калі не пазначана літургічная ступень', 'Панядзелак пасля Спаслання Духа Святога', 'Апошняя нядзеля Звычайнага перыяду', 'Нядзеля ў актаве Нараджэння Пана']) assert.ok(all.includes(wording));
  assert.equal(rows.filter(row => row.kind === 'intro').length, 5);
  assert.ok(rows.some(row => row.indent && text(row).startsWith('У Віцебскай')));
  assert.ok(rows.some(row => row.runs?.some(run => run.italic && run.text.includes('Раймунда'))));
  assert.ok(rows.some(row => row.rank?.some(run => run.tone === 'red' && run.text.includes('Урачыстасць'))));
  assert.ok(rows.some(row => row.runs?.some(run => run.tone === 'red' && run.text === '*')));
  const thomas = rows.find(row => row.month === 7 && row.date === 3);
  assert.equal(text(thomas), 'СВ. ТАМАША, АПОСТАЛА');
  assert.ok(thomas.runs.some(run => run.small));
  assert.ok(rows.find(row => row.month === 11 && text(row).startsWith('(Маці Божай') && !row.runs.some(run => run.italic)).indent, 'PDF indentation comes from visible glyph position, not leading whitespace bbox');
  const december = calendar.pages[12].rows.filter(row => row.month === 12).map(text).join('\n');
  assert.ok(december.includes('Св. Яна Дамаскіна'));
  assert.ok(december.includes('ГАДАВІНА ПАСВЯЧЭННЯ КАТЭДРАЛЬНАГА КАСЦЁЛА'));
  assert.doesNotMatch(december, /Барбар/);
});

test('static document UI renders all runs without a public calendar PDF link and retains safe navigation', () => {
  for (const file of ['src/views/ProperCalendar.vue', 'src/views/LiturgyHoursDecrees.vue', 'src/views/LiturgyHoursIntroduction.vue']) {
    const vue = read(file);
    assert.doesNotMatch(vue, /firestore|useLiturgical|useOrdo|calendarService|v-html/);
    assert.match(vue, /DocumentBack/);
  }
  assert.match(read('src/views/ProperCalendar.vue'), /calendar.pages/);
  assert.doesNotMatch(read('src/views/ProperCalendar.vue'), /Арыгінал PDF|:href="calendar.sourceFile"|class="document-original"/);
  assert.match(read('src/components/DocumentBack.vue'), /router.push\(\{ name: 'Sources' \}\)/);
  for (const route of ['documents/proper-calendar', 'documents/liturgy-hours-decrees', 'documents/liturgy-hours-introduction']) assert.ok(read('src/router/index.js').includes(route));
});

test('full Apostolic See decrees are embedded and source-verifiable without outbound links', () => {
  assert.equal(apostolic.publicationMode, 'full_text');
  assert.equal(introduction.publicationMode, 'full_text');
  assert.equal(introduction.permission.status, 'confirmed_by_project_owner');
  assert.match(read(introduction.permission.evidence), /Разрешение получено/);
  assert.equal(introduction.sourceUrl, 'https://lh.catholic.by/uvodziny.php');
  assert.equal(apostolic.sourceFile, 'docs/sources/primary/lh-decrees-2026-11-05.txt');
  assert.deepEqual(apostolic.documents.map(doc => [doc.protocol, doc.date]), [['1000/71', '1971-04-11'], ['1814/84', '1985-04-07']]);
  const source = read(apostolic.sourceFile);
  const sourceStart = source.indexOf('СВЯТАЯ КАНГРЭГАЦЫЯ БОЖАГА КУЛЬТУ');
  assert.ok(sourceStart >= 0);
  const original = source.slice(sourceStart);
  const second = original.indexOf('\nКАНГРЭГАЦЫЯ БОЖАГА КУЛЬТУ\n');
  assert.ok(second >= 0);
  const sourceTexts = [original.slice(0, second), original.slice(second + 1)];
  apostolic.documents.forEach((doc, index) => {
    const rendered = [doc.issuer, `Прат. № ${doc.protocol}`, doc.heading, doc.body].join('\n');
    assert.equal(normalized(rendered), normalized(sourceTexts[index]), `Full decree ${doc.protocol} must match the primary source`);
    assert.ok(doc.body.length > 100);
  });
  const vue = read('src/views/LiturgyHoursDecrees.vue');
  assert.match(vue, /apostolic-decree__body/);
  assert.doesNotMatch(vue, /Крыніца дэкрэтаў I–III тамоў|Поўныя тэксты двух дэкрэтаў на|https:\/\/lh\.catholic\.by\/dekrety\.php/);
  assert.equal(getSource('liturgy-hours-2012-2020').decrees.length, 4);
});

const documentBlockText = (block, sourceNumbers = false) => {
  if (block.type === 'list') return block.items.join(' ');
  if (block.type === 'point') return `${sourceNumbers ? block.sourceNumber : block.number}. ${block.blocks.map(item => documentBlockText(item, sourceNumbers)).join(' ')}`;
  return block.text;
};

test('complete introduction preserves all 284 points, five chapters and every source word in order', () => {
  const source = read(introduction.sourceFile);
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), introduction.sourceSha256);
  const points = introduction.chapters.flatMap(chapter => chapter.blocks.filter(block => block.type === 'point'));
  assert.deepEqual(points.map(point => point.number), Array.from({ length: 284 }, (_, index) => index + 1));
  assert.deepEqual(introduction.chapters.map(chapter => [chapter.firstPoint, chapter.lastPoint]), [[1, 33], [34, 99], [100, 203], [204, 252], [253, 284]]);
  assert.equal(points[139].blocks.length, 2, 'point 140 has a number on a separate source line and two paragraphs');
  assert.equal(points[176].sourceNumber, 178);
  assert.equal(points[177].sourceNumber, 178);
  assert.equal(introduction.editorialNotes[0].point, 177);
  assert.match(introduction.editorialNotes[0].verificationUrl, /liturgyoffice\.org\.uk/);
  const table = introduction.liturgicalDays;
  const entries = table.groups.flatMap(group => group.entries);
  assert.deepEqual(entries.map(entry => entry.number), Array.from({ length: 13 }, (_, index) => index + 1));
  assert.deepEqual(table.groups.map(group => group.entries.length), [4, 5, 4]);
  assert.deepEqual(entries.filter(entry => entry.subpoints.length).map(entry => [entry.number, entry.subpoints.length]), [[4, 4], [8, 6], [11, 2]]);
  assert.equal(introduction.precedence.paragraphs.length, 2);
  const reconstructed = [introduction.officialTitle];
  for (const chapter of introduction.chapters) reconstructed.push(chapter.label, chapter.title, ...chapter.blocks.map(block => documentBlockText(block, true)));
  reconstructed.push(table.title, table.subtitle, table.introduction);
  for (const group of table.groups) {
    reconstructed.push(group.label);
    for (const entry of group.entries) reconstructed.push(`${entry.number}. ${entry.text}`, ...entry.subpoints);
  }
  reconstructed.push(introduction.precedence.title, ...introduction.precedence.paragraphs);
  assert.equal(normalized(reconstructed.join(' ')), normalized(source), 'whole article, not only point numbers, round-trips to primary text');
});

test('registry and document metadata agree strictly for every decree', () => {
  const registry = getSource('liturgy-hours-2012-2020').decrees;
  const common = doc => ({ volume: doc.volume, number: doc.number, date: doc.date, sourceUrl: doc.sourceUrl });
  assert.deepEqual(registry.map(common), decrees.documents.map(common));
  for (const [index, doc] of decrees.documents.entries()) {
    assert.equal(registry[index].documentPath, `/documents/liturgy-hours-decrees#${doc.id}`);
    if (registry[index].sourceDocument) assert.equal(registry[index].sourceDocument, doc.sourceFile);
  }
});

test('06.11.2026 source page12 includes Vitebsk in the obligatory memorial group', () => {
  assert.equal(calendar.sourceSha256, 'a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696');
  const november = calendar.pages[11].rows;
  assert.ok(november.some(row => text(row).includes('Пінскай і Віцебскай дыяцэзіі:')));
  const start = november.findIndex(row => row.date === 16);
  const end = november.findIndex(row => row.date === 17);
  const section = november.slice(start, end);
  assert.equal(section.filter(row => text(row).startsWith('У Віцебскай дыяцэзіі:')).length, 0);
  assert.ok(section.some(row => row.rank?.some(run => run.text.includes('Успамін'))));
});

test('introduction renders original text without the editorial footnote or external source links', () => {
  const vue = read('src/views/LiturgyHoursIntroduction.vue');
  assert.doesNotMatch(vue, /editorialNotes|introduction\.sources|numbering-note-177|editorial-reference|editorial-note/);
  assert.doesNotMatch(vue, /lh\.catholic\.by|Catholic\.by|source\.url/);
  assert.match(vue, /© Канферэнцыя Каталіцкіх Біскупаў Беларусі/);
  assert.match(vue, /introduction\.precedence\.paragraphs/);
});
