// Firestore documents produced by an approved plan. Replacement keeps everything the old document
// carried (id, createdAt, verified, priestOnly, other-language versions, unknown fields).
import { normalizePrayerSourceFields } from '../../../src/utils/prayerSource.mjs';

export function replacementDocument(old, payload) {
  const { _collection, id: _id, ...rest } = old;
  const merged = { ...rest, ...payload.data, priestOnly: old.priestOnly === true };
  if (old.textVersions || old.titleVersions) {
    merged.textVersions = { ...old.textVersions, be: payload.data.text };
    merged.titleVersions = { ...old.titleVersions, be: payload.data.title };
  }
  if (old.effectivePriestOnly !== undefined) merged.effectivePriestOnly = old.effectivePriestOnly;
  return normalizePrayerSourceFields(merged);
}
export const newDocument = (payload) => normalizePrayerSourceFields({ ...payload.data, priestOnly: false });
export function draftDocument(payload, { createdBy }) {
  // Old pre-approved plans may still contain editorial rights and review fields.
  // Never require or copy them into new draft records.
  const data = { ...payload.data };
  for (const key of ['rightsStatus', 'rightsBasis', 'rightsConfirmedBy', 'rightsConfirmedAt', 'reviewedBy', 'reviewedAt']) delete data[key];
  return normalizePrayerSourceFields({ ...data, version: 1, createdBy, status: 'draft' });
}
