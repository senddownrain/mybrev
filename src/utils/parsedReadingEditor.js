import {
  buildPeriodDayId,
  buildReadingDocumentId,
  normalizeFeastCode,
  normalizeReadingCycle,
  readingSelector,
} from './parsedReadingsIdentity.js';
import { normalizeReadingText } from './readingTextNormalization.js';

const READING_SECTION_PATTERN = /^reading(\d+)$/;

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

function emptyReadingSection() {
  return {
    bible: '',
    comment: '',
    title: '',
    text: '',
  };
}

/** Fields of a section the editor models; everything else on the stored object is kept as it is. */
const SECTION_FIELDS = new Set(['key', 'bible', 'comment', 'title', 'text', 'alternatives', 'italicLines']);
const PSALM_FIELDS = new Set(['bible', 'chorus', 'altChorus', 'verses', 'text']);
const ALLELUIA_FIELDS = new Set(['bible', 'verse', 'text']);
const SEQUENCE_FIELDS = new Set(['text']);

const unknownFieldsOf = (object, known) => Object.fromEntries(
  Object.entries(object && typeof object === 'object' ? object : {}).filter(([key]) => !known.has(key)),
);

function normalizeReadingSection(section = {}) {
  const normalized = {
    ...unknownFieldsOf(section, SECTION_FIELDS),
    bible: nullableText(section.bible),
    comment: nullableText(section.comment),
    title: nullableText(section.title),
    text: normalizeReadingText(text(section.text)),
  };
  const alternatives = (section.alternatives || [])
    .filter(sectionHasAnyValue)
    .map((alternative) => normalizeReadingSection(alternative));
  if (alternatives.length) normalized.alternatives = alternatives;
  const italicLines = (section.italicLines || []).map(text).filter(Boolean);
  if (italicLines.length) normalized.italicLines = [...new Set(italicLines)];
  return normalized;
}

function sectionHasAnyValue(section = {}) {
  return ['bible', 'comment', 'title', 'text'].some((field) => text(section[field]));
}

function readingSectionNumber(name) {
  return Number(String(name).match(READING_SECTION_PATTERN)?.[1] || 0);
}

export function inferParsedReadingSourceType(data = {}) {
  if (data._feast) return 'feast';
  if (data._date) return 'date';
  if (data._periodType) return 'period';
  if (data._dayId || data._dayIds?.length) return 'linked';
  return 'period';
}

export function createParsedReadingDraft(data = {}, seed = {}) {
  const readingNames = Object.keys(data)
    .filter((key) => READING_SECTION_PATTERN.test(key))
    .sort((left, right) => readingSectionNumber(left) - readingSectionNumber(right));
  const sections = (readingNames.length ? readingNames : ['reading1']).map((key) => ({
    key,
    ...emptyReadingSection(),
    ...(data[key] || {}),
  }));

  const linkedDayIds = Array.isArray(data._dayIds)
    ? data._dayIds.map(String).filter(Boolean)
    : [];
  const linkedDayId = text(data._dayId || seed.dayId);

  return {
    title: data.title ?? seed.title ?? '',
    year: normalizeReadingCycle(data.year ?? seed.year) || null,
    sourceType: inferParsedReadingSourceType({
      ...seed,
      ...data,
      _dayId: data._dayId || seed.dayId,
    }),
    date: data._date ?? seed.date ?? '',
    feast: normalizeFeastCode(data._feast ?? seed.feast),
    periodType: data._periodType ?? seed.periodType ?? 'ordinary',
    // Lent «week 0» (the days after Ash Wednesday) is stored with a null week: it stays null.
    periodWeekNumber: data._periodWeekNumber === null ? null : Number(data._periodWeekNumber ?? seed.periodWeekNumber ?? 1),
    dayOfWeek: Number(data._dayOfWeek ?? seed.dayOfWeek ?? 1),
    variant: data._variant ?? '',
    linkedDayId,
    linkedDayIds,
    readingSections: sections,
    psalm: {
      bible: data.psalm?.bible ?? '',
      chorus: data.psalm?.chorus ?? '',
      altChorus: data.psalm?.altChorus ?? '',
      verses: Array.isArray(data.psalm?.verses) && data.psalm.verses.length
        ? data.psalm.verses.map((verse) => (
          typeof verse === 'string' ? verse : String(verse?.text ?? '')
        ))
        : [''],
      text: data.psalm?.text ?? '',
    },
    alleluia: {
      bible: data.alleluia?.bible ?? '',
      verse: data.alleluia?.verse ?? data.alleluia?.text ?? '',
    },
    sequence: { text: data.sequence?.text ?? '' },
    gospel: {
      ...emptyReadingSection(),
      ...(data.gospel || {}),
    },
  };
}

export function nextReadingSectionKey(sections = []) {
  const used = new Set(sections.map((section) => readingSectionNumber(section.key)));
  let number = 2;
  while (used.has(number)) number += 1;
  return `reading${number}`;
}

