/**
 * Editor model of structured Mass reading sets (ParsedReadingEditor →
 * MassReadingSetsEditor). Pure: drafts, role markup of the Passion, sanitized
 * payloads, flat re-projection of the document and of its linked legacy
 * documents. Unknown fields of documents, sets and sections are preserved.
 */
import {
  MASS_READINGS_SCHEMA,
  PASSION_MARKER_ROLES,
  PASSION_ROLES,
  massReadingSetsOf,
  projectSetToLegacy,
  sanitizeReadingHtml,
  validateMassReadings,
} from './massReadingSets.js';

const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const trim = (value) => String(value ?? '').trim();

/** Flat fields a projection owns (removed before re-projecting). */
export const PROJECTED_FIELDS = Object.freeze([
  'reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle',
  'psalm', 'psalm1', 'psalm2', 'psalm3', 'psalm4', 'psalm5', 'psalm6', 'psalm7',
  'alleluia', 'sequence', 'gospel', 'sectionsFound',
]);

export function createSetsDraft(doc) {
  const massReadings = clone(doc?.massReadings) || { schema: MASS_READINGS_SCHEMA, flatSet: null, sets: [] };
  massReadings.sets = massReadingSetsOf({ massReadings }).map((set) => ({
    ...set,
    sections: (set.sections || []).map((section) => ({ ...section })),
  }));
  return massReadings;
}

export function emptySection(kind) {
  const base = { kind };
  if (kind === 'reading') return { ...base, role: 'reading1', bible: '', comment: '', title: '', text: '' };
  if (kind === 'gospel') return { ...base, role: 'gospel', bible: '', comment: '', title: '', text: '' };
  if (kind === 'psalm') return { ...base, role: 'psalm', bible: '', chorus: '', verses: [] };
  if (kind === 'acclamation') return { ...base, role: 'alleluia', acclamation: 'Аллелюя, аллелюя, аллелюя.', bible: '', verse: '' };
  if (kind === 'sequence') return { ...base, role: 'sequence', text: '' };
  return { kind: 'rubric', text: '' };
}

export function emptySet(sets = []) {
  let index = sets.length + 1;
  while (sets.some((set) => set.id === `set${index}`)) index += 1;
  return { id: `set${index}`, label: 'Св. Імша', sections: [emptySection('reading'), emptySection('gospel')] };
}

export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// ── Role markup of the Passion ───────────────────────────────────────────────
//
//   # Пілат дапытвае Езуса            → heading
//   > Усе становяцца на калені…        → rubric
//   Ев. У той час… Е. Ты кажаш. І. …   → paragraph of role runs
// Blocks are separated by an empty line.

const MARKER_PATTERN = /(^|\s)(Ев\.|Е\.|І\.|I\.|Л\.)(?=\s)/gu;

export function passionToMarkup(passion) {
  return (passion?.blocks || []).map((block) => {
    if (block.type === 'heading') return `# ${trim(block.text)}`;
    if (block.type === 'rubric') return `> ${trim(block.text)}`;
    return (block.runs || []).map((run) => `${PASSION_ROLES[run.role]?.marker || ''} ${trim(run.text)}`.trim()).join(' ');
  }).join('\n\n');
}

export function markupToPassion(markup) {
  const blocks = String(markup ?? '').split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    if (chunk.startsWith('#')) return { type: 'heading', text: chunk.replace(/^#+\s*/, '') };
    if (chunk.startsWith('>')) return { type: 'rubric', text: chunk.replace(/^>\s*/, '') };
    const runs = [];
    let role = 'narrator';
    let last = 0;
    const push = (end) => {
      const value = chunk.slice(last, end).trim();
      if (value) runs.push({ role, text: value });
    };
    for (const match of chunk.matchAll(MARKER_PATTERN)) {
      const start = match.index + match[1].length;
      push(start);
      role = PASSION_MARKER_ROLES[match[2]];
      last = start + match[2].length;
    }
    push(chunk.length);
    return { type: 'paragraph', runs };
  });
  return { blocks };
}

// ── Payload ──────────────────────────────────────────────────────────────────

