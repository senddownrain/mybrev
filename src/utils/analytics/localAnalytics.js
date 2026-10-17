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
import { findReaderContent, measureDepth, readerState, scrollParentOf } from './readerSignal.js';

const SCROLL_THROTTLE_MS = 200;
/** Wait for the reader block of a material: quick checks first, then slower ones (≈ 9.5 s in total), then give up. */
const READY_DELAYS_MS = Object.freeze([...Array(8).fill(250), ...Array(10).fill(750)]);
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
  let routeToken = 0; // every route change invalidates pending readiness checks (fast switching, Back)
  let reader = null; // { element, scroller, observer } of the material that is on screen

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
      let packets = collector.snapshot({ includeOpen: true });
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

  function stopObserving() {
    window.clearTimeout(measureTimer);
    reader?.observer?.disconnect();
    reader = null;
  }

  // The view may replace the block while it loads (a hour re-renders its column when the psalms arrive): follow it.
  function bindReader(element) {
    reader?.observer?.disconnect();
    reader = { element, scroller: scrollParentOf(element, window), observer: null, failures: 0, reported: false };
    // Font size change, resize or late content: re-measure on the same throttle (one observed element, no tree walk).
    if (typeof window.ResizeObserver === 'function') {
      reader.observer = new window.ResizeObserver(() => queueMeasure());
      reader.observer.observe(element);
    }
  }

  // Facts of the text that is on screen now: fits / depth of the reader block, never of the whole document.
  function measure() {
    if (!current || !reader) return;
    if (!reader.element.isConnected) {
      const element = findReaderContent(current.section, document);
      if (!element) return; // being re-rendered: the next scroll / resize measures again
      bindReader(element);
    }
    const result = measureDepth(reader.element, window, reader.scroller);
    if (result.unmeasurable) {
      // may be a block that is not laid out yet: report only when it stays unmeasurable on a second look
      reader.failures += 1;
      if (reader.failures >= 2 && !reader.reported) { reader.reported = true; collector.reportError('scroll_unmeasurable'); }
      else if (reader.failures < 2) queueMeasure();
      return;
    }
    reader.failures = 0;
    collector.reportFits(result.fits); // may change back after late loading or a larger font
    if (!result.fits) collector.reportScroll(result.depth);
  }

  function onReaderReady(element, chars) {
    collector.enterView({ ...current, totalChars: chars }); // same material: refreshes the text facts only
    bindReader(element);
    measure();
  }

  function waitForReader(token, attempt) {
    if (token !== routeToken || !current?.contentId) return;
    const element = findReaderContent(current.section, document);
    const state = readerState(element);
    if (state.ready) { onReaderReady(element, state.chars); return; }
    if (attempt >= READY_DELAYS_MS.length) { collector.discardView(); current = null; return; } // loader / not found / error
    measureTimer = window.setTimeout(() => waitForReader(token, attempt + 1), READY_DELAYS_MS[attempt]);
  }

  let routeSeen = false;
  function onRoute(to) {
    routeSeen = true;
    routeToken += 1;
    stopObserving();
    current = mapRoute(to, { massOrderPrayerId });
    if (!current) { collector.leaveView(); return; }
    collector.enterView(current);
    if (current.contentId) waitForReader(routeToken, 0);
  }
  router.afterEach((to, from, failure) => { if (!failure) onRoute(to); });
  // The module is loaded lazily, usually after the first navigation finished: the screen the page was opened on
  // (a direct link to a prayer, a reload) would otherwise never be seen.
  router.isReady().then(() => { if (!routeSeen) onRoute(router.currentRoute.value); }).catch(() => {});

  // Trailing throttle on a timer (not rAF: rAF stops when the page is not being painted). The listener is passive and
  // global (capture) so that the window and a nested scroller are both seen, but only ours is measured.
  function queueMeasure() {
    if (scrollQueued) return;
    scrollQueued = true;
    window.setTimeout(() => { scrollQueued = false; measure(); }, SCROLL_THROTTLE_MS);
  }
  document.addEventListener('scroll', (event) => {
    if (!reader) return;
    if (event.target === document || event.target === reader.scroller) queueMeasure();
  }, { passive: true, capture: true });

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
