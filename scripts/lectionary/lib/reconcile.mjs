/**
 * Full Lectionary reconciliation (pure over loaded inputs): crawled pages ×
 * stored `readings` documents × planned Ordo options.
 */
import { massReadingSetsOf, defaultSetId, sectionsForCycle, setCycles } from '../../../src/utils/massReadingSets.js';
import { compareSections, legacySections } from './compare.mjs';
import { documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { backingOf, compareCanonical, compareLegacy, identityMismatch, pageOfUrl } from './doc-page.mjs';
import { parseFidelity } from './fidelity.mjs';
import { docSelector } from './identity.mjs';
import { pageIdOfUrl, sha256 } from './source-pages.mjs';
import { validateParsedPage } from '../../liturgy/lib/lectionary-parser.mjs';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/** Every page that contains at least one reading/Gospel section is a reading page. */
export const isReadingPage = (page) => Boolean(page.parsed?.sets.some((set) => set.sections.some((section) => ['reading', 'gospel', 'psalm'].includes(section.kind))));

function pageKind(page) {
  if (!page.record.bytes) return 'empty';
  if (isReadingPage(page)) return 'reading';
  const text = (page.html || '').replace(/<[^>]+>/g, ' ');
  if (/1\s*чыт\.|Ев\.\s*[А-ЯЁ]/u.test(text) && text.length < 1200) return 'citation-only';
  return 'index-or-prose';
}

export function describePage(page, docsOfPage, plannedKeys) {
  const parsed = page.parsed;
  const kind = pageKind(page);
  const sets = (parsed?.sets || []).map((set) => ({
    label: set.sourceLabel || '',
    ...(set.note ? { note: set.note } : {}),
    ...(set.prayers ? { prayers: set.prayers.map((p) => p.kind) } : {}),
    ...(set.preface ? { preface: set.preface.length } : {}),
    sections: set.sections.filter((s) => s.kind !== 'rubric').map((s) => ({
      kind: s.kind, role: s.role, ...(s.cycle ? { cycle: s.cycle } : {}), ...(s.year ? { year: s.year } : {}), ...(s.form ? { form: s.form } : {}),
      bible: s.bible || '', text: Boolean(s.text || s.passion || s.verses?.length || s.verse),
      ...(s.alternatives?.length ? { alternatives: s.alternatives.map((a) => a.bible || '') } : {}),
    })),
    rubrics: set.sections.filter((s) => s.kind === 'rubric').length,
  }));
  const fidelity = kind === 'reading' ? parseFidelity(page.html) : null;
  return {
    id: page.id, url: page.record.url, finalUrl: page.record.finalUrl, category: page.record.category || '_root',
    listed: page.record.category !== '_unlisted', listedVia: (page.record.via || []).filter((v) => v.startsWith('category:')).map((v) => v.slice(9)),
    status: page.record.status, redirects: page.record.redirects, bytes: page.record.bytes, sha256: page.record.sha256,
    title: String(page.record.title || '').replace(/^Catholic\.by\s*-\s*/, ''),
    identity: page.identity.kind === 'unknown' ? { kind: 'unknown' } : { kind: page.identity.kind, key: page.identity.key, ...(page.identity.rank ? { rank: page.identity.rank } : {}) },
    pageKind: kind,
    parse: parsed ? {
      sets, warnings: parsed.warnings, validation: kind === 'reading' ? validateParsedPage(parsed) : [],
      ...(parsed.translationNote ? { translationNote: true } : {}),
      fidelity: fidelity ? { sourceWords: fidelity.sourceWords, droppedWords: fidelity.droppedWords, extraWords: fidelity.extraWords } : null,
    } : null,
    docs: docsOfPage,
    planned: plannedKeys,
  };
}

/** Discrepancies of every stored document against its source page(s). */
export function reconcileDocuments({ docs, pages, inferred = new Map() }) {
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const findings = [];
  const docsByPage = new Map();
  const unlinked = [];
  const sectionStats = {};
  const stats = { compared: 0, canonical: 0, legacy: 0, projection: 0, unlinked: 0, exact: 0, withDifferences: 0, skipped: 0 };
  const link = (pageId, docId) => { if (!docsByPage.has(pageId)) docsByPage.set(pageId, new Set()); docsByPage.get(pageId).add(docId); };

  for (const doc of docs) {
    const backing = backingOf(doc, docsById);
    let diffs = [];
    if (backing.kind === 'canonical') {
      stats.canonical += 1;
      massReadingSetsOf(doc).forEach((set) => { const id = pageIdOfUrl(set.source?.url || doc._sourceUrl || ''); if (id) link(id, doc.id); });
      diffs = compareCanonical(doc, pages, sectionStats);
      stats.compared += 1;
    } else if (backing.kind === 'projection') {
      stats.projection += 1;
      const canonical = backing.canonical;
      const ref = doc._massReadingsRef;
      const set = massReadingSetsOf(canonical).find((item) => item.id === ref.set);
      const id = pageIdOfUrl(set?.source?.url || doc._sourceUrl || '');
      if (id) link(id, doc.id);
      if (!canonical || !set) diffs = [{ class: 'WRONG_CONTEXT', severity: 'high', docId: doc.id, detail: `_massReadingsRef points to a missing document/set (${ref.doc}/${ref.set})` }];
      else if (ref.projected !== false) {
        // A projection must carry exactly the flat form of its canonical set (and cycle).
        const expected = sectionsForCycle(set, ref.cycle || '').map(({ cycle: _cycle, ...section }) => section);
        diffs = compareSections(expected, legacySections(doc), { stats: sectionStats })
          .map((diff) => ({ ...diff, docId: doc.id, pageId: id || null, url: set.source?.url || doc._sourceUrl || null, projectionOf: `${ref.doc}#${ref.set}${ref.cycle ? `:${ref.cycle}` : ''}` }));
      }
      stats.compared += 1;
    } else if (backing.kind === 'legacy') {
      stats.legacy += 1;
      const page = pageOfUrl(pages, doc._sourceUrl);
      if (!page || !page.parsed) {
        diffs = [{ class: 'SOURCE_UNAVAILABLE', severity: 'medium', docId: doc.id, url: doc._sourceUrl, detail: 'source page is not in the crawl snapshot' }];
      } else {
        link(page.id, doc.id);
        const result = compareLegacy(doc, page, sectionStats);
        if (result.skipped) { stats.skipped += 1; diffs = [{ class: 'MISSING_SET', severity: 'medium', docId: doc.id, pageId: page.id, url: page.record.url, detail: result.skipped }]; }
        else diffs = result.diffs;
        stats.compared += 1;
        const mismatch = identityMismatch(doc, page);
        if (mismatch) diffs.push({ class: mismatch.kind === 'cycle' ? 'WRONG_CYCLE' : 'WRONG_CONTEXT', severity: 'high', docId: doc.id, pageId: page.id, url: page.record.url, detail: `document ${mismatch.selector}${mismatch.docYear ? ` year ${mismatch.docYear}` : ''} is backed by the page «${page.identity.heading}» (${mismatch.pageKey})` });
      }
    } else {
      // No `_sourceUrl`: use the one page that carries the document's identity.
      const page = inferred.get(doc.id);
      if (page?.parsed) {
        stats.inferred = (stats.inferred || 0) + 1;
        link(page.id, doc.id);
        const result = compareLegacy(doc, page, sectionStats);
        diffs = result.skipped ? [{ class: 'MISSING_SET', severity: 'medium', docId: doc.id, pageId: page.id, url: page.record.url, detail: result.skipped }] : result.diffs;
        stats.compared += 1;
        diffs.forEach((diff) => { diff.sourceLinkInferred = true; });
      } else {
        stats.unlinked += 1;
        unlinked.push(doc.id);
      }
    }
    if (diffs.length) stats.withDifferences += 1; else if (backing.kind !== 'unlinked' || inferred.get(doc.id)) stats.exact += 1;
    diffs.forEach((diff) => findings.push({ docId: doc.id, ...diff }));
  }
  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || a.docId.localeCompare(b.docId));
  return { findings, docsByPage, unlinked, stats, sectionStats };
}

