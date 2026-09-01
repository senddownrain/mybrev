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
export async function getDocsOfflineAware(queryRef, session) {
  const observe = (snapshot) => session ? session.observe(snapshot) : snapshot;
  if (isKnownOffline()) {
    if (session) session.complete = false;
    return getDocsFromCache(queryRef).then(observe);
  }

  try {
    return observe(await retryFirestore(() => getDocs(queryRef)));
  } catch (networkError) {
    if (session) session.complete = false;
    try {
      return await getDocsFromCache(queryRef);
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
    return getDocFromCache(documentRef).then(observe);
  }

  try {
    return observe(await retryFirestore(() => getDoc(documentRef)));
  } catch (networkError) {
    if (session) session.complete = false;
    try {
      return await getDocFromCache(documentRef);
    } catch {
      throw networkError;
    }
  }
}
