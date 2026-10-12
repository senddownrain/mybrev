/**
 * Re-import of legacy `readings` documents from their canonical Catholic.by
 * page: the flat fields (reading1, psalm, reading2, alleluia, gospel,
 * sequence) are replaced by the parsed page; every other field of the
 * document (selectors, `_dayId`, title, year, …) is kept. Pure: the CLI
 * (`resync-readings.mjs`) owns the dry-run report and the guarded apply.
 */
import { classifyPatch, describeDocuments, diffCollection, documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { projectSetToLegacy } from '../../../src/utils/massReadingSets.js';
import { validateParsedPage } from '../../liturgy/lib/lectionary-parser.mjs';
import { parseFidelity } from './fidelity.mjs';
import { normalizeReadingText } from '../../../src/utils/readingTextNormalization.js';
import { expectedForLegacy, identityMismatch } from './doc-page.mjs';

const FLAT = ['reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'epistle', 'psalm', 'sequence', 'alleluia', 'gospel'];
const prune = (value) => {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '' && !(Array.isArray(item) && !item.length)).map(([key, item]) => [key, prune(item)]));
  }
  return value;
};

/** Flat fields of a document from the page sections that apply to it. */
export function flatFieldsFromPage(doc, page) {
  const expected = expectedForLegacy(doc, page);
  if (expected.error) return { error: expected.error };
  const sections = expected.sections.filter((section) => section.kind !== 'rubric');
  const set = { id: 'import', label: 'import', sections: sections.map((section) => ({ ...section, cycle: undefined, year: undefined })) };
  const flat = prune(projectSetToLegacy(set, ''));
  // the legacy shape of the Alleluia is {bible, verse}
  if (flat.alleluia) flat.alleluia = prune({ bible: flat.alleluia.bible, verse: flat.alleluia.verse });
  // the parser's reading fields that legacy documents do not store
  for (const key of Object.keys(flat)) if (flat[key] && typeof flat[key] === 'object') { delete flat[key].conclusion; delete flat[key].rubrics; }
  // The layout rule every other writer of readings applies (admin editor, db:cleanup-reading-paragraphs):
  // a uniform run of short poetic lines is one paragraph with line breaks, not a column of paragraphs.
  const normalizeTexts = (reading) => {
    if (!reading || typeof reading.text !== 'string') return;
    reading.text = normalizeReadingText(reading.text);
    (reading.alternatives || []).forEach(normalizeTexts);
  };
  Object.entries(flat).forEach(([key, value]) => { if (/^(reading\d|epistle|gospel)$/.test(key)) normalizeTexts(value); });
  return { flat };
}

const sectionsFoundOf = (flat) => Object.keys(flat).filter((key) => key !== 'sequence');

/**
 * @param {{ docs: object[], pages: Map, findings: object[], inferred?: Map }} input
 * @returns {{ changes: object[], skipped: object[] }}
 */