/** Documents without `_sourceUrl`: infer their page by identity (selector + cycle). */
export function inferPagesForUnlinked(unlinkedIds, docsById, pages) {
  const byKey = new Map();
  for (const page of pages.values()) if (page.identity.key) { const list = byKey.get(page.identity.key) || []; list.push(page); byKey.set(page.identity.key, list); }
  return unlinkedIds.map((id) => {
    const doc = docsById.get(id);
    const selector = docSelector(doc);
    const cycle = /^[ABC]$/.test(String(doc.year)) ? `:cycle=${doc.year}` : '';
    const candidates = [...(byKey.get(`${selector}${cycle}`) || []), ...(byKey.get(selector) || []),
      ...[...byKey.entries()].filter(([key]) => key.startsWith(`${selector}:`) && !key.includes('cycle=')).flatMap(([, list]) => list)];
    let unique = [...new Map(candidates.map((p) => [p.id, p])).values()];
    // `advent-DD-12` / `christmas-DD-MM` documents are the weekday pages, never a saint's memorial of the same date.
    if (/^(advent|christmas)-\d/.test(id) && unique.length > 1) {
      const weekday = unique.filter((p) => ['weekday', 'advent-weekday', 'octave-day'].includes(p.identity.rank));
      if (weekday.length) unique = weekday;
    }
    return { docId: id, selector, year: doc.year ?? null, pages: unique.map((p) => p.id), rank: doc._rank || null };
  });
}

export const hashOfDoc = (doc) => documentHash(storedDocument(doc.id, doc));
export { sha256, defaultSetId, setCycles };
