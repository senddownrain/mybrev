// Holy Mass V4 content normalization and migration planning.
//
// Pure functions only: no Firestore, no file system. The CLI
// (scripts/migrate-mass-content-v4.mjs) and the tests share this module.
//
// Allowed changes to a Mass text (everything else must stay byte-identical
// once markup and whitespace are ignored — see `massWordingFingerprint`):
//   1. the five major-section headings become the canonical Belarusian names;
//   2. speaker prefixes get one syntax (`С.`/`Н.`, `V.`/`R.`);
//   3. markup and whitespace.
import { createHash } from 'node:crypto';

export const MASS_V4_COLLECTION = 'prayers';

export const MASS_V4_DOCUMENTS = Object.freeze([
  Object.freeze({ id: 'eMmCtxwyJ75ogmL5rwye', language: 'be' }),
  Object.freeze({ id: 'zdro66KYVuQ9p2KbqizD', language: 'la' }),
  Object.freeze({ id: 'order-of-mass-en', language: 'en' }),
]);

export const MASS_V4_MAJOR_HEADINGS = Object.freeze([
  Object.freeze({
    id: 'introductory-rites',
    title: 'Уступныя абрады',
    former: ['Вступительные обряды', 'The Introductory Rites'],
  }),
  Object.freeze({
    id: 'liturgy-of-the-word',
    title: 'Літургія слова',
    former: ['Литургия Слова', 'The Liturgy of the Word'],
  }),
  Object.freeze({
    id: 'eucharistic-liturgy',
    title: 'Эўхарыстычная літургія',
    former: ['Евхаристическая Литургия', 'The Liturgy of the Eucharist'],
  }),
  Object.freeze({
    id: 'communion-rite',
    title: 'Абрад Камуніі',
    former: ['Обряд причащения', 'The Communion Rite'],
  }),
  Object.freeze({
    id: 'concluding-rites',
    title: 'Заключныя абрады',
    former: ['Абрад заканчэння', 'Заключительный обряд', 'The Concluding Rites'],
  }),
]);

// Headings that already exist in the sources and only get heading markup.
const SUBSECTION_HEADINGS = {
  be: ['Чын пакаяння', 'Хвала на вышынях Богу', 'Малітва дня — Калекта', 'Вызнанне веры', 'II эўхарыстычная малітва'],
  la: ['Исповедание веры', 'Вторая Евхаристическая молитва'],
  en: [],
};
const MINOR_HEADINGS = { be: [], la: ['ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ'], en: [] };
// Paragraphs that are directions, not spoken text.
const RUBRIC_PARAGRAPHS = { be: [], la: ['Или:', 'После чтения:', 'Евангелие:'], en: [] };

// Source prefix → canonical prefix. A prefix ending with ":" may be followed
// by text directly; the others need whitespace or the end of the line.
const SPEAKER_PREFIXES = {
  be: { 'С.:': 'С.', 'C.:': 'С.', 'Н.:': 'Н.', 'С.': 'С.', 'Н.': 'Н.', 'Цэлебрант:': 'Цэлебрант:', 'Усе:': 'Усе:' },
  la: { 'V.': 'V.', 'R.': 'R.' },
  en: {},
};

export const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

const plain = (value) => String(value).replace(/^#{1,6}\s+/, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

function majorHeadingOf(text) {
  const value = plain(text);
  return MASS_V4_MAJOR_HEADINGS.find((heading) => heading.title === value || heading.former.includes(value)) || null;
}

function speakerPrefixOf(line, language) {
  const prefixes = Object.keys(SPEAKER_PREFIXES[language] || {}).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length);
    if (prefix.endsWith(':') || !rest || /^\s/.test(rest)) return { prefix, rest: rest.trim() };
  }
  return null;
}

