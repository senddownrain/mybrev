/**
 * Mass reading sets: several structured sets of Mass readings inside one
 * `readings` document (`massReadings`), e.g. «Св. Імша ў вігілію» and
 * «Св. Імша ўдзень» of the Assumption, the three Masses of Christmas, the
 * procession and the Mass of Palm Sunday, the ordered Easter Vigil.
 *
 * Backward compatibility: the flat fields of a `readings` document
 * (`reading1`, `psalm`, `reading2`, `alleluia`, `gospel`, …) stay the
 * projection of ONE set (`projectSetToLegacy`), which the released apps keep
 * reading. A document that only gathers the sets of several legacy documents
 * («canonical» document without flat fields) is invisible to old clients:
 * they skip documents without text. Legacy documents covered by a canonical
 * one carry `_massReadingsRef: { doc, set, cycle?, projected }` (projected:
 * its flat fields are re-generated from that set).
 *
 *   massReadings: {
 *     schema: 1,
 *     flatSet?: string|null,           // set projected into the flat fields of this document
 *     sourceUrl?: string,
 *     sets: [{
 *       id, label, sourceLabel?, context?, default?, cycle?, referenceOnly?,
 *       note?, source?: { url, parser?, fetchedAt? },
 *       sections: [Section]            // ordered; `cycle` on a section = cycle-specific
 *     }]
 *   }
 *   Section (by `kind`):
 *     reading     { role, label?, bible, comment, title, text, alternatives?, conclusion?, rubrics? }
 *     psalm       { role, bible, chorus, altChorus?, verses[], text? }
 *     acclamation { role: 'alleluia', acclamation, bible?, verse }
 *     sequence    { role: 'sequence', text }
 *     gospel      { role: 'gospel', cycle?, bible, comment, title, text, passion?, conclusion? }
 *     rubric      { text }
 *   passion: { legend?: string[], blocks: [{ type: 'heading'|'rubric', text } | { type: 'paragraph', runs: [{ role, text }] }] }
 *
 * Pure module: shared by the web app, the editor and the Node scripts.
 */

export const MASS_READINGS_SCHEMA = 1;

export const SET_CONTEXTS = Object.freeze([
  'day', 'vigil', 'night', 'dawn', 'morning', 'evening', 'procession', 'mass', 'chrism',
]);
/** A set celebrated in the evening (preferred when a date also has a morning/day set). */
export const EVENING_CONTEXTS = Object.freeze(['vigil', 'evening']);
const DAYTIME_CONTEXTS = new Set(['morning', 'day', 'chrism', 'mass']);

export const SECTION_KINDS = Object.freeze(['reading', 'psalm', 'acclamation', 'sequence', 'gospel', 'rubric']);
export const SET_CYCLES = Object.freeze(['A', 'B', 'C']);

/** Passion read by roles (Catholic.by markers → semantic roles). */
export const PASSION_ROLES = Object.freeze({
  narrator: { marker: 'Ев.', label: 'словы евангеліста' },
  christ: { marker: 'Е.', label: 'словы Хрыста' },
  speaker: { marker: 'І.', label: 'словы адной асобы' },
  crowd: { marker: 'Л.', label: 'словы некалькіх асобаў' },
});
export const PASSION_MARKER_ROLES = Object.freeze({
  'Ев.': 'narrator', 'Е.': 'christ', 'І.': 'speaker', 'I.': 'speaker', 'Л.': 'crowd',
});

/** Labels of the Readings screen (source language). */
export const SECTION_LABELS = Object.freeze({
  reading1: 'Першае чытанне',
  reading2: 'Другое чытанне',
  reading3: 'Трэцяе чытанне',
  reading4: 'Чацвёртае чытанне',
  reading5: 'Пятае чытанне',
  reading6: 'Шостае чытанне',
  reading7: 'Сёмае чытанне',
  epistle: 'Эпістала',
  psalm: 'Рэспансарыйны псальм',
  alleluia: 'Спеў перад Евангеллем',
  sequence: 'Секвенцыя',
  gospel: 'Евангелле',
});

const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ── Reading sets of a document ───────────────────────────────────────────────

export function massReadingSetsOf(doc) {
  const sets = doc?.massReadings?.sets;
  return Array.isArray(sets) ? sets.filter((set) => isObject(set) && text(set.id)) : [];
}

export const hasMassReadingSets = (doc) => massReadingSetsOf(doc).length > 0;

export function isReferenceOnlySet(set) {
  return Boolean(set?.referenceOnly);
}

/** Cycles A/B/C a set distinguishes (from its cycle-specific sections). */
export function setCycles(set) {
  const found = new Set([
    ...(set?.cycle ? [set.cycle] : []),
    ...(set?.sections || []).map((section) => section?.cycle).filter(Boolean),
  ]);
  return SET_CYCLES.filter((cycle) => found.has(cycle));
}

