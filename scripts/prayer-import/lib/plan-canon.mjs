// Dry-run planner for the canonical (first-pass) import. Pure: no I/O besides the injected corpus,
// returns operations + payloads + report rows. Nothing here talks to Firestore.
import { createHash } from 'node:crypto';
import { draftSourceNotice, normalizeTitleKey } from '../../../src/utils/prayerDraftModel.mjs';
import { pageSpanLabel } from '../../../src/utils/prayerSource.mjs';
import { entryToMarkdown, fixLatinInCyrillic } from './blocks-to-markdown.mjs';
import { matchCanonical, kindFromTitle, oldText, oldTitle } from './matching.mjs';
import { buildTagUniverse, chooseTags } from './tags.mjs';

export const CANON_BATCH = 'canon-two-pass-2026-11-12-v1';
export const canonId = (entryId) => `cn_${createHash('sha256').update(entryId).digest('hex').slice(0, 16)}`;
const textHash = (value) => createHash('sha256').update(value).digest('hex');
const RITE_HINTS = { rite_baptism: /хрост|хрышчэн/, rite_penance: /пакаянн|споведз|пэнітэнт/, rite_anointing: /намашчэн|хвор/ };

/**
 * @param {{ corpus: {index, readEntry, sourceHashes}, sources: object, oldPrayers: Array, categories: Array }} input
 */
