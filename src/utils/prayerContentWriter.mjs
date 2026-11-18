// Version-locked transactional writer for prayer content, independent of the Firebase
// wiring so the same code runs in the app and against the Firestore emulator in tests.
import { canonicalPrayerContent, comparablePrayerValue, CONTENT_CONTROL, MAX_ATOMIC_CONTENT_WRITES, PRAYER_STORAGE, prayerStoragePlan } from './prayerStoragePlan.mjs';

import { normalizePrayerSourceFields } from './prayerSource.mjs';

const collectionNames = Object.entries(PRAYER_STORAGE).flat();
const rows = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
const controlVersion = (snapshot) => snapshot.data()?.version || 0;
const passthrough = (read) => read();

/**
 * @param {object} deps { db, fs: {doc, collection, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp},
 *   withQuota?: (read) => Promise, runTransaction?: (runTransaction, db, update) => Promise }
 */
export function createPrayerContentWriter({ db, fs, withQuota = passthrough, transact }) {
  const { doc, collection, getDocFromServer, getDocsFromServer, serverTimestamp } = fs;
  const runTx = transact || ((dbRef, update) => fs.runTransaction(dbRef, update));
  async function readState() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await withQuota(() => getDocFromServer(doc(db, CONTENT_CONTROL)));
      if (before.data()?.lockUid) throw new Error('Міграцыя змесціва працягваецца. Рэдагаванне часова недаступнае.');
      const collections = new Map(await Promise.all(collectionNames.map(async (name) => [name, rows(await withQuota(() => getDocsFromServer(collection(db, name))))])));
      const after = await withQuota(() => getDocFromServer(doc(db, CONTENT_CONTROL)));
      if (controlVersion(before) === controlVersion(after) && !after.data()?.lockUid) return { collections, version: controlVersion(after) };
    }
    throw new Error('Змесціва змянілася ў іншай сесіі. Паспрабуйце яшчэ раз.');
  }
  /**
   * `hooks.read(transaction)` runs after the control read, before any write (extra reads; may throw to abort);
   * `hooks.write(transaction)` adds writes to the same transaction (draft status, audit).
   */
  async function mutate(edit, hooks = {}) {
    let denied;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { collections, version } = await readState();
      const content = canonicalPrayerContent(collections);
      const existingPrayers = new Map(content.prayers.map((item) => [item.id,
        Object.fromEntries(['source', 'sourceBook'].filter((field) => Object.hasOwn(item, field))
          .map((field) => [field, structuredClone(item[field])])),
      ]));
      const result = edit(content);
      const plan = prayerStoragePlan(collections, content);
      if (plan.operations.length > MAX_ATOMIC_CONTENT_WRITES
        || new globalThis.TextEncoder().encode(JSON.stringify(comparablePrayerValue(plan.operations))).length > 7000000) {
        throw new Error('Змена занадта вялікая для бяспечнай атамарнай аперацыі. Патрэбна правераная міграцыя з рэзервовай копіяй.');
      }
      if (!plan.operations.length && !hooks.write) return result;
      try {
        await runTx(db, async (transaction) => {
          const control = doc(db, CONTENT_CONTROL);
          const current = await transaction.get(control);
          if (controlVersion(current) !== version || current.data()?.lockUid) throw new Error('CONTENT_CONFLICT');
          await hooks.read?.(transaction);
          for (const operation of plan.operations) {
            const reference = doc(db, operation.collection, operation.id);
            if (operation.type === 'delete') transaction.delete(reference);
            else transaction.set(reference, ['prayers', 'priestProtectedPrayers'].includes(operation.collection)
              ? normalizePrayerSourceFields(operation.data, { existing: existingPrayers.get(operation.id), editor: true }) : operation.data);
          }
          hooks.write?.(transaction);
          transaction.set(control, { version: version + 1, lockUid: '', updatedAt: serverTimestamp() });
        });
        return result;
      } catch (error) {
        // A concurrent commit changes the version the rules compare against, so the loser of a race is
        // reported as permission-denied. Re-read and retry; a genuine denial survives all attempts.
        if (error.code === 'permission-denied') denied = error;
        else if (error.message !== 'CONTENT_CONFLICT') throw error;
      }
    }
    if (denied) throw denied;
    throw new Error('Змесціва змянілася ў іншай сесіі. Паспрабуйце яшчэ раз.');
  }
  return { mutate, readState };
}
