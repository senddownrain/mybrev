/**
 * Admin writes of year overrides (`liturgicalYearOverrides`): manual
 * decisions and the materialized (auto) transfers, which the admin can
 * confirm or correct. Public runtime only reads them (`ordoCalendarService.js`).
 */
import {
  collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { normalizeYearOverride, validateYearOverride } from '@/utils/ordo/yearOverrides';
import { CALENDAR_COLLECTIONS, fetchYearOverridesFresh } from '@/services/ordoCalendarService';

const STORED_FIELDS = ['year', 'scope', 'dioceseId', 'targetCelebrationId', 'action',
  'originalDate', 'computedDate', 'effectiveDate', 'from', 'to', 'rank', 'color', 'celebration', 'rule',
  'reason', 'sourceNote', 'source', 'status', 'transferRule', 'transferCase', 'rankEvidence', 'generator', 'enabled'];

/**
 * Document body of a draft: canonical fields only, no empty values. `from` /
 * `to` are written as mirrors of `originalDate` / `effectiveDate` for app
 * builds that predate the canonical schema.
 */
export function yearOverrideDocument(draft) {
  const canonical = normalizeYearOverride(draft);
  const data = {};
  STORED_FIELDS.forEach((field) => {
    const value = canonical[field];
    if (value === undefined || value === null || value === '') return;
    data[field] = field === 'year' ? Number(value) : value;
  });
  if (data.scope !== 'diocese') delete data.dioceseId;
  data.enabled = draft.enabled !== false;
  return data;
}

export async function saveYearOverride(draft) {
  const data = yearOverrideDocument(draft);
  const errors = validateYearOverride(data);
  if (!String(data.reason || '').trim()) errors.push('reason is required');
  if (errors.length) throw new Error(errors.join('; '));
  const overrides = collection(db, CALENDAR_COLLECTIONS.yearOverrides);
  if (draft.id) {
    // `setDoc` replaces the document, so removed optional fields disappear.
    await setDoc(doc(overrides, draft.id), { ...data, createdAt: draft.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await setDoc(doc(overrides), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return fetchYearOverridesFresh();
}

export async function setYearOverrideEnabled(id, enabled) {
  await updateDoc(doc(db, CALENDAR_COLLECTIONS.yearOverrides, id), { enabled: Boolean(enabled), updatedAt: serverTimestamp() });
  return fetchYearOverridesFresh();
}

export async function deleteYearOverride(id) {
  await deleteDoc(doc(db, CALENDAR_COLLECTIONS.yearOverrides, id));
  return fetchYearOverridesFresh();
}
