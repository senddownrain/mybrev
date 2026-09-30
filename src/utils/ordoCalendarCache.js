/**
 * Locally cached calendar publication → engine. No Firestore import here:
 * `primeContentCache` applies the cache before the first screen is created.
 */
import { publicContentCache, publicContentKey, requestContentRefresh } from './publicContentCache.js';
import { getBundledCalendarDefinitions, getCalendarDefinitions, setCalendarDefinitions } from './ordo/definitions.js';
import { selectCalendarSource, sameDefinitions } from './ordoCalendarSource.js';

export const CALENDAR_CACHE_KEY = publicContentKey('ordo-calendar');
export const YEAR_OVERRIDES_CACHE_KEY = publicContentKey('ordo-year-overrides');
export const NOTES_CACHE_KEY = publicContentKey('ordo-notes');

/** Definitions the cache asks for (partial), or null when it has nothing newer. */
export function definitionsFromCache({ calendar, overrides, bundled }) {
  const source = selectCalendarSource({ bundled, cached: calendar });
  const next = {
    ...(source === 'firestore' ? {
      schemaVersion: calendar.schemaVersion,
      revision: calendar.revision,
      publishedAt: calendar.publishedAt,
      celebrations: calendar.celebrations,
      dioceseOverrides: calendar.dioceseOverrides || [],
    } : {}),
    ...(Array.isArray(overrides?.items) ? { yearOverrides: overrides.items } : {}),
  };
  return Object.keys(next).length ? next : null;
}

/** Apply what is already in the local cache. Synchronous after `prime`. */
export function applyCachedCalendar({ markContentStale = false } = {}) {
  const next = definitionsFromCache({
    calendar: publicContentCache.peek(CALENDAR_CACHE_KEY),
    overrides: publicContentCache.peek(YEAR_OVERRIDES_CACHE_KEY),
    bundled: getBundledCalendarDefinitions(),
  });
  if (!next || sameDefinitions(getCalendarDefinitions(), next)) return false;
  setCalendarDefinitions(next);
  // Saved Hours / Readings were resolved with the previous calendar.
  if (markContentStale) requestContentRefresh();
  return true;
}
