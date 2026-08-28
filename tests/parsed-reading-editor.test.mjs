import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParsedReadingPayload,
  createAdditionalReadingSection,
  createParsedReadingDraft,
  suggestParsedReadingDocumentId,
  validateParsedReadingDraft,
} from '../src/utils/parsedReadingEditor.js';

function completeDraft() {
  const draft = createParsedReadingDraft({}, {
    dayId: 'ordinary-w3-d2',
    periodType: 'ordinary',
    periodWeekNumber: 3,
    dayOfWeek: 2,
    year: '2',
  });
  draft.title = 'Панядзелак III тыдня';
  Object.assign(draft.readingSections[0], {
    bible: 'Гбр 1, 1–6',
    comment: 'Бог прамовіў праз Сына',
    title: 'Чытанне Паслання да Габрэяў.',
    text: 'Шматразова і шматлікімі спосабамі прамаўляў Бог.',
  });
  Object.assign(draft.psalm, {
    bible: 'Пс 97 (96), 1 і 2b',
    chorus: 'Пакланіцеся Богу, усе анёлы Ягоныя.',
    verses: ['Пан валадарыць, няхай радуецца зямля.'],
  });
  Object.assign(draft.alleluia, { bible: 'Мк 1, 15', verse: 'Наблізілася Валадарства Божае.' });
  Object.assign(draft.gospel, {
    bible: 'Мк 1, 14–20',
    comment: 'Пакайцеся і верце ў Евангелле',
    title: '+ Чытанне святога Евангелля паводле Марка.',
    text: 'Езус прыйшоў у Галілею і абвяшчаў Евангелле.',
  });
  return draft;
}

test('creates a human-facing draft from a linked readings document', () => {
  const draft = createParsedReadingDraft({
    _dayId: 'feast-example',
    year: 'a',
    reading1: { text: 'Тэкст' },
    reading3: { text: 'Трэцяе чытанне' },
  });
  assert.equal(draft.sourceType, 'linked');
  assert.equal(draft.year, 'A');
  assert.deepEqual(draft.readingSections.map((section) => section.key), ['reading1', 'reading3']);
  assert.equal(createAdditionalReadingSection(draft.readingSections).key, 'reading2');
});

test('builds the canonical structured payload and keeps nullable fields', () => {
  const draft = completeDraft();
  const payload = buildParsedReadingPayload(draft, { _sourceCategory: 'legacy', custom: true });
  assert.equal(payload.custom, true);
  assert.equal(payload._sourceCategory, undefined);
  assert.equal(payload._dayId, 'ordinary-w3-d2');
  assert.equal(payload.year, '2');
  assert.equal(payload.psalm.altChorus, null);
  assert.equal(payload.reading1.text, draft.readingSections[0].text);
  assert.equal(payload.alleluia.verse, draft.alleluia.verse);
  assert.equal(suggestParsedReadingDocumentId(draft), 'ordinary-w3-d2--2');
});

test('clears obsolete selectors when the editor changes source type', () => {
  const draft = completeDraft();
  draft.linkedDayId = '';
  draft.sourceType = 'date';
  draft.date = '25.12';
  const payload = buildParsedReadingPayload(draft, {
    _feast: 'feast-old',
    _periodType: 'ordinary',
    _periodWeekNumber: 1,
    _dayOfWeek: 1,
  });
  assert.equal(payload._date, '25.12');
  assert.equal(payload._feast, undefined);
  assert.equal(payload._periodType, undefined);
});

test('validates a complete reading and reports incomplete core sections', () => {
  assert.deepEqual(validateParsedReadingDraft(completeDraft()), []);
  const incomplete = createParsedReadingDraft({}, { periodType: 'lent', periodWeekNumber: 1, dayOfWeek: 2 });
  assert.ok(validateParsedReadingDraft(incomplete).some((message) => message.includes('Першае чытанне')));
  assert.ok(validateParsedReadingDraft(incomplete).some((message) => message.includes('Евангелле')));
});