/** The cycle to show: the requested one when the set has it, else the first. */
export function resolveSetCycle(set, wanted) {
  const cycles = setCycles(set);
  if (!cycles.length) return '';
  const desired = text(wanted).toUpperCase();
  return cycles.includes(desired) ? desired : cycles[0];
}

/** Ordered sections of a set for one cycle (shared base + cycle-specific). */
export function sectionsForCycle(set, cycle = '') {
  const active = resolveSetCycle(set, cycle);
  return (set?.sections || []).filter((section) => isObject(section)
    && (!section.cycle || section.cycle === active));
}

/**
 * Default set: an explicit `default`; else the evening/vigil set when the
 * date also has a morning/day set; else the first.
 */
export function defaultSetId(sets = []) {
  if (!sets.length) return '';
  const explicit = sets.find((set) => set.default === true);
  if (explicit) return explicit.id;
  const evening = sets.find((set) => EVENING_CONTEXTS.includes(set.context));
  const daytime = sets.some((set) => DAYTIME_CONTEXTS.has(set.context));
  if (evening && daytime) return evening.id;
  return sets[0].id;
}

export function selectSet(sets = [], requestedId = '') {
  const requested = text(requestedId);
  return sets.find((set) => set.id === requested)
    || sets.find((set) => set.id === defaultSetId(sets))
    || null;
}

// ── Passion ──────────────────────────────────────────────────────────────────

/** Plain text of a role-marked Passion (markers kept, as the legacy field). */
export function passionToPlainText(passion) {
  return (passion?.blocks || []).map((block) => {
    if (block.type !== 'paragraph') return text(block.text);
    return (block.runs || []).map((run) => {
      const marker = PASSION_ROLES[run.role]?.marker;
      return marker ? `${marker} ${text(run.text)}` : text(run.text);
    }).filter(Boolean).join(' ');
  }).filter(Boolean).join('\n\n');
}

export function passionRoleCount(passion) {
  const roles = new Set();
  (passion?.blocks || []).forEach((block) => (block.runs || []).forEach((run) => roles.add(run.role)));
  return roles.size;
}

// ── Projection to the flat (legacy) fields ───────────────────────────────────

function legacyReading(section) {
  const result = {
    bible: text(section.bible) || null,
    comment: text(section.comment) || null,
    title: text(section.title) || null,
    text: text(section.text) || (section.passion ? passionToPlainText(section.passion) : null),
  };
  const alternatives = (section.alternatives || []).map(legacyReading).filter((item) => item.bible || item.text);
  if (alternatives.length) result.alternatives = alternatives;
  return result;
}

function legacyPsalm(section) {
  return {
    bible: text(section.bible) || null,
    chorus: text(section.chorus) || null,
    altChorus: text(section.altChorus) || null,
    verses: (section.verses || []).map(text).filter(Boolean),
    text: text(section.text) || null,
  };
}

/**
 * Flat fields of one set for the released apps: reading1, psalm, reading2,
 * sequence, alleluia, gospel (+ readingN/psalmN of an ordered vigil). A
 * reference-only set gives citations only (`bible`), never text.
 */
export function projectSetToLegacy(set, cycle = '') {
  const result = {};
  const sections = sectionsForCycle(set, cycle);
  for (const section of sections) {
    const role = text(section.role);
    if (!role || result[role]) continue;
    if (section.kind === 'reading' || section.kind === 'gospel') result[role] = legacyReading(section);
    else if (section.kind === 'psalm') result[role] = legacyPsalm(section);
    else if (section.kind === 'acclamation') {
      result[role] = { bible: text(section.bible) || null, verse: text(section.verse) || null, text: null };
    } else if (section.kind === 'sequence') result[role] = { text: text(section.text) || null };
  }
  if (!result.psalm) {
    const first = sections.find((section) => section.kind === 'psalm');
    if (first) result.psalm = legacyPsalm(first);
  }
  if (isReferenceOnlySet(set)) {
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, { bible: value.bible ?? null }]));
  }
  return result;
}

/** Citations of a set (reference-only rendering, Ordo index). */
export function setCitations(set, cycle = '') {
  return sectionsForCycle(set, cycle)
    .filter((section) => section.kind !== 'rubric' && text(section.bible))
    .map((section) => ({
      role: section.role || section.kind,
      label: section.label || SECTION_LABELS[section.role] || SECTION_LABELS[section.kind] || '',
      bible: text(section.bible),
      alternatives: (section.alternatives || []).map((item) => text(item.bible)).filter(Boolean),
    }));
}

// ── Readings screen ──────────────────────────────────────────────────────────

/**
 * Documents of a date as the Readings screen shows them: a legacy document
 * covered by a canonical document that is also present is hidden.
 */
export function collapseCoveredDocuments(documents = []) {
  const canonical = new Set(documents.filter(hasMassReadingSets).map((doc) => doc.id));
  return documents.filter((doc) => !(doc?._massReadingsRef?.doc && canonical.has(doc._massReadingsRef.doc)));
}

