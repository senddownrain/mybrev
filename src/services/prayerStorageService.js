import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { collection as liteCollection, doc as liteDoc, getDoc as getLiteDoc, getDocs as getLiteDocs } from 'firebase/firestore/lite';
import { getPriestEditorDb, getPriestEditorWriteDb } from '@/plugins/priestFirebase';
import { PRAYER_STORAGE } from '@/utils/prayerStoragePlan.mjs';
import { createPrayerContentWriter } from '@/utils/prayerContentWriter.mjs';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { quotaSafeTransaction } from '@/utils/retry';
import { noteFirestoreError, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

import { normalizePrayerSource, normalizePrayerSourceFields } from '@/utils/prayerSource.mjs';
import { prayerAccessPolicy } from '@/utils/priestPolicy.mjs';
import { assertPrayerSaveConfirmed } from '@/utils/prayerSaveVerification.mjs';
import { createAccessSetsV2Gateway } from './accessSetsV2Gateway.mjs';

const collectionNames = Object.entries(PRAYER_STORAGE).flat();
const protectedCollections = new Set(Object.values(PRAYER_STORAGE));
const rows = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
const firestoreFns = { doc, collection, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp };

// S3 injects the approved authenticated transport when its editor is linked.
// Calls pass plain request data. Firestore mutations stay inside the Callable.
export function createCanonicalPrayerSaveApi(invoke) {
  return {
    preview: (edits) => invoke({ action: 'preview', edits }),
    save: (edits, preview) => invoke({ action: 'save', edits,
      expectedVersion: preview.version, planDigest: preview.planDigest }),
    verify: (preview) => invoke({ action: 'verify', expectedVersion: preview.version + Number(Boolean(preview.writes)),
      afterDigest: preview.afterDigest }),
    previewDraft: (draft) => invoke({ action: 'preview', draft }),
    saveDraft: (draft, preview) => invoke({ action: 'save', draft, expectedVersion: preview.version, planDigest: preview.planDigest }),
    verifyDraft: (draft, preview) => invoke({ action: 'verify', draft: { id: draft.id, expectedVersion: draft.expectedVersion },
      expectedVersion: preview.version + 1, afterDigest: preview.afterDigest, planDigest: preview.planDigest }),
  };
}

export async function getCatalogEditorMode() {
  const db = await getPriestEditorWriteDb();
  return withFirestoreQuota(() => createAccessSetsV2Gateway(db).readMode()).catch((error) => {
    if (error?.code === 'permission-denied') return 'legacy'; // Rules still gate the legacy writer.
    throw error;
  });
}

export async function usesCanonicalCatalogWriter() {
  const mode = await getCatalogEditorMode();
  if (mode === 'suspended') throw new Error('Рэдагаванне каталога часова спынена.');
  return mode === 'canonical';
}

export async function commitCanonicalCatalog({ edits, draft }) {
  const { connectCanonicalPrayerSaveApi } = await import('./canonicalPrayerCallable');
  const api = connectCanonicalPrayerSaveApi(import.meta.env.VITE_CANONICAL_CATALOG_REGION || 'europe-west1');
  const preview = await withFirestoreQuota(() => draft ? api.previewDraft(draft) : api.preview(edits));
  if (!globalThis.confirm('Пацвердзіць змены каталога? Запісаў: ' + (preview.writes + preview.extraWrites))) {
    throw new Error('Захаванне скасавана.');
  }
  let receipt;
  try {
    receipt = await withFirestoreQuota(() => draft ? api.saveDraft(draft, preview) : api.save(edits, preview));
  } catch (error) {
    if (!['functions/unavailable', 'functions/deadline-exceeded', 'functions/unknown', 'functions/internal'].includes(error?.code)) throw error;
    try {
      receipt = await (draft ? api.verifyDraft(draft, preview) : api.verify(preview));
    } catch {
      throw new Error('Вынік захавання не пацверджаны. Абнавіце запіс перад паўторнай спробай.');
    }
  }
  requestContentRefresh();
  return receipt;
}

export async function readCanonicalEditorContent() {
  const db = await getPriestEditorWriteDb();
  const read = async (name) => rows(await withFirestoreQuota(() => getLiteDocs(liteCollection(db, name))));
  const [publicPrayers, privatePrayers, publicCategories, privateCategories] = await Promise.all([
    read('prayers'), read('protectedPrayers'), read('prayerCategories'), read('protectedCategories'),
  ]);
  return { prayers: [...publicPrayers, ...privatePrayers], categories: [...publicCategories, ...privateCategories] };
}

export async function readStoredPrayerForEditor(id) {
  const db = await getPriestEditorWriteDb();
  if (await getCatalogEditorMode() === 'canonical') {
    const protectedRow = await withFirestoreQuota(() => createAccessSetsV2Gateway(db).readContent('prayers', id));
    if (protectedRow) return protectedRow;
    const publicRow = await withFirestoreQuota(() => getLiteDoc(liteDoc(db, 'prayers', id)));
    return publicRow.exists() ? { ...publicRow.data(), id } : null;
  }
  const snapshot = await withFirestoreQuota(() => getLiteDoc(liteDoc(db, PRAYER_STORAGE.prayers, id)));
  return snapshot.exists() ? { ...snapshot.data(), id, effectivePriestOnly: true } : null;
}
export async function getPrayerContentWriter() {
  const db = await getPriestEditorDb();
  return createPrayerContentWriter({ db, fs: firestoreFns, withQuota: withFirestoreQuota, transact: (dbRef, update) => quotaSafeTransaction(runTransaction, dbRef, update) });
}
export async function mutatePrayerContent(edit, hooks) {
  const result = await (await getPrayerContentWriter()).mutate(edit, hooks);
  requestContentRefresh();
  return result;
}
export async function saveStoredPrayer(id, data, create = false) {
  const db = await getPriestEditorDb();
  const key = id || doc(collection(db, 'prayers')).id;
  if (await usesCanonicalCatalogWriter()) {
    const { priestOnly, accessSets, ...patch } = normalizePrayerSourceFields(data, { editor: true });
    if (typeof patch.source === 'string') patch.sourceManual = normalizePrayerSource(patch.source) !== patch.source;
    if (accessSets !== undefined || (create && priestOnly)) patch.accessSets = accessSets ?? ['priest'];
    await commitCanonicalCatalog({ edits: [{ kind: 'prayers', id: key, action: create ? 'create' : 'update', patch }] });
    const prayer = await readStoredPrayerForEditor(key);
    if (!prayer) throw new Error('Захаванне пацверджана, але паўторнае чытанне недаступнае.');
    return { id: key, prayer };
  }
  if (data.accessSets !== undefined) throw new Error('Кананічны каталог недаступны. Абнавіце форму.');
  let targetCollection = 'prayers';
  let expected;
  await mutatePrayerContent((content) => {
    const old = content.prayers.find((item) => item.id === key);
    if (!create && !old) throw new Error('Малітва не знойдзена.');
    const { id: _id, ...payload } = normalizePrayerSourceFields({ ...old, ...data }, { existing: old, editor: true });
    // Keep manual wording for sources outside the confirmed edition list.
    const sourceManual = typeof payload.source === 'string' && normalizePrayerSource(payload.source) !== payload.source;
    expected = { ...old, ...payload, id: key, sourceManual,
      priestOnly: payload.priestOnly === undefined ? old?.priestOnly === true : payload.priestOnly === true,
      ...(create ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() };
    content.prayers = content.prayers.filter((item) => item.id !== key);
    content.prayers.push(expected);
    targetCollection = prayerAccessPolicy(content.prayers, content.categories).prayerRestricted(expected)
      ? PRAYER_STORAGE.prayers : 'prayers';
  });
  // One targeted server read: never present a local/optimistic value as a
  // confirmed save. The same target is used for public and priest-only prayers.
  let snapshot;
  try {
    snapshot = await withFirestoreQuota(() => getDocFromServer(doc(db, targetCollection, key)));
  } catch (error) {
    throw new Error('Захаванне адпраўлена, але праверыць вынік на серверы не атрымалася. Абнавіце малітву перад паўторнай спробай.', { cause: error });
  }
  const prayer = snapshot.exists() ? { ...snapshot.data(), id: key } : null;
  assertPrayerSaveConfirmed(prayer, expected);
  return { id: key, prayer };
}
export async function removeStoredPrayer(id) {
  if (await usesCanonicalCatalogWriter()) {
    await commitCanonicalCatalog({ edits: [{ kind: 'prayers', id, action: 'delete' }] });
    return;
  }
  await mutatePrayerContent((content) => {
    content.prayers = content.prayers.filter((item) => item.id !== id);
    content.categories = content.categories.map((c) => (c.prayerIds || []).includes(id)
      ? { ...c, prayerIds: c.prayerIds.filter((value) => value !== id), updatedAt: serverTimestamp() } : c);
  });
}

// One shared subscription for both admin stores. Protected documents never
// enter the primary persistent Firestore cache.
const observers = new Set();
let stop, pending, lastContent;
export function subscribeAdminPrayerContent(callback, onError) {
  const observer = { callback, onError };
  observers.add(observer);
  if (lastContent && stop) callback(lastContent);
  if (!pending && !stop) {
    pending = Promise.all([getPriestEditorDb(), getCatalogEditorMode()]).then(([db, mode]) => {
      if (!observers.size) return;
      const activeCollections = mode === 'canonical'
        ? ['prayers', 'prayerCategories', 'protectedPrayers', 'protectedCategories'] : collectionNames;
      const contentPaths = mode === 'canonical'
        ? { prayers: 'protectedPrayers', prayerCategories: 'protectedCategories' } : PRAYER_STORAGE;
      let active = true;
      let failed = false;
      const latest = new Map();
      const unsubscribers = activeCollections.map((name) => onSnapshot(collection(db, name), { includeMetadataChanges: true }, (snapshot) => {
        if (!active || failed || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        const items = rows(snapshot);
        latest.set(name, protectedCollections.has(name)
          ? items.map((row) => ({ ...row, effectivePriestOnly: true })) : items);
        if (latest.size === activeCollections.length) {
          // Atomic transfers can arrive through separate listeners in either
          // order. Admin-only presentation deduplicates with private priority.
          const content = { prayers: [], categories: [] };
          for (const [publicName, privateName] of Object.entries(contentPaths)) {
            const items = new Map([...latest.get(publicName), ...latest.get(privateName)].map((item) => [item.id, item]));
            content[publicName === 'prayers' ? 'prayers' : 'categories'] = [...items.values()];
          }
          lastContent = content;
          for (const item of observers) item.callback(content);
        }
      }, (error) => {
        if (!active || failed) return;
        failed = true;
        latest.clear();
        lastContent = null;
        noteFirestoreError(error);
        for (const item of observers) item.onError?.(error);
      }));
      stop = () => {
        active = false;
        latest.clear();
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        stop = null;
        lastContent = null;
      };
    }).catch((error) => { for (const item of observers) item.onError?.(error); }).finally(() => { pending = null; });
  }
  return () => { observers.delete(observer); if (!observers.size) stop?.(); };
}
