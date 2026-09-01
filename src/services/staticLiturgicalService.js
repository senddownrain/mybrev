import { collection } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';

/** Cache only a confirmed complete public collection, never a partial SDK query. */
export async function getStaticCollection(collectionName, options = {}) {
  if (!['invitatoriums', 'completoriums'].includes(collectionName)) {
    throw new Error('Unsupported public static collection');
  }
  const loader = async () => {
    const session = createReadSession();
    const snapshot = await getDocsOfflineAware(collection(db, collectionName), session);
    return { data: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), complete: session.complete };
  };
  const entry = options.bypassCache
    ? await loader()
    : await publicContentCache.read(publicContentKey('static', collectionName), loader, options);
  if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася абнавіць агульныя тэксты.');
  return entry.data;
}

export const getInvitatoriums = (options) => getStaticCollection('invitatoriums', options);
export const getCompletoriums = (options) => getStaticCollection('completoriums', options);

export async function getCompletoriumById(id, options) {
  const items = await getCompletoriums(options);
  return items.find((item) => item.id === id) || null;
}

export async function warmupStaticLiturgicalCollections() {
  return Promise.allSettled([getInvitatoriums(), getCompletoriums()]);
}