/** Splits prayer Markdown into rubric fences and blank-line separated blocks. */
export function parseMassSourceBlocks(text) {
  const blocks = [];
  let paragraph = [];
  let rubric = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (rubric) {
      if (line === ':::') {
        blocks.push({ type: 'rubric', lines: rubric.filter(Boolean) });
        rubric = null;
      } else rubric.push(line);
      return;
    }
    if (line === ':::rubric') {
      flush();
      rubric = [];
    } else if (!line) flush();
    else paragraph.push(line);
  });
  if (rubric) blocks.push({ type: 'rubric', lines: rubric.filter(Boolean) });
  flush();
  return blocks.filter((block) => block.lines.length);
}

function serializeMassSourceBlocks(blocks) {
  return blocks.map((block) => (
    block.type === 'rubric' ? `:::rubric\n${block.lines.join('\n')}\n:::` : block.lines.join('\n')
  )).join('\n\n');
}

const isHeadingLine = (line) => /^#{1,6}\s/.test(line);

/**
 * Normalizes one Mass text. Deterministic and idempotent.
 * @param {'be'|'la'|'en'} language
 * @param {string} text
 * @returns {{ text: string, changed: boolean, counts: Record<string, number>, changes: object[] }}
 */
export function normalizeMassText(language, text) {
  const source = String(text ?? '');
  const changes = [];
  const note = (kind, before, after) => {
    if (before !== after) changes.push({ kind, before, after });
  };
  const sameInList = (list, value) => list.some((item) => plain(item) === plain(value));
  let blocks = parseMassSourceBlocks(source);

  // A speaker prefix left alone before a rubric belongs to the line after it:
  // «V.» / (После чтения) / «Verbum Domini.» → (После чтения) / «V. Verbum Domini.»
  for (let index = 0; index + 2 < blocks.length; index += 1) {
    const [label, rubric, spoken] = [blocks[index], blocks[index + 1], blocks[index + 2]];
    const prefix = label.type === 'paragraph' && label.lines.length === 1 && speakerPrefixOf(label.lines[0], language);
    if (!prefix || prefix.rest || rubric.type !== 'rubric' || spoken.type !== 'paragraph') continue;
    if (isHeadingLine(spoken.lines[0]) || speakerPrefixOf(spoken.lines[0], language)) continue;
    const before = serializeMassSourceBlocks([label, rubric, spoken]);
    const moved = { type: 'paragraph', lines: [`${prefix.prefix} ${spoken.lines[0]}`, ...spoken.lines.slice(1)] };
    blocks.splice(index, 3, rubric, moved);
    note('prefix', before, serializeMassSourceBlocks([rubric, moved]));
  }

  blocks = blocks.map((block) => {
    const single = block.lines.length === 1 ? block.lines[0] : null;
    const before = serializeMassSourceBlocks([block]);

    if (single !== null) {
      const major = majorHeadingOf(single);
      if (major) {
        const after = `## ${major.title}`;
        note(plain(single) === major.title ? 'markup' : 'heading', before, after);
        return { type: 'paragraph', lines: [after] };
      }
      const levels = [[SUBSECTION_HEADINGS, '###'], [MINOR_HEADINGS, '####']];
      for (const [list, hashes] of levels) {
        if (!sameInList(list[language] || [], single)) continue;
        const after = `${hashes} ${plain(single)}`;
        note('markup', before, after);
        return { type: 'paragraph', lines: [after] };
      }
      if (block.type === 'paragraph' && sameInList(RUBRIC_PARAGRAPHS[language] || [], single) && !isHeadingLine(single)) {
        const rubric = { type: 'rubric', lines: [single] };
        note('markup', before, serializeMassSourceBlocks([rubric]));
        return rubric;
      }
    }

    const lines = block.lines.map((line) => {
      let value = line;
      if (block.type === 'paragraph') {
        const speaker = speakerPrefixOf(value, language);
        if (speaker) {
          const canonical = SPEAKER_PREFIXES[language][speaker.prefix];
          const next = speaker.rest ? `${canonical} ${speaker.rest}` : canonical;
          note('prefix', value, next);
          value = next;
        }
      }
      let spaced = value.replace(/[ \t]{2,}/g, ' ');
      if (language === 'be') {
        // Sentences glued together when line breaks were lost, and the cross
        // sign glued to its neighbours.
        if (block.type === 'rubric') spaced = spaced.replace(/([.!?])(?=\p{Lu}\p{Ll})/gu, '$1 ');
        spaced = spaced.replace(/(\S)(\*\*[XХ+]\*\*)/g, '$1 $2').replace(/(\*\*[XХ+]\*\*)(\p{L})/gu, '$1 $2');
      }
      note('whitespace', value, spaced);
      return spaced;
    });
    return { ...block, lines };
  });

  const normalized = serializeMassSourceBlocks(blocks);
  const counts = { heading: 0, prefix: 0, markup: 0, whitespace: 0 };
  changes.forEach((change) => { counts[change.kind] += 1; });
  // Blank-line runs, stray indentation and trailing spaces are fixed by the
  // serializer; they are counted as one whitespace change per affected line.
  if (normalized !== source) {
    const replay = serializeMassSourceBlocks(parseMassSourceBlocks(source));
    if (replay !== source) {
      const tidy = source.replace(/\r\n?/g, '\n').split('\n')
        .filter((line) => line !== line.trim()).length;
      counts.whitespace += Math.max(tidy, 1);
    }
  }
  return { text: normalized, changed: normalized !== source, counts, changes };
}

