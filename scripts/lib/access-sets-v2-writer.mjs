import { FieldValue } from 'firebase-admin/firestore';
import { catalogError } from '../../src/utils/accessSetsV2Policy.mjs';
import { CONTENT_CONTROL, MAX_ATOMIC_CONTENT_WRITES } from '../../src/utils/prayerStoragePlan.mjs';
import {
  assertCatalogParity, catalogDigest, CATALOG_KINDS, CATALOG_PATHS, CATALOG_ROLLOUT,
  planCanonicalCatalog, planCatalogRestore, summarizeCatalogPlan,
} from './access-sets-v2-storage-plan.mjs';

import { digestCatalogValue } from './access-sets-v2-content-values.mjs';
import { draftAuditPath, prepareDraftPublication, validatePublication, writeDraftPublication } from './access-sets-v2-draft-publication.mjs';

const MAX_CATALOG_SCAN_READS = 2500;
const fail = (code) => { throw catalogError(code); };

export function canManageCanonicalCatalog(admin) {
  const role = admin && (Object.hasOwn(admin, 'role') ? admin.role : 'admin');
  return role === 'superadmin' || (role === 'admin' && admin.accessSetsV2 === true);
}

// Admin Firestore instance, owned by a trusted operator/service. No default
// app initialization or endpoint registration happens when importing S4.
export function createCanonicalCatalogWriter(db) {
  async function readSnapshot(transaction, uid) {
    const [role, rollout, control] = await transaction.getAll(
      db.collection('admins').doc(uid), db.doc(CATALOG_ROLLOUT), db.doc(CONTENT_CONTROL),
    );
    if (!canManageCanonicalCatalog(role.data())) fail('permission-denied');
    if (rollout.data()?.mode !== 'canonical' || control.data()?.lockUid !== '') fail('canonical-writer-locked');
    const storedVersion = control.data()?.version;
    const version = typeof storedVersion === 'bigint' ? Number(storedVersion) : storedVersion;
    if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) fail('invalid-content-version');

    const registry = await transaction.get(db.collection('accessSetsV2').limit(MAX_CATALOG_SCAN_READS + 1));
    let reads = Math.max(1, registry.size);
    const sets = new Map(registry.docs.map((doc) => [doc.id, doc.data()]));
    const paths = [
      ...Object.values(CATALOG_PATHS).flat(),
      ...registry.docs.flatMap((doc) => CATALOG_KINDS.map((kind) => `${doc.ref.path}/${kind}`)),
    ];
    const documents = new Map();
    for (const path of paths) {
      if (reads >= MAX_CATALOG_SCAN_READS) fail('catalog-scan-limit');
      const page = await transaction.get(db.collection(path).limit(MAX_CATALOG_SCAN_READS - reads + 1));
      reads += Math.max(1, page.size);
      if (reads > MAX_CATALOG_SCAN_READS) fail('catalog-scan-limit');
      for (const doc of page.docs) documents.set(doc.ref.path, doc.data());
    }
    return { version, sets, documents };
  }

  function apply(transaction, plan, advance = Boolean(plan.operations.length)) {
    for (const operation of plan.operations) {
      const ref = db.doc(operation.path);
      if (operation.after === null) transaction.delete(ref);
      else transaction.set(ref, operation.after);
    }
    if (advance) {
      transaction.update(db.doc(CONTENT_CONTROL), { version: plan.version + 1, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  async function save(uid, request) {
    if (typeof uid !== 'string' || !uid.length || uid.includes('/')) fail('unauthenticated');
    const { action, edits, draft, expectedVersion, planDigest, afterDigest } = request ?? {};
    if (!['preview', 'save', 'verify'].includes(action)) fail('invalid-writer-action');
    if (draft !== undefined) {
      validatePublication(draft);
      if (edits !== undefined) fail('invalid-draft-publication');
    }
    if (action !== 'preview' && (!Number.isSafeInteger(expectedVersion)
      || !/^[a-f0-9]{64}$/.test(action === 'save' ? planDigest : afterDigest))) {
      fail('missing-content-precondition');
    }
    return db.runTransaction(async (transaction) => {
      const snapshot = await readSnapshot(transaction, uid);
      if (action !== 'preview' && snapshot.version !== expectedVersion) fail('content-snapshot-drift');
      if (action === 'verify') {
        if (catalogDigest(snapshot.documents) !== afterDigest) fail('content-snapshot-drift');
        assertCatalogParity(snapshot);
        if (draft) {
          const [published, audit] = await transaction.getAll(
            db.collection('prayerDrafts').doc(draft.id), db.doc(draftAuditPath(draft.id, draft.expectedVersion + 1)),
          );
          const receipt = audit.data();
          const state = published.data();
          if (!receipt || !/^[a-f0-9]{64}$/.test(planDigest) || receipt.planDigest !== planDigest
            || state?.status !== 'published' || Number(state.version) !== draft.expectedVersion + 1
            || state.targetPrayerId !== receipt.targetPrayerId) fail('draft-conflict');
          return { version: snapshot.version, parity: 'verified', id: receipt.targetPrayerId };
        }
        return { version: snapshot.version, parity: 'verified' };
      }
      const publication = draft && await prepareDraftPublication(db, transaction, snapshot, draft);
      const plan = planCanonicalCatalog(snapshot, publication ? [publication.edit] : edits, draft?.id);
      const advance = Boolean(publication || plan.operations.length);
      const extraWrites = publication ? 4 : advance ? 2 : 0; // control, catalog audit, draft, draft audit
      if (plan.operations.length + extraWrites > MAX_ATOMIC_CONTENT_WRITES) fail('content-transaction-too-large');
      const digest = publication ? digestCatalogValue({
        catalog: plan.planDigest, draftId: draft.id, version: publication.version, patch: publication.saved,
      }) : plan.planDigest;
      const summary = summarizeCatalogPlan(plan);
      if (action === 'save') {
        if (digest !== planDigest) fail('content-snapshot-drift');
        apply(transaction, plan, advance);
        if (publication) writeDraftPublication(db, transaction, publication, uid, digest);
        if (advance) transaction.create(db.doc(CATALOG_ROLLOUT + '/catalogAudit/' + (plan.version + 1)), {
          action: publication ? 'publish-draft' : 'edit-catalog', uid, at: FieldValue.serverTimestamp(),
          version: plan.version + 1, planDigest: digest, writes: summary.writes,
        });
      }
      return { ...summary, planDigest: digest, ...(publication && { id: publication.id }),
        extraWrites, committedVersion: action === 'save' ? plan.version + Number(advance) : null };
    }, { maxAttempts: 2 });
  }

  return {
    // Handler contract: Firebase callable request shape after Auth validation.
    // Bind only to a trusted transport that supplies verified request.auth.
    call: ({ auth, data }) => save(auth?.uid, data),
    async restore(uid, retainedPlan) {
      if (typeof uid !== 'string' || !uid.length || uid.includes('/')) fail('unauthenticated');
      return db.runTransaction(async (transaction) => {
        const plan = planCatalogRestore(await readSnapshot(transaction, uid), retainedPlan);
        apply(transaction, plan);
        return summarizeCatalogPlan(plan);
      }, { maxAttempts: 2 });
    },
  };
}

export function createCanonicalCatalogHandler({ db, HttpsError, authorize }) {
  const writer = createCanonicalCatalogWriter(db);
  return async (request) => {
    try {
      await authorize(request);
      return await writer.call(request);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const code = error?.code;
      if (code === 'permission-denied' || code === 'unauthenticated') throw new HttpsError(code, code);
      if (code === 'content-snapshot-drift' || code === 'draft-conflict') throw new HttpsError('aborted', code);
      if (code === 8 || code === 'resource-exhausted') throw new HttpsError('resource-exhausted', 'quota-exhausted');
      if (typeof code === 'string' && /^[a-z-]+$/.test(code) && error.message === code) {
        throw new HttpsError('failed-precondition', code);
      }
      throw new HttpsError('internal', 'catalog-writer-failed');
    }
  };
}
