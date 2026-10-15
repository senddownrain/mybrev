/**
 * DOM glue for the local-only collector (decision D-10 = B: test builds only).
 * Loaded exclusively through the build flag in src/main.js. Everything stays in
 * memory; nothing is sent and nothing is written to storage. Testers read the
 * aggregates with `window.__analyticsLocal.snapshot()`.
 */
import { version as packageVersion } from '../../../package.json';
import { createCollector } from './collector.js';
import inventory from './public-inventory.json';
import { mapRoute } from './routeMapper.js';

const MEASURE_DELAY_MS = 1500;
const MEASURE_ATTEMPTS = 4;
/** Below this much text the screen is a loader or a "not found" page, not a text. */
const MIN_TEXT_CHARS = 200;

export function startLocalAnalytics(router, { massOrderPrayerId, appVersion = packageVersion }) {
  const collector = createCollector({
    platform: 'web', appVersion, enabled: true, region: 'UNKNOWN', publicIds: new Set(inventory.ids),
  });
  let current = null;
  let scrollQueued = false;
  let measureTimer = 0;

  const scrollFraction = () => {
    const root = document.documentElement;
    const total = root.scrollHeight;
    return total > 0 ? (window.scrollY + window.innerHeight) / total : 1;
  };

  function measureText(attempt = 1) {
    if (!current) return;
    const root = document.documentElement;
    const fits = root.scrollHeight <= window.innerHeight + 2;
    const totalChars = (document.querySelector('.v-main')?.textContent || '').length;
    if (current.contentId && totalChars < MIN_TEXT_CHARS) {
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
    measureTimer = window.setTimeout(measureText, MEASURE_DELAY_MS);
  });

  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(() => {
      scrollQueued = false;
      collector.reportScroll(scrollFraction());
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', () => collector.setVisible(document.visibilityState === 'visible'));
  window.addEventListener('pagehide', () => collector.flush());

  window.__analyticsLocal = {
    snapshot: () => { collector.flush(); return collector.snapshot(); },
    clear: () => collector.clear(),
  };
  return collector;
}
