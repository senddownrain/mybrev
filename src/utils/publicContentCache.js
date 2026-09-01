import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../constants/contentRevision.js';
import { createContentCache } from './contentCache.js';
import { createContentCacheStorage } from './contentCacheStorage.js';

const namespace = `mybrev-public-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'}-v${CONTENT_CACHE_SCHEMA}`;
const refreshKey = `${namespace}:refresh`;
let localRevision = '';
const readRefreshRevision = () => {
  try { return localStorage.getItem(refreshKey) || localRevision; }
  catch { return localRevision; }
};

export const isContentOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
export const publicContentKey = (type, ...parts) => JSON.stringify([type, ...parts]);
export const publicContentCache = createContentCache({
  storage: createContentCacheStorage(namespace),
  getRevision: () => `${CONTENT_REVISION}:${readRefreshRevision()}`,
  isOnline: isContentOnline,
  onError: (error) => console.warn('[ContentCache]', error.message),
});

/** Mark stale without deleting a single offline result. Other tabs see the token. */
export function requestContentRefresh() {
  localRevision = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(refreshKey, localRevision); } catch { /* Session-only fallback. */ }
}

export function contentKey(date) { return publicContentKey('content', date); }
export function readingsKey(date, options = {}) {
  return publicContentKey('readings', date, options.dayId || '', Boolean(options.includeAlternatives));
}
