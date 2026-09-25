// Pure helpers for the canonical Compendium dataset (see docs/compendium.md).
// No Vue, Firebase or `@/` imports: this module is shared by the app, the
// Node build/import scripts and `node --test`.

export const COMPENDIUM_SCHEMA_VERSION = 1;
export const COMPENDIUM_EXPECTED_QUESTION_COUNT = 598;

const CCC_REF = /^\d+(?:-\d+)?$/;
const INTRO_MARKERS = [/motu\s+proprio/i, /^УВОДЗІНЫ$/u, /Бенедыкт\s+XVI/u];

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Structural validation of a canonical dataset. Returns human-readable errors;
 * an empty array means the dataset is safe to render and index.
 */
export function validateCompendiumDataset(dataset, { expectedQuestionCount = COMPENDIUM_EXPECTED_QUESTION_COUNT } = {}) {
  const errors = [];
  const fail = (message) => { if (errors.length < 50) errors.push(message); };
  if (!dataset || typeof dataset !== 'object') return ['Dataset is not an object.'];
  const { meta, parts, units } = dataset;
  if (!meta || meta.schemaVersion !== COMPENDIUM_SCHEMA_VERSION) fail(`Unsupported schemaVersion: ${meta?.schemaVersion}`);
  if (!Number.isInteger(meta?.contentVersion) || meta.contentVersion < 1) fail('meta.contentVersion must be a positive integer.');
  if (!isText(meta?.sourceUrl) || !isText(meta?.sourceTitle)) fail('Source attribution is missing.');
  if (!Array.isArray(parts) || parts.length !== 4) fail('Expected exactly four parts.');
  if (!Array.isArray(units) || !units.length) return [...errors, 'Units are missing.'];

  const partNumbers = new Set((parts || []).map((part) => part.number));
  const unitIds = new Set();
  const topicIds = new Set();
  let expectedNumber = 1;
  let previousPart = 0;
  units.forEach((unit, unitIndex) => {
    if (!isText(unit.id) || unitIds.has(unit.id)) fail(`Invalid or duplicate unit id at ${unitIndex}.`);
    unitIds.add(unit.id);
    if (unit.order !== unitIndex + 1) fail(`Unit ${unit.id} has order ${unit.order}, expected ${unitIndex + 1}.`);
    if (!partNumbers.has(unit.partNumber)) fail(`Unit ${unit.id} references unknown part ${unit.partNumber}.`);
    if (unit.partNumber < previousPart) fail(`Unit ${unit.id} breaks part order.`);
    previousPart = unit.partNumber;
    if (!Array.isArray(unit.questions) || !unit.questions.length) fail(`Unit ${unit.id} has no questions.`);
    const unitTopics = new Map((unit.topics || []).map((topic) => [topic.id, topic]));
    (unit.topics || []).forEach((topic, topicIndex) => {
      if (!isText(topic.id) || topicIds.has(topic.id)) fail(`Invalid or duplicate topic id in ${unit.id}.`);
      topicIds.add(topic.id);
      if (topic.order !== topicIndex + 1) fail(`Topic ${topic.id} has order ${topic.order}.`);
      if (!isText(topic.title)) fail(`Topic ${topic.id} has no title.`);
    });
    let previousTopicIndex = -1;
    for (const question of unit.questions || []) {
      const label = `Question ${question?.number}`;
      if (question.number !== expectedNumber) fail(`${label}: expected number ${expectedNumber} (gap, duplicate or order error).`);
      expectedNumber = (Number.isInteger(question.number) ? question.number : expectedNumber) + 1;
      if (question.id !== `q${String(question.number).padStart(3, '0')}`) fail(`${label}: unexpected id ${question.id}.`);
      if (question.order !== question.number) fail(`${label}: order ${question.order} differs from number.`);
      if (!isText(question.question)) fail(`${label}: empty question.`);
      if (!isText(question.answer)) fail(`${label}: empty answer.`);
      if (!Array.isArray(question.cccRefs) || question.cccRefs.some((ref) => !CCC_REF.test(ref))) fail(`${label}: invalid cccRefs.`);
      if (question.topicId !== null) {
        const topic = unitTopics.get(question.topicId);
        if (!topic) fail(`${label}: unknown topic ${question.topicId}.`);
        else {
          if (question.topicTitle !== topic.title) fail(`${label}: topicTitle differs from topic.`);
          const topicIndex = unit.topics.indexOf(topic);
          if (topicIndex < previousTopicIndex) fail(`${label}: topic order is not monotonic.`);
          previousTopicIndex = topicIndex;
          if (question.number < topic.firstQuestion || question.number > topic.lastQuestion) fail(`${label}: outside topic range.`);
        }
      } else if (previousTopicIndex >= 0) fail(`${label}: question without topic after a topic.`);
      for (const range of question.answerEmphasis || []) {
        if (!(range.start >= 0 && range.end > range.start && range.end <= question.answer.length)) fail(`${label}: invalid emphasis range.`);
      }
      for (const text of [question.question, question.answer]) {
        if (INTRO_MARKERS.some((marker) => marker.test(text || ''))) fail(`${label}: contains introductory material.`);
      }
    }
    if (unit.firstQuestion !== unit.questions?.[0]?.number || unit.lastQuestion !== unit.questions?.at(-1)?.number) {
      fail(`Unit ${unit.id}: question range does not match its questions.`);
    }
  });
  const total = expectedNumber - 1;
  if (total !== expectedQuestionCount) fail(`Expected ${expectedQuestionCount} questions, found ${total}.`);
  if (meta?.questionCount !== total) fail(`meta.questionCount (${meta?.questionCount}) differs from ${total}.`);
  if (Array.isArray(meta?.unitIds) && meta.unitIds.join('|') !== units.map((unit) => unit.id).join('|')) fail('meta.unitIds differ from unit order.');
  return errors;
}

