import { getCalendarDefinitions, getDefinitionsEpoch } from './ordo/definitions.js';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../constants/contentRevision.js';
import { createContentCache } from './contentCache.js';
import { createContentCacheStorage } from './contentCacheStorage.js';
import { currentOrdoDiocese } from './ordoDiocese.js';
import { resolveRuntimeDay } from './ordo/runtime.js';
import { celebrationTextContext, periodTextContext } from './ordoScreen.js';

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

export function resolveReaderDay(date, diocese, referenceOptionId, periodOnly) {
  if (periodOnly) return periodTextContext(date, { diocese });
  if (referenceOptionId) return celebrationTextContext(date, referenceOptionId, { diocese });
  return resolveRuntimeDay(date, { diocese });
}

let previousCalendarKey;
export function rememberLegacyCalendarKey() {
  previousCalendarKey = `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}`;
}

const versions = new WeakMap();
function calendarContentVersion(day) {
  if (versions.has(day)) return versions.get(day);
  const text = JSON.stringify([
    day.period, day.periodPhase, day.week, day.dayOfWeek, day.psalterWeek, day.readingCycle,
    day.primary, day.alternatives, day.commemorations, day.officeOptions,
    day.officeResolution, day.readingResolution, day.sources,
  ]);
  // Stable across tabs, reloads and changes to unrelated calendar dates.
  let first = 0x811c9dc5;
  let second = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charCodeAt(index);
    first = Math.imul(first ^ character, 0x01000193);
    second = Math.imul(second, 33) ^ character;
  }
  const version = `calendar:day:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  versions.set(day, version);
  return version;
}

export function contentKey(date, diocese = currentOrdoDiocese(), referenceOptionId = '', periodOnly = false, resolved) {
  const version = calendarContentVersion(resolved || resolveReaderDay(date, diocese, referenceOptionId, periodOnly));
  if (periodOnly) return publicContentKey('period-content', date, diocese, version);
  return referenceOptionId ? publicContentKey('reference-content', date, diocese, referenceOptionId, version) : publicContentKey('content', date, diocese, version);
}
export function readingsKey(date, options = {}) {
  const diocese = options.diocese || currentOrdoDiocese();
  const resolved = options.resolved || resolveReaderDay(date, diocese, options.referenceOptionId, options.periodOnly);
  return publicContentKey(
    ...(options.periodOnly ? ['period-readings'] : options.referenceOptionId ? ['reference-readings', options.referenceOptionId] : ['readings']), date, options.dayId || '', Boolean(options.includeAlternatives), diocese, calendarContentVersion(resolved),
  );
}

// Only reuse the old per-epoch keys while the startup calendar is still active.
export function legacyReaderKey(key) {
  if (previousCalendarKey !== `calendar:${getCalendarDefinitions().revision}:${getDefinitionsEpoch()}`) return undefined;
  const parts = JSON.parse(key);
  parts[parts.length - 1] = previousCalendarKey;
  return publicContentKey(...parts);
}

/** The first Hours cache that included the 7,791 text corrections was PR #255. */
export function hasCorrectedHours(entry) {
  return entry.revision.startsWith('2026-11-16-pr255-web-only-v1:')
    || /^\d{4}-\d{2}-\d{2}/.test(entry.revision) && entry.revision.slice(0, 10) >= '2026-11-17';
}
