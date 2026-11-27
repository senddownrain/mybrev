/**
 * Locally cached calendar publication → engine. No Firestore import here:
 * Startup restores these definitions before a route can resolve any dates.
 */
import { publicContentCache, publicContentKey } from './publicContentCache.js';
import { getBundledCalendarDefinitions, getCalendarDefinitions, setCalendarDefinitions } from './ordo/definitions.js';
import { selectCalendarSource, sameDefinitions } from './ordoCalendarSource.js';

export const CALENDAR_CACHE_KEY = publicContentKey('ordo-calendar');
export const YEAR_OVERRIDES_CACHE_KEY = publicContentKey('ordo-year-overrides');
export const NOTES_CACHE_KEY = publicContentKey('ordo-notes');

export async function restoreCalendarCache() {
  await publicContentCache.prime([CALENDAR_CACHE_KEY, YEAR_OVERRIDES_CACHE_KEY]);
  applyCachedCalendar();
}

/** Definitions the cache asks for (partial), or null when it has nothing newer. */
export function definitionsFromCache({ calendar, overrides, bundled }) {
  const source = selectCalendarSource({ bundled, cached: calendar });
  const disabled = bundled.yearOverrides.filter((item) => item.enabled === false);
  const yearItems = Array.isArray(overrides?.items) ? overrides.items : null;
  const years = yearItems && Number(calendar?.revision || 0) <= bundled.revision
    ? [...yearItems.filter((item) => !disabled.some((cancelled) => cancelled.id === item.id)), ...disabled] : yearItems;
  const next = {
    ...(source === 'firestore' ? {
      schemaVersion: calendar.schemaVersion,
      revision: calendar.revision,
      publishedAt: calendar.publishedAt,
      celebrations: calendar.celebrations,
      dioceseOverrides: calendar.dioceseOverrides || [],
    } : {}),
    ...(years ? { yearOverrides: years } : {}),
  };
  return Object.keys(next).length ? next : null;
}

/** Apply what is already in the local cache. Synchronous after `prime`. */
export function applyCachedCalendar() {
  const next = definitionsFromCache({
    calendar: publicContentCache.peek(CALENDAR_CACHE_KEY),
    overrides: publicContentCache.peek(YEAR_OVERRIDES_CACHE_KEY),
    bundled: getBundledCalendarDefinitions(),
  });
  if (!next || sameDefinitions(getCalendarDefinitions(), next)) return false;
  setCalendarDefinitions(next);
  return true;
}
