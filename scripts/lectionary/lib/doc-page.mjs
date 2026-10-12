/**
 * Stored `readings` document ↔ Catholic.by page(s): which page backs which
 * set / cycle, the expected sections, and the section-by-section comparison.
 */
import { massReadingSetsOf } from '../../../src/utils/massReadingSets.js';
import { compareSections, legacySections, normalizeCitation, normalizeText, wordsOf, pageSectionsFor } from './compare.mjs';
import { pageIdOfUrl } from './source-pages.mjs';
import { docSelector } from './identity.mjs';

const isYear = (value) => /^[12]$/.test(String(value ?? ''));
const isCycle = (value) => /^[ABC]$/.test(String(value ?? '').toUpperCase());

/**
 * Typical artifacts of the legacy (2026-08) parser. A text difference is
 * "explained" when removing the artifact from the stored text gives exactly
 * the source text; the tags go into the evidence of the report.
 */
export function explainText(expected, actual, own = {}, ext = {}) {
  const tags = [];
  let text = normalizeText(actual);
  const target = normalizeText(expected);
  const same = (left, right) => left.replace(/\s+/g, '') === right.replace(/\s+/g, '');
  if (same(text, target)) return { tags, explained: true };
  const strip = (tag, pattern) => { const next = text.replace(pattern, '').trim(); if (next !== text) { tags.push(tag); text = next; } };
  for (const comment of [own.comment, ext.comment].filter(Boolean)) {
    const c = normalizeText(comment);
    if (text.startsWith(c)) { tags.push('summary line inside the text'); text = text.slice(c.length).trim(); break; }
  }
  for (const title of [own.title, ext.title].filter(Boolean)) {
    const t = normalizeText(title);
    if (text.startsWith(t)) { tags.push('liturgical title inside the text'); text = text.slice(t.length).trim(); break; }
  }
  strip('Gospel title «+ Чытанне…» inside the text', /^\+?\s*Чытанне святога Евангелля паводле \S+\.\s*/u);
  strip('conclusion «Гэта слова …» inside the text', /\s*Гэта слова (Божае|Пана)\.?/u);
  strip('«Або:» marker left in the text', /\s*Або:?\s*$/u);
  strip('stray divider letter appended', /\s+[а-яa-zф]$/u);
  strip('stray divider letter appended', /(?<=[.!?»”)\u2026])[а-яф]$/u);
  if (!same(text, target)) {
    // a short lead-in line («Браты:», «У тыя дні:») missing from the stored text
    const lead = /^([^\n]{1,40}:)\s*\n+/u.exec(String(expected ?? '').trim());
    if (lead && same(text, target.slice(normalizeText(lead[1]).length))) { tags.push('lead-in line dropped'); return { tags, explained: true }; }
  }
  return { tags, explained: same(text, target) };
}

export function artifactOf(diff, expectedSection, actualSection) {
  if (diff.artifact) return diff.artifact;
  const a = String(diff.actual ?? '');
  if (diff.field === 'bible' && /\s[А-ЯЁІЎA-Z]$/u.test(a) && actualSection?.verse !== undefined) return 'drop-cap letter moved into the citation';
  if (diff.field === 'verse' && actualSection && expectedSection) {
    const e = wordsOf(expectedSection.verse);
    const v = wordsOf(actualSection.verse ?? actualSection.text);
    for (const n of [1, 2, 3]) if (e.slice(n) === v) return `drop-cap letter${n > 1 ? 's' : ''} lost from the verse`;
    if (v.length >= e.length && v.startsWith(e) && v.length - e.length <= 3) return 'stray divider letter appended';
    if (v.endsWith(e) && v.length - e.length <= 3) return 'stray letter before the verse';
  }
  if (diff.field === 'text' && actualSection) {
    const { tags, explained } = explainText(expectedSection?.text ?? '', actualSection.text, actualSection, expectedSection || {});
    if (explained && tags.length) return tags.join('; ');
  }
  if (diff.field === 'verses' && actualSection && expectedSection) {
    const { tags, explained } = explainText((expectedSection.verses || []).join('\n\n'), (actualSection.verses || []).join('\n\n') || actualSection.text || '');
    if (explained && tags.length) return tags.join('; ');
    if (/^Або:/u.test(String(actualSection.verses?.[0] || ''))) return 'alternative refrain inside the strophes';
  }
  if (diff.field === 'chorus' && String(actualSection?.chorus || '').length > String(expectedSection?.chorus || '').length + 20) return 'strophes merged into the refrain';
  return '';
}

