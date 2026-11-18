/** Applies only the prepared offline baseline supplement to a Flutter build input.
 * Deliberately NOT imported by the Firestore writer or the Web reader. */
import { isDeepStrictEqual } from 'node:util';
import { describeDocuments } from '../../content/lib/app-content.mjs';
import { valueSha256 } from './coordinated-release.mjs';
const requireThat = (yes, message) => { if (!yes) throw Error(message); };
const state = (doc, field) => ({ present: Object.hasOwn(doc, field), value: doc[field] ?? null });
export function applyFlutterBaselineReconciliation(collections, patch) {
  requireThat(patch.schema === 1 && patch.scope === 'flutter-bundle-baseline-only' && patch.firestoreWrites === 0, 'Not a Flutter-only baseline supplement');
  const result = new Map([...collections].map(([name, docs]) => [name, structuredClone(docs)]));
  for (const name of Object.keys(patch.before)) {
    requireThat(result.has(name), 'Missing candidate collection ' + name);
    const actual = describeDocuments(result.get(name));
    requireThat(isDeepStrictEqual(actual, patch.before[name]) || isDeepStrictEqual(actual, patch.after[name]), 'Wrong candidate baseline ' + name);
  }
  for (const entry of patch.changes) {
    const [collection, id] = entry.document.split('/'), doc = result.get(collection)?.find(item => item.id === id);
    requireThat(doc && entry.path.length === 1 && entry.path[0] === entry.field && /^[_A-Za-z][_A-Za-z0-9]*$/u.test(entry.field)
      && !['__proto__', 'prototype', 'constructor'].includes(entry.field), 'Unsafe supplement path');
    requireThat(valueSha256({ present: true, value: entry.value }) === entry.afterSha256, 'Invalid supplement value proof');
    const hash = valueSha256(state(doc, entry.field));
    requireThat(hash === entry.beforeSha256 || hash === entry.afterSha256, 'Unknown candidate field ' + entry.document + '|' + entry.field);
    doc[entry.field] = entry.value;
  }
  for (const [name, expected] of Object.entries(patch.after)) requireThat(isDeepStrictEqual(describeDocuments(result.get(name)), expected), 'Reconciled candidate mismatch ' + name);
  return result;
}