/**
 * Wording of a Mass text with everything the allow-list may change removed:
 * markup, whitespace, speaker prefixes (returned separately as roles) and the
 * five major headings (returned as section ids).
 */
export function massWordingFingerprint(language, text) {
  const sections = [];
  const speakers = [];
  const canonicalPrefix = SPEAKER_PREFIXES[language] || {};
  const words = [];
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((rawLine) => {
    let line = rawLine.trim();
    if (!line || line === ':::rubric' || line === ':::' || /^-{3,}$/.test(line)) return;
    const major = majorHeadingOf(line);
    if (major) {
      sections.push(major.id);
      return;
    }
    line = line.replace(/^#{1,6}\s+/, '');
    const speaker = speakerPrefixOf(line, language);
    if (speaker) {
      speakers.push(canonicalPrefix[speaker.prefix]);
      line = speaker.rest;
    }
    words.push(line.replace(/\*+/g, ''));
  });
  return { wording: words.join('').replace(/\s+/g, ''), sections, speakers };
}

/** Throws when `after` differs from `before` by more than the allow-list. */
export function assertMassAllowListedChange(language, before, after) {
  const a = massWordingFingerprint(language, before);
  const b = massWordingFingerprint(language, after);
  if (a.wording !== b.wording) {
    let index = 0;
    while (index < a.wording.length && a.wording[index] === b.wording[index]) index += 1;
    throw new Error(`Mass wording changed (${language}) near «${a.wording.slice(Math.max(0, index - 20), index + 20)}» → «${b.wording.slice(Math.max(0, index - 20), index + 20)}»`);
  }
  if (a.speakers.join('|') !== b.speakers.join('|')) throw new Error(`Mass speaker sequence changed (${language})`);
  if (a.sections.join('|') !== b.sections.join('|')) throw new Error(`Mass major sections changed (${language})`);
  const expected = MASS_V4_MAJOR_HEADINGS.map((heading) => heading.id).join('|');
  if (b.sections.join('|') !== expected) {
    throw new Error(`Mass text (${language}) must contain exactly the five major sections in order; found: ${b.sections.join(', ') || 'none'}`);
  }
}

/** Text fields the readers actually display: `text`, else every `textVersions` entry. */
export function activeMassTextFields(data = {}) {
  if (typeof data.text === 'string' && data.text.trim()) return ['text'];
  return Object.keys(data.textVersions || {})
    .filter((key) => typeof data.textVersions[key] === 'string' && data.textVersions[key].trim())
    .sort()
    .map((key) => `textVersions.${key}`);
}

const readField = (data, fieldPath) => fieldPath.split('.').reduce((value, key) => value?.[key], data);

/**
 * Plans the migration of one fetched document.
 * @param {{ id: string, language: string }} target
 * @param {{ exists: boolean, data?: object, updateTime?: string|null }} snapshot
 */
export function planMassDocument(target, snapshot) {
  const base = { collection: MASS_V4_COLLECTION, id: target.id, language: target.language };
  if (!snapshot?.exists) {
    return { ...base, status: 'missing', updateTime: null, fields: [], texts: {} };
  }
  const texts = {};
  const fields = activeMassTextFields(snapshot.data).map((fieldPath) => {
    const before = readField(snapshot.data, fieldPath);
    const result = normalizeMassText(target.language, before);
    assertMassAllowListedChange(target.language, before, result.text);
    texts[fieldPath] = { before, after: result.text };
    return {
      path: fieldPath,
      changed: result.changed,
      beforeSha256: sha256(before),
      afterSha256: sha256(result.text),
      beforeLength: before.length,
      afterLength: result.text.length,
      counts: result.counts,
    };
  });
  if (!fields.length) throw new Error(`prayers/${target.id} has no text to migrate`);
  return {
    ...base,
    status: fields.some((field) => field.changed) ? 'update' : 'unchanged',
    updateTime: snapshot.updateTime || null,
    fields,
    texts,
  };
}

/** Minimal line diff (LCS) rendered as unified-style hunks. */
export function diffLines(before, after, context = 2) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ mark: ' ', line: a[i], a: i + 1, b: j + 1 });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      rows.push({ mark: '-', line: a[i], a: i + 1, b: j + 1 });
      i += 1;
    } else {
      rows.push({ mark: '+', line: b[j], a: i + 1, b: j + 1 });
      j += 1;
    }
  }
  const keep = new Set();
  rows.forEach((row, index) => {
    if (row.mark === ' ') return;
    for (let k = Math.max(0, index - context); k <= Math.min(rows.length - 1, index + context); k += 1) keep.add(k);
  });
  const output = [];
  let previous = -2;
  [...keep].sort((x, y) => x - y).forEach((index) => {
    if (index !== previous + 1) output.push(`@@ -${rows[index].a} +${rows[index].b} @@`);
    output.push(`${rows[index].mark}${rows[index].line}`);
    previous = index;
  });
  return output.join('\n');
}

