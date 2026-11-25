import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { PRAYER_STORAGE } from '@/utils/prayerStoragePlan.mjs';
import { createPrayerContentWriter } from '@/utils/prayerContentWriter.mjs';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { quotaSafeTransaction } from '@/utils/retry';
import { noteFirestoreError, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

import { normalizePrayerSource, normalizePrayerSourceFields } from '@/utils/prayerSource.mjs';
import { prayerAccessPolicy } from '@/utils/priestPolicy.mjs';
import { assertPrayerSaveConfirmed } from '@/utils/prayerSaveVerification.mjs';

const collectionNames = Object.entries(PRAYER_STORAGE).flat();
const rows = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
const firestoreFns = { doc, collection, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp };

// S3 injects the approved authenticated transport when its editor is linked.
// Both calls pass plain edit data, never an arbitrary mutator or SDK write.
export function createCanonicalPrayerSaveApi(invoke) {
  return {
    preview: (edits) => invoke({ action: 'preview', edits }),
    save: (edits, preview) => invoke({ action: 'save', edits,
      expectedVersion: preview.version, planDigest: preview.planDigest }),
    verify: (preview) => invoke({ action: 'verify', expectedVersion: preview.version + Number(Boolean(preview.writes)),
      afterDigest: preview.afterDigest }),
  };
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
    pending = getPriestEditorDb().then((db) => {
      if (!observers.size) return;
      const latest = new Map();
      const unsubscribers = collectionNames.map((name) => onSnapshot(collection(db, name), (snapshot) => {
        latest.set(name, rows(snapshot));
        if (latest.size === collectionNames.length) {
          // Atomic transfers can arrive through separate listeners in either
          // order. Admin-only presentation deduplicates with private priority.
          const content = { prayers: [], categories: [] };
          for (const [publicName, privateName] of Object.entries(PRAYER_STORAGE)) {
            const items = new Map([...latest.get(publicName), ...latest.get(privateName)].map((item) => [item.id, item]));
            content[publicName === 'prayers' ? 'prayers' : 'categories'] = [...items.values()];
          }
          lastContent = content;
          for (const item of observers) item.callback(content);
        }
      }, (error) => { noteFirestoreError(error); for (const item of observers) item.onError?.(error); }));
      stop = () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); stop = null; lastContent = null; };
    }).catch((error) => { for (const item of observers) item.onError?.(error); }).finally(() => { pending = null; });
  }
  return () => { observers.delete(observer); if (!observers.size) stop?.(); };
}
