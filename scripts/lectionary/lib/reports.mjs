/**
 * Report builders of the Lectionary audit (pure over `runAudit` output).
 */
import crypto from 'node:crypto';
import { massReadingSetsOf, defaultSetId, setCycles, PASSION_ROLES, SET_CONTEXTS, SECTION_KINDS } from '../../../src/utils/massReadingSets.js';
import { canonicalJson, collectionDigest, describeDocuments, storedDocument, documentHash, CONTENT_SCHEMA_VERSION, DOCUMENT_SCHEMAS } from '../../content/lib/app-content.mjs';
import { docSelector } from './identity.mjs';
import { SET_DEFAULT_POLICY } from '../plan-options.mjs';
import { withoutCycle } from './expected-page.mjs';

const short = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex').slice(0, 16);
const count = (items, key) => items.reduce((acc, item) => { const k = typeof key === 'function' ? key(item) : item[key]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const sortObject = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => String(a).localeCompare(String(b))));
const CLASSES = ['WRONG_TEXT', 'WRONG_REFERENCE', 'MISSING_BLOCK', 'MISSING_SET', 'WRONG_DEFAULT', 'WRONG_CYCLE', 'WRONG_CONTEXT', 'STRUCTURE_LOSS', 'STALE_PUBLISHED', 'SOURCE_UNAVAILABLE', 'REFERENCE_ONLY'];

// ── per-document verification status ─────────────────────────────────────────

export function documentStatuses(audit) {
  const findings = new Map();
  audit.recon.findings.forEach((f) => { const list = findings.get(f.docId) || []; list.push(f); findings.set(f.docId, list); });
  const status = new Map();
  for (const doc of audit.docs) {
    const own = findings.get(doc.id) || [];
    const sets = massReadingSetsOf(doc);
    const referenceOnly = sets.length && sets.every((set) => set.referenceOnly);
    const linked = Boolean(doc._sourceUrl || sets.some((set) => set.source?.url) || doc._massReadingsRef?.doc || audit.inferred.has(doc.id));
    let value;
    if (referenceOnly) value = 'reference-only';
    else if (!linked) value = 'no-source-page';
    else if (own.some((f) => !(f.class === 'STRUCTURE_LOSS' && f.severity === 'low'))) value = 'mismatch';
    else if (own.length) value = 'verified-layout-note';
    else value = 'verified';
    status.set(doc.id, { status: value, findings: own.length });
  }
  return status;
}

// ── source inventory ─────────────────────────────────────────────────────────

export function buildSourceInventory(audit) {
  const { crawl, pageRows } = audit;
  const anomalies = [];
  const holes = crawl.holes?.probed || [];
  anomalies.push({ kind: 'unlisted-articles', note: 'articles inside the id range that no category menu links; probed by id', ids: holes, withBody: holes.filter((id) => crawl.items[id]?.bytes) });
  anomalies.push({ kind: 'identical-text-duplicates', note: 'the same Lectionary text published twice (identical words)', groups: audit.duplicates });
  anomalies.push({ kind: 'same-identity-different-article', note: 'several articles carry the same liturgical identity; the stored documents use one of them', groups: audit.identityDuplicates });
  anomalies.push({ kind: 'cross-listed', note: 'articles that appear in the menus of several categories', ids: Object.values(crawl.items).filter((item) => (item.via || []).filter((v) => v.startsWith('category:')).length > 1).map((item) => item.id) });
  anomalies.push({ kind: 'layout-edit-link', note: 'a menu link with ?layout=edit (Joomla back-end form) points at article 4564, a category-less URL', ids: [4564] });
  anomalies.push({ kind: 'source-defects', note: 'defects of the pages themselves (never auto-fixed)', items: pageRows.filter((row) => row.parse?.warnings?.length || row.parse?.validation?.length).map((row) => ({ id: row.id, title: row.title, warnings: row.parse.warnings, validation: row.parse.validation })) });
  return {
    schema: 1, generatedAt: audit.generatedAt,
    source: { index: crawl.index.url, crawledAt: crawl.crawledAt, userAgent: 'browser-like, sequential, 400 ms delay, retries', snapshotDir: 'reports/lectionary/snapshots' },
    crawl: {
      index: crawl.index,
      categories: Object.fromEntries(Object.entries(crawl.categories).map(([name, c]) => [name, { url: c.url, status: c.status, finalUrl: c.finalUrl, redirects: c.redirects, bytes: c.bytes, sha256: c.sha256, pagination: c.pagination, links: c.links.length, own: c.links.filter((l) => l.category === name).length }])),
      paginationNote: 'No category page exposes ?start=/?limitstart=/?page= links; the probes ?limit=0, ?start=20, ?limitstart=20, ?start=1000 return the same 65 (uspaminy) links, so every category menu is complete on one page.',
      holesProbed: holes,
    },
    totals: {
      articles: pageRows.length, listed: pageRows.filter((r) => r.listed).length, unlisted: pageRows.filter((r) => !r.listed).length,
      status200: pageRows.filter((r) => r.status === 200).length, redirected: pageRows.filter((r) => r.redirects).length,
      byCategory: sortObject(count(pageRows, 'category')), byPageKind: count(pageRows, 'pageKind'),
      byIdentityKind: count(pageRows, (r) => r.identity.kind),
    },
    anomalies,
    pages: pageRows,
  };
}

