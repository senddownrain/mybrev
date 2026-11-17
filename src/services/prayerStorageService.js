import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { PRAYER_STORAGE } from '@/utils/prayerStoragePlan.mjs';
import { createPrayerContentWriter } from '@/utils/prayerContentWriter.mjs';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { quotaSafeTransaction } from '@/utils/retry';
import { noteFirestoreError, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

import { normalizePrayerSourceFields } from '@/utils/prayerSource.mjs';

const collectionNames = Object.entries(PRAYER_STORAGE).flat();
const rows = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
const firestoreFns = { doc, collection, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp };
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
  await mutatePrayerContent((content) => {
    const old = content.prayers.find((item) => item.id === key);
    if (!create && !old) throw new Error('Малітва не знойдзена.');
    const { id: _id, ...payload } = normalizePrayerSourceFields({ ...old, ...data }, { existing: old });
    content.prayers = content.prayers.filter((item) => item.id !== key);
    content.prayers.push({ ...old, ...payload, id: key, priestOnly: payload.priestOnly === undefined ? old?.priestOnly === true : payload.priestOnly === true,
      ...(create ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() });
  });
  return { id: key };
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