export function createAdditionalReadingSection(sections = []) {
  return { key: nextReadingSectionKey(sections), ...emptyReadingSection() };
}

export function buildParsedReadingPayload(draft, original = {}) {
  const payload = { ...original };

  for (const key of Object.keys(payload)) {
    if (READING_SECTION_PATTERN.test(key)) delete payload[key];
  }
  delete payload.id;
  delete payload._sourceCategory;
  delete payload._date;
  delete payload._feast;
  delete payload._periodType;
  delete payload._periodWeekNumber;
  delete payload._dayOfWeek;

  if (text(draft.title) || original.title !== undefined) payload.title = text(draft.title);
  payload.year = normalizeReadingCycle(draft.year) || null;

  const variant = text(draft.variant);
  if (variant) payload._variant = variant;
  else delete payload._variant;

  const linkedDayId = text(draft.linkedDayId);
  const linkedDayIds = [...new Set((draft.linkedDayIds || []).map(text).filter(Boolean))];
  if (linkedDayId) payload._dayId = linkedDayId;
  else delete payload._dayId;
  if (linkedDayIds.length) payload._dayIds = linkedDayIds;
  else delete payload._dayIds;

  if (draft.sourceType === 'date') {
    payload._date = text(draft.date);
  } else if (draft.sourceType === 'feast') {
    payload._feast = normalizeFeastCode(draft.feast);
  } else if (draft.sourceType === 'period') {
    payload._periodType = text(draft.periodType).toLowerCase();
    payload._periodWeekNumber = draft.periodWeekNumber === null ? null : Number(draft.periodWeekNumber);
    payload._dayOfWeek = Number(draft.dayOfWeek);
  }

  for (const section of draft.readingSections || []) {
    if (!sectionHasAnyValue(section)) continue;
    payload[section.key] = normalizeReadingSection(section);
  }

  payload.psalm = {
    ...unknownFieldsOf(original.psalm, PSALM_FIELDS),
    bible: nullableText(draft.psalm?.bible),
    chorus: text(draft.psalm?.chorus),
    altChorus: nullableText(draft.psalm?.altChorus),
    verses: (draft.psalm?.verses || []).map(text).filter(Boolean),
  };
  const psalmText = text(draft.psalm?.text);
  if (psalmText) payload.psalm.text = psalmText;

  const alleluiaVerse = text(draft.alleluia?.verse);
  if (alleluiaVerse) {
    payload.alleluia = {
      ...unknownFieldsOf(original.alleluia, ALLELUIA_FIELDS),
      bible: nullableText(draft.alleluia?.bible),
      verse: alleluiaVerse,
    };
  } else {
    delete payload.alleluia;
  }

  const sequenceText = text(draft.sequence?.text);
  if (sequenceText) payload.sequence = { ...unknownFieldsOf(original.sequence, SEQUENCE_FIELDS), text: sequenceText };
  else delete payload.sequence;

  payload.gospel = normalizeReadingSection(draft.gospel);
  return payload;
}

export function validateParsedReadingDraft(draft) {
  const errors = [];
  if (!text(draft.title)) errors.push('Укажыце назву дня або святкавання.');

  const selector = readingSelector(buildParsedReadingPayload(draft));
  const hasDayLink = text(draft.linkedDayId) || draft.linkedDayIds?.length;
  if (!selector && !hasDayLink) errors.push('Укажыце, да якога дня адносяцца чытанні.');

  const reading1 = draft.readingSections?.find((section) => section.key === 'reading1');
  for (const [field, label] of [
    ['bible', 'спасылку'],
    ['comment', 'кароткі загаловак'],
    ['title', 'літургічны ўступ'],
    ['text', 'тэкст'],
  ]) {
    if (!text(reading1?.[field])) errors.push(`Першае чытанне: запоўніце ${label}.`);
  }

  if (!text(draft.psalm?.bible)) errors.push('Псальм: укажыце спасылку.');
  if (!text(draft.psalm?.chorus)) errors.push('Псальм: укажыце рэфрэн.');
  if (!(draft.psalm?.verses || []).some((verse) => text(verse))) {
    errors.push('Псальм: дадайце хаця б адну страфу.');
  }

  if (text(draft.variant).toLowerCase() !== 'vigil') {
    if (!text(draft.alleluia?.verse)) errors.push('Укажыце верш спеву перад Евангеллем.');
  }

  for (const [field, label] of [
    ['bible', 'спасылку'],
    ['title', 'літургічны ўступ'],
    ['text', 'тэкст'],
  ]) {
    if (!text(draft.gospel?.[field])) errors.push(`Евангелле: запоўніце ${label}.`);
  }

  return errors;
}

export function suggestParsedReadingDocumentId(draft) {
  let base = text(draft.linkedDayId);
  if (!base && draft.sourceType === 'period') {
    base = buildPeriodDayId(buildParsedReadingPayload(draft));
  }
  if (!base && draft.sourceType === 'feast') base = normalizeFeastCode(draft.feast);
  return buildReadingDocumentId(base, draft);
}
