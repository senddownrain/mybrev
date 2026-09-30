/**
 * Admin writes of manual year overrides (`liturgicalYearOverrides`).
 * Public runtime only reads them (`ordoCalendarService.js`).
 */
import {
  collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { validateYearOverride } from '@/utils/ordo/yearOverrides';
import { CALENDAR_COLLECTIONS, fetchYearOverridesFresh } from '@/services/ordoCalendarService';

const STORED_FIELDS = ['year', 'scope', 'dioceseId', 'targetCelebrationId', 'action', 'from', 'to', 'rank', 'color',
  'celebration', 'reason', 'source', 'enabled'];

/** Document body of a draft: known fields only, no empty values. */
export function yearOverrideDocument(draft) {
  const data = {};
  STORED_FIELDS.forEach((field) => {
    const value = draft[field];
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