/** Page id → parsed page (with identity) accessor. */
export function pageOfUrl(pages, url) {
  const id = pageIdOfUrl(url);
  return id ? pages.get(id) || null : null;
}

/**
 * Pages that back a document. `kind`: 'canonical' (massReadings sets with
 * their own source), 'legacy' (flat fields + `_sourceUrl`), 'projection'
 * (`_massReadingsRef`: a legacy copy of a canonical set), 'unlinked'.
 */
export function backingOf(doc, docsById) {
  if (massReadingSetsOf(doc).length) return { kind: 'canonical' };
  if (doc._massReadingsRef?.doc) return { kind: 'projection', canonical: docsById.get(doc._massReadingsRef.doc) || null };
  if (doc._sourceUrl) return { kind: 'legacy' };
  return { kind: 'unlinked' };
}

/** Page set that a stored set was imported from. */
export function pageSetFor(set, setIndexOnPage, page) {
  const sets = page.parsed?.sets || [];
  if (!sets.length) return null;
  if (sets.length === 1) return sets[0];
  const label = String(set.sourceLabel || '').trim();
  if (label) {
    const byLabel = sets.find((candidate) => candidate.sourceLabel.trim() === label);
    if (byLabel) return byLabel;
  }
  return sets[setIndexOnPage] || null;
}

/** Comparison of one canonical document with the pages of its sets. */
export function compareCanonical(doc, pages, stats = null) {
  const out = [];
  const perPage = new Map();
  massReadingSetsOf(doc).forEach((set) => {
    const url = set.source?.url || doc.massReadings?.sourceUrl || doc._sourceUrl || '';
    if (set.referenceOnly || !url) return;
    const page = pageOfUrl(pages, url);
    if (!page || !page.parsed) {
      out.push({ class: 'SOURCE_UNAVAILABLE', severity: 'high', docId: doc.id, set: set.id, url, detail: 'the source page of this set is not in the crawl snapshot' });
      return;
    }
    const index = perPage.get(page.id) || 0;
    perPage.set(page.id, index + 1);
    const pageSet = pageSetFor(set, index, page);
    if (!pageSet) { out.push({ class: 'MISSING_BLOCK', severity: 'high', docId: doc.id, set: set.id, url, detail: 'the page has no reading set' }); return; }
    compareSections(pageSet.sections, set.sections, { checkOrder: true, checkRubrics: true, stats }).forEach((diff) => out.push({
      ...diff, docId: doc.id, set: set.id, url, pageId: page.id,
    }));
  });
  // sets of a page that the document does not carry
  for (const [pageId, used] of perPage) {
    const page = pages.get(pageId);
    const available = page.parsed.sets.length;
    if (used < available) out.push({ class: 'MISSING_SET', severity: 'high', docId: doc.id, pageId, url: page.record.url, detail: `the page has ${available} reading sets, the document ${used}` });
  }
  return out;
}

/** Expected flat sections of a legacy document from its page. */
export function expectedForLegacy(doc, page) {
  const sets = page.parsed?.sets || [];
  if (!sets.length) return { error: 'page has no reading set' };
  if (sets.length > 1) return { error: `page has ${sets.length} reading sets (a canonical document is expected)` };
  const year = isYear(doc.year) ? String(doc.year) : '';
  const cycle = isCycle(doc.year) ? String(doc.year).toUpperCase() : '';
  // A legacy document is the projection of ONE cycle / weekday year: the markers are not part of its shape.
  let selected = pageSectionsFor(sets[0], { year, cycle });
  // The page has cycle-specific sections but the document has no cycle: it can only follow ONE of them (WRONG_CYCLE).
  const cycles = [...new Set(selected.map((section) => section.cycle).filter(Boolean))];
  const notCycleAware = cycles.length > 1 && !cycle;
  if (notCycleAware) selected = selected.filter((section) => !section.cycle || section.cycle === cycles[0]);
  const sections = selected.map(({ cycle: _cycle, year: _year, ...section }) => section);
  return { sections, set: sets[0], ...(notCycleAware ? { notCycleAware: cycles } : {}) };
}

