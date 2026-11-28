/** Pure planning for a reviewed field patch: exact before/after per field, nothing else. */
import { createHash } from 'node:crypto';

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
/** `undefined`/`null` both mean "the field is absent". */
export const valueHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value ?? null))).digest('hex');
export const documentPath = (change) => `${change.collection}/${change.document}`;

/**
 * `documents`: Map path → data (or undefined when the document does not exist).
 * Any conflict blocks the whole patch; a field already equal to `after` is a no-op.
 */
export function planFieldPatch(patch, documents) {
  const updates = new Map();
  const conflicts = [];
  let noop = 0;
  for (const change of patch.changes) {
    const path = documentPath(change);
    const data = documents.get(path);
    if (valueHash(change.before) !== change.beforeSha256 || valueHash(change.after) !== change.afterSha256) {
      conflicts.push({ path, field: change.field, reason: 'patch file does not match its own hashes' });
    } else if (!data) {
      conflicts.push({ path, field: change.field, reason: 'document is missing; this patch never creates documents' });
    } else if (valueHash(data[change.field]) === change.afterSha256) {
      noop += 1;
    } else if (valueHash(data[change.field]) !== change.beforeSha256) {
      conflicts.push({ path, field: change.field, reason: 'live value differs from the reviewed before state' });
    } else {
      if (!updates.has(path)) updates.set(path, new Map());
      // `after: null` removes a field the patch had added (rollback).
      updates.get(path).set(change.field, change.after);
    }
  }
  const fields = [...updates.values()].reduce((sum, map) => sum + map.size, 0);
  return { updates, conflicts, summary: { documents: updates.size, fields, noop, create: 0, delete: 0 } };
}

/** Apply a conflict-free plan to plain data (local snapshots and tests). */
export function applyPlan(plan, documents) {
  if (plan.conflicts.length) throw new Error('Conflicts: nothing applied');
  for (const [path, fields] of plan.updates) {
    const data = { ...documents.get(path) };
    for (const [field, value] of fields) {
      if (value === null) delete data[field]; else data[field] = value;
    }
    documents.set(path, data);
  }
  return documents;
}
