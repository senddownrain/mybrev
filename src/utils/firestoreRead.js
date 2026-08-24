import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
} from 'firebase/firestore';

import { retryFirestore } from '@/utils/retry';

function isKnownOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Read a Firestore query without making an offline PWA wait for network retry
 * timeouts. Online reads still prefer the server and fall back to IndexedDB if
 * the connection disappears while the request is running.
 */
export async function getDocsOfflineAware(queryRef) {
  if (isKnownOffline()) return getDocsFromCache(queryRef);

  try {
    return await retryFirestore(() => getDocs(queryRef));
  } catch (networkError) {
    try {
      return await getDocsFromCache(queryRef);
    } catch {
      throw networkError;
    }
  }
}

/** Offline-aware counterpart for a single document reference. */
export async function getDocOfflineAware(documentRef) {
  if (isKnownOffline()) return getDocFromCache(documentRef);

  try {
    return await retryFirestore(() => getDoc(documentRef));
  } catch (networkError) {
    try {
      return await getDocFromCache(documentRef);
    } catch {
      throw networkError;
    }
  }
}