/** Reassemble a dataset from Firestore documents (meta + one document per unit). */
export function compendiumFromDocuments(meta, unitDocuments) {
  const byId = new Map(unitDocuments.map((unit) => [unit.id, unit]));
  const ids = Array.isArray(meta?.unitIds) ? meta.unitIds : [...byId.keys()];
  const units = ids.map((id) => byId.get(id)).filter(Boolean)
    .map(({ importedAt: _importedAt, ...unit }) => unit)
    .sort((a, b) => a.order - b.order);
  const { importedAt: _importedAt, parts, ...rest } = meta || {};
  return { meta: rest, parts: parts || [], units };
}

const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V'];
export const romanNumeral = (value) => romanNumerals[value] || String(value ?? '');

/**
 * Build lookup structures once per dataset: a flat ordered question list, a
 * number index and "reading groups" (topics, or a unit's untitled lead-in).
 */
export function indexCompendium(dataset) {
  const questions = [];
  const byNumber = new Map();
  const groups = new Map();
  const groupOrder = [];
  const partsById = new Map(dataset.parts.map((part) => [part.id, part]));

  for (const unit of dataset.units) {
    const unitGroup = {
      id: unit.id,
      kind: 'unit',
      unit,
      title: unit.chapterTitle || unit.sectionTitle || unit.partTitle,
      parentTitle: null,
      leadCitations: unit.leadCitations || [],
      questions: [],
    };
    const topicGroups = new Map(unit.topics.map((topic) => [topic.id, {
      id: topic.id,
      kind: 'topic',
      unit,
      topic,
      title: topic.title,
      parentTitle: topic.parentTitle || null,
      leadCitations: topic.leadCitations || [],
      questions: [],
    }]));
    for (const question of unit.questions) {
      const entry = {
        ...question,
        unitId: unit.id,
        partId: unit.partId,
        partNumber: unit.partNumber,
        partLabel: unit.partLabel,
        partTitle: unit.partTitle,
        sectionTitle: unit.sectionTitle,
        chapterTitle: unit.chapterTitle,
      };
      questions.push(entry);
      byNumber.set(entry.number, entry);
      (topicGroups.get(question.topicId) || unitGroup).questions.push(entry);
    }
    for (const group of [unitGroup, ...topicGroups.values()]) {
      if (!group.questions.length) continue;
      group.firstQuestion = group.questions[0].number;
      group.lastQuestion = group.questions.at(-1).number;
      groups.set(group.id, group);
      groupOrder.push(group.id);
    }
  }
  groupOrder.sort((a, b) => groups.get(a).firstQuestion - groups.get(b).firstQuestion);
  for (const question of questions) question.groupId = question.topicId && groups.has(question.topicId) ? question.topicId : question.unitId;

  return {
    meta: dataset.meta,
    parts: dataset.parts,
    units: dataset.units,
    questions,
    byNumber,
    groups,
    groupOrder,
    partsById,
    getQuestion: (value) => byNumber.get(Number(String(value).replace(/^q0*/i, ''))) || null,
    getGroup: (id) => groups.get(id) || null,
    getPart: (id) => partsById.get(id) || dataset.parts.find((part) => String(part.number) === String(id)) || null,
  };
}

/**
 * Part outline for navigation: sections → chapters → reading groups.
 * Section/chapter levels without a heading are represented with `title: null`.
 */
export function buildPartOutline(index, partId) {
  const part = index.getPart(partId);
  if (!part) return null;
  const sections = [];
  for (const groupId of index.groupOrder) {
    const group = index.groups.get(groupId);
    const { unit } = group;
    if (unit.partId !== part.id) continue;
    let section = sections.find((item) => item.number === unit.sectionNumber);
    if (!section) {
      section = { id: `${part.id}-s${unit.sectionNumber}`, number: unit.sectionNumber, label: unit.sectionLabel, title: unit.sectionTitle, chapters: [] };
      sections.push(section);
    }
    let chapter = section.chapters.find((item) => item.number === unit.chapterNumber);
    if (!chapter) {
      chapter = { id: unit.id, number: unit.chapterNumber, label: unit.chapterLabel, title: unit.chapterTitle, groups: [] };
      section.chapters.push(chapter);
    }
    chapter.groups.push(group);
  }
  return { part, sections };
}

/** Breadcrumb labels for a question or group (visible Belarusian source titles only). */
export function contextTrail(index, item) {
  const unit = item?.unit || index.units.find((candidate) => candidate.id === item?.unitId);
  if (!unit) return [];
  const trail = [unit.partLabel, unit.sectionTitle, unit.chapterTitle];
  const topicTitle = item.topic?.title ?? item.topicTitle;
  if (topicTitle) trail.push(topicTitle);
  return trail.filter(Boolean);
}

/** Split an answer into paragraphs of styled runs using `answerEmphasis`. */
export function answerParagraphs(question) {
  const text = question?.answer || '';
  const ranges = [...(question?.answerEmphasis || [])].sort((a, b) => a.start - b.start);
  const runs = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) runs.push({ text: text.slice(cursor, range.start), style: null });
    runs.push({ text: text.slice(range.start, range.end), style: range.style });
    cursor = range.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), style: null });

  const paragraphs = [[]];
  for (const run of runs) {
    const pieces = run.text.split('\n');
    pieces.forEach((piece, pieceIndex) => {
      if (pieceIndex > 0) paragraphs.push([]);
      if (piece) paragraphs.at(-1).push({ text: piece, style: run.style });
    });
  }
  return paragraphs.filter((paragraph) => paragraph.length);
}

export function formatCccRefs(refs = []) {
  return refs.map((ref) => ref.replace('-', '–')).join(', ');
}
