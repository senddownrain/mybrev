import { readonly, ref, watch } from 'vue';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { getPriestActivationDb } from '@/plugins/priestFirebase';
import { s2Session } from './s2AccessFirebase';
import { createAccessSetsCatalogSession } from './accessSetsCatalogSession.mjs';
import { isFirestoreQuotaBlocked, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

const revision = ref(0);
export const prayerCatalogRevision = readonly(revision);
const demand = ref(0);
export const prayerCatalogDemand = readonly(demand);
export function retainPrayerCatalog() {
  demand.value++;
  return () => { demand.value--; };
}
let pageActive = true;
export const canReadPrayerCatalog = () => globalThis.navigator?.onLine !== false
  && pageActive && !globalThis.document?.hidden && !isFirestoreQuotaBlocked();

const sessionProvider = {
  async confirm() {
    const confirmed = await s2Session.confirmCatalog();
    if (confirmed?.mode !== 'legacy') return confirmed;
    return {
      ...confirmed,
      async readLegacyPrayer(id) {
        const snapshot = await getDoc(doc(getPriestActivationDb(), 'priestProtectedPrayers', id));
        return snapshot.exists() ? { ...snapshot.data(), id } : null;
      },
      async readLegacy(assertCurrent) {
        const db = getPriestActivationDb();
        const read = async (name) => (await withFirestoreQuota(() => getDocs(collection(db, name)))).docs
          .map((doc) => ({ ...doc.data(), id: doc.id }));
        const prayers = await read('priestProtectedPrayers');
        assertCurrent();
        const categories = await read('priestProtectedCategories');
        return { prayers, categories };
      },
    };
  },
  subscribe(invalidate) { return watch(() => s2Session.access.revision, invalidate, { flush: 'sync' }); },
};
let provider = sessionProvider;
export const prayerCatalogAccess = createAccessSetsCatalogSession({
  confirm: () => provider.confirm(), canRead: canReadPrayerCatalog,
  perform: withFirestoreQuota, onInvalidated: () => { revision.value++; },
});
let unsubscribe = provider.subscribe(prayerCatalogAccess.invalidate);

// S2 supplies server confirmation and synchronous invalidation on Auth/grant,
// role revision, pending revoke and mode changes. No device Auth logic lives here.
export function installPrayerCatalogEntitlements(nextProvider) {
  if (typeof nextProvider?.confirm !== 'function' || typeof nextProvider?.subscribe !== 'function') {
    throw new TypeError('Invalid prayer catalog entitlements provider');
  }
  unsubscribe?.();
  provider = nextProvider;
  unsubscribe = provider.subscribe(prayerCatalogAccess.invalidate);
  prayerCatalogAccess.invalidate();
  return () => { if (provider === nextProvider) installPrayerCatalogEntitlements(sessionProvider); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', prayerCatalogAccess.invalidate);
  window.addEventListener('online', prayerCatalogAccess.invalidate);
  window.addEventListener('pagehide', () => {
    pageActive = false;
    prayerCatalogAccess.invalidate();
  });
  window.addEventListener('pageshow', () => {
    if (pageActive) return;
    pageActive = true;
    prayerCatalogAccess.invalidate();
  });
  document.addEventListener('visibilitychange', prayerCatalogAccess.invalidate);
}