// ── coverage ─────────────────────────────────────────────────────────────────

export function buildCoverage(audit) {
  const { pageRows, planned, recon, docs } = audit;
  const statuses = documentStatuses(audit);
  const readingPages = pageRows.filter((r) => r.pageKind === 'reading');
  const planRows = planned.identities;
  const identityStatus = (row) => {
    const own = row.docIds.map((id) => statuses.get(id)?.status).filter(Boolean);
    if (!own.length) {
      if (row.absent?.weekdayByDesign && !row.absent.missing) return 'weekday-by-design';
      if (row.absent?.referenceOnly && !row.absent.missing) return 'reference-only';
      return 'no-document';
    }
    if (own.includes('mismatch')) return 'mismatch';
    if (own.every((s) => s === 'reference-only')) return 'reference-only';
    if (own.includes('no-source-page')) return 'no-source-page';
    if (own.includes('verified-layout-note')) return 'verified-layout-note';
    return 'verified';
  };
  const rowsWithStatus = planRows.map((row) => ({ ...row, verification: identityStatus(row) }));
  const byStatus = count(rowsWithStatus, 'verification');
  const bySeason = {};
  planned.counts.byPeriod && Object.assign(bySeason, planned.counts.byPeriod);
  const perDioceseIdentity = Object.fromEntries(planned.dioceses.map((d) => {
    const rows = rowsWithStatus.filter((row) => row.dioceses.includes(d));
    return [d, { identities: rows.length, ...count(rows, 'verification'), dateOptions: planned.counts.byDiocese[d] }];
  }));
  const perKind = {};
  rowsWithStatus.forEach((row) => row.officeKinds.forEach((kind) => { perKind[kind] ||= {}; perKind[kind][row.verification] = (perKind[kind][row.verification] || 0) + 1; }));
  const perCategory = {};
  for (const row of pageRows) {
    const bucket = (perCategory[row.category] ||= { pages: 0, readingPages: 0, withDocument: 0, verified: 0, mismatch: 0, layoutNoteOnly: 0 });
    bucket.pages += 1;
    if (row.pageKind === 'reading') {
      bucket.readingPages += 1;
      if (row.docs.length) {
        bucket.withDocument += 1;
        const st = row.docs.map((id) => statuses.get(id)?.status);
        if (st.includes('mismatch')) bucket.mismatch += 1; else if (st.includes('verified-layout-note')) bucket.layoutNoteOnly += 1; else bucket.verified += 1;
      }
    }
  }
  const perSeason = {};
  for (const row of readingPages) {
    const season = row.identity.key?.split(':')[1] || row.identity.kind || 'other';
    const bucket = (perSeason[season] ||= { readingPages: 0, withDocument: 0, mismatch: 0 });
    bucket.readingPages += 1;
    if (row.docs.length) { bucket.withDocument += 1; if (row.docs.some((id) => statuses.get(id)?.status === 'mismatch')) bucket.mismatch += 1; }
  }
  const setsTotal = docs.reduce((n, d) => n + massReadingSetsOf(d).length, 0);
  const referenceOnlySets = docs.reduce((n, d) => n + massReadingSetsOf(d).filter((s) => s.referenceOnly).length, 0);
  const sections = recon.sectionStats;
  const sectionTotals = Object.values(sections).reduce((acc, s) => ({ checked: acc.checked + s.checked, exact: acc.exact + s.exact, citations: acc.citations + s.citations, citationsExact: acc.citationsExact + s.citationsExact }), { checked: 0, exact: 0, citations: 0, citationsExact: 0 });
  const unreachedDocs = docs.filter((d) => !audit.plannedDocIds.has(d.id) && !d._massReadingsRef?.doc).map((d) => d.id);
  const complete = !rowsWithStatus.some((row) => ['mismatch', 'no-document', 'no-source-page'].includes(row.verification))
    && !pageRows.some((r) => r.pageKind === 'reading' && !r.docs.length && !r.duplicateOf?.length && !r.sameIdentityAs?.length);
  return {
    schema: 1, generatedAt: audit.generatedAt, complete,
    completenessStatement: complete
      ? 'Every reachable page, planned legal option and mandatory section was positively checked.'
      : 'NOT complete: see `notChecked` and the discrepancies; coverage is stated as numerators over denominators, never as 100%.',
    inputs: { snapshot: planned.snapshot, crawledAt: audit.crawl.crawledAt, plannedYears: planned.years, dioceses: planned.dioceses },
    sources: {
      articles: pageRows.length, listed: pageRows.filter((r) => r.listed).length, unlisted: pageRows.filter((r) => !r.listed).length,
      fetched200: pageRows.filter((r) => r.status === 200).length, unavailable: pageRows.filter((r) => r.status !== 200).length,
      readingPages: readingPages.length, nonReadingPages: pageRows.length - readingPages.length,
      parsedWithoutValidationErrors: readingPages.filter((r) => !r.parse.validation.length).length,
      losslessParse: readingPages.filter((r) => r.parse.fidelity && !r.parse.fidelity.droppedWords && !r.parse.fidelity.extraWords).length,
      readingPagesWithDocument: readingPages.filter((r) => r.docs.length).length,
      readingPagesWithoutDocument: readingPages.filter((r) => !r.docs.length).map((r) => ({ id: r.id, title: r.title, category: r.category, listed: r.listed, duplicateOf: r.duplicateOf || null, sameIdentityAs: r.sameIdentityAs || null })),
      readingPagesReachedByPlan: readingPages.filter((r) => r.docs.some((id) => audit.plannedDocIds.has(id))).length,
      byCategory: perCategory, bySeason: perSeason,
    },
    documents: {
      total: docs.length, canonicalWithSets: docs.filter((d) => massReadingSetsOf(d).length).length, projections: docs.filter((d) => d._massReadingsRef?.doc).length,
      legacy: recon.stats.legacy, linkedBySourceUrl: docs.filter((d) => d._sourceUrl || massReadingSetsOf(d).some((s) => s.source?.url)).length,
      sourcePageInferredFromIdentity: audit.inferred.size, noSourcePage: [...statuses].filter(([, v]) => v.status === 'no-source-page').map(([id]) => id),
      byStatus: count([...statuses.values()], 'status'), notReachedByAnyPlannedOption: unreachedDocs,
      sets: setsTotal, referenceOnlySets,
    },
    sections: { byKind: sections, totals: { ...sectionTotals, textSectionsWithDifferences: sectionTotals.checked - sectionTotals.exact, citationMismatches: sectionTotals.citations - sectionTotals.citationsExact } },
    planned: {
      years: planned.years, dateDioceseCombinations: planned.counts.dioceseDates, civilDates: planned.counts.dates,
      legalMassOptions: planned.counts.options, normalizedIdentities: planRows.length,
      byDiocese: planned.counts.byDiocese, byYear: planned.counts.byYear, byPeriod: planned.counts.byPeriod, byOfficeKind: planned.counts.byKind,
      byCycle: planned.counts.byCycle, lookupStatus: planned.counts.byStatus,
      screensResolved: planned.counts.screens, screensWithCycleChoice: planned.counts.cycleScreens, screensWithSeveralSets: planned.counts.multiSetScreens,
    },
    plannedVerification: { identities: planRows.length, ...byStatus, byDiocese: perDioceseIdentity, byOfficeKind: perKind },
    policyScenarios: { total: planned.scenarios.length, ok: planned.scenarios.filter((s) => s.ok).length, failed: planned.scenarios.filter((s) => !s.ok).map((s) => `${s.scenario} ${s.date} ${s.diocese}`) },
    notChecked: [
      { what: 'Hours (Liturgy of the Hours) texts', why: 'out of scope of the Mass-reading audit; covered by `npm run liturgy:audit`' },
      { what: 'Browser-side consumed version', why: 'cannot be observed headlessly; see publication-drift.json (browser.status)' },
      { what: 'Reference-only celebrations', why: 'no Lectionary page exists (cathedral dedications, Lahishyn, Trakai, five saints with calendar citations only): citations are held back, never filled' },
    ],
  };
}