export function buildResyncPlan({ docs, pages, findings, inferred = new Map() }) {
  const byDoc = new Map();
  findings.forEach((finding) => { if (!byDoc.has(finding.docId)) byDoc.set(finding.docId, []); byDoc.get(finding.docId).push(finding); });
  const changes = [];
  const skipped = [];
  for (const doc of docs) {
    const own = byDoc.get(doc.id) || [];
    const material = own.filter((item) => !(item.class === 'STRUCTURE_LOSS' && item.severity === 'low'));
    if (!material.length) continue;
    const skip = (reason) => skipped.push({ id: doc.id, reason, classes: [...new Set(material.map((item) => item.class))] });
    if (material.some((item) => item.class === 'WRONG_CYCLE' && !item.detail?.includes('backed by'))) { skip('cycle-aware canonical document needed: handled by migrate-readings-sets.mjs'); continue; }
    if (doc.massReadings || doc._massReadingsRef) { skip('canonical or projected document: handled by migrate-readings-sets.mjs'); continue; }
    const page = doc._sourceUrl ? pages.get(/\/(\d{3,6})-[^/]+(?:[?#].*)?$/.exec(doc._sourceUrl)?.[1] || '') || null : inferred.get(doc.id) || null;
    if (!page?.parsed) { skip('no source page'); continue; }
    if (page.parsed.sets.length !== 1) { skip(`source page has ${page.parsed.sets.length} reading sets`); continue; }
    if (identityMismatch(doc, page)) { skip('document identity does not match the page identity'); continue; }
    // Page defects the parser handles deterministically are not blockers: a missing liturgical title,
    // a repeated conclusion, a cycle marker that the table of contents makes unambiguous.
    const blocking = [...validateParsedPage(page.parsed).filter((error) => !/no liturgical title/.test(error)),
      ...page.parsed.warnings.filter((warning) => !/cycle marker missing|repeats the conclusion/.test(warning))];
    if (blocking.length) { skip(`the page does not pass the parser validation: ${blocking[0]}`); continue; }
    const fidelity = parseFidelity(page.html);
    if (fidelity.droppedWords || fidelity.extraWords) { skip('the parse is not lossless for this page'); continue; }
    if (material.some((item) => item.class === 'WRONG_CONTEXT' && item.field === 'section')) { skip('the document has a block that the source page does not (needs a human decision)'); continue; }
    const { flat, error } = flatFieldsFromPage(doc, page);
    if (error) { skip(error); continue; }
    const after = { ...doc };
    FLAT.forEach((field) => { if (!flat[field]) delete after[field]; });
    Object.assign(after, flat, { sectionsFound: sectionsFoundOf(flat) });
    const changedFields = FLAT.filter((field) => JSON.stringify(doc[field] ?? null) !== JSON.stringify(after[field] ?? null)).concat(
      JSON.stringify(doc.sectionsFound ?? null) !== JSON.stringify(after.sectionsFound ?? null) ? ['sectionsFound'] : []);
    if (!changedFields.length) continue;
    const { id: _afterId, ...afterData } = after;
    const { id: _id, ...beforeData } = doc;
    changes.push({
      id: doc.id, pageId: page.id, url: page.record.url, sourceSha256: page.record.sha256, inferredSource: !doc._sourceUrl,
      changedFields, classes: [...new Set(material.map((item) => item.class))], findings: material.length,
      beforeHash: documentHash(storedDocument(doc.id, beforeData)), afterHash: documentHash(storedDocument(doc.id, afterData)),
      before: beforeData, after: afterData,
    });
  }
  return { changes, skipped };
}

export const WAVE_SIZE = 150;

/** Waves ordered by severity so the worst documents go first; each wave is a SAFE CONTENT PATCH. */
export function partitionWaves(changes, size = WAVE_SIZE) {
  const weight = (change) => (change.classes.includes('WRONG_TEXT') || change.classes.includes('MISSING_BLOCK') ? 0 : change.classes.includes('WRONG_REFERENCE') ? 1 : 2);
  const ordered = [...changes].sort((a, b) => weight(a) - weight(b) || a.id.localeCompare(b.id));
  return ordered.map((change, index) => ({ ...change, wave: Math.floor(index / size) + 1 }));
}

/** Verdict of the manifest classifier for every wave, against the production documents. */
export function waveVerdicts(waves, docs) {
  const production = describeDocuments(docs.map(({ id, ...data }) => storedDocument(id, data)));
  const verdicts = [];
  for (let wave = 1; wave <= Math.max(0, ...waves.map((change) => change.wave)); wave += 1) {
    const subset = waves.filter((change) => change.wave === wave);
    const ids = new Set(subset.map((change) => change.id));
    const described = describeDocuments([
      ...docs.filter((doc) => !ids.has(doc.id)).map(({ id, ...data }) => storedDocument(id, data)),
      ...subset.map((change) => storedDocument(change.id, change.after)),
    ]);
    const diff = diffCollection('readings', described, production);
    const classification = classifyPatch([diff], { publishedSchema: 1 });
    verdicts.push({ wave, documents: subset.length, changed: diff.changed.length, bytes: diff.bytes, verdict: classification.verdict, reasons: classification.reasons });
  }
  return verdicts;
}

/** The reviewed dry-run report (hashes only; before/after bodies are rebuilt at apply time). */
export function resyncReport(audit) {
  const waves = partitionWaves(audit.resync.changes);
  return {
    waves,
    report: {
      generatedAt: audit.generatedAt, source: audit.planned.snapshot, snapshotDocuments: audit.docs.length,
      totals: { changes: waves.length, skipped: audit.resync.skipped.length }, verdicts: waveVerdicts(waves, audit.docs), projectedAfterResync: audit.projectedAfterResync,
      changes: waves.map(({ before: _before, after: _after, ...change }) => change), skipped: audit.resync.skipped,
    },
  };
}
