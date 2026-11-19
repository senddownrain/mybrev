import { getCalendarDefinitions, getDefinitionsEpoch } from './ordo/definitions.js';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../constants/contentRevision.js';
import { createContentCache } from './contentCache.js';
import { createContentCacheStorage } from './contentCacheStorage.js';
import { currentOrdoDiocese } from './ordoDiocese.js';

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

// Hours and Readings are resolved for a diocese (Ordo layers), so the
// diocese is part of the key.
export const calendarContentVersion = () => `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}`;

export function contentKey(date, diocese = currentOrdoDiocese(), referenceOptionId = '', periodOnly = false) {
  if (periodOnly) return publicContentKey('period-content', date, diocese, calendarContentVersion());
  return referenceOptionId ? publicContentKey('reference-content', date, diocese, referenceOptionId, calendarContentVersion()) : publicContentKey('content', date, diocese, calendarContentVersion());
}
export function readingsKey(date, options = {}) {
  return publicContentKey(
    ...(options.periodOnly ? ['period-readings'] : options.referenceOptionId ? ['reference-readings', options.referenceOptionId] : ['readings']), date, options.dayId || '', Boolean(options.includeAlternatives), options.diocese || currentOrdoDiocese(), calendarContentVersion(),
  );
}
