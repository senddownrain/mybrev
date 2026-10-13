/**
 * The Lectionary audit: crawled pages × production `readings` snapshot ×
 * planned Ordo options. Produces the report objects; the CLI writes them.
 */
import path from 'node:path';
import { massReadingSetsOf } from '../../../src/utils/massReadingSets.js';
import { docHash, openSnapshot } from './snapshot-docs.mjs';
import { ROOT, loadPages, pageIdOfUrl, sha256 } from './source-pages.mjs';
import { describePage, hashOfDoc, inferPagesForUnlinked, isReadingPage, reconcileDocuments } from './reconcile.mjs';
import { docSelector } from './identity.mjs';
import { withoutCycle } from './expected-page.mjs';
import { buildResyncPlan } from './resync-plan.mjs';
import { runPlan, DIOCESES } from '../plan-options.mjs';
import { READING_SET_CELEBRATIONS } from '../../liturgy/lib/readings-sets-plan.mjs';

export const REPORT_DIR = path.join(ROOT, 'reports', 'lectionary');
const count = (items, key) => items.reduce((acc, item) => { const k = typeof key === 'function' ? key(item) : item[key]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

/** Sole page that carries the identity of a document without `_sourceUrl` (duplicates with the same body count as one). */
function inferPages(docs, pages) {
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const unlinked = docs.filter((doc) => !doc._sourceUrl && !massReadingSetsOf(doc).length && !doc._massReadingsRef?.doc).map((doc) => doc.id);
  const map = new Map();
  inferPagesForUnlinked(unlinked, docsById, pages).forEach((row) => {
    const candidates = row.pages.map((id) => pages.get(id)).filter((page) => page?.parsed && isReadingPage(page));
    const distinct = new Map(candidates.map((page) => [page.record.sha256, page]));
    if (distinct.size === 1) map.set(row.docId, [...distinct.values()].sort((a, b) => Number(a.id) - Number(b.id))[0]);
  });
  return map;
}

export async function runAudit({ snapshotDir, plan = null } = {}) {
  const snap = await openSnapshot(snapshotDir);
  const generatedAt = new Date().toISOString();
  const allDocs = await snap.collection('readings');
  const docs = allDocs.filter((doc) => doc._obsolete !== true);
  const { crawl, pages } = loadPages();
  const planned = plan || await runPlan({ snapshotDir });
  const inferred = inferPages(docs, pages);
  const recon = reconcileDocuments({ docs, pages, inferred });
  const resync = buildResyncPlan({ docs, pages, findings: recon.findings, inferred });
  const resyncById = new Map(resync.changes.map((change) => [change.id, change]));
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  // What the audit would say after the resync plan: the proof that the plan fixes what it claims to fix.
  const afterById = new Map(resync.changes.map((change) => [change.id, { id: change.id, ...change.after }]));
  const docsAfter = docs.map((doc) => afterById.get(doc.id) || doc);
  const reconAfter = reconcileDocuments({ docs: docsAfter, pages, inferred });
  const projectedAfterResync = {
    documentsWithFindings: new Set(reconAfter.findings.map((f) => f.docId)).size,
    documentsWithMaterialFindings: new Set(reconAfter.findings.filter((f) => !(f.class === 'STRUCTURE_LOSS' && f.severity === 'low')).map((f) => f.docId)).size,
    byClass: count(reconAfter.findings, 'class'), remainingDocumentsMaterial: [...new Set(reconAfter.findings.filter((f) => !(f.class === 'STRUCTURE_LOSS' && f.severity === 'low')).map((f) => f.docId))].sort(),
  };

  // ---- doc → planned identities (dates / dioceses)
  const plannedByDoc = new Map();
  planned.identities.forEach((identity) => identity.docIds.forEach((docId) => {
    const list = plannedByDoc.get(docId) || [];
    list.push({ key: identity.key, purpose: identity.purpose, sampleDates: identity.sampleDates, dioceses: identity.dioceses, dates: identity.dates, options: identity.optionIds.slice(0, 4) });
    plannedByDoc.set(docId, list);
  }));
  const plannedDocIds = new Set(plannedByDoc.keys());

  // ---- pages
  const pageRows = [];
  for (const page of [...pages.values()].sort((a, b) => Number(a.id) - Number(b.id))) {
    const docIds = [...(recon.docsByPage.get(page.id) || [])].sort();
    const keys = [...new Set(docIds.flatMap((id) => (plannedByDoc.get(id) || []).map((row) => row.key)))];
    pageRows.push(describePage(page, docIds, keys.slice(0, 12)));
  }
  const bodies = new Map();
  pageRows.forEach((row) => {
    const sha = pages.get(row.id).record.wordsSha256;
    row.wordsSha256 = sha;
    if (sha && row.pageKind === 'reading') bodies.set(sha, [...(bodies.get(sha) || []), row.id]);
  });
  // identical words (markup may differ): the same Lectionary text published twice
  const duplicates = [...bodies.values()].filter((ids) => ids.length > 1);
  pageRows.forEach((row) => { const group = duplicates.find((ids) => ids.includes(row.id)); if (group) row.duplicateOf = group.filter((id) => id !== row.id); });

  // the same identity published under several articles (a copy in another category, a stale revision)
  const byIdentity = new Map();
  pageRows.forEach((row) => { if (row.pageKind === 'reading' && row.identity.key) byIdentity.set(row.identity.key, [...(byIdentity.get(row.identity.key) || []), row.id]); });
  const identityDuplicates = [...byIdentity.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({
    identity: key, pages: ids, identicalWords: new Set(ids.map((id) => pages.get(id).record.wordsSha256)).size === 1,
    withDocuments: ids.filter((id) => pageRows.find((row) => row.id === id).docs.length),
  }));
  pageRows.forEach((row) => { const group = identityDuplicates.find((dup) => dup.pages.includes(row.id)); if (group) row.sameIdentityAs = group.pages.filter((id) => id !== row.id); });

  // ---- discrepancy rows
  const items = [];
  const push = (item) => items.push({ id: `D${String(items.length + 1).padStart(4, '0')}`, ...item });
  for (const finding of recon.findings) {
    const doc = docsById.get(finding.docId);
    const change = resyncById.get(finding.docId);
    const eligible = Boolean(change) && !(finding.class === 'STRUCTURE_LOSS' && finding.severity === 'low');
    const planned_ = plannedByDoc.get(finding.docId) || [];
    push({
      scope: 'document', class: finding.class, severity: finding.severity,
      docId: finding.docId, identity: docSelector(doc) || null, year: doc?.year ?? null,
      ...(finding.set ? { set: finding.set } : {}),
      section: finding.section || null, field: finding.field || null,
      sourcePageId: finding.pageId || pageIdOfUrl(finding.url) || null, sourceUrl: finding.url || doc?._sourceUrl || null,
      expected: finding.expected ?? null, actual: finding.actual ?? null,
      evidence: { detail: finding.detail || null, relation: finding.relation || null, artifact: finding.artifact || null, at: finding.at ?? null, sourceLinkInferred: finding.sourceLinkInferred || undefined },
      planned: planned_.slice(0, 3).map((row) => ({ identity: row.key, sampleDates: row.sampleDates, dioceses: row.dioceses })),
      resolution: resolutionOf(finding, eligible, resync.skipped.find((row) => row.id === finding.docId)?.reason || ''),
    });
  }
  // ---- plan anomalies (engine ↔ readings)
  const planGroups = new Map();
  planned.anomalies.forEach((a) => {
    const key = `${a.class}|${a.option || a.scenario}|${a.detail}`;
    const row = planGroups.get(key) || { ...a, dioceses: new Set(), dates: new Set() };
    row.dioceses.add(a.diocese); row.dates.add(a.date); planGroups.set(key, row);
  });
  for (const row of planGroups.values()) {
    push({
      scope: 'plan', class: row.class, severity: row.severity, docId: null, identity: row.option || row.scenario || null,
      section: null, field: null, sourcePageId: null, sourceUrl: null, expected: null, actual: null,
      evidence: { detail: row.detail, dioceses: [...row.dioceses].sort(), dates: [...row.dates].sort(), officeKind: row.officeKind },
      planned: [],
      resolution: classifyPlanAnomaly(row),
    });
  }
  // ---- independent oracle: the page a temporal option shows must carry the date's own identity
  const keysOfDoc = new Map();
  for (const row of pageRows) for (const docId of row.docs) { const set = keysOfDoc.get(docId) || new Set(); if (row.identity.key) set.add(row.identity.key); keysOfDoc.set(docId, set); }
  const temporal = { checked: 0, unverifiable: 0, mismatches: 0 };
  for (const check of planned.temporalChecks) {
    if (!check.expectedKey || !check.doc) { temporal.unverifiable += 1; continue; }
    const keys = keysOfDoc.get(check.doc);
    const doc = docsById.get(check.doc);
    const projectedFrom = doc?._massReadingsRef?.doc ? keysOfDoc.get(doc._massReadingsRef.doc) : null;
    const known = keys?.size ? keys : projectedFrom;
    if (!known?.size) { temporal.unverifiable += 1; continue; }
    temporal.checked += 1;
    const wanted = withoutCycle(check.expectedKey);
    const cycleWanted = /cycle=([ABC])$/.exec(check.expectedKey)?.[1] || '';
    const ok = [...known].some((key) => withoutCycle(key) === wanted && (!cycleWanted || !/cycle=/.test(key) || key.endsWith(`cycle=${cycleWanted}`)));
    if (!ok) {
      temporal.mismatches += 1;
      push({
        scope: 'plan', class: 'WRONG_CONTEXT', severity: 'high', docId: check.doc, identity: check.expectedKey, section: null, field: null,
        sourcePageId: null, sourceUrl: null, expected: check.expectedKey, actual: [...known].join(' | '),
        evidence: { detail: `the readings shown for ${check.sample} (${check.dioceses.join(', ')}) come from a page of another liturgical identity`, option: check.sampleOption, occurrences: check.dates },
        planned: [], resolution: { status: 'REMAINING', reason: 'needs an engine/data decision' },
      });
    }
  }
  planned.temporalOracle = temporal;

  // ---- reference-only celebrations: confirmed against the source inventory (no Lectionary page carries them)
  for (const ref of planned.referenceOnly) {
    const words = new Set(wordsOfTitle(ref.title));
    const best = pageRows.filter((row) => row.pageKind === 'reading').map((row) => ({ row, score: overlap(words, new Set(wordsOfTitle(row.title))) })).sort((a, b) => b.score - a.score)[0];
    push({
      scope: 'plan', class: 'REFERENCE_ONLY', severity: 'low', docId: null, identity: ref.option, section: null, field: null, sourcePageId: best?.score >= 0.6 ? best.row.id : null, sourceUrl: best?.score >= 0.6 ? best.row.url : null,
      expected: ref.reference, actual: null,
      evidence: { detail: `${ref.title}: citations only; best Lectionary title match «${best?.row.title.slice(0, 50)}» (similarity ${best?.score.toFixed(2)}); ${ref.occurrences} date×diocese occurrences`, dioceses: ref.dioceses, dates: ref.dates },
      planned: [], resolution: { status: best?.score >= 0.6 ? 'REMAINING' : 'NOT_AN_ERROR', reason: best?.score >= 0.6 ? 'a Lectionary page with a similar title exists: review whether it is the same celebration' : 'no Lectionary page carries this celebration; the citation stays reference-only (never invented text)' },
    });
  }
  for (const doc of docs.filter((d) => massReadingSetsOf(d).some((set) => set.referenceOnly))) {
    const set = massReadingSetsOf(doc).find((item) => item.referenceOnly);
    push({
      scope: 'document', class: 'REFERENCE_ONLY', severity: 'low', docId: doc.id, identity: docSelector(doc) || null, section: null, field: null, sourcePageId: null, sourceUrl: null,
      expected: set.sections.filter((s2) => s2.bible).map((s2) => s2.bible).join('; '), actual: null,
      evidence: { detail: `${doc.title}: reference-only set «${set.id}» (${set.note || 'no text approved'})` }, planned: (plannedByDoc.get(doc.id) || []).slice(0, 2).map((r) => ({ identity: r.key, sampleDates: r.sampleDates, dioceses: r.dioceses })),
      resolution: { status: 'NOT_AN_ERROR', reason: 'owner decision (§5.5/§5.6 of the final-phase prompt): no text is invented; the Minsk 16.03 page is the only dedication page' },
    });
  }
  // ---- pages (reading pages) that no stored document is built from
  const notImported = pageRows.filter((row) => row.pageKind === 'reading' && !row.docs.length
    && ![...(row.duplicateOf || []), ...(row.sameIdentityAs || [])].some((id) => pageRows.find((r) => r.id === id)?.docs.length));
  notImported.forEach((row) => push({
    scope: 'source', class: 'MISSING_SET', severity: row.listed ? 'medium' : 'low', docId: null, identity: row.identity.key || null,
    section: null, field: null, sourcePageId: row.id, sourceUrl: row.url, expected: row.title, actual: null,
    evidence: { detail: `reading page «${row.title}» (${row.category}) has no stored readings document`, sets: row.parse.sets.length },
    planned: [], resolution: { status: 'REMAINING', reason: row.listed ? 'a new document must be created from this page (needs an identity decision from the owner)' : 'unlisted article; not part of the published lectionary menu' },
  }));
  // parse problems of the crawl itself
  pageRows.filter((row) => row.parse?.validation?.length).forEach((row) => push({
    scope: 'source', class: 'SOURCE_UNAVAILABLE', severity: 'medium', docId: null, identity: row.identity.key || null,
    section: null, field: null, sourcePageId: row.id, sourceUrl: row.url, expected: null, actual: null,
    evidence: { detail: row.parse.validation.join('; ') }, planned: [], resolution: { status: 'REMAINING', reason: 'the page does not pass the structural validation of the parser; not auto-importable' },
  }));
  return { snap, crawl, pages, docs, allDocs, planned, recon, resync, projectedAfterResync, pageRows, duplicates, identityDuplicates, items, inferred, generatedAt, plannedByDoc, plannedDocIds, notImported };
}

const wordsOfTitle = (title) => String(title || '').toLowerCase().replace(/^catholic\.by\s*-\s*/, '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !/^(успамін|свята|урачыстасць|найсв|панны|марыі|св)$/.test(w));
const overlap = (a, b) => (a.size ? [...a].filter((w) => b.has(w)).length / a.size : 0);

const SETS_MIGRATION = new Set(READING_SET_CELEBRATIONS.flatMap((celebration) => [celebration.doc, ...(celebration.linked || []).map((link) => link.doc)]));

function resolutionOf(finding, eligible, skipReason) {
  if (finding.projectionOf) return { status: 'FIX_PLANNED', by: 'scripts/liturgy/migrate-readings-sets.mjs (dry-run plan in the repo)', reason: `the legacy projection of ${finding.projectionOf} differs from its canonical set; the existing migration re-projects it` };
  if (SETS_MIGRATION.has(finding.docId) && /migrate-readings-sets|reading sets|has a Gospel for each year/.test(`${skipReason} ${finding.detail || ''}`)) {
    return { status: 'FIX_PLANNED', by: 'scripts/liturgy/migrate-readings-sets.mjs (dry-run plan in the repo)', reason: 'a canonical document with structured sets (this celebration was added to the plan by the audit); needs `--apply` + manifest publication' };
  }
  if (finding.class === 'STRUCTURE_LOSS' && finding.severity === 'low') return { status: 'REMAINING', reason: 'paragraph layout only (same words); not worth a write' };
  if (eligible) return { status: 'FIX_PLANNED', by: 'scripts/lectionary/resync-readings.mjs (dry-run plan)', reason: 'flat fields re-imported from the canonical page; needs `--apply` + manifest publication' };
  if (/^the page does not pass/.test(skipReason)) return { status: 'DECISION_NEEDED', reason: `${skipReason}; the source page itself is defective (a text is missing on the page), nothing may be invented` };
  if (/identity does not match/.test(skipReason)) return { status: 'DECISION_NEEDED', reason: 'the document is keyed to the date 05.01 but backed by the page of the II Sunday after Christmas; since the engine fix the Sunday reads the period document christmas-w2-d1, so this copy is unreachable. Mark it obsolete or delete it (permanent deletion is not done without the owner)' };
  return { status: 'REMAINING', reason: skipReason || 'no safe automatic fix' };
}

function classifyPlanAnomaly(row) {
  if (row.option === 'our-lady-budslav') {
    return { status: 'DECISION_NEEDED', reason: 'confirmed by the diocesan calendars: Minsk solemnity, Vitebsk feast, Pinsk memorial with the proper readings, Grodno weekday in the 2027 table (optional memorial in the engine). The only readings document `02-07-our-lady-budslav-minsk` is linked to Minsk only: the prepared change adds `_dayIds` (pending-authorization.json, budslav-link; needs the owner\'s authorization)' };
  }
  if (/prescribes proper readings/.test(row.detail || '')) {
    return { status: 'DECISION_NEEDED', reason: 'the Lectionary prescribes proper readings for this memorial, but Catholic.by has no page for it, so `readings` has no document; the weekday readings are shown (nothing is invented). Obtain the Lectionary page (pending-authorization.json, prescribed-proper-without-document)' };
  }
  if (row.scenario === 'transfiguration') {
    return { status: 'FIXED_IN_DATA', by: 'resync-readings.mjs wave 4', reason: 'document 06-08-transfiguration-lord now has a cycle-aware set (A, B, C)' };
  }
  if (row.scenario === 'nativity-john-baptist') {
    return { status: 'FIXED_IN_DATA', by: 'resync-readings.mjs wave 4', reason: 'document 24-06-nativity-john-baptist now has sets vigil + day, DAY default (owner decision)' };
  }
  if (row.scenario === 'pentecost-saturday') {
    return { status: 'FIXED_IN_REPO', reason: 'Pentecost Saturday taken by the Visitation (2031-05-31): the feast Mass and the evening Vigil Mass of Pentecost are both offered, vigil default (src/utils/ordo/readings.js)' };
  }
  return { status: 'REMAINING', reason: 'see detail' };
}

export { docHash, hashOfDoc, sha256, DIOCESES, count };
