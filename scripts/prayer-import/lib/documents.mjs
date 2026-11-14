// Firestore documents produced by an approved plan. Replacement keeps everything the old document
// carried (id, createdAt, verified, priestOnly, other-language versions, unknown fields).
export function replacementDocument(old, payload) {
  const { _collection, id: _id, ...rest } = old;
  const merged = { ...rest, ...payload.data, priestOnly: old.priestOnly === true };
  if (old.textVersions || old.titleVersions) {
    merged.textVersions = { ...old.textVersions, be: payload.data.text };
    merged.titleVersions = { ...old.titleVersions, be: payload.data.title };
  }
  if (old.effectivePriestOnly !== undefined) merged.effectivePriestOnly = old.effectivePriestOnly;
  return merged;
}
export const newDocument = (payload) => ({ ...payload.data, priestOnly: false });
export function draftDocument(payload, { rightsStatus, createdBy, rightsBasis = '', rightsConfirmedBy = '' }) {
  const confirmed = rightsStatus === 'confirmed' ? { rightsBasis, rightsConfirmedBy } : {};
  return { ...payload.data, rightsStatus, ...confirmed, version: 1, createdBy, status: payload.data.status || 'needs_review' };
}
