/**
 * Wave 4 of the production change set: the three documents the flat-field
 * resync cannot express, each one a bounded, source-confirmed change.
 *
 *   24-06-nativity-john-baptist   structured sets: vigil + day, DAY is the default and the flat projection
 *   06-08-transfiguration-lord    structured sets: Gospels of the years A, B and C
 *   ordinary-w28-d1--A            the Gospel citation «Мк 22, 1–10» → «Мц 22, 1–10» (the page itself
 *                                 names Matthew in the Gospel heading; Catholic.by 4873 cites «Мц 22, 1–14»
 *                                 for the same parable)
 *
 * The other 36 documents of the readings-sets migration are NOT part of the
 * wave: 28 are already identical in production and 8 differ only in paragraph
 * layout (edited in production after the migration was applied) — a manual edit
 * is never overwritten; they are reported in `deferred`.
 */
import { buildReadingsSetsMigration } from '../../liturgy/lib/readings-sets-plan.mjs';
import { documentHash, storedDocument } from '../../content/lib/app-content.mjs';
import { normalizeText } from './compare.mjs';
import { loadFixturePages } from '../../liturgy/migrate-readings-sets.mjs';
import { resyncReport } from './resync-plan.mjs';
import { CITATION_CORRECTIONS } from './source-corrections.mjs';

export { CITATION_CORRECTIONS };

export const SETS_WAVE_DOCS = Object.freeze(['24-06-nativity-john-baptist', '06-08-transfiguration-lord']);

const idOf = ({ id: _id, ...data }) => data;
const textsOf = (value) => (value && typeof value === 'object' ? Object.entries(value).flatMap(([key, item]) => (['text', 'verse', 'chorus'].includes(key) || Array.isArray(item) || (item && typeof item === 'object') ? textsOf(item) : [])) : typeof value === 'string' ? [value] : []);
/** The words of the changed fields, and the sub-keys (comment, title, …) present on one side only. */
function layoutDifference(before, after, fields) {
  const words = (doc) => normalizeText(fields.flatMap((field) => textsOf(doc[field])).join(' ')).replace(/\s+/g, ' ');
  const keysOf = (doc) => fields.flatMap((field) => (doc[field] && typeof doc[field] === 'object' && !Array.isArray(doc[field]) ? Object.keys(doc[field]).map((key) => `${field}.${key}`) : []));
  const left = new Set(keysOf(before));
  const right = new Set(keysOf(after));
  return { sameWords: words(before) === words(after), addedKeys: [...right].filter((key) => !left.has(key)), droppedKeys: [...left].filter((key) => !right.has(key)) };
}

/**
 * @param {{ docs: object[], pages: Record<string,string> }} input docs: snapshot documents (with `id`)
 */
export function buildWave4({ docs, pages }) {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const migration = buildReadingsSetsMigration({ docs: new Map(docs.map((doc) => [doc.id, idOf(doc)])), pages });
  const changes = [];
  const deferred = [];
  for (const change of migration.changes) {
    if (SETS_WAVE_DOCS.includes(change.id)) {
      if (change.action !== 'update') throw new Error(`${change.id}: the wave only updates existing documents`);
      changes.push({ id: change.id, kind: 'sets-migration', celebration: change.celebration, changedFields: change.changedFields.filter((field) => field !== 'updatedAt'), classes: ['MISSING_SET'], before: change.before, after: change.after });
    } else if (change.changedFields.length) {
      const diff = layoutDifference(change.before, change.after, change.changedFields);
      const layoutOnly = diff.sameWords && !diff.droppedKeys.length;
      deferred.push({
        id: change.id, celebration: change.celebration, changedFields: change.changedFields, layoutOnly, productionLacks: diff.addedKeys, productionOnly: diff.droppedKeys,
        reason: !diff.sameWords ? 'differs from production in words: needs a human decision'
          : `paragraph layout${diff.addedKeys.length ? ` and missing ${diff.addedKeys.join(', ')} in production` : ''} only (same words)${diff.droppedKeys.length ? `; production carries ${diff.droppedKeys.join(', ')} that the plan would drop` : ''}; production was edited after the migration — a manual edit is not overwritten`,
      });
    }
  }
  for (const id of SETS_WAVE_DOCS) if (!changes.some((change) => change.id === id)) throw new Error(`${id} is missing from the readings-sets plan`);
  for (const fix of CITATION_CORRECTIONS) {
    const doc = byId.get(fix.id);
    if (!doc) throw new Error(`${fix.id} is not in the snapshot`);
    const current = doc[fix.field]?.[fix.key];
    if (current === fix.to) continue; // already corrected
    if (current !== fix.from) throw new Error(`${fix.id}: ${fix.field}.${fix.key} is «${current}», expected «${fix.from}»`);
    const { id: _id, ...before } = doc;
    const after = { ...before, [fix.field]: { ...before[fix.field], [fix.key]: fix.to } };
    changes.push({ id: fix.id, kind: 'citation-correction', changedFields: [fix.field], classes: ['WRONG_REFERENCE'], evidence: fix.evidence, before, after });
  }
  return {
    // a document that already equals its reviewed after-state is not a change: the plan is empty after the apply
    changes: changes.map((change) => ({
      ...change, wave: 4,
      beforeHash: documentHash(storedDocument(change.id, change.before)), afterHash: documentHash(storedDocument(change.id, change.after)),
    })).filter((change) => change.beforeHash !== change.afterHash),
    deferred,
  };
}

/** Waves 1-3 (flat-field resync) + wave 4, as one reviewed report. */
export function fullPlan(audit) {
  return resyncReport(audit, buildWave4({ docs: audit.docs, pages: loadFixturePages() }));
}