// ── discrepancies ────────────────────────────────────────────────────────────

export function buildDiscrepancies(audit, extraItems = []) {
  const items = [...audit.items, ...extraItems].map((item, index) => ({ ...item, id: `D${String(index + 1).padStart(4, '0')}` }));
  const resolution = count(items, (i) => i.resolution.status);
  return {
    schema: 1, generatedAt: audit.generatedAt, classes: CLASSES,
    summary: {
      total: items.length, byClass: Object.fromEntries(CLASSES.map((c) => [c, items.filter((i) => i.class === c).length])),
      bySeverity: count(items, 'severity'), byResolution: resolution, byScope: count(items, 'scope'),
      documentsAffected: new Set(items.filter((i) => i.docId).map((i) => i.docId)).size,
      byArtifact: count(items.filter((i) => i.evidence?.artifact), (i) => i.evidence.artifact),
    },
    items,
  };
}

// ── Flutter export contract ──────────────────────────────────────────────────

const sectionHash = (section) => short(section);

function describeSections(sections) {
  return sections.map((section, index) => ({
    i: index, kind: section.kind, role: section.role || null, ...(section.cycle ? { cycle: section.cycle } : {}), ...(section.year ? { year: section.year } : {}), hash: sectionHash(section),
  }));
}

function legacyOrderedSections(doc) {
  const out = [];
  const add = (kind, role) => { if (doc[role]) out.push({ kind, role, ...doc[role] }); };
  add('reading', 'reading1'); add('psalm', 'psalm');
  ['reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle'].forEach((role) => add('reading', role));
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => add('psalm', `psalm${n}`));
  if (doc.sequence?.text) add('sequence', 'sequence');
  add('acclamation', 'alleluia'); add('gospel', 'gospel');
  return out;
}

