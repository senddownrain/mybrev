import {
  collection,
  getDocs,
  getDocsFromCache,
} from 'firebase/firestore';

import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const INVITATORIUM_COLLECTION = 'invitatoriums';
const COMPLETORIUM_COLLECTION = 'completoriums';

let invitatoriumsCache = null;
let completoriumsCache = null;
let invitatoriumsRequest = null;
let completoriumsRequest = null;
let invitatoriumsRefreshStarted = false;
let completoriumsRefreshStarted = false;

function snapshotItems(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function readCachedCollection(collectionName) {
  try {
    const snapshot = await getDocsFromCache(collection(db, collectionName));
    return snapshot.empty ? null : snapshotItems(snapshot);
  } catch {
    logger.log(`[staticLiturgicalService] ${collectionName} is not in persistent cache yet`);
    return null;
  }
}

async function readServerCollection(collectionName) {
  const snapshot = await retryFirestore(() => getDocs(collection(db, collectionName)));
  return snapshotItems(snapshot);
}

function refreshInBackground(collectionName, assign) {
  readServerCollection(collectionName)
    .then((items) => {
      assign(items);
      logger.log(`[staticLiturgicalService] refreshed ${collectionName}: ${items.length}`);
    })
    .catch((error) => {
      logger.error(`[staticLiturgicalService] failed to refresh ${collectionName}:`, error);
    });
}

async function loadCacheFirst({
  collectionName,
  getMemoryCache,
  assignMemoryCache,
  getRequest,
  assignRequest,
  hasRefreshStarted,
  markRefreshStarted,
}) {
  const memoryCache = getMemoryCache();
  if (memoryCache) return memoryCache;

  const activeRequest = getRequest();
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const cachedItems = await readCachedCollection(collectionName);
    if (cachedItems) {
      assignMemoryCache(cachedItems);
      if (!hasRefreshStarted()) {
        markRefreshStarted();
        refreshInBackground(collectionName, assignMemoryCache);
      }
      return cachedItems;
    }

    const serverItems = await readServerCollection(collectionName);
    assignMemoryCache(serverItems);
    return serverItems;
  })();

  assignRequest(request);
  try {
    return await request;
  } finally {
    assignRequest(null);
  }
}

/** Load the complete, small invitatorium collection into memory. */
export function getInvitatoriums() {
  return loadCacheFirst({
    collectionName: INVITATORIUM_COLLECTION,
    getMemoryCache: () => invitatoriumsCache,
    assignMemoryCache: (items) => { invitatoriumsCache = items; },
    getRequest: () => invitatoriumsRequest,
    assignRequest: (request) => { invitatoriumsRequest = request; },
    hasRefreshStarted: () => invitatoriumsRefreshStarted,
    markRefreshStarted: () => { invitatoriumsRefreshStarted = true; },
  });
}

/** Load the complete, small compline collection into memory. */
export function getCompletoriums() {
  return loadCacheFirst({
    collectionName: COMPLETORIUM_COLLECTION,
    getMemoryCache: () => completoriumsCache,
    assignMemoryCache: (items) => { completoriumsCache = items; },
    getRequest: () => completoriumsRequest,
    assignRequest: (request) => { completoriumsRequest = request; },
    hasRefreshStarted: () => completoriumsRefreshStarted,
    markRefreshStarted: () => { completoriumsRefreshStarted = true; },
  });
}

export async function getCompletoriumById(id) {
  const items = await getCompletoriums();
  return items.find((item) => item.id === id) || null;
}

/** Warm both static collections without blocking the caller's UI. */
export async function warmupStaticLiturgicalCollections() {
  const results = await Promise.allSettled([
    getInvitatoriums(),
    getCompletoriums(),
  ]);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const collectionName = index === 0 ? INVITATORIUM_COLLECTION : COMPLETORIUM_COLLECTION;
      logger.error(`[staticLiturgicalService] warmup failed for ${collectionName}:`, result.reason);
    }
  });
}
