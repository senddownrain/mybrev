/**
 * Fill missing offline Hours and Readings after the first prayer is visible.
 * Existing complete results are revalidated when the reader opens them.
 */
import { useLiturgicalStore } from '@/stores/liturgical';
import { buildDateWarmupOrder, CACHE_DAYS_AHEAD, CACHE_DAYS_BEHIND } from './cacheWarmup.js';
import { publicContentCache, legacyReaderKey } from './publicContentCache.js';
import { contentKey, readingsKey, hasCorrectedHours } from './readerCacheKeys.js';
import { currentOrdoDiocese } from './ordoDiocese.js';
import { isFirestoreQuotaBlocked } from './firestoreErrors.mjs';
import { logger } from './logger.js';

const QUIET_BEFORE_REQUEST_MS = 3500;
const BACKGROUND_IDLE_ATTEMPTS = 25;
const BACKGROUND_LOCK_NAME = 'mybrev-public-week-prefetch';

export function mayPrefetchExtendedContent() {
  if (isFirestoreQuotaBlocked()) return false;
  if (typeof navigator !== 'undefined') {
    if (navigator.onLine === false) return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) return false;
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
    // Try the visible date first, then visit its neighbours in order.
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
        // IndexedDB read only. A deployment or editorial refresh still leaves
        // a complete offline copy available until the reader opens this date.
        const legacy = legacyReaderKey(task.key);
        const keys = legacy ? [task.key, legacy] : [task.key];
        await cache.prime(keys);
        const acceptCached = task.type === 'hours' ? hasCorrectedHours : undefined;
        if (keys.some((key) => cache.hasComplete(key, acceptCached))) {
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
        if (!cache.hasComplete(task.key, acceptCached)) {
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