export function buildFlutterContract(audit, { drift }) {
  const { docs, planned, plannedByDoc } = audit;
  const statuses = documentStatuses(audit);
  const documents = docs.slice().sort((a, b) => a.id.localeCompare(b.id)).map((doc) => {
    const sets = massReadingSetsOf(doc);
    const stored = storedDocument(doc.id, Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'id')));
    const pageIds = [...new Set([...(sets.map((s) => s.source?.url)), doc._sourceUrl].filter(Boolean).map((u) => /\/(\d{3,6})-/.exec(u)?.[1]).filter(Boolean))];
    if (!pageIds.length && audit.inferred.has(doc.id)) pageIds.push(audit.inferred.get(doc.id).id);
    const row = {
      id: doc.id, kind: sets.length ? 'canonical' : doc._massReadingsRef?.doc ? 'projection' : 'legacy',
      selector: docSelector(doc) || null, year: doc.year ?? null, variant: doc._variant ?? null,
      places: doc._place ? [].concat(doc._place) : null,
      hash: documentHash(stored), verification: statuses.get(doc.id).status,
      sourcePages: pageIds.map((id) => ({ id, sha256: audit.pages.get(id)?.record.sha256 || null })),
      hasFlatFields: ['reading1', 'psalm', 'reading2', 'gospel'].some((f) => doc[f]),
    };
    if (sets.length) {
      row.defaultSet = defaultSetId(sets); row.flatSet = doc.massReadings.flatSet ?? null;
      row.sets = sets.map((set) => ({
        id: set.id, label: set.label, context: set.context || null, default: Boolean(set.default), referenceOnly: Boolean(set.referenceOnly), cycles: setCycles(set),
        sourcePageId: /\/(\d{3,6})-/.exec(set.source?.url || '')?.[1] || null, hash: short(set),
        sections: describeSections(set.sections),
      }));
    } else {
      row.sections = describeSections(legacyOrderedSections(doc));
      if (doc._massReadingsRef) row.covers = doc._massReadingsRef;
    }
    return row;
  });
  const docsDigest = collectionDigest(Object.fromEntries(documents.map((d) => [d.id, d.hash])));
  const contract = {
    schema: 1, contract: 'mybrev.lectionary.flutter-export', generatedAt: audit.generatedAt,
    dataset: {
      collection: 'readings', documents: docs.length, digest: drift.production.readings.digest,
      snapshot: planned.snapshot, publishedManifest: drift.manifest.readings, flutterBundle: drift.flutterBundle?.readings || null,
      revision: `readings@${drift.production.readings.digest}`, contentSchemaVersion: CONTENT_SCHEMA_VERSION, documentSchemas: DOCUMENT_SCHEMAS,
      note: 'Flutter parity = its effective `readings` digest equals `dataset.digest` (collectionDigest over documentHash, scripts/content/lib/app-content.mjs). Per-document `hash` lets a client list exactly which documents differ.',
    },
    schemas: {
      sectionKinds: SECTION_KINDS, setContexts: SET_CONTEXTS, passionRoles: Object.keys(PASSION_ROLES), cycles: ['A', 'B', 'C'], weekdayYears: ['1', '2'],
      flatFields: ['reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle', 'psalm', 'psalm1', 'psalm2', 'psalm3', 'psalm4', 'psalm5', 'psalm6', 'psalm7', 'alleluia', 'sequence', 'gospel'],
      unknownSectionFields: 'preserve and ignore: year, form, altChorusRef, rubrics, conclusion, alternatives[].form',
    },
    idRules: {
      documentId: '`readings/<id>`: stable string, never reused; legacy projections are `<canonical>--<variant|cycle>`',
      readingKey: '<documentId>#<setId|flat>#<cycle|->',
      sectionKey: '<readingKey>/<index>:<kind>:<role>[:<cycle>]',
      selector: 'date:DD.MM | feast:<code without feast-> | period:<type>:w<week>:d<dow> (lookups of the Ordo engine, src/utils/ordo/readings.js)',
      cycleRule: 'Sunday cycle A when (liturgical-year start year mod 3) = 0, B = 1, C = 2 (Advent 2025 starts A); weekday year 1 for odd, 2 for even calendar years',
    },
    defaults: {
      rule: 'explicit set.default → evening/vigil set when a daytime set also exists → first set (src/utils/massReadingSets.js defaultSetId)',
      closedPolicy: SET_DEFAULT_POLICY,
      resolution: 'route ?option=<optionId>&set=<setId>&year=<A|B|C|1|2>; the set choice is independent of the Office option choice',
    },
    ordering: 'sections keep the source order (set.sections); psalm refrain slots: chorus, altChorus (+ altChorusRef); long/short readings: alternatives[] with form',
    documents,
    plannedSelections: planned.identities.map((row) => ({ identity: row.key, purpose: row.purpose, selector: row.selector, cycle: row.cycle || null, options: row.optionIds.slice(0, 6), officeKinds: row.officeKinds, dioceses: row.dioceses, documents: row.docIds, sets: row.sets, occurrences: row.dates, sampleDates: row.sampleDates })),
    policyScenarios: planned.scenarios.map((s) => ({ scenario: s.scenario, date: s.date, diocese: s.diocese, primary: s.primary, document: s.document, sets: s.sets.map((x) => x.id), activeSet: s.activeSet, cycle: s.cycle, sunday: s.sunday ?? undefined, ok: s.ok })),
    edgeCases: edgeCases(audit),
    hashes: { documents: docsDigest, plannedSelections: short(planned.identities.map((r) => [r.key, r.docIds, r.sets])), scenarios: short(planned.scenarios.map((s) => [s.scenario, s.date, s.diocese, s.activeSet, s.cycle])) },
  };
  contract.hashes.contract = short({ ...contract, generatedAt: undefined, hashes: undefined });
  return contract;
}