function sanitizeSection(section) {
  const result = { ...section };
  ['text', 'verse'].forEach((field) => {
    if (typeof result[field] === 'string') result[field] = sanitizeReadingHtml(result[field]).trim();
  });
  ['bible', 'comment', 'title', 'chorus', 'altChorus', 'acclamation', 'label', 'role'].forEach((field) => {
    if (typeof result[field] === 'string') result[field] = result[field].replace(/<[^>]*>/g, '').trim();
  });
  if (Array.isArray(result.verses)) result.verses = result.verses.map((verse) => sanitizeReadingHtml(verse).trim()).filter(Boolean);
  if (Array.isArray(result.alternatives)) {
    result.alternatives = result.alternatives.map(sanitizeSection).filter((item) => item.bible || item.text);
    if (!result.alternatives.length) delete result.alternatives;
  }
  if (Array.isArray(result.rubrics)) result.rubrics = result.rubrics.map(trim).filter(Boolean);
  if (!result.cycle) delete result.cycle;
  return result;
}

export function sanitizeSetsDraft(massReadings) {
  return {
    ...massReadings,
    schema: MASS_READINGS_SCHEMA,
    sets: (massReadings.sets || []).map((set) => {
      const clean = { ...set, id: trim(set.id), label: trim(set.label) };
      if (!clean.context) delete clean.context;
      if (!clean.default) delete clean.default;
      if (!clean.referenceOnly) delete clean.referenceOnly;
      clean.sections = (set.sections || []).map(sanitizeSection);
      return clean;
    }),
  };
}

/** Editor validation: structure plus «a reference-only set has no text». */
export function validateSetsDraft(massReadings) {
  return validateMassReadings(sanitizeSetsDraft(massReadings));
}

function withProjection(data, set, cycle) {
  const result = { ...data };
  PROJECTED_FIELDS.forEach((field) => delete result[field]);
  const flat = projectSetToLegacy(set, cycle);
  return { ...result, ...flat, ...(set.referenceOnly ? {} : { sectionsFound: Object.keys(flat).filter((key) => key !== 'sequence') }) };
}

/**
 * Document payload: the edited `massReadings` and, when the document projects
 * a set into its flat fields (`flatSet`), the re-projected flat fields.
 */
export function buildSetsPayload(original, draft) {
  const massReadings = sanitizeSetsDraft(draft);
  const payload = { ...original, massReadings };
  delete payload.id;
  const flatSet = massReadings.sets.find((set) => set.id === massReadings.flatSet);
  return flatSet ? withProjection(payload, flatSet, flatSet.cycle || '') : payload;
}

/** Linked legacy documents whose flat fields follow a set of this document. */
export function linkedProjectionUpdates(draft, linkedDocs = []) {
  const massReadings = sanitizeSetsDraft(draft);
  return linkedDocs.flatMap((doc) => {
    const ref = doc?._massReadingsRef;
    if (!ref?.projected) return [];
    const set = massReadings.sets.find((item) => item.id === ref.set);
    if (!set) return [];
    const { id, ...data } = doc;
    return [{ id, data: withProjection(data, set, ref.cycle || '') }];
  });
}

/** Fields changed by an edit (shown before saving: source vs edited). */
export function changedSetFields(originalSet, editedSet) {
  const keys = [...new Set([...Object.keys(originalSet || {}), ...Object.keys(editedSet || {})])];
  return keys.filter((key) => JSON.stringify(originalSet?.[key]) !== JSON.stringify(editedSet?.[key])).sort();
}

/** One set from the flat fields of a legacy document (start of structured editing). */
export function setFromLegacy(doc, { id = 'mass', label = 'Св. Імша' } = {}) {
  const sections = [];
  const reading = (role, data) => data && sections.push({ kind: 'reading', role, ...clone(data) });
  reading('reading1', doc?.reading1 || doc?.reading);
  if (doc?.psalm) sections.push({ kind: 'psalm', role: 'psalm', ...clone(doc.psalm) });
  reading('reading2', doc?.reading2);
  if (doc?.sequence?.text) sections.push({ kind: 'sequence', role: 'sequence', text: doc.sequence.text });
  if (doc?.alleluia) sections.push({ kind: 'acclamation', role: 'alleluia', bible: doc.alleluia.bible || '', verse: doc.alleluia.verse || doc.alleluia.text || '' });
  if (doc?.gospel) sections.push({ kind: 'gospel', role: 'gospel', ...clone(doc.gospel) });
  return {
    id, label,
    ...(doc?._sourceUrl ? { source: { url: doc._sourceUrl } } : {}),
    sections: sections.map((section) => Object.fromEntries(Object.entries(section).filter(([, value]) => value !== null && value !== undefined))),
  };
}
