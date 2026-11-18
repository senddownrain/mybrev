import { publicContentCache, publicContentKey } from '@/utils/publicContentCache';
import { checkPriestAccess, priestAccess } from './priestAccessService';
import { permittedPrayerContent, prayerAccessPolicy } from '@/utils/priestPolicy.mjs';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { PUBLIC_PRAYERS_ASSET, validatePublicPrayerCatalog } from '@/utils/publicPrayerCatalog.mjs';
import { db } from '@/plugins/firebase';
import { priestFirebase } from '@/plugins/priestFirebase';
import { assertFirestoreQuotaAvailable, isFirestoreQuotaBlocked, isFirestoreQuotaError, noteFirestoreError } from '@/utils/firestoreErrors.mjs';

export const PRAYER_PUBLIC_CACHE_KEY = publicContentKey('prayer-content', 3);
const documents = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
async function readCollections(database, prayers, categories) {
  assertFirestoreQuotaAvailable();
  try {
    const result = await Promise.all([prayers, categories].map((name) => getDocsFromServer(collection(database, name))));
    return { prayers: documents(result[0]), categories: documents(result[1]) };
  } catch (error) { noteFirestoreError(error); throw error; }
}
let inFlight;
// Public disk cache and protected in-memory results never share a storage key.
export async function getPrayerContent() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Upgrade fallback preserves previously saved public offline prayers.
    // Both legacy collections are needed to evaluate category inheritance.
    if (navigator.onLine === false) await publicContentCache.prime([PRAYER_PUBLIC_CACHE_KEY]);
    if (navigator.onLine === false && !publicContentCache.peek(PRAYER_PUBLIC_CACHE_KEY)) {
      const oldPrayers = publicContentKey('prayers');
      const oldCategories = publicContentKey('prayerCategories');
      const oldCombined = publicContentKey('prayer-content', 2);
      await publicContentCache.prime([oldCombined, oldPrayers, oldCategories]);
      const prayers = publicContentCache.peek(oldCombined)?.prayers || publicContentCache.peek(oldPrayers);
      const categories = publicContentCache.peek(oldCombined)?.categories || publicContentCache.peek(oldCategories);
      if (Array.isArray(prayers) && Array.isArray(categories)) {
        return permittedPrayerContent(prayers.filter((p) => p.effectivePriestOnly !== true),
          categories.map((c) => ({ ...c, priestOnly: c.priestOnly === true || c.effectivePriestOnly === true })));
      }
    }
    const entry = await publicContentCache.read(PRAYER_PUBLIC_CACHE_KEY, async () => ({
      data: await readPublic(), complete: true,
    }), { fresh: true });
    const publicData = permittedPrayerContent(entry.data.prayers, entry.data.categories);
    if (navigator.onLine === false || isFirestoreQuotaBlocked()) return publicData;
    try { await checkPriestAccess(); } catch { return publicData; }
    if (!priestAccess.active) return publicData;
    const revision = priestAccess.revision;
    try {
      const protectedContent = await readCollections(priestFirebase.db, 'priestProtectedPrayers', 'priestProtectedCategories');
      const allowed = permittedPrayerContent(
        [...new Map([...entry.data.prayers, ...protectedContent.prayers].map((item) => [item.id, item])).values()],
        [...new Map([...entry.data.categories, ...protectedContent.categories].map((item) => [item.id, item])).values()], true);
      if (revision !== priestAccess.revision || !priestAccess.active) return publicData;
      return allowed;
    } catch (error) {
      if (!isFirestoreQuotaError(error)) await checkPriestAccess().catch(() => {});
      return publicData;
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}
async function readPublic() {
  // Development keeps using the old Firestore path without an export snapshot.
  // Production is STRICTLY Hosting-only. A missing/invalid asset must not
  // generate hundreds of live Firestore reads per visitor at launch.
  if (import.meta.env.DEV) {
    const content = await readCollections(db, 'prayers', 'prayerCategories');
    const policy = prayerAccessPolicy(content.prayers, content.categories);
    return { prayers: content.prayers.filter((item) => item.effectivePriestOnly !== true && !policy.prayerRestricted(item)),
      categories: content.categories.filter((item) => item.effectivePriestOnly !== true && !policy.categoryRestricted(item.id)) };
  }
  const response = await fetch(PUBLIC_PRAYERS_ASSET, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Не атрымалася загрузіць публічны каталог малітваў.');
  return validatePublicPrayerCatalog(await response.json());
}
