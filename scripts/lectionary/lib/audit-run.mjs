/**
 * The Lectionary audit: crawled pages × production `readings` snapshot ×
 * planned Ordo options. Produces the report objects; the CLI writes them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { massReadingSetsOf } from '../../../src/utils/massReadingSets.js';
import { docHash, openSnapshot } from './snapshot-docs.mjs';
import { ROOT, loadPages, pageIdOfUrl, sha256 } from './source-pages.mjs';
import { describePage, hashOfDoc, inferPagesForUnlinked, isReadingPage, reconcileDocuments } from './reconcile.mjs';
import { docSelector } from './identity.mjs';
import { withoutCycle } from './expected-page.mjs';
import { buildResyncPlan } from './resync-plan.mjs';
import { runPlan, DIOCESES } from '../plan-options.mjs';

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
  pageRows.forEach((row) => { if (row.sha256) bodies.set(row.sha256, [...(bodies.get(row.sha256) || []), row.id]); });
  const duplicates = [...bodies.values()].filter((ids) => ids.length > 1);
  pageRows.forEach((row) => { const group = duplicates.find((ids) => ids.includes(row.id)); if (group) row.duplicateOf = group.filter((id) => id !== row.id); });

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
      resolution: eligible
        ? { status: 'FIX_PLANNED', by: 'scripts/lectionary/resync-readings.mjs (dry-run plan)', reason: 'flat fields re-imported from the canonical page; needs `--apply` + manifest publication' }
        : { status: 'REMAINING', reason: finding.class === 'STRUCTURE_LOSS' ? 'paragraph layout only (same words)' : (resync.skipped.find((row) => row.id === finding.docId)?.reason || 'canonical/projected document or low severity') },
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
  // ---- pages (reading pages) that no stored document is built from
  const notImported = pageRows.filter((row) => row.pageKind === 'reading' && !row.docs.length && !(row.duplicateOf || []).some((id) => pageRows.find((r) => r.id === id)?.docs.length));
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
  return { snap, crawl, pages, docs, allDocs, planned, recon, resync, pageRows, duplicates, items, inferred, generatedAt, plannedByDoc, plannedDocIds, notImported };
}

function classifyPlanAnomaly(row) {
  if (row.option === 'our-lady-budslav') {
    return { status: 'DECISION_NEEDED', reason: 'the only readings document of 02.07 is `02-07-our-lady-budslav-minsk` (_place minsk-mohilev); Vitebsk celebrates a feast, Pinsk a memorial and Grodno an optional memorial of the same title. Whether those dioceses use the Minsk lectionary page is a ritual decision, not a data fix.' };
  }
  if (row.scenario === 'pentecost-saturday') {
    return { status: 'REMAINING', reason: 'Pentecost Saturday coincides with the feast of the Visitation (31.05.2031): the engine yields only the feast, so the Mass of the Pentecost Vigil is not offered. Needs an engine/ordo decision (extra Mass option) and the same change in the Flutter engine.' };
  }
  return { status: 'REMAINING', reason: 'see detail' };
}

export { docHash, hashOfDoc, sha256, DIOCESES, count };
