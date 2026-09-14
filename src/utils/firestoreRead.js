import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
} from 'firebase/firestore';

import { retryFirestore } from '@/utils/retry';
import { firestoreCacheRecovery } from '@/plugins/firebase';
import { isFirestoreCacheError } from './firestoreCacheRecovery.js';

async function readWithCacheRecovery(read) {
  try {
    return await read();
  } catch (error) {
    firestoreCacheRecovery.recover(error);
    throw error;
  }
}

function isKnownOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Read a Firestore query without making an offline PWA wait for network retry
 * timeouts. Online reads still prefer the server and fall back to IndexedDB if
 * the connection disappears while the request is running.
 */
export async function getDocsOfflineAware(queryRef, session) {
  const observe = (snapshot) => session ? session.observe(snapshot) : snapshot;
  if (isKnownOffline()) {
    if (session) session.complete = false;
    return readWithCacheRecovery(() => getDocsFromCache(queryRef)).then(observe);
  }

  try {
    return observe(await readWithCacheRecovery(() => retryFirestore(() => getDocs(queryRef))));
  } catch (networkError) {
    if (session) session.complete = false;
    if (isFirestoreCacheError(networkError)) throw networkError;
    try {
      return await readWithCacheRecovery(() => getDocsFromCache(queryRef));
    } catch {
      throw networkError;
    }
  }
}

/** Offline-aware counterpart for a single document reference. */
export async function getDocOfflineAware(documentRef, session) {
  const observe = (snapshot) => session ? session.observe(snapshot) : snapshot;
  if (isKnownOffline()) {
    if (session) session.complete = false;
    return readWithCacheRecovery(() => getDocFromCache(documentRef)).then(observe);
  }

  try {
    return observe(await readWithCacheRecovery(() => retryFirestore(() => getDoc(documentRef))));
  } catch (networkError) {
    if (session) session.complete = false;
    if (isFirestoreCacheError(networkError)) throw networkError;
    try {
      return await readWithCacheRecovery(() => getDocFromCache(documentRef));
    } catch {
      throw networkError;
    }
  }
}
