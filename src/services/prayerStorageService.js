import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getPriestEditorDb } from '@/plugins/priestFirebase';
import { canonicalPrayerContent, comparablePrayerValue, CONTENT_CONTROL, MAX_ATOMIC_CONTENT_WRITES, PRAYER_STORAGE, prayerStoragePlan } from '@/utils/prayerStoragePlan.mjs';
import { requestContentRefresh } from '@/utils/publicContentCache';
import { quotaSafeTransaction } from '@/utils/retry';
import { noteFirestoreError, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

const collectionNames = Object.entries(PRAYER_STORAGE).flat();
const rows = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
const controlVersion = (snapshot) => snapshot.data()?.version || 0;
async function readState(db) {
  // All supported writers serialize through one version. Web transactions do
  // not support collection queries, so validate the complete read with it.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await withFirestoreQuota(() => getDocFromServer(doc(db, CONTENT_CONTROL)));
    if (before.data()?.lockUid) throw new Error('Міграцыя змесціва працягваецца. Рэдагаванне часова недаступнае.');
    const collections = new Map(await Promise.all(collectionNames.map(async (name) => [name, rows(await withFirestoreQuota(() => getDocsFromServer(collection(db, name))))])));
    const after = await withFirestoreQuota(() => getDocFromServer(doc(db, CONTENT_CONTROL)));
    if (controlVersion(before) === controlVersion(after) && !after.data()?.lockUid) return { collections, version: controlVersion(after) };
  }
  throw new Error('Змесціва змянілася ў іншай сесіі. Паспрабуйце яшчэ раз.');
}
export async function mutatePrayerContent(edit) {
  const db = await getPriestEditorDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { collections, version } = await readState(db);
    const content = canonicalPrayerContent(collections);
    const result = edit(content);
    const plan = prayerStoragePlan(collections, content);
    if (plan.operations.length > MAX_ATOMIC_CONTENT_WRITES
      || new globalThis.TextEncoder().encode(JSON.stringify(comparablePrayerValue(plan.operations))).length > 7000000) {
      throw new Error('Змена занадта вялікая для бяспечнай атамарнай аперацыі. Патрэбна правераная міграцыя з рэзервовай копіяй.');
    }
    if (!plan.operations.length) return result;
    try {
      await quotaSafeTransaction(runTransaction, db, async (transaction) => {
        const control = doc(db, CONTENT_CONTROL);
        const current = await transaction.get(control);
        if (controlVersion(current) !== version || current.data()?.lockUid) throw new Error('CONTENT_CONFLICT');
        for (const operation of plan.operations) {
          const reference = doc(db, operation.collection, operation.id);
          if (operation.type === 'delete') transaction.delete(reference);
          else transaction.set(reference, operation.data);
        }
        transaction.set(control, { version: version + 1, lockUid: '', updatedAt: serverTimestamp() });
      });
      requestContentRefresh();
      return result;
    } catch (error) { if (error.message !== 'CONTENT_CONFLICT') throw error; }
  }
  throw new Error('Змесціва змянілася ў іншай сесіі. Паспрабуйце яшчэ раз.');
}
export async function saveStoredPrayer(id, data, create = false) {
  const db = await getPriestEditorDb();
  const key = id || doc(collection(db, 'prayers')).id;
  await mutatePrayerContent((content) => {
    const old = content.prayers.find((item) => item.id === key);
    if (!create && !old) throw new Error('Малітва не знойдзена.');
    const { id: _id, ...payload } = data;
    content.prayers = content.prayers.filter((item) => item.id !== key);
    content.prayers.push({ ...old, ...payload, id: key, priestOnly: payload.priestOnly === undefined ? old?.priestOnly === true : payload.priestOnly === true,
      ...(create ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() });
  });
  return { id: key };
}
export async function removeStoredPrayer(id) {
  await mutatePrayerContent((content) => { content.prayers = content.prayers.filter((item) => item.id !== id); });
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