const stripTexts = ({ texts: _texts, ...document }) => document;

/**
 * Runs the migration against a Firestore adapter.
 *
 * Adapter: `get(id)` → `{ exists, data, updateTime }`,
 * `update(id, fields, { lastUpdateTime })`. Dry run never calls `update`.
 *
 * @param {object} input
 * @param {{ get: Function, update: Function }} input.firestore
 * @param {boolean} [input.apply]
 * @param {object|null} [input.previousPlan] plan written by the last dry run (required for apply)
 * @param {(documents: object[]) => Promise<void>|void} [input.backup] receives the untouched documents before anything else
 * @param {string} [input.generatedAt]
 */
export async function runMassMigration({ firestore, apply = false, previousPlan = null, backup, generatedAt = new Date().toISOString() }) {
  const fetched = [];
  for (const target of MASS_V4_DOCUMENTS) {
    const snapshot = await firestore.get(target.id);
    fetched.push({ target, snapshot: { exists: Boolean(snapshot?.exists), data: snapshot?.data, updateTime: snapshot?.updateTime || null } });
  }
  await backup?.(fetched.map(({ target, snapshot }) => ({ ...target, ...snapshot })));

  const documents = fetched.map(({ target, snapshot }) => planMassDocument(target, snapshot));
  const plan = {
    schema: 'mass-content-v4-plan/1',
    generatedAt,
    mode: apply ? 'apply' : 'dry-run',
    documents: documents.map(stripTexts),
  };
  if (!apply) return { plan, documents, writes: [], results: documents.map(({ id, status }) => ({ id, status: status === 'update' ? 'would-update' : status })) };

  if (!previousPlan?.documents) {
    throw new Error('No dry-run plan found. Run the migration without --apply first and review the report.');
  }

  // Decide everything before the first write.
  const writes = [];
  const results = [];
  documents.forEach((document) => {
    const planned = previousPlan.documents.find((item) => item.id === document.id);
    if (!planned) throw new Error(`prayers/${document.id} is not part of the dry-run plan.`);
    if (document.status === 'missing') {
      if (planned.status !== 'missing') throw new Error(`prayers/${document.id} existed at dry run and is now missing. Re-run the dry run.`);
      results.push({ id: document.id, status: 'missing' });
      return;
    }
    if (planned.status === 'missing') {
      throw new Error(`prayers/${document.id} did not exist at dry run and exists now. Re-run the dry run.`);
    }
    const currentByPath = new Map(document.fields.map((field) => [field.path, field]));
    const samePaths = planned.fields.length === document.fields.length
      && planned.fields.every((field) => currentByPath.has(field.path));
    const alreadyApplied = samePaths
      && planned.fields.every((field) => currentByPath.get(field.path).beforeSha256 === field.afterSha256);
    if (alreadyApplied) {
      results.push({ id: document.id, status: 'already-applied' });
      return;
    }
    const untouched = samePaths
      && document.updateTime === planned.updateTime
      && planned.fields.every((field) => {
        const current = currentByPath.get(field.path);
        return current.beforeSha256 === field.beforeSha256 && current.afterSha256 === field.afterSha256;
      });
    if (!untouched) {
      throw new Error(
        `prayers/${document.id} changed since the dry run (planned updateTime ${planned.updateTime}, `
        + `current ${document.updateTime}). Nothing was written. Re-run the dry run and review the new report.`,
      );
    }
    const changed = document.fields.filter((field) => field.changed);
    if (!changed.length) {
      results.push({ id: document.id, status: 'unchanged' });
      return;
    }
    writes.push({
      id: document.id,
      lastUpdateTime: document.updateTime,
      fields: Object.fromEntries(changed.map((field) => [field.path, document.texts[field.path].after])),
    });
  });

  for (const write of writes) {
    await firestore.update(write.id, write.fields, { lastUpdateTime: write.lastUpdateTime });
    results.push({ id: write.id, status: 'updated', fields: Object.keys(write.fields) });
  }
  return { plan, documents, writes, results };
}

