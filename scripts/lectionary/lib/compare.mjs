/**
 * Section-by-section comparison of a parsed Catholic.by page with a stored
 * `readings` document: citations AND text, exact after a documented
 * normalization (typography only — never fuzzy similarity).
 *
 *   normalization: HTML tags/entities, NFC, NBSP/zero-width, quote / dash /
 *   apostrophe variants, whitespace. Everything else must be equal.
 *
 * Discrepancy classes (spec): WRONG_TEXT, WRONG_REFERENCE, MISSING_BLOCK,
 * WRONG_CONTEXT (block not in the source), STRUCTURE_LOSS (paragraphs, roles,
 * rubrics, alternatives, order).
 */
import { passionToPlainText } from '../../../src/utils/massReadingSets.js';

const HOMOGLYPH = { 'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'І': 'I', 'і': 'i' };

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

export function plain(value) {
  return String(value ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (match) => ENTITIES[match])
    .normalize('NFC');
}

/** Typography-insensitive text: lines kept as `\n`, paragraphs as `\n\n`. */
export function normalizeText(value) {
  return plain(value)
    .replace(/[  -   　]/g, ' ')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[«»„“”‟]/g, '"')
    .replace(/[’ʼ`´‘]/g, "'")
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\r\n?/g, '\n')
    .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const wordsOf = (value) => normalizeText(value).replace(/\s+/g, '');
export const paragraphsOf = (value) => normalizeText(value).split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

export function normalizeCitation(value) {
  return normalizeText(value)
    .replace(/[а-яА-ЯіІ]/g, (ch) => HOMOGLYPH[ch] || ch)
    .replace(/\s+/g, '')
    .replace(/\.$/, '');
}

const clip = (value, n = 160) => { const t = String(value ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** How the stored text relates to the source text (evidence of a WRONG_TEXT). */
export function relationOf(expected, actual) {
  const e = wordsOf(expected);
  const a = wordsOf(actual);
  if (a === e) return 'same words';
  if (!a) return 'stored text is empty';
  if (e.startsWith(a)) return 'stored text is a truncated prefix of the source';
  if (e.endsWith(a)) return 'stored text lacks the beginning of the source';
  if (a.startsWith(e)) return 'stored text = source + extra tail';
  if (a.endsWith(e)) return 'stored text = extra head + source';
  if (a.includes(e)) return 'stored text contains the source plus extra text';
  if (e.includes(a)) return 'stored text is a fragment of the source';
  return 'stored text differs from the source';
}

/** First point where two normalized strings differ (evidence for a report). */
export function firstDifference(expected, actual) {
  const a = normalizeText(expected).replace(/\s+/g, ' ');
  const b = normalizeText(actual).replace(/\s+/g, ' ');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return {
    at: i, expectedLength: a.length, actualLength: b.length,
    expected: a.slice(Math.max(0, i - 25), i + 60), actual: b.slice(Math.max(0, i - 25), i + 60),
  };
}

// ── Section records ──────────────────────────────────────────────────────────

/** Flat legacy fields of a `readings` document as ordered section records. */
export function legacySections(doc) {
  const out = [];
  const push = (kind, role, data) => data && out.push({ kind, role, ...data });
  const reading = (role, kind = 'reading') => {
    const value = doc[role];
    if (value && (value.bible || value.text)) push(kind, role, value);
  };
  reading('reading1');
  if (doc.psalm) push('psalm', 'psalm', doc.psalm);
  ['reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle'].forEach((role) => reading(role));
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => doc[`psalm${n}`] && push('psalm', `psalm${n}`, doc[`psalm${n}`]));
  if (doc.sequence?.text) push('sequence', 'sequence', doc.sequence);
  if (doc.alleluia) push('acclamation', 'alleluia', doc.alleluia);
  reading('gospel', 'gospel');
  return out;
}

/** Sections of a page set applying to a weekday year / Sunday cycle. */
export function pageSectionsFor(set, { year = '', cycle = '' } = {}) {
  return (set.sections || []).filter((section) => (!section.year || !year || section.year === year)
    && (!section.cycle || !cycle || section.cycle === cycle));
}

const keyOf = (section, seen) => {
  const base = `${section.kind}|${section.role || ''}|${section.cycle || ''}`;
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return `${base}#${n}`;
};

function citationDiff(expected, actual) {
  return normalizeCitation(expected) !== normalizeCitation(actual);
}

function textDiff(path, label, expected, actual, out, klass = 'WRONG_TEXT') {
  const e = normalizeText(expected);
  const a = normalizeText(actual);
  if (e === a) return;
  if (wordsOf(e) === wordsOf(a)) {
    const pe = paragraphsOf(e).length;
    const pa = paragraphsOf(a).length;
    out.push({ class: 'STRUCTURE_LOSS', severity: 'low', section: path, field: label, detail: `same words, different paragraphing (${pe} vs ${pa} paragraphs/lines)`, expected: clip(e, 80), actual: clip(a, 80) });
    return;
  }
  out.push({ class: klass, severity: 'high', section: path, field: label, detail: 'text differs', relation: relationOf(e, a), ...firstDifference(e, a) });
}

function compareReadingLike(path, expected, actual, out) {
  if (citationDiff(expected.bible, actual.bible)) {
    out.push({ class: 'WRONG_REFERENCE', severity: 'high', section: path, field: 'bible', expected: expected.bible || '', actual: actual.bible || '' });
  }
  if (normalizeText(expected.title) !== normalizeText(actual.title) && (expected.title || actual.title)) {
    // The liturgical title is a heading, not scripture: low severity.
    if (wordsOf(expected.title) !== wordsOf(actual.title)) out.push({ class: 'WRONG_TEXT', severity: 'low', section: path, field: 'title', expected: clip(expected.title), actual: clip(actual.title) });
  }
  if ((expected.comment || actual.comment) && wordsOf(expected.comment) !== wordsOf(actual.comment)) {
    out.push({ class: actual.comment ? 'WRONG_TEXT' : 'MISSING_BLOCK', severity: 'low', section: path, field: 'comment', expected: clip(expected.comment), actual: clip(actual.comment) });
  }
  const expectedText = expected.passion ? passionToPlainText(expected.passion) : expected.text;
  const actualText = actual.passion ? passionToPlainText(actual.passion) : actual.text;
  if (expected.passion && !actual.passion?.blocks?.length && !/(^|\s)(Ев|Е)\.\s/.test(actualText || '')) {
    out.push({ class: 'STRUCTURE_LOSS', severity: 'high', section: path, field: 'passion', detail: 'role-marked Passion flattened' });
  }
  if (expected.passion && actual.passion) {
    const roles = (p) => (p.blocks || []).flatMap((b) => (b.runs || []).map((r) => r.role)).join(',');
    if (roles(expected.passion) !== roles(actual.passion)) {
      out.push({ class: 'STRUCTURE_LOSS', severity: 'high', section: path, field: 'passion.roles', detail: 'role sequence differs' });
    }
  }
  textDiff(path, 'text', expectedText, actualText, out);
  // alternatives («або»)
  const ea = expected.alternatives || [];
  const aa = actual.alternatives || [];
  if (ea.length !== aa.length) {
    out.push({ class: ea.length > aa.length ? 'MISSING_BLOCK' : 'WRONG_CONTEXT', severity: 'high', section: path, field: 'alternatives', expected: ea.length, actual: aa.length, detail: ea.map((x) => x.bible).join(' | ') });
  }
  ea.slice(0, aa.length).forEach((alt, i) => compareReadingLike(`${path}/або${i + 1}`, alt, aa[i], out));
  if ((expected.conclusion || '') !== (actual.conclusion || '') && (expected.conclusion !== undefined && actual.conclusion !== undefined)) {
    if (normalizeText(expected.conclusion) !== normalizeText(actual.conclusion)) {
      out.push({ class: 'STRUCTURE_LOSS', severity: 'low', section: path, field: 'conclusion', expected: clip(expected.conclusion), actual: clip(actual.conclusion) });
    }
  }
}

function comparePsalm(path, expected, actual, out) {
  if (citationDiff(expected.bible, actual.bible)) out.push({ class: 'WRONG_REFERENCE', severity: 'high', section: path, field: 'bible', expected: expected.bible || '', actual: actual.bible || '' });
  const ev = (expected.verses || []).join('\n\n');
  const av = (actual.verses || []).length ? (actual.verses || []).join('\n\n') : (actual.text || '');
  // Order-insensitive: «all words present, in the wrong slot».
  const all = (value) => normalizeText(`${value.chorus || ''} ${value.altChorus || ''} ${value === expected ? ev : av}`).split(/\s+/).filter(Boolean).sort().join(' ');
  const sameWordsOverall = all(expected) === all(actual);
  const chorusOk = wordsOf(expected.chorus) === wordsOf(actual.chorus);
  const altOk = wordsOf(expected.altChorus) === wordsOf(actual.altChorus);
  const versesOk = wordsOf(ev) === wordsOf(av);
  if (chorusOk && altOk && versesOk) {
    if ((expected.verses || []).length !== (actual.verses || []).length) {
      out.push({ class: 'STRUCTURE_LOSS', severity: 'low', section: path, field: 'verses', detail: `${(expected.verses || []).length} strophe groups vs ${(actual.verses || []).length}` });
    }
    return;
  }
  if (sameWordsOverall) {
    // All words are stored but in the wrong slot.
    if (!chorusOk) {
      out.push({ class: 'WRONG_TEXT', severity: 'high', section: path, field: 'chorus', detail: 'strophes merged into the refrain', expected: clip(expected.chorus), actual: clip(actual.chorus), artifact: 'strophes merged into the refrain' });
    } else {
      out.push({
        class: 'STRUCTURE_LOSS', severity: 'high', section: path, field: 'altChorus',
        detail: 'the alternative refrain slot holds text that is not an alternative refrain (the strophes are split differently from the source)',
        expected: clip(expected.altChorus || '(none)'), actual: clip(actual.altChorus), ...(/^\d/.test(String(actual.altChorus || '')) ? { artifact: 'last strophe stored as the alternative refrain' } : {}),
      });
    }
    return;
  }
  if (!chorusOk) out.push({ class: actual.chorus ? 'WRONG_TEXT' : 'MISSING_BLOCK', severity: 'high', section: path, field: 'chorus', expected: clip(expected.chorus), actual: clip(actual.chorus) });
  if (!altOk && (expected.altChorus || actual.altChorus)) {
    out.push({ class: actual.altChorus ? 'WRONG_TEXT' : 'MISSING_BLOCK', severity: 'medium', section: path, field: 'altChorus', expected: clip(expected.altChorus), actual: clip(actual.altChorus) });
  }
  if (!versesOk) out.push({ class: 'WRONG_TEXT', severity: 'high', section: path, field: 'verses', detail: 'psalm strophes differ', relation: relationOf(ev, av), ...firstDifference(ev, av) });
}

function compareAcclamation(path, expected, actual, out) {
  if (citationDiff(expected.bible, actual.bible)) out.push({ class: 'WRONG_REFERENCE', severity: 'medium', section: path, field: 'bible', expected: expected.bible || '', actual: actual.bible || '' });
  if (wordsOf(expected.verse) !== wordsOf(actual.verse ?? actual.text)) out.push({ class: 'WRONG_TEXT', severity: 'high', section: path, field: 'verse', relation: relationOf(expected.verse, actual.verse ?? actual.text), ...firstDifference(expected.verse, actual.verse ?? actual.text) });
  if (expected.acclamation !== undefined && actual.acclamation !== undefined && expected.acclamation && wordsOf(expected.acclamation) !== wordsOf(actual.acclamation)) {
    out.push({ class: 'WRONG_TEXT', severity: 'low', section: path, field: 'acclamation', expected: clip(expected.acclamation), actual: clip(actual.acclamation) });
  }
}

/**
 * @param {object[]} expected  page sections (parser shape)
 * @param {object[]} actual    document sections (massReadings or legacy)
 * @param {{ ignoreMissingSequence?: boolean }} [options]
 * @returns {object[]} discrepancies
 */
export function compareSections(expected, actual, options = {}) {
  const out = [];
  const exp = expected.filter((s) => s.kind !== 'rubric');
  const act = actual.filter((s) => s.kind !== 'rubric');
  const seenE = new Map();
  const seenA = new Map();
  const eMap = new Map(exp.map((s) => [keyOf(s, seenE), s]));
  const aMap = new Map(act.map((s) => [keyOf(s, seenA), s]));
  for (const [key, section] of eMap) {
    const path = key.replace(/\|/g, '/');
    const match = aMap.get(key);
    if (!match) {
      out.push({ class: 'MISSING_BLOCK', severity: 'high', section: path, field: 'section', expected: clip(section.bible || section.text || section.verse || ''), actual: '' });
      continue;
    }
    if (section.kind === 'psalm') comparePsalm(path, section, match, out);
    else if (section.kind === 'acclamation') compareAcclamation(path, section, match, out);
    else if (section.kind === 'sequence') textDiff(path, 'text', section.text, match.text, out);
    else compareReadingLike(path, section, match, out);
  }
  for (const [key, section] of aMap) {
    if (!eMap.has(key)) {
      out.push({ class: 'WRONG_CONTEXT', severity: 'medium', section: key.replace(/\|/g, '/'), field: 'section', detail: 'block present in the document but not in the source page', actual: clip(section.bible || section.text || section.verse || '') });
    }
  }
  // order
  const order = (map) => [...map.keys()].filter((k) => !k.startsWith('rubric')).join('>');
  if (options.checkOrder && !out.some((d) => d.field === 'section') && order(eMap) !== order(aMap)) {
    out.push({ class: 'STRUCTURE_LOSS', severity: 'medium', section: 'order', field: 'order', expected: order(eMap), actual: order(aMap) });
  }
  if (options.stats) {
    const bad = new Set(out.map((diff) => diff.section));
    const badFields = new Set(out.filter((diff) => diff.field === 'bible').map((diff) => diff.section));
    for (const [key, section] of eMap) {
      const path = key.replace(/\|/g, '/');
      const kind = section.kind;
      const stats = (options.stats[kind] ||= { checked: 0, exact: 0, citations: 0, citationsExact: 0 });
      stats.checked += 1;
      if (!bad.has(path) && aMap.has(key)) stats.exact += 1;
      if (section.bible) { stats.citations += 1; if (!badFields.has(path) && aMap.has(key)) stats.citationsExact += 1; }
    }
  }
  // rubrics: page rubrics must survive in a canonical document
  if (options.checkRubrics) {
    const er = expected.filter((s) => s.kind === 'rubric').map((s) => wordsOf(s.text));
    const ar = new Set(actual.filter((s) => s.kind === 'rubric').map((s) => wordsOf(s.text)));
    er.filter((r) => !ar.has(r)).forEach((r) => out.push({ class: 'STRUCTURE_LOSS', severity: 'medium', section: 'rubric', field: 'rubric', detail: 'source rubric not in the document', expected: clip(r, 100) }));
  }
  return out;
}
