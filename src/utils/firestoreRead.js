import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  onSnapshot,
} from 'firebase/firestore';

import { retryFirestore } from '@/utils/retry';
import { firestoreCacheRecovery } from '@/plugins/firebase';
import { isFirestoreCacheError } from './firestoreCacheRecovery.js';
import { withFirestoreQuota } from './firestoreErrors.mjs';

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

const deadlineError = () => Object.assign(new Error('Public content read timed out'), { code: 'deadline-exceeded' });

// One shared deadline across the queries needed to assemble a reader result.
// A temporary listener can be cancelled, unlike a racing getDoc()/getDocs().
async function readPublicSnapshot(ref, readCache, session) {
  if (isKnownOffline()) {
    session.complete = false;
    let timer;
    try {
      return await Promise.race([
        readWithCacheRecovery(readCache),
        new Promise((_, reject) => { timer = setTimeout(() => reject(deadlineError()), 700); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  let cached;
  try {
    return session.observe(await readWithCacheRecovery(() => withFirestoreQuota(() => new Promise((resolve, reject) => {
      const remaining = session.deadline - Date.now();
      if (remaining <= 0) { reject(deadlineError()); return; }
      let unsubscribe;
      const finish = (callback, value) => {
        clearTimeout(timer);
        unsubscribe?.();
        callback(value);
      };
      const timer = setTimeout(() => finish(reject, deadlineError()), remaining);
      try {
        unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
          if (!snapshot.metadata.fromCache) finish(resolve, snapshot);
          else if (snapshot.exists ? snapshot.exists() : !snapshot.empty) cached = snapshot;
        }, (error) => finish(reject, error));
      } catch (error) { finish(reject, error); }
    }))));
  } catch (error) {
    session.complete = false;
    if (cached && error.code === 'deadline-exceeded') return cached;
    throw error;
  }
}

/**
 * Read a Firestore query without making an offline PWA wait for network retry
 * timeouts. Online reads still prefer the server and fall back to IndexedDB if
 * the connection disappears while the request is running.
 */
export async function getDocsOfflineAware(queryRef, session) {
  if (session) return readPublicSnapshot(queryRef, () => getDocsFromCache(queryRef), session);
  if (isKnownOffline()) {
    return readWithCacheRecovery(() => getDocsFromCache(queryRef));
  }

  try {
    return await readWithCacheRecovery(() => retryFirestore(() => getDocs(queryRef)));
  } catch (networkError) {
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
  if (session) return readPublicSnapshot(documentRef, () => getDocFromCache(documentRef), session);
  if (isKnownOffline()) {
    return readWithCacheRecovery(() => getDocFromCache(documentRef));
  }

  try {
    return await readWithCacheRecovery(() => retryFirestore(() => getDoc(documentRef)));
  } catch (networkError) {
    if (isFirestoreCacheError(networkError)) throw networkError;
    try {
      return await readWithCacheRecovery(() => getDocFromCache(documentRef));
    } catch {
      throw networkError;
    }
  }
}
