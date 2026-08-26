import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentIssues,
  validTitle,
} from '../scripts/audit-parsed-readings-content-integrity.mjs';

const completeDocument = {
  year: null,
  reading1: {
    text: 'Тэкст першага чытання.',
    comment: 'Кароткі каментар.',
    title: 'Чытанне кнігі Апакаліпсіса святога апостала Яна.',
    bible: 'Ап 12, 10–12',
  },
  psalm: {
    altChorus: null,
    bible: 'Пс 96 (95), 1–2',
    verses: ['Спявайце Пану новую песню.'],
    chorus: 'Апавядайце пра славу Пана.',
  },
  alleluia: {
    verse: 'Авечкі мае слухаюць Мой голас.',
    bible: 'Ян 10, 27',
  },
  gospel: {
    text: 'У той час Езус маліўся за сваіх вучняў.',
    comment: 'Каб былі з’яднаныя ў адно',
    title: '+ Чытанне святога Евангелля паводле Яна.',
    bible: 'Ян 17, 20–26',
  },
};

test('accepts complete reading content and lectionary headings', () => {
  assert.deepEqual(documentIssues(completeDocument), []);
  assert.equal(validTitle('gospel', 'Мука Пана нашага Езуса Хрыста паводле Мацвея.'), true);
});

test('detects comments misplaced in reading and gospel title fields', () => {
  const document = structuredClone(completeDocument);
  document.reading1.title = 'Перамаглі, дзякуючы крыві Ягняці';
  document.reading1.comment = null;
  document.gospel.title = 'Каб былі з’яднаныя ў адно';
  document.gospel.comment = null;

  const issues = documentIssues(document);
  assert.equal(issues.filter((issue) => issue.problem === 'non-lectionary-title').length, 2);
  assert.equal(issues.filter((issue) => issue.problem === 'missing-required-field'
    && issue.field === 'comment').length, 2);
});

test('requires canonical year and the nullable psalm altChorus field', () => {
  const document = structuredClone(completeDocument);
  document.year = '2026';
  delete document.psalm.altChorus;
  const issues = documentIssues(document);
  assert.ok(issues.some((issue) => issue.problem === 'invalid-year'));
  assert.ok(issues.some((issue) => issue.problem === 'missing-nullable-field'
    && issue.section === 'psalm' && issue.field === 'altChorus'));
});

test('rejects normalized-but-noncanonical year values', () => {
  for (const year of ['a', 1]) {
    const document = structuredClone(completeDocument);
    document.year = year;
    assert.ok(documentIssues(document).some((issue) => issue.problem === 'invalid-year'));
  }
});

test('validates every additional readingN section when present', () => {
  const document = structuredClone(completeDocument);
  document.reading3 = {
    text: 'Тэкст трэцяга чытання.',
    comment: null,
    title: 'Чытанне кнігі Зыходу.',
    bible: 'Зых 14, 15 — 15, 1а',
  };
  const issues = documentIssues(document);
  assert.ok(issues.some((issue) => issue.section === 'reading3'
    && issue.field === 'comment' && issue.problem === 'missing-required-field'));
});

test('detects swapped and duplicated psalm refrains', () => {
  const swapped = structuredClone(completeDocument);
  swapped.psalm.chorus = '1. Першы сапраўдны верш псальма.';
  swapped.psalm.verses = ['Правільны рэфрэн псальма.', '2. Другі верш псальма.'];
  assert.ok(documentIssues(swapped).some((issue) => issue.problem === 'swapped-psalm-chorus'));

  const duplicated = structuredClone(completeDocument);
  duplicated.psalm.verses.unshift(duplicated.psalm.chorus);
  assert.ok(documentIssues(duplicated).some((issue) => issue.problem === 'duplicated-psalm-chorus-in-verses'));

  const alternate = structuredClone(completeDocument);
  alternate.psalm.chorus = 'Асноўны рэфрэн. Або: Аллелюя.';
  assert.ok(documentIssues(alternate).some((issue) => issue.problem === 'embedded-alternate-psalm-chorus'));

  const contaminated = structuredClone(completeDocument);
  contaminated.psalm.verses.push('ПЕРШАЕ ЧЫТАННЕ');
  assert.ok(documentIssues(contaminated).some((issue) => issue.problem === 'parser-marker-in-psalm-verses'));
});

test('allows an explicit null Bible reference for non-biblical acclamations', () => {
  const document = structuredClone(completeDocument);
  document.alleluia.bible = null;
  assert.deepEqual(documentIssues(document), []);
});

test('accepts the Paschal Vigil alleluia as the final psalm refrain', () => {
  const document = structuredClone(completeDocument);
  document._variant = 'vigil';
  document.psalm.chorus = 'Аллелюя, аллелюя, аллелюя.';
  delete document.alleluia;
  assert.deepEqual(documentIssues(document), []);
});

test('detects liturgical response wrappers embedded in the alleluia verse', () => {
  const document = structuredClone(completeDocument);
  document.alleluia.verse = 'Хвала Табе, слова Божае. Ян 10, 27 Авечкі мае слухаюць Мой голас. Хвала Табе, слова Божае.';
  assert.ok(documentIssues(document).some((issue) => issue.problem === 'acclamation-wrapper-in-verse'));
});
