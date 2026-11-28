import { getCalendarDefinitions, getDefinitionsEpoch } from './ordo/definitions.js';
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
// Recheck public content after 15 minutes on the next online visit.
// Liturgical readers may show a complete current-revision copy during this check.
export const PUBLIC_CONTENT_MAX_AGE_MS = 15 * 60 * 1000;
export const publicContentCache = createContentCache({
  maxAgeMs: PUBLIC_CONTENT_MAX_AGE_MS,
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

let previousCalendarKey;
export function rememberLegacyCalendarKey() {
  previousCalendarKey = `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}`;
}

// Only reuse the old per-epoch keys while the startup calendar is still active.
export function legacyReaderKey(key) {
  if (previousCalendarKey !== `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}`) return undefined;
  const parts = JSON.parse(key);
  parts[parts.length - 1] = previousCalendarKey;
  return publicContentKey(...parts);
}
