/**
 * Admin reads and writes of novena definitions. Reading costs the two small
 * novena collections only; prayer texts come from the public catalog, and
 * publication re-reads just the referenced prayers from the server.
 */
import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { useAuthStore } from '@/stores/auth';
import { getPublicPrayerContent } from '@/services/prayerContentService';
import { NOVENA_COLLECTION, NOVENA_DRAFTS_COLLECTION, pickDefinition, publicationErrors } from '@/utils/novena/document.mjs';
import { publicationDocument, stableJson } from '@/utils/novena/drafts.mjs';

const byId = (snapshot) => new Map(snapshot.docs.map((item) => [item.id, item.data()]));
const draftRef = (id) => doc(db, NOVENA_DRAFTS_COLLECTION, id);
const publishedRef = (id) => doc(db, NOVENA_COLLECTION, id);
const CHANGED = 'Запіс зменены ў іншым месцы. Абнавіце старонку.';

/** Public prayers by id: the Hosting catalog, no Firestore reads in production. */
export async function loadNovenaPrayers() {
  const content = await getPublicPrayerContent();
  return new Map(content.prayers.map((item) => [item.id, item]));
}

export async function loadNovenaData() {
  const [prayers, drafts, published] = await Promise.all([
    loadNovenaPrayers(),
    getDocsFromServer(collection(db, NOVENA_DRAFTS_COLLECTION)),
    getDocsFromServer(collection(db, NOVENA_COLLECTION)),
  ]);
  return {
    prayers,
    drafts: byId(drafts),
    published: byId(published),
  };
}

function draftDocument(draft) {
  return {
    ...pickDefinition(draft),
    status: 'draft',
    blockers: draft.blockers || [],
    ...(draft.importHash ? { importHash: draft.importHash } : {}),
    ...(draft.everPublished ? { everPublished: true } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: useAuthStore().user.uid,
  };
}

const comparable = (record) => stableJson({ ...pickDefinition(record), blockers: record.blockers || [] });
const unchanged = (stored, loaded) => (stored ? Boolean(loaded) && comparable(stored) === comparable(loaded) : !loaded);

/** `loaded` is the stored draft the editor started from (null: none yet). */
export async function saveNovenaDraft(draft, loaded) {
  await runTransaction(db, async (transaction) => {
    const stored = await transaction.get(draftRef(draft.novenaId));
    if (!unchanged(stored.data(), loaded)) throw new Error(CHANGED);
    transaction.set(draftRef(draft.novenaId), draftDocument(draft));
  });
}

const referencedIds = (draft) => [...new Set([draft.sourcePrayerId,
  ...[...draft.template, ...draft.days.flatMap((day) => day.blocks)].map((block) => block.prayerId).filter(Boolean)])];

/** Current server versions of the referenced public prayers only. */
async function livePrayers(draft, cache = new Map()) {
  const read = (id) => {
    if (!cache.has(id)) {
      const request = getDocFromServer(doc(db, 'prayers', id));
      request.catch(() => cache.delete(id));
      cache.set(id, request);
    }
    return cache.get(id);
  };
  const snapshots = await Promise.all(referencedIds(draft).map(read));
  return new Map(snapshots.filter((item) => item.exists()).map((item) => [item.id, { ...item.data(), id: item.id }]));
}

/** `cache` shares the prayer reads of one batch. */
export async function publishNovena(draft, loaded, { cache } = {}) {
  if (draft.blockers?.length) throw new Error('Ёсць неразвязаныя заўвагі генератара.');
  const prayers = await livePrayers(draft, cache);
  const errors = publicationErrors(pickDefinition(draft), prayers);
  if (errors.length) throw new Error(`Праверка не пройдзена: ${errors.join(', ')}`);
  const id = draft.novenaId;
  await runTransaction(db, async (transaction) => {
    const [stored, current] = [await transaction.get(draftRef(id)), await transaction.get(publishedRef(id))];
    if (!unchanged(stored.data(), loaded)) throw new Error(CHANGED);
    const previous = current.data() || null;
    const next = publicationDocument(draft, previous);
    if (!previous || stableJson(previous) !== stableJson(next)) transaction.set(publishedRef(id), next);
    transaction.set(draftRef(id), draftDocument({ ...draft, contentVersion: next.contentVersion, everPublished: true }));
  });
}

export async function unpublishNovena(id) {
  await runTransaction(db, async (transaction) => {
    transaction.delete(publishedRef(id));
  });
}

export async function fetchStoredNovena(id) {
  const [draft, published] = await Promise.all([getDocFromServer(draftRef(id)), getDocFromServer(publishedRef(id))]);
  return { draft: draft.data() || null, published: published.data() || null };
}
