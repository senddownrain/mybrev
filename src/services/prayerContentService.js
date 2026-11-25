import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { permittedPrayerContent } from '@/utils/priestPolicy.mjs';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { PUBLIC_PRAYERS_ASSET, publicPrayerRows, validatePublicPrayerCatalog } from '@/utils/publicPrayerCatalog.mjs';
import { assembleCanonicalCatalog, validCatalogId } from '@/utils/accessSetsV2Policy.mjs';
import { db } from '@/plugins/firebase';
import { withFirestoreQuota } from '@/utils/firestoreErrors.mjs';
import { canReadPrayerCatalog, prayerCatalogAccess } from './prayerCatalogAccess';

let editorGeneration;
let editorReads = new Map();
let editorEpoch = 0;

function readEditorPrayer(id, editorUid, generation, epoch) {
  if (editorGeneration?.uid !== editorUid || editorGeneration?.generation !== generation) {
    editorGeneration = { uid: editorUid, generation };
    editorReads = new Map();
  }
  if (!editorReads.has(id)) editorReads.set(id, import('./prayerStorageService').then(({ readStoredPrayerForEditor }) => {
    if (epoch !== editorEpoch || generation !== prayerCatalogAccess.generation || !canReadPrayerCatalog()) return null;
    return readStoredPrayerForEditor(id);
  }));
  return editorReads.get(id);
}

export function clearEditorPrayerReads() {
  editorEpoch++;
  editorGeneration = undefined;
  editorReads.clear();
}

export const PRAYER_PUBLIC_CACHE_KEY = publicContentKey('prayer-content', 3);
const documents = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
let publicRequest;

export function getPublicPrayerContent() {
  publicRequest ??= loadPublic().finally(() => { publicRequest = null; });
  return publicRequest;
}

async function loadPublic() {
  if (navigator.onLine === false) {
    await publicContentCache.prime([PRAYER_PUBLIC_CACHE_KEY]);
    // Upgrade fallback for previously cached public prayers.
    if (!publicContentCache.peek(PRAYER_PUBLIC_CACHE_KEY)) {
      const oldPrayers = publicContentKey('prayers');
      const oldCategories = publicContentKey('prayerCategories');
      const oldCombined = publicContentKey('prayer-content', 2);
      await publicContentCache.prime([oldCombined, oldPrayers, oldCategories]);
      const prayers = publicContentCache.peek(oldCombined)?.prayers || publicContentCache.peek(oldPrayers);
      const categories = publicContentCache.peek(oldCombined)?.categories || publicContentCache.peek(oldCategories);
      if (Array.isArray(prayers) && Array.isArray(categories)) {
        const safe = publicPrayerRows({ prayers, categories });
        return safe;
      }
    }
  }
  const entry = await publicContentCache.read(PRAYER_PUBLIC_CACHE_KEY, async () => ({
    data: await readPublic(), complete: true,
  }), { fresh: true });
  return publicPrayerRows(entry.data);
}

const withProtected = (publicRows, protectedRows) => [...new Map(
  [...publicRows, ...protectedRows].map((row) => [row.id, row]),
).values()];

export async function getPrayerContent(publicData) {
  if (!Array.isArray(publicData?.prayers) || !Array.isArray(publicData?.categories)) publicData = await getPublicPrayerContent();
  const generation = prayerCatalogAccess.generation;
  const privateData = await prayerCatalogAccess.catalog();
  if (!privateData || generation !== prayerCatalogAccess.generation) return publicData;
  if (privateData.mode === 'canonical') return assembleCanonicalCatalog(publicData, privateData.content);
  const legacy = privateData.content;
  // A row physically present in the legacy mirror remains private even if
  // its payload predates the compatibility flags.
  return permittedPrayerContent(withProtected(publicData.prayers, legacy.prayers.map((row) => ({ ...row, priestOnly: true }))),
    withProtected(publicData.categories, legacy.categories.map((row) => ({ ...row, priestOnly: true }))), true);
}

export async function getPrayerForDeepLink(id, editorUid) {
  if (!validCatalogId(id)) return null;
  const generation = prayerCatalogAccess.generation;
  const epoch = editorEpoch;
  const publicData = await getPublicPrayerContent();
  const existing = publicData.prayers.find((row) => row.id === id);
  if (existing) return existing;
  if (!editorUid) return prayerCatalogAccess.readPrayer(id, publicData);
  if (epoch !== editorEpoch || generation !== prayerCatalogAccess.generation || !canReadPrayerCatalog()) return null;
  const row = await readEditorPrayer(id, editorUid, generation, epoch);
  return epoch === editorEpoch && generation === prayerCatalogAccess.generation && canReadPrayerCatalog() ? row : null;
}

async function readPublic() {
  if (import.meta.env.DEV) {
    const [prayers, categories] = await withFirestoreQuota(() => Promise.all(['prayers', 'prayerCategories']
      .map((name) => getDocsFromServer(collection(db, name)))));
    return publicPrayerRows({ prayers: documents(prayers), categories: documents(categories) });
  }
  // The public Hosting asset remains independent of device Auth and V2 reads.
  const response = await fetch(PUBLIC_PRAYERS_ASSET, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Не атрымалася загрузіць публічны каталог малітваў.');
  return validatePublicPrayerCatalog(await response.json());
}
