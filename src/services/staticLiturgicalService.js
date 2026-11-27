import { collection, doc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { afterContentPaint } from '@/utils/afterContentPaint';

const CHECK_INTERVAL = 60 * 60 * 1000;
const FULL_READ_INTERVAL = 24 * CHECK_INTERVAL;
const STATIC_COLLECTIONS = ['liturgicalTemplates', 'invitatoriums', 'completoriums'];
const digestsKey = publicContentKey('published-static-digests');

async function readPublishedDigests(deadline) {
  const entry = await publicContentCache.read(digestsKey, async () => {
    const session = createReadSession(deadline);
    const snapshot = await getDocOfflineAware(doc(db, 'contentManifest', 'current'), session);
    const published = snapshot.data()?.collections;
    const data = Object.fromEntries(STATIC_COLLECTIONS.map((name) => [name, published?.[name]?.digest || '']));
    return { data, complete: session.complete };
  }, { maxAge: CHECK_INTERVAL });
  return entry.complete ? entry.data : {};
}

function readStaticResource(key, collectionName, read, options) {
  const loader = async (previous, revision) => {
    const unchangedRevision = previous?.revision === revision;
    // A fresh install can start its data read without waiting for metadata.
    const deadline = options.session?.deadline;
    const digests = readPublishedDigests(deadline).catch(() => ({}));
    if (unchangedRevision && previous?.complete && !options.revalidate && !options.requireFresh
      && Date.now() - previous.sourceFetchedAt < FULL_READ_INTERVAL) {
      const digest = (await digests)[collectionName];
      // Older projects may have no manifest. Give them a bounded refresh
      // interval as well, and retry on the next check if a known digest is unavailable.
      if (!digest || digest === previous.sourceDigest) return previous;
    }
    const session = createReadSession(deadline);
    const data = await read(session);
    return {
      data,
      complete: session.complete,
      sourceDigest: publicContentCache.peekFresh(digestsKey, CHECK_INTERVAL)?.[collectionName] || '',
      sourceFetchedAt: Date.now(),
    };
  };
  return publicContentCache.read(key, loader, {
    ...options, maxAge: CHECK_INTERVAL,
  });
}

const publicDocument = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const readCollection = (collectionName, session) => getDocsOfflineAware(collection(db, collectionName), session)
  .then((snapshot) => snapshot.docs.map(publicDocument));
const loadStaticCollection = (name, options) => readStaticResource(
  publicContentKey('static', name), name, (session) => readCollection(name, session), options,
);

/** Cache only a confirmed complete public collection, never a partial SDK query. */
export async function getStaticCollection(collectionName, options = {}) {
  if (!['invitatoriums', 'completoriums'].includes(collectionName)) {
    throw new Error('Unsupported public static collection');
  }
  if (options.bypassCache) {
    const session = createReadSession();
    const items = await readCollection(collectionName, session);
    if (options.requireFresh && !session.complete) throw new Error('Не атрымалася абнавіць агульныя тэксты.');
    return items;
  }
  const entry = await loadStaticCollection(collectionName, {
    ...options, revalidateInBackground: options.requireFresh ? undefined : afterContentPaint,
  });
  if (options.requireFresh && !entry.complete) throw new Error('Не атрымалася абнавіць агульныя тэксты.');
  return entry.data;
}

/**
 * Reusable Office sources (`liturgicalTemplates`): the Commons and the
 * Sunday, week I psalter. Returned by id for Office assembly.
 */
export async function getLiturgicalTemplates(options = {}) {
  const entry = await loadStaticCollection('liturgicalTemplates', options);
  if (!entry.complete && options.session) options.session.complete = false;
  if (!entry.complete && options.requireFresh) throw new Error('Не атрымалася абнавіць агульныя тэксты.');
  return new Map(entry.data.map((item) => [item.id, item]));
}

export async function getLiturgicalTemplate(id, session) {
  const entry = await readStaticResource(publicContentKey('static-template', id), 'liturgicalTemplates', async (readSession) => {
    const snapshot = await getDocOfflineAware(doc(db, 'liturgicalTemplates', id), readSession);
    return snapshot.exists() ? publicDocument(snapshot) : null;
  }, { session });
  if (session && !entry.complete) session.complete = false;
  return entry.data;
}

export const getInvitatoriums = (options) => getStaticCollection('invitatoriums', options);
export const getCompletoriums = (options) => getStaticCollection('completoriums', options);

export async function getCompletoriumById(id, options) {
  const items = await getCompletoriums(options);
  return items.find((item) => item.id === id) || null;
}