export function planCanonical({ corpus, sources, oldPrayers, categories = [] }) {
  const universe = buildTagUniverse(oldPrayers, categories);
  const operations = []; const payloads = {}; const tagRows = []; const proposedTags = new Map(); const duplicateRows = []; const coverage = new Map();
  const qa = { mixedRedBlocks: 0, unresolvedLinks: 0, resolvedLinks: 0, latinFixes: 0, emptyTexts: 0, withoutTags: [], titleChanged: 0 };
  const rightsOf = (sourceId) => sources.sources[sourceId];

  // Pass 1: classification (needs the matching text), pass 2 writes final markdown with links to planned targets.
  const titleCount = new Map();
  const planned = new Map(); // entryId -> { meta, entry, markdown, decision }
  const groupOf = new Map(); // member entryId -> printed group title (weekday / plural saint group)
  for (const meta of corpus.index) for (const member of meta.members || []) groupOf.set(member, meta.title);
  for (const meta of corpus.index) {
    const entry = corpus.readEntry(meta);
    if (meta.kind === 'other') { planned.set(meta.entryId, { meta, entry, decision: { decision: 'PRESERVE_STRUCTURE', reason: 'section/day group heading, not a prayer' } }); continue; }
    const title = fixLatinInCyrillic(entry.title);
    titleCount.set(normalizeTitleKey(title), (titleCount.get(normalizeTitleKey(title)) || 0) + 1);
    const { markdown } = entryToMarkdown(entry, { title });
    const kind = meta.kind === 'ritual' ? 'ritual' : meta.kind;
    let decision;
    if (meta.status !== 'complete') {
      const reasons = (entry.qaFlags || []).filter((flag) => flag.severity !== 'info').map((flag) => flag.reason);
      const hint = RITE_HINTS[meta.sourceId];
      const counterparts = hint ? oldPrayers.filter((prayer) => hint.test(normalizeTitleKey(oldTitle(prayer)))).map((prayer) => ({ id: prayer.id, title: oldTitle(prayer) })) : matchCanonical({ title, text: markdown, kind: kindFromTitle(title) || kind }, oldPrayers).candidates;
      decision = { decision: 'REVIEW_AMBIGUOUS', reason: meta.kind === 'ritual' ? 'rite excerpt: scope-limited replacement needs the live rite structure and an editor decision' : 'parser QA flag', flags: reasons, confidence: 'n/a', candidates: counterparts };
    } else {
      decision = matchCanonical({ title, text: markdown, kind: meta.kind === 'prayer' ? null : meta.kind }, oldPrayers);
    }
    planned.set(meta.entryId, { meta, entry, title, markdown, kind, decision });
  }
  // Different prayers that share one printed title (e.g. «Малітоўныя заклікі» under every weekday) get the group
  // in the title so readers and the matcher can tell them apart. The printed title stays in `printedTitle`.
  for (const item of planned.values()) {
    if (!item.title || titleCount.get(normalizeTitleKey(item.title)) < 2) continue;
    const group = groupOf.get(item.meta.entryId);
    if (group) { item.printedTitle = item.title; item.title = `${item.title} (${group})`; }
  }
  const targetOf = new Map();
  for (const [entryId, item] of planned) {
    const d = item.decision.decision;
    if (d === 'CREATE') targetOf.set(entryId, canonId(entryId));
    if (d === 'REPLACE_KEEP_ID') targetOf.set(entryId, item.decision.targetId);
  }

  for (const [entryId, item] of planned) {
    const { meta, entry, decision } = item;
    const rights = rightsOf(meta.sourceId);
    const row = coverage.get(meta.sourceId) || { sourceId: meta.sourceId, book: rights.book, entries: 0, CREATE: 0, REPLACE_KEEP_ID: 0, REVIEW_AMBIGUOUS: 0, PRESERVE_STRUCTURE: 0 };
    row.entries += 1; row[decision.decision] += 1; coverage.set(meta.sourceId, row);
    const pages = pageSpanLabel(meta.printedPageStart, meta.printedPageEnd);
    const base = { sourceId: meta.sourceId, sourceEntryId: entryId, kind: meta.kind, parserStatus: meta.status, pdfPageStart: meta.pdfPageStart, pdfPageEnd: meta.pdfPageEnd, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd };
    if (decision.decision === 'PRESERVE_STRUCTURE') {
      operations.push({ ...base, action: 'PRESERVE_STRUCTURE', title: entry.title, rationale: decision.reason, members: meta.members || [] });
      continue;
    }
    const { markdown: finalMarkdown, stats } = entryToMarkdown(entry, { title: item.title, resolveLink: (target) => (targetOf.get(target) ? targetOf.get(target) : null) });
    qa.mixedRedBlocks += stats.mixedRed; qa.unresolvedLinks += stats.unresolvedLinks; qa.resolvedLinks += stats.links;
    if (item.title !== entry.title) { qa.latinFixes += 1; }
    if (!finalMarkdown.trim()) qa.emptyTexts += 1;
    const old = decision.targetId ? oldPrayers.find((prayer) => prayer.id === decision.targetId) : null;
    const { tags, proposedNew, trace } = chooseTags({ kind: meta.kind, title: item.title, sourceId: meta.sourceId, keepTags: old?.tags || [] }, universe);
    for (const entryTag of proposedNew) { const known = proposedTags.get(entryTag.tag) || { tag: entryTag.tag, reason: entryTag.reason, affected: [] }; known.affected.push(entryId); proposedTags.set(entryTag.tag, known); }
    for (const t of trace) tagRows.push({ sourceEntryId: entryId, title: item.title, tag: t.tag, via: t.via });
    if (!tags.length) qa.withoutTags.push(entryId);
    const sourceFields = { sourceBook: rights.book, copyrightNotices: rights.copyrightNotices };
    const sourceNotice = draftSourceNotice({ ...sourceFields, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd, pdfPageStart: meta.pdfPageStart });
    const hash = textHash(finalMarkdown);
    const common = { ...base, title: item.title, canonicalTitle: item.title, ...(item.printedTitle ? { printedTitle: item.printedTitle } : {}), tags, source: sourceNotice, copyrightNotices: rights.copyrightNotices, rightsStatus: 'unconfirmed', textSha256: hash, textLength: finalMarkdown.length, blocks: stats.blocks };
    if (decision.decision === 'CREATE' || decision.decision === 'REPLACE_KEEP_ID') {
      const id = targetOf.get(entryId);
      const priestOnly = old?.priestOnly === true;
      const action = decision.decision;
      if (action === 'REPLACE_KEEP_ID' && old && oldTitle(old) !== item.title) qa.titleChanged += 1;
      const doc = { title: item.title, text: finalMarkdown, textFormat: 'mybrev-markdown', textFormatVersion: 1, tags, source: sourceNotice, copyrightNotices: rights.copyrightNotices, priestOnly, sourceId: meta.sourceId, sourceEntryId: entryId };
      payloads[id] = { collection: 'prayers', id, data: doc, preserve: action === 'REPLACE_KEEP_ID' ? ['createdAt', 'verified', 'priestOnly', 'effectivePriestOnly', 'titleVersions', 'textVersions'] : [] };
      operations.push({ ...common, action, targetCollection: 'prayers', targetId: id, oldIds: old ? [old.id] : [], oldTitle: old ? oldTitle(old) : null, oldFingerprint: old ? fingerprintOf(old) : null, rationale: decision.reason, confidence: decision.confidence, evidence: decision.candidates, tagTrace: trace.map((t) => `${t.tag}←${t.via}`) });
      if (decision.candidates.length > 1 || decision.candidates.some((c) => c.embedded)) duplicateRows.push({ sourceEntryId: entryId, title: item.title, decision: action, chosen: id, candidates: decision.candidates });
    } else {
      const draftId = canonId(entryId);
      const reason = meta.kind === 'ritual' ? 'rite_scope' : meta.status !== 'complete' ? 'needs_review' : 'ambiguous';
      const hasLatinN = meta.kind === 'ritual';
      const draft = { draftId, sourceId: meta.sourceId, sourceBook: rights.book, sourceSha256: corpusHash(corpus, meta.sourceId), pdfPageStart: meta.pdfPageStart, pdfPageEnd: meta.pdfPageEnd, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd, sourcePageSpan: pages, originalEntryId: entryId, title: item.title, text: finalMarkdown, textFormat: 'mybrev-markdown', tags, copyrightNotices: rights.copyrightNotices, rightsStatus: 'unconfirmed', priestOnly: false, originBatch: CANON_BATCH, origin: 'disputed', reason, flagReasons: [decision.reason, ...(decision.flags || [])].slice(0, 6), possibleDuplicateIds: (decision.candidates || []).map((c) => c.id).filter(Boolean).slice(0, 10), status: 'needs_review', fingerprint: hash, ...(hasLatinN ? { notes: 'Рытуал: вытрымка з кнігі. Метка N. — месца для імя; незавершаныя заўвагі рэдактара не вырашаюцца аўтаматычна.' } : {}) };
      payloads[draftId] = { collection: 'prayerDrafts', id: draftId, data: draft };
      operations.push({ ...common, action: 'REVIEW_AMBIGUOUS', targetCollection: 'prayerDrafts', targetId: draftId, oldIds: [], rationale: decision.reason, flags: decision.flags || [], reason, confidence: decision.confidence, evidence: decision.candidates });
      duplicateRows.push({ sourceEntryId: entryId, title: item.title, decision: 'REVIEW_AMBIGUOUS', chosen: draftId, candidates: decision.candidates || [], reason: decision.reason });
    }
  }
  const counts = operations.reduce((acc, op) => ({ ...acc, [op.action]: (acc[op.action] || 0) + 1 }), {});
  return { operations, payloads, counts, coverage: [...coverage.values()], tagRows, proposedNewTags: [...proposedTags.values()], duplicateRows, qa, tagUniverse: [...universe.values()] };
}
export const fingerprintOf = (prayer) => textHash(`${oldTitle(prayer)}\n${oldText(prayer)}`);
const corpusHash = (corpus, sourceId) => corpus.sourceHashes?.[sourceId] || '';
export { oldText };
