/**
 * Re-import of legacy `readings` documents from their canonical Catholic.by
 * page: the flat fields (reading1, psalm, reading2, alleluia, gospel,
 * sequence) are replaced by the parsed page; every other field of the
 * document (selectors, `_dayId`, title, year, …) is kept. Pure: the CLI
 * (`resync-readings.mjs`) owns the dry-run report and the guarded apply.
 */
import { documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { projectSetToLegacy } from '../../../src/utils/massReadingSets.js';
import { validateParsedPage } from '../../liturgy/lib/lectionary-parser.mjs';
import { parseFidelity } from './fidelity.mjs';
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
    if (doc.massReadings || doc._massReadingsRef) { skip('canonical or projected document: handled by migrate-readings-sets.mjs'); continue; }
    const page = doc._sourceUrl ? [...pages.values()].find((candidate) => doc._sourceUrl && candidate.record.url === doc._sourceUrl) || null : inferred.get(doc.id) || null;
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
    const { id, ...afterData } = after;
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
