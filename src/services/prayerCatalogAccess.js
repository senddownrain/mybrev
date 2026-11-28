import { readonly, ref, watch } from 'vue';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { getPriestActivationDb } from '@/plugins/priestFirebase';
import { s2Session } from './s2AccessFirebase';
import { createAccessSetsCatalogSession } from './accessSetsCatalogSession.mjs';
import { advancePrayerCatalogRevision } from './prayerCatalogRevision.js';
import { isFirestoreQuotaBlocked, withFirestoreQuota } from '@/utils/firestoreErrors.mjs';

export { prayerCatalogRevision } from './prayerCatalogRevision.js';
const demand = ref(0);
export const prayerCatalogDemand = readonly(demand);
export function retainPrayerCatalog() {
  if (!demand.value) {
    if (paused) resumeCatalog();
    else prayerCatalogAccess.retryClosed();
  }
  demand.value++;
  return () => { demand.value--; };
}
let pageActive = true;
let paused = false;
let resumeRequest;
const rechecking = ref(false);
export const prayerCatalogRechecking = readonly(rechecking);
export const canReadPrayerCatalog = () => !paused && globalThis.navigator?.onLine !== false
  && pageActive && !globalThis.document?.hidden && !isFirestoreQuotaBlocked();

const sessionProvider = {
  refresh: s2Session.refresh,
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
  perform: withFirestoreQuota, onInvalidated: advancePrayerCatalogRevision,
});
const invalidateForEntitlements = () => {
  if (!paused) prayerCatalogAccess.invalidate();
};
let unsubscribe = provider.subscribe(invalidateForEntitlements);

// S2 supplies server confirmation and synchronous invalidation on Auth/grant,
// role revision, pending revoke and mode changes. No device Auth logic lives here.
export function installPrayerCatalogEntitlements(nextProvider) {
  if (typeof nextProvider?.confirm !== 'function' || typeof nextProvider?.subscribe !== 'function') {
    throw new TypeError('Invalid prayer catalog entitlements provider');
  }
  unsubscribe?.();
  provider = nextProvider;
  unsubscribe = provider.subscribe(invalidateForEntitlements);
  invalidateForEntitlements();
  return () => { if (provider === nextProvider) installPrayerCatalogEntitlements(sessionProvider); };
}

function pauseCatalog() {
  resumeRequest = undefined;
  rechecking.value = false;
  if (paused) return;
  paused = true;
  prayerCatalogAccess.invalidate();
}

function resumeCatalog() {
  if (!paused || resumeRequest || !pageActive || document.hidden || navigator.onLine === false) return;
  rechecking.value = true;
  const request = Promise.resolve().then(async () => {
    const source = provider;
    let status = await source.refresh?.();
    if (status?.interrupted && resumeRequest === request) status = await source.refresh();
    if (resumeRequest !== request || status?.interrupted || document.hidden || navigator.onLine === false) return;
    paused = false;
    // The old generation was discarded on pause. Wake consumers only after
    // the current permissions have been confirmed for this foreground view.
    advancePrayerCatalogRevision();
  }).catch(() => {}).finally(() => {
    if (resumeRequest === request) {
      resumeRequest = undefined;
      rechecking.value = false;
    }
  });
  resumeRequest = request;
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', pauseCatalog);
  window.addEventListener('online', resumeCatalog);
  window.addEventListener('focus', () => {
    if (paused) resumeCatalog();
    else prayerCatalogAccess.retryClosed();
  });
  window.addEventListener('pagehide', () => { pageActive = false; pauseCatalog(); });
  window.addEventListener('pageshow', () => { pageActive = true; resumeCatalog(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseCatalog();
    else resumeCatalog();
  });
}
