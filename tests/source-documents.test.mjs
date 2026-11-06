import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import calendar from '../src/data/documents/proper-calendar.json' with { type: 'json' };
import decrees from '../src/data/documents/liturgy-hours-decrees.json' with { type: 'json' };
import apostolic from '../src/data/documents/apostolic-see-decrees.json' with { type: 'json' };
import introduction from '../src/data/documents/liturgy-hours-introduction.json' with { type: 'json' };
import { getSource } from '../src/constants/sources.js';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const normalized = text => text.replace(/\s+/gu, ' ').trim();
const text = row => (row.runs || []).map(run => run.text).join('');
const rows = calendar.pages.flatMap(page => page.rows);

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
  assert.equal(rows.length, 495);
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
  assert.ok(rows.find(row => row.month === 11 && text(row).startsWith('(Маці Божай') && row.runs.some(run => run.italic)).indent, 'PDF indentation comes from visible glyph position, not leading whitespace bbox');
  const december = calendar.pages[12].rows.filter(row => row.month === 12).map(text).join('\n');
  assert.ok(december.includes('Св. Яна Дамаскіна'));
  assert.ok(december.includes('ГАДАВІНА ПАСВЯЧЭННЯ КАТЭДРАЛЬНАГА КАСЦЁЛА'));
  assert.doesNotMatch(december, /Барбар/);
});

test('static document UI renders all runs, public original and safe navigation without calendar services', () => {
  for (const file of ['src/views/ProperCalendar.vue', 'src/views/LiturgyHoursDecrees.vue', 'src/views/LiturgyHoursIntroduction.vue']) {
    const vue = read(file);
    assert.doesNotMatch(vue, /firestore|useLiturgical|useOrdo|calendarService|v-html/);
    assert.match(vue, /DocumentBack/);
  }
  assert.match(read('src/views/ProperCalendar.vue'), /calendar.pages/);
  assert.match(read('src/views/ProperCalendar.vue'), /:href="calendar.sourceFile"/);
  assert.match(read('src/components/DocumentBack.vue'), /router.push\(\{ name: 'Sources' \}\)/);
  for (const route of ['documents/proper-calendar', 'documents/liturgy-hours-decrees', 'documents/liturgy-hours-introduction']) assert.ok(read('src/router/index.js').includes(route));
});

test('new translations stay link-only until republication permission is established', () => {
  for (const document of [introduction, apostolic]) {
    assert.equal(document.publicationMode, 'official_link');
    assert.ok(!('paragraphs' in document) && !('fullText' in document));
  }
  assert.equal(introduction.fullTextUrl, 'https://lh.catholic.by/uvodziny.php');
  assert.equal(apostolic.sourceUrl, 'https://lh.catholic.by/dekrety.php');
  assert.deepEqual(apostolic.documents.map(doc => [doc.protocol, doc.date]), [['1000/71', '1971-04-11'], ['1814/84', '1985-04-07']]);
  for (const document of apostolic.documents) {
    assert.ok(!('volume' in document) && !('roman' in document) && !('fullText' in document));
    assert.ok(read('docs/sources/primary/lh-decrees-2026-11-05.txt').includes(`Прат. № ${document.protocol}`));
  }
  assert.equal(getSource('liturgy-hours-2012-2020').decrees.length, 4);
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