export function compareLegacy(doc, page, stats = null) {
  const expected = expectedForLegacy(doc, page);
  if (expected.error) return { skipped: expected.error, diffs: [] };
  const actual = legacySections(doc);
  const expectedByKey = new Map();
  const diffs = compareSections(expected.sections, actual, { stats }).map((diff) => {
    const expectedSection = expected.sections.find((s) => `${s.kind}/${s.role}` === diff.section.split('/').slice(0, 2).join('/'));
    const actualSection = actual.find((s) => `${s.kind}/${s.role}` === diff.section.split('/').slice(0, 2).join('/'));
    const artifact = artifactOf(diff, expectedSection, actualSection);
    expectedByKey.set(diff.section, expectedSection);
    return { ...diff, ...(artifact ? { artifact } : {}), docId: doc.id, pageId: page.id, url: page.record.url };
  });
  // A document of one weekday year / Sunday cycle that carries the reading of ANOTHER year: WRONG_CYCLE, not a typo.
  const others = (page.parsed.sets[0].sections || []).filter((section) => (section.year && section.year !== String(doc.year)) || (section.cycle && section.cycle !== String(doc.year).toUpperCase()));
  diffs.forEach((diff) => {
    if (!['bible', 'text', 'verses', 'chorus'].includes(diff.field) || diff.class === 'STRUCTURE_LOSS') return;
    const role = diff.section.split('/')[1];
    const stored = actual.find((section) => section.role === role);
    if (!stored) return;
    const twin = others.find((section) => section.role === role && (
      (diff.field === 'bible' && normalizeCitation(section.bible) === normalizeCitation(stored.bible))
      || (diff.field === 'text' && wordsOf(section.text) === wordsOf(stored.text) && wordsOf(stored.text))
      || (diff.field === 'verses' && wordsOf((section.verses || []).join('')) === wordsOf((stored.verses || []).join('')) && (stored.verses || []).length)
      || (diff.field === 'chorus' && wordsOf(section.chorus) === wordsOf(stored.chorus) && wordsOf(stored.chorus))));
    if (twin) {
      diff.class = 'WRONG_CYCLE';
      diff.detail = `the ${isYear(doc.year) ? `weekday year ${doc.year}` : `cycle ${doc.year}`} document carries the ${role} of ${twin.year ? `weekday year ${twin.year}` : `cycle ${twin.cycle}`} (${twin.bible})`;
    }
  });
  if (expected.notCycleAware) {
    diffs.push({ class: 'WRONG_CYCLE', severity: 'high', docId: doc.id, pageId: page.id, url: page.record.url, detail: `the page has a Gospel for each year (${expected.notCycleAware.join(', ')}); the document has no year and carries one` });
  }
  return { diffs };
}

/** WRONG_CONTEXT: the document's own selector against the page title identity. */
export function identityMismatch(doc, page) {
  const pageKey = page.identity.key;
  const selector = docSelector(doc);
  if (!pageKey || !selector) return null;
  const cycleless = pageKey.replace(/:cycle=[ABC]$/, '');
  if (page.identity.kind === 'date') {
    const date = page.identity.date;
    return selector === `date:${date}` || String(doc._date || '') === date ? null : { selector, pageKey };
  }
  if (page.identity.kind === 'feast') return selector === `feast:${page.identity.code}` ? null : { selector, pageKey };
  if (page.identity.kind === 'period') {
    const base = cycleless.replace(/:(vigil|chrism|evening)$/, '');
    if (selector === base) {
      const pageCycle = page.identity.cycle;
      if (pageCycle && isCycle(doc.year) && String(doc.year).toUpperCase() !== pageCycle) return { selector, pageKey, docYear: doc.year, kind: 'cycle' };
      return null;
    }
    return { selector, pageKey };
  }
  return null;
}

export { wordsOf };
