/**
 * Optional, deliberately opt-in nine-day OFFLINE warmup.
 *
 * Stage 1 lives in cacheWarmup.js: today/tomorrow Hours + static collections.
 * This module is imported only after Stage 1, an additional delay, and browser
 * idle time. It never touches protected prayers, admin data, or the Bible.
 *
 * Extended content is re-prefetched no more often than once every seven days
 * at the same publication revision. Opening a page still uses the existing
 * 15-minute online revalidation policy: this longer interval only prevents
 * unnecessary speculative reads on every launch.
 */
import { useLiturgicalStore } from '@/stores/liturgical';
import { buildDateWarmupOrder, CACHE_DAYS_AHEAD, CACHE_DAYS_BEHIND } from './cacheWarmup.js';
import { publicContentCache, contentKey, readingsKey } from './publicContentCache.js';
import { currentOrdoDiocese } from './ordoDiocese.js';
import { isFirestoreQuotaBlocked } from './firestoreErrors.mjs';
import { logger } from './logger.js';

export const EXTENDED_CACHE_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const QUIET_BEFORE_REQUEST_MS = 3500;
const BACKGROUND_IDLE_ATTEMPTS = 25;
const BACKGROUND_LOCK_NAME = 'mybrev-public-week-prefetch';

export function mayPrefetchExtendedContent() {
  if (isFirestoreQuotaBlocked()) return false;
  if (typeof navigator !== 'undefined') {
    if (navigator.onLine === false) return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return false;
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof window !== 'undefined' && /^\/(admin|login)(\/|$)/.test(window.location.pathname)) return false;
  return true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observeUserActivity() {
  let lastInput = Date.now();
  const record = () => { lastInput = Date.now(); };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    for (const event of events) window.addEventListener(event, record, { passive: true });
  }
  return {
    lastInputAt: () => lastInput,
    stop() {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        for (const event of events) window.removeEventListener(event, record);
      }
    },
  };
}

/** One opportunity PER resource; never schedule a burst of queries or CPU work. */
async function waitForQuietIdle(eligible, lastInputAt) {
  for (let attempt = 0; attempt < BACKGROUND_IDLE_ATTEMPTS; attempt += 1) {
    if (!eligible()) return false;
    if (Date.now() - lastInputAt() >= QUIET_BEFORE_REQUEST_MS) {
      await new Promise((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(resolve, { timeout: 3000 });
        } else {
          setTimeout(resolve, 300);
        }
      });
      if (eligible() && Date.now() - lastInputAt() >= QUIET_BEFORE_REQUEST_MS) return true;
    }
    await sleep(850);
  }
  return false; // Busy reader: prefer responsiveness; retry on a future launch.
}

async function fillWindow(baseDate, { eligible, cache, store, waitForSlot }) {
  const diocese = currentOrdoDiocese();
  const allowed = () => eligible() && currentOrdoDiocese() === diocese;
  const activity = observeUserActivity();
  const checkSlot = waitForSlot || (() => waitForQuietIdle(allowed, activity.lastInputAt));
  const result = { loaded: 0, alreadyCached: 0, incomplete: 0, stopped: false };

  try {
    // Today and tomorrow's Hours should already be cached by Stage 1. Readings
    // for those days are next; then yesterday and days +2 .. +7.
    const dates = buildDateWarmupOrder(baseDate, CACHE_DAYS_BEHIND, CACHE_DAYS_AHEAD);
    outer: for (const date of dates) {
      if (!allowed()) { result.stopped = true; break; }
      const day = date.format('YYYY-MM-DD');
      const tasks = [
        { type: 'hours', key: contentKey(day, diocese),
          load: () => store.fetchContentByDate(date.toDate(), { diocese }) },
        { type: 'readings', key: readingsKey(day, { diocese, includeAlternatives: true }),
          load: () => store.fetchReadingsByDate(date.toDate(), { diocese, includeAlternatives: true }) },
      ];
      for (const task of tasks) {
        if (!allowed()) { result.stopped = true; break outer; }
        // IndexedDB read only: skip the real Firestore read for a complete
        // current-revision entry, even if its UI recheck TTL has expired.
        await cache.prime([task.key]);
        if (cache.hasRecentComplete(task.key, EXTENDED_CACHE_RECHECK_MS)) {
          result.alreadyCached += 1;
          continue;
        }
        if (!(await checkSlot()) || !allowed()) {
          result.stopped = true;
          break outer;
        }
        try {
          await task.load();
        } catch (error) {
          logger.error(`[ExtendedCacheWarmup] ${task.type} ${day} failed:`, error);
          result.incomplete += 1;
          result.stopped = true;
          break outer; // No repeated queries on network/quota failures.
        }
        if (!allowed()) { result.stopped = true; break outer; }
        if (!cache.hasRecentComplete(task.key, EXTENDED_CACHE_RECHECK_MS)) {
          result.incomplete += 1;
          result.stopped = true;
          break outer; // Never mark a partial SDK/offline result as ready.
        }
        result.loaded += 1;
      }
    }
  } finally {
    activity.stop();
  }
  logger.log('[ExtendedCacheWarmup] nine-day offline cache:', result);
  return result;
}

/**
 * Prevent two open tabs from performing the same costly background work.
 * navigator.locks is optional; without it, IndexedDB completeness still
 * prevents repeat reads on subsequent visits.
 */
export async function warmupExtendedDateWindow(baseDate = new Date(), options = {}) {
  const eligible = options.eligible || mayPrefetchExtendedContent;
  if (!eligible()) return { loaded: 0, alreadyCached: 0, incomplete: 0, stopped: true };
  const run = () => fillWindow(baseDate, {
    eligible,
    cache: options.cache || publicContentCache,
    store: options.store || useLiturgicalStore(),
    waitForSlot: options.waitForSlot,
  });
  if (typeof navigator !== 'undefined' && navigator.locks?.request && !options.skipLock) {
    return navigator.locks.request(BACKGROUND_LOCK_NAME, { ifAvailable: true }, (lock) =>
      lock ? run() : { loaded: 0, alreadyCached: 0, incomplete: 0, stopped: true });
  }
  return run();
}