/** A reading view the card renders: the canonical document + one set + one cycle. */
export function readingViewOfSet(doc, set, cycle = '') {
  const activeCycle = resolveSetCycle(set, cycle);
  return {
    id: doc.id,
    title: doc.title || set.label,
    year: activeCycle || null,
    _setId: set.id,
    _setLabel: set.label,
    _referenceOnly: isReferenceOnlySet(set),
    _note: set.note || '',
    _sections: sectionsForCycle(set, activeCycle),
    _ordoOptionId: doc._ordoOptionId,
    _sourceUrl: set.source?.url || doc.massReadings?.sourceUrl || doc._sourceUrl || '',
  };
}

// ── Validation and sanitizing ────────────────────────────────────────────────

const ALLOWED_TAGS = new Set(['p', 'br', 'em', 'i', 'strong', 'b', 'u', 'span', 'sup']);
const ALLOWED_CLASSES = new Set(['rubric', 'reading-rubric', 'psalm-refrain', 'liturgical-red']);

/**
 * Allowed reading HTML only: inline emphasis, paragraphs, line breaks and a
 * few rubric classes. Everything else (scripts, handlers, links, styles) is
 * dropped; the text inside unknown tags is kept.
 */
export function sanitizeReadingHtml(html) {
  const source = String(html ?? '');
  if (!/[<>]/.test(source)) return source;
  return source
    .replace(/<(script|style|iframe|object|embed|template)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, rawTag, attributes) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (match.startsWith('</')) return `</${tag}>`;
      if (tag === 'br') return '<br>';
      const classMatch = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
      const classes = String(classMatch?.[2] ?? classMatch?.[3] ?? '').split(/\s+/).filter((name) => ALLOWED_CLASSES.has(name));
      return classes.length ? `<${tag} class="${classes.join(' ')}">` : `<${tag}>`;
    });
}

function validateSection(section, path) {
  const errors = [];
  if (!isObject(section)) return [`${path}: not an object`];
  if (!SECTION_KINDS.includes(section.kind)) errors.push(`${path}: unknown kind ${JSON.stringify(section.kind)}`);
  if (section.cycle && !SET_CYCLES.includes(section.cycle)) errors.push(`${path}: unknown cycle ${section.cycle}`);
  if (section.kind === 'rubric' && !text(section.text)) errors.push(`${path}: empty rubric`);
  if (section.passion) {
    (section.passion.blocks || []).forEach((block, index) => {
      if (block.type === 'paragraph' && !(block.runs || []).every((run) => PASSION_ROLES[run.role] || run.role === 'rubric')) {
        errors.push(`${path}.passion.blocks[${index}]: unknown role`);
      }
    });
  }
  return errors;
}

/**
 * Structural validation (app-content contract, editor, migration).
 * A reference-only set needs citations and must not carry texts.
 */
export function validateMassReadings(massReadings) {
  if (massReadings === undefined) return [];
  if (!isObject(massReadings)) return ['massReadings: not an object'];
  const errors = [];
  if (massReadings.schema !== MASS_READINGS_SCHEMA) errors.push(`massReadings.schema: expected ${MASS_READINGS_SCHEMA}`);
  if (massReadings.flatSet && !(massReadings.sets || []).some((set) => set?.id === massReadings.flatSet)) {
    errors.push(`massReadings.flatSet: no set ${massReadings.flatSet}`);
  }
  const sets = Array.isArray(massReadings.sets) ? massReadings.sets : [];
  if (!sets.length) errors.push('massReadings.sets: empty');
  const ids = new Set();
  sets.forEach((set, index) => {
    const path = `massReadings.sets[${index}]`;
    if (!isObject(set)) { errors.push(`${path}: not an object`); return; }
    if (!text(set.id)) errors.push(`${path}: no id`);
    else if (ids.has(set.id)) errors.push(`${path}: duplicate id ${set.id}`);
    ids.add(set.id);
    if (!text(set.label)) errors.push(`${path}: no label`);
    if (set.context && !SET_CONTEXTS.includes(set.context)) errors.push(`${path}: unknown context ${set.context}`);
    if (/навячэр/iu.test(set.label || '')) errors.push(`${path}: label «${set.label}» (use «Св. Імша ў вігілію»)`);
    const sections = Array.isArray(set.sections) ? set.sections : [];
    if (!sections.length) errors.push(`${path}: no sections`);
    sections.forEach((section, sectionIndex) => errors.push(...validateSection(section, `${path}.sections[${sectionIndex}]`)));
    if (set.referenceOnly) {
      if (!sections.some((section) => text(section.bible))) errors.push(`${path}: reference-only without citations`);
      if (sections.some((section) => text(section.text) || (section.verses || []).length || section.passion)) {
        errors.push(`${path}: reference-only set carries text`);
      }
    } else if (!sections.some((section) => section.kind === 'gospel' || section.kind === 'reading')) {
      errors.push(`${path}: no reading`);
    }
  });
  if (sets.filter((set) => set.default === true).length > 1) errors.push('massReadings.sets: more than one default');
  return errors;
}