/** Human-readable dry-run report (Markdown). Contains the texts' diff. */
export function renderMassMigrationReport({ plan, documents, results = [] }) {
  const lines = [
    '# Holy Mass V4 — content migration report',
    '',
    `- Generated: ${plan.generatedAt}`,
    `- Mode: **${plan.mode}**${plan.mode === 'dry-run' ? ' (no Firestore writes)' : ''}`,
    '',
    '| Document | Language | Status | Field | Headings | Prefixes | Markup | Whitespace | Length |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  documents.forEach((document) => {
    const status = results.find((item) => item.id === document.id)?.status || document.status;
    if (!document.fields.length) {
      lines.push(`| \`${document.id}\` | ${document.language} | ${status} | — | — | — | — | — | — |`);
      return;
    }
    document.fields.forEach((field) => {
      lines.push(`| \`${document.id}\` | ${document.language} | ${status} | \`${field.path}\` | ${field.counts.heading} | ${field.counts.prefix} | ${field.counts.markup} | ${field.counts.whitespace} | ${field.beforeLength} → ${field.afterLength} |`);
    });
  });
  documents.forEach((document) => {
    lines.push('', `## prayers/${document.id} (${document.language})`, '');
    if (document.status === 'missing') {
      lines.push('Document does not exist. Nothing to migrate; the reader uses the bundled text.');
      return;
    }
    lines.push(`- updateTime at read: \`${document.updateTime}\``);
    const seen = new Map();
    document.fields.forEach((field) => {
      lines.push(`- \`${field.path}\`: ${field.changed ? 'changes' : 'no changes'} — sha256 ${field.beforeSha256.slice(0, 12)} → ${field.afterSha256.slice(0, 12)}`);
      const key = `${field.beforeSha256}:${field.afterSha256}`;
      if (!field.changed) return;
      if (seen.has(key)) {
        lines.push(`  (identical to \`${seen.get(key)}\`, diff not repeated)`);
        return;
      }
      seen.set(key, field.path);
      const { before, after } = document.texts[field.path];
      lines.push('', '```diff', diffLines(before, after), '```', '');
    });
  });
  return `${lines.join('\n')}\n`;
}