function edgeCases(audit) {
  const docs = audit.docs;
  const canonicalWithoutFlat = docs.filter((d) => massReadingSetsOf(d).length && !['reading1', 'psalm', 'reading2', 'gospel'].some((f) => d[f])).map((d) => d.id);
  const projections = docs.filter((d) => d._massReadingsRef?.doc).map((d) => ({ id: d.id, covers: d._massReadingsRef }));
  const referenceOnly = docs.filter((d) => massReadingSetsOf(d).some((s) => s.referenceOnly)).map((d) => d.id);
  const multi = docs.filter((d) => massReadingSetsOf(d).length > 1).map((d) => ({ id: d.id, sets: massReadingSetsOf(d).map((s) => s.id), default: defaultSetId(massReadingSetsOf(d)) }));
  const weekdayPairs = docs.filter((d) => /--[12]$/.test(d.id)).length;
  return [
    { id: 'canonical-without-flat-fields', description: 'Canonical documents carry only massReadings.sets; released apps skip them (hasReadingDocumentContent = false). The new client must read the sets.', documents: canonicalWithoutFlat },
    { id: 'legacy-projections', description: 'Legacy documents that are projections of a canonical set carry `_massReadingsRef`; hide them when the canonical document is also loaded (collapseCoveredDocuments).', documents: projections },
    { id: 'reference-only-sets', description: 'Sets with referenceOnly=true carry citations only; render citations and the notice, never invent text.', documents: referenceOnly },
    { id: 'multi-set-documents', description: 'Documents with several sets: choose the default set by rule/policy; persist the user choice in the route (?set=).', documents: multi },
    { id: 'weekday-year-pairs', description: `Ordinary-time weekdays are stored as <base>--1 / <base>--2 (weekday year I / II); both are read from one source page (${weekdayPairs} documents).`, count: weekdayPairs },
    { id: 'sunday-24-december', description: 'On a Sunday 24.12 the engine offers the Sunday of Advent AND the Christmas Vigil Mass (lookup {_date:24.12,_variant:christmas-vigil}); the vigil group is the default (evening).', dates: ['2028-12-24', '2034-12-24'] },
    { id: 'sundays-in-date-keyed-windows', description: 'Sundays of Advent 17–24.12 and II Sunday after Christmas use the period documents (advent-w4-d1--A/B/C, christmas-w2-d1), not the date documents of that day (engine change of this audit).', periodDocuments: ['advent-w3-d1--*', 'advent-w4-d1--*', 'christmas-w2-d1'] },
    { id: 'all-souls-on-sunday', description: 'When 02.11 is a Sunday (2025, 2031) Hours = Sunday, Mass = All Souls with three sets; default first.', document: '02-11-all-faithful-departed' },
    { id: 'pentecost-saturday-with-feast', description: 'Pentecost Saturday that coincides with a feast (31.05.2031 Visitation) offers no Pentecost Vigil Mass option (open decision).', dates: ['2031-05-31'] },
    { id: 'budslav-other-dioceses', description: 'The readings document 02-07-our-lady-budslav-minsk is restricted to minsk-mohilev; Vitebsk/Pinsk/Grodno show the celebration without readings (open decision).', dates: ['02.07'] },
    { id: 'alt-chorus-misuse-in-legacy-documents', description: 'Until the resync migration is applied, many legacy psalms store the LAST strophe in altChorus and truncate the strophes; compare per-section hashes with the contract, not slots.', count: audit.items.filter((i) => i.evidence?.artifact === 'last strophe stored as the alternative refrain').length },
  ];
}
export { short, count, sortObject, CLASSES };
