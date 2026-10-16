/**
 * DOM glue for the local-only collector (decision D-10 = B: test builds only).
 * Loaded exclusively through the build flag in src/main.js. Nothing is sent.
 *
 * Storage (test builds only): one small localStorage buffer of aggregated cells,
 * written when the page is hidden or closed (never on scroll/tap), capped at
 * 64 KiB, kept for at most 14 days, and wiped by `window.__analyticsLocal.clear()`.
 * It holds no identifiers.
 */
import { version as packageVersion } from '../../../package.json';
import { createCollector } from './collector.js';
import { LIMITS } from './contract.js';
import inventory from './public-inventory.json';
import { mapRoute } from './routeMapper.js';

const MEASURE_DELAY_MS = 1500;
const MEASURE_ATTEMPTS = 4;
const SCROLL_THROTTLE_MS = 200;
/** Below this much text the screen is a loader or a "not found" page, not a text. */
const MIN_TEXT_CHARS = 200;
/** Section a feature use is attributed to when the current screen is a catalog. */
const CATALOG_SECTION = Object.freeze({
  hours_list: 'hours', prayers_home: 'prayers', prayers_all: 'prayers', favorites: 'prayers',
  songs: 'songs', bible_books: 'bible', compendium_home: 'compendium',
});
const STORAGE_KEY = 'analytics_local_v1';
const MAX_STORED_BYTES = 64 * 1024;

export function startLocalAnalytics(router, { massOrderPrayerId, appVersion = packageVersion }) {
  const collector = createCollector({
    platform: 'web', appVersion, enabled: true, region: 'UNKNOWN', publicIds: new Set(inventory.ids),
  });
  let current = null;
  let scrollQueued = false;
  let measureTimer = 0;

  restore();

  function restore() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) collector.importPackets(JSON.parse(stored));
      collector.pruneOlderThan(LIMITS.maxLocalDays);
    } catch {
      collector.reportError('storage_unavailable');
    }
  }

  // Called only when the page is hidden or closed: one small write, no work on scroll/tap.
  function persist() {
    try {
      let packets = collector.snapshot();
      let text = JSON.stringify(packets);
      while (text.length > MAX_STORED_BYTES && packets.length > 0) {
        packets = packets.slice(1); // oldest day first
        collector.reportError('queue_overflow');
        text = JSON.stringify(packets);
      }
      window.localStorage.setItem(STORAGE_KEY, text);
    } catch {
      collector.reportError('storage_unavailable');
    }
  }

  const scrollFraction = () => {
    const root = document.documentElement;
    const total = root.scrollHeight;
    return total > 0 ? (window.scrollY + window.innerHeight) / total : 1;
  };

  function measureText(attempt = 1) {
    if (!current || !current.contentId) return;
    const root = document.documentElement;
    const fits = root.scrollHeight <= window.innerHeight + 2;
    const totalChars = (document.querySelector('.v-main')?.textContent || '').length;
    if (totalChars < MIN_TEXT_CHARS) {
      // Loader or "not found": retry while it may still load, then do not count the visit.
      if (attempt < MEASURE_ATTEMPTS) measureTimer = window.setTimeout(() => measureText(attempt + 1), MEASURE_DELAY_MS);
      else { collector.discardView(); current = null; }
      return;
    }
    collector.enterView({ ...current, totalChars, fits }); // same material: refreshes text facts only
    if (!fits) collector.reportScroll(scrollFraction());
  }

  router.afterEach((to, from, failure) => {
    if (failure) return;
    window.clearTimeout(measureTimer);
    current = mapRoute(to, { massOrderPrayerId });
    if (!current) { collector.leaveView(); return; }
    collector.enterView(current);
    if (current.contentId) measureTimer = window.setTimeout(measureText, MEASURE_DELAY_MS);
  });

  // Trailing throttle on a timer (not rAF: rAF stops when the page is not being painted).
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    window.setTimeout(() => {
      scrollQueued = false;
      collector.reportScroll(scrollFraction());
    }, SCROLL_THROTTLE_MS);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    collector.setVisible(visible);
    if (!visible) persist();
  });
  window.addEventListener('pagehide', () => { collector.flush(); persist(); });

  // A successful user action reported by trackFeature(); the section is the current screen's.
  window.__analyticsFeature = (featureId) => {
    const section = current?.section || CATALOG_SECTION[current?.catalogId];
    if (section) collector.featureUse(featureId, section);
  };

  window.__analyticsLocal = {
    // Closed visits only: the open visit is added when the reader leaves the screen or the page.
    snapshot: () => collector.snapshot(),
    clear: () => { collector.clear(); try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } },
  };
  return collector;
}
