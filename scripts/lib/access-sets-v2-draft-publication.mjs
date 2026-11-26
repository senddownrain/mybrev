import { FieldValue } from 'firebase-admin/firestore';
import {
  buildPrayerFromDraft, findDuplicateCandidates, publishBlockers, targetPrayerIdFor,
} from '../../src/utils/prayerDraftModel.mjs';
import { normalizePrayerSourceFields } from '../../src/utils/prayerSource.mjs';
import { catalogError, validAccessSetList, validCatalogId } from '../../src/utils/accessSetsV2Policy.mjs';
import { assertCatalogParity } from './access-sets-v2-storage-plan.mjs';

const fail = (code) => { throw catalogError(code); };
const fields = new Set(['title', 'text', 'tags', 'source', 'priestOnly']);

export function validatePublication(input) {
  if (!input || !validCatalogId(input.id) || !Number.isSafeInteger(input.expectedVersion)
    || input.expectedVersion < 1 || input.expectedVersion >= Number.MAX_SAFE_INTEGER
    || (input.replaceId !== undefined && !validCatalogId(input.replaceId))
    || (input.accessSets !== undefined && !validAccessSetList(input.accessSets))
    || (input.acknowledgeDuplicates !== undefined && typeof input.acknowledgeDuplicates !== 'boolean')) {
    fail('invalid-draft-publication');
  }
}

export function draftAuditPath(id, version) {
  return 'prayerDrafts/' + id + '/audit/publish-v2-' + version;
}

export async function prepareDraftPublication(db, tx, snapshot, input) {
  validatePublication(input);
  const ref = db.collection('prayerDrafts').doc(input.id);
  const current = (await tx.get(ref)).data();
  if (!current) fail('draft-not-found');
  if (Number(current.version) !== input.expectedVersion || current.status !== 'draft') fail('draft-conflict');
  const patch = input.patch ?? {};
  if (Object.getPrototypeOf(patch) !== Object.prototype
    || Object.keys(patch).some((key) => !fields.has(key))
    || ['title', 'text', 'source'].some((key) => Object.hasOwn(patch, key) && typeof patch[key] !== 'string')
    || (Object.hasOwn(patch, 'priestOnly') && typeof patch.priestOnly !== 'boolean')
    || (Object.hasOwn(patch, 'tags') && (!Array.isArray(patch.tags) || patch.tags.length > 40
      || patch.tags.some((value) => typeof value !== 'string' || value.length > 120)))) {
    fail('invalid-draft-patch');
  }
  const data = normalizePrayerSourceFields({ ...current, ...patch }, { existing: current, editor: true });
  if (publishBlockers(data).length) fail('invalid-draft-publication');
  const saved = { ...patch };
  for (const field of ['source', 'sourceBook']) {
    if (Object.hasOwn(data, field)) saved[field] = data[field];
  }
  const { content } = assertCatalogParity(snapshot);
  const id = input.replaceId ?? targetPrayerIdFor({ ...current, id: input.id });
  const existing = content.prayers.find((row) => row.id === id);
  if (input.replaceId && !existing) fail('draft-replace-missing');
  if (!input.replaceId && !input.acknowledgeDuplicates
    && findDuplicateCandidates(data.title, content.prayers).some((match) => match.kind === 'exact' && match.id !== id)) {
    fail('draft-duplicate');
  }
  const { sourceDraftId: _sourceDraftId, priestOnly, ...payload } =
    buildPrayerFromDraft({ ...data, id: input.id }, { existing, editorSource: true });
  const accessSets = input.accessSets ?? existing?.accessSets ?? (priestOnly ? ['priest'] : []);
  return {
    ref, saved, version: input.expectedVersion + 1, id,
    edit: { kind: 'prayers', id, action: existing ? 'update' : 'create', patch: { ...payload, accessSets } },
  };
}

export function writeDraftPublication(db, tx, publication, uid, planDigest) {
  const { ref, id, version, saved } = publication;
  tx.update(ref, { ...saved, status: 'published', version, targetPrayerId: id, publishedBy: uid,
    publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  tx.create(db.doc(draftAuditPath(ref.id, version)), {
    action: 'publish', uid, at: FieldValue.serverTimestamp(), fromStatus: 'draft', toStatus: 'published',
    version, targetPrayerId: id, planDigest,
  });
}
