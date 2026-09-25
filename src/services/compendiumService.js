import { collection, doc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { compendiumFromDocuments } from '@/utils/compendiumData';
import { createCompendiumLoader } from '@/utils/compendiumLoader';
import {
  COMPENDIUM_CACHE_VERSION,
  COMPENDIUM_COLLECTION,
  COMPENDIUM_META_COLLECTION,
  COMPENDIUM_META_DOCUMENT,
} from '@/constants/compendium';

// The canonical dataset (~350 kB JSON) and aliases are lazy chunks: they are
// precached by the PWA service worker but never part of the start-up bundle.
export const loadBundledCompendium = () => import('@/data/compendium/compendium.json').then((module) => module.default);
export const loadCompendiumAliases = () => import('@/data/compendium/compendium_search_aliases.json').then((module) => module.default);

const cacheKey = publicContentKey('compendium', COMPENDIUM_CACHE_VERSION);

export const loadCompendium = createCompendiumLoader({
  loadBundled: loadBundledCompendium,
  readCached: (loader, options) => publicContentCache.read(cacheKey, loader, options),
  async readRemoteMeta() {
    const session = createReadSession();
    const snapshot = await getDocOfflineAware(doc(db, COMPENDIUM_META_COLLECTION, COMPENDIUM_META_DOCUMENT), session);
    return { data: snapshot.exists() ? snapshot.data() : null, complete: session.complete };
  },
  async readRemoteDataset(meta) {
    // ~30 chapter documents in one query, never one read per question.
    const session = createReadSession();
    const snapshot = await getDocsOfflineAware(collection(db, COMPENDIUM_COLLECTION), session);
    const units = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
    return { data: compendiumFromDocuments(meta, units), complete: session.complete };
  },
  warn: (message, error) => console.warn('[Compendium]', message, error?.message || ''),
});
