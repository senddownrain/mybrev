/**
 * Public calendar data of the Ordo in Firestore, cached for offline use.
 *
 *   liturgicalCalendarMeta/current   { schemaVersion, revision, notesRevision, publishedAt }
 *   liturgicalCelebrations           permanent universal / Belarus celebrations
 *   liturgicalDioceseOverrides       diocesan differences
 *   liturgicalYearOverrides          manual one-year decisions
 *   liturgicalOrdoNotes              Ordo notes with selectors
 *
 * Firestore → `publicContentCache` → `setCalendarDefinitions()` → pure engine.
 * The bundled snapshot is used until a newer revision has been published, so
 * the calendar works without network, without a cache and without these
 * collections. Nothing here blocks rendering.
 */
import { collection, doc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { getDocOfflineAware, getDocsOfflineAware } from '@/utils/firestoreRead';
import { createReadSession } from '@/utils/contentCache';
import { publicContentCache } from '@/utils/publicContentCache';
import { logger } from '@/utils/logger';
import { CALENDAR_SCHEMA_VERSION, getBundledCalendarDefinitions } from '@/utils/ordo/definitions';
import { selectNotesSource } from '@/utils/ordoCalendarSource';
import {
  CALENDAR_CACHE_KEY, NOTES_CACHE_KEY, YEAR_OVERRIDES_CACHE_KEY, applyCachedCalendar,
} from '@/utils/ordoCalendarCache';

export const CALENDAR_COLLECTIONS = Object.freeze({
  meta: 'liturgicalCalendarMeta',
  celebrations: 'liturgicalCelebrations',
  dioceseOverrides: 'liturgicalDioceseOverrides',
  yearOverrides: 'liturgicalYearOverrides',
  notes: 'liturgicalOrdoNotes',
});

const readCollection = async (name, session) => {
  const snapshot = await getDocsOfflineAware(collection(db, name), session);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

async function readMeta(session) {
  const snapshot = await getDocOfflineAware(doc(db, CALENDAR_COLLECTIONS.meta, 'current'), session);
  return snapshot.exists() ? snapshot.data() : null;
}

/** Apply a refreshed cache entry once the cache has stored it. */
function applySoon() {
  setTimeout(() => applyCachedCalendar({ markContentStale: true }), 0);
}

async function loadCalendar() {
  const session = createReadSession();
  const meta = await readMeta(session);
  const bundled = getBundledCalendarDefinitions();
  // Same or older revision: the bundled snapshot is that publication.
  if (!meta || Number(meta.schemaVersion || CALENDAR_SCHEMA_VERSION) > CALENDAR_SCHEMA_VERSION
    || Number(meta.revision || 0) <= bundled.revision) {
    applySoon();
    return {
      data: { revision: Number(meta?.revision || 0), meta: meta ? { revision: Number(meta.revision || 0), notesRevision: Number(meta.notesRevision || 0) } : null },
      complete: session.complete,
    };
  }
  const [celebrations, dioceseOverrides] = await Promise.all([
    readCollection(CALENDAR_COLLECTIONS.celebrations, session),
    readCollection(CALENDAR_COLLECTIONS.dioceseOverrides, session),
  ]);
  applySoon();
  return {
    data: {
      schemaVersion: Number(meta.schemaVersion || CALENDAR_SCHEMA_VERSION),
      revision: Number(meta.revision),
      publishedAt: meta.publishedAt?.toDate?.()?.toISOString?.() || meta.publishedAt || null,
      meta: { revision: Number(meta.revision), notesRevision: Number(meta.notesRevision || 0) },
      celebrations,
      dioceseOverrides,
    },
    complete: session.complete,
  };
}

async function loadYearOverrides() {
  const session = createReadSession();
  const items = await readCollection(CALENDAR_COLLECTIONS.yearOverrides, session);
  applySoon();
  return { data: { items: items.map(serializableOverride) }, complete: session.complete };
}

const timestampToIso = (value) => value?.toDate?.()?.toISOString?.() || value || null;

export function serializableOverride(item) {
  return { ...item, createdAt: timestampToIso(item.createdAt), updatedAt: timestampToIso(item.updatedAt) };
}

/**
 * Refresh the calendar from Firestore (cached result first, network in the
 * background) and apply it to the engine. Saved Hours/Readings are marked
 * stale when the calendar actually changed.
 */
export async function refreshCalendarDefinitions(options = {}) {
  try {
    await Promise.all([
      publicContentCache.read(CALENDAR_CACHE_KEY, loadCalendar, options),
      publicContentCache.read(YEAR_OVERRIDES_CACHE_KEY, loadYearOverrides, options),
    ]);
  } catch (error) {
    // No rules / no collections / offline without a cache: bundled snapshot.
    logger.warn('[ordoCalendar] Firestore calendar unavailable, using the bundled snapshot:', error?.message || error);
  }
  return applyCachedCalendar({ markContentStale: true });
}

/** Year overrides straight from the server (admin page). */
export async function fetchYearOverridesFresh() {
  const entry = await publicContentCache.read(YEAR_OVERRIDES_CACHE_KEY, loadYearOverrides, { fresh: true });
  applyCachedCalendar({ markContentStale: true });
  return entry.data.items;
}

/**
 * Ordo notes: a published newer revision from Firestore, else null (the
 * caller falls back to the bundled chunk).
 */
export async function loadPublishedOrdoNotes(bundledRevision = 0) {
  const calendar = publicContentCache.peek(CALENDAR_CACHE_KEY);
  if (selectNotesSource({ bundledRevision, meta: calendar?.meta }) !== 'firestore') return null;
  const revision = Number(calendar.meta.notesRevision);
  const entry = await publicContentCache.read(NOTES_CACHE_KEY, async () => {
    const session = createReadSession();
    const notes = await readCollection(CALENDAR_COLLECTIONS.notes, session);
    return { data: { revision, notes }, complete: session.complete };
  });
  return entry.data?.revision === revision && entry.data.notes.length ? entry.data.notes : null;
}
