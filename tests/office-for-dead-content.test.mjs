import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = JSON.parse(fs.readFileSync(
  new URL('../patchs/feasts/common-texts/office-for-dead.json', import.meta.url),
  'utf8',
));

test('office-for-dead hymns expose three selectable endings and separated stanzas', () => {
  for (const field of ['officeOfReadingsHymn', 'laudesHymn', 'vesperHymn']) {
    assert.equal((source[field].match(/data-alternative-title=/g) || []).length, 3, field);
    assert.ok((source[field].match(/<p>/g) || []).length >= 7, field);
  }
});

test('office-for-dead psalms use verse paragraphs without duplicated trailing antiphons', () => {
  const regularFields = [
    'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
    'laudesPs1', 'laudesPs2', 'vesperPs1', 'vesperPs2', 'vesperPs3',
  ];
  regularFields.forEach((field) => {
    assert.doesNotMatch(source[field], /<p>Ант\./u, field);
    assert.ok((source[field].match(/<p>/g) || []).length >= 4, field);
  });
});

test('Lauds third psalm has two alternatives with their own antiphons', () => {
  assert.equal((source.laudesPs3.match(/data-alternative-title=/g) || []).length, 2);
  assert.match(source.laudesPs3, /Псальм 146 \(145\)/u);
  assert.match(source.laudesPs3, /Псальм 150/u);
  assert.match(source.laudesPs3, /Усё жывое/u);
  assert.match(source.laudesPs3, /Хвала Айцу і Сыну/u);
});

test('every office prayer exposes five selectable alternatives', () => {
  for (const field of ['officeOfReadingsPr', 'laudesPr', 'sext1Pr', 'sext2Pr', 'sext3Pr', 'vesperPr']) {
    assert.equal((source[field].match(/data-alternative-title=/g) || []).length, 5, field);
  }
});

test('Lauds short reading uses the standard rubric and responsory formatting', () => {
  assert.match(source.laudesR, /<span style="color: #ff0000;">КАРОТКАЕ ЧЫТАННЕ 1 Тэс 4, 14<\/span>/u);
  assert.match(source.laudesR, /<span style="color: #ff0000;">КАРОТКІ РЭСПАНСОРЫЙ<\/span>/u);
  assert.equal((source.laudesR.match(/<span style="color: #ff0000;">К\.\s*<\/span>/g) || []).length, 3);
  assert.equal((source.laudesR.match(/<span style="color: #ff0000;">Н\.\s*<\/span>/g) || []).length, 3);
});

test('Lauds and Vespers intercessions use the standard response and petition layout', () => {
  assert.match(source.laudesInter, /<em>Пане, ажыві нас у Хрысце\.<\/em>/u);
  assert.match(source.vesperInter, /<em>Пане, Ты жыццё і ўваскрашэнне нашае\.<\/em>/u);
  assert.equal((source.laudesInter.match(/<br \/><span style="color: #ff0000;">–<\/span>/g) || []).length, 5);
  assert.equal((source.vesperInter.match(/<br \/><span style="color: #ff0000;">–<\/span>/g) || []).length, 6);
});

test('all office readings and responsories use rubrics and expose alternatives', () => {
  for (const field of ['laudesR', 'sext1R', 'sext2R', 'sext3R', 'vesperR']) {
    assert.match(source[field], /<span style="color: #ff0000;">КАРОТКАЕ ЧЫТАННЕ/u, field);
  }
  for (const field of ['sext1R', 'sext2R', 'sext3R']) {
    assert.match(source[field], /<span style="color: #ff0000;">К\.\s*<\/span>/u, field);
    assert.match(source[field], /<span style="color: #ff0000;">Н\.\s*<\/span>/u, field);
  }
  assert.equal((source.sext1R.match(/data-alternative-title=/g) || []).length, 2);
  assert.equal((source.vesperR.match(/data-alternative-title=/g) || []).length, 2);
  assert.equal((source.officeOfReadingsR1.match(/data-alternative-title=/g) || []).length, 3);
  assert.equal((source.officeOfReadingsR2.match(/data-alternative-title=/g) || []).length, 2);
});
