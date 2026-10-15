/**
 * Local-only analytics collector (contract v1, docs/analytics-contract.md §5-§8).
 *
 * In-memory state machine: no DOM, storage, timers or network. The host passes a
 * clock and reports lifecycle/scroll facts; the collector turns them into
 * aggregated cells. It is disabled by default (`enabled: false` makes every call
 * a no-op), no screen imports it yet, and it has no code path that sends data.
 */
import {
  LIMITS, MAX_VISIT_SECONDS, MIN_COUNTED_VISIT_SECONDS, SCHEMA_VERSION, SECTIONS,
  SECTION_CONTENT_KIND, SHORT_OPEN_SECONDS, bucketScrollDepth, bucketVisibleSeconds,
  estimateReadingSeconds, validateCell, validatePacket,
} from './contract.js';

/** Background of at least this long closes the visit (contract §7). */
export const BACKGROUND_CLOSE_MS = 5 * 60 * 1000;
/** A re-trigger on the same material within this window is one visit (contract §7). */
export const DOUBLE_TRIGGER_MS = 2000;
/** Local cap on distinct cells held in memory; overflow is dropped and counted. */
export const MAX_LOCAL_CELLS = 2000;

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function coarseAppVersion(version) {
  const match = /^(\d{1,2})\.(\d{1,2})/.exec(String(version ?? ''));
  return match ? `${match[1]}.${match[2]}` : '0.0';
}

/**
 * @param {object} options
 * @param {'web'|'android'|'ios'} options.platform
 * @param {string} options.appVersion any semver-like string, coarsened to major.minor
 * @param {boolean} [options.enabled=false] master switch; false makes everything a no-op
 * @param {'BY'|'OTHER'|'UNKNOWN'} [options.region='UNKNOWN']
 * @param {Set<string>} [options.publicIds] public content_id inventory; without it
 *   materials that need a content_id are not measured (fail closed)
 * @param {() => number} [options.now] epoch milliseconds
 */
export function createCollector({
  platform, appVersion, enabled = false, region = 'UNKNOWN', publicIds = null, now = Date.now,
}) {
  let on = Boolean(enabled);
  /** day -> Map(cellKey -> cell) */
  const days = new Map();
  let cellCount = 0;
  let visit = null; // active visit
  let pending = null; // just-closed visit, held for the double-trigger window
  let visible = true;
  let hiddenAt = null;

  function addCell(day, cell) {
    if (validateCell(cell).length > 0) return;
    const key = JSON.stringify({ ...cell, n: 0 });
    let bucket = days.get(day);
    if (!bucket) { bucket = new Map(); days.set(day, bucket); }
    const existing = bucket.get(key);
    if (existing) { existing.n = Math.min(existing.n + cell.n, LIMITS.maxCellCount); return; }
    // Error cells are exempt from the cap so overflow can be reported; they are bounded
    // by the five error ids per day.
    if (cellCount >= MAX_LOCAL_CELLS && cell.e !== 'measurement_error') {
      addError('queue_overflow', day);
      return;
    }
    bucket.set(key, { ...cell });
    cellCount += 1;
  }

  function addError(errorId, day = utcDay(now())) {
    addCell(day, { e: 'measurement_error', error_id: errorId, n: 1 });
  }

  function measurable(section, contentId) {
    if (!SECTIONS.includes(section)) return false;
    if (!SECTION_CONTENT_KIND[section]) return contentId === undefined || contentId === null;
    return Boolean(publicIds) && publicIds.has(contentId);
  }

  function accrue(v, at) {
    if (!v || v.runningSince === null) return;
    const delta = at - v.runningSince;
    if (delta < 0) addError('clock_anomaly');
    else v.visibleMs += delta;
    v.runningSince = at;
  }

  function finalize(v, endedAt) {
    accrue(v, endedAt);
    v.runningSince = null;
    const seconds = Math.min(v.visibleMs / 1000, MAX_VISIT_SECONDS);
    if (seconds < MIN_COUNTED_VISIT_SECONDS) return;
    const day = utcDay(endedAt);
    const base = { section: v.section };
    const contentId = v.contentId ?? undefined;
    addCell(day, { e: 'screen_view', ...base, ...(contentId ? { content_id: contentId } : {}), n: 1 });
    if (!contentId) return;
    addCell(day, { e: 'text_read', ...base, content_id: contentId, metric: 'fv', bucket: bucketVisibleSeconds(seconds), n: 1 });
    if (seconds < SHORT_OPEN_SECONDS) return;
    if (!v.fits && v.maxScroll === null) { addError('scroll_unmeasurable', day); return; }
    const fraction = v.fits ? 1 : v.maxScroll;
    addCell(day, { e: 'text_read', ...base, content_id: contentId, metric: 'sd', bucket: bucketScrollDepth(fraction, { fits: v.fits }), n: 1 });
    if (Number.isFinite(v.totalChars)) {
      const er = estimateReadingSeconds({ visibleSeconds: seconds, totalChars: v.totalChars, maxScrollFraction: fraction });
      if (er !== null) addCell(day, { e: 'text_read', ...base, content_id: contentId, metric: 'er', bucket: bucketVisibleSeconds(er), n: 1 });
    }
  }

  function commitPending() {
    if (!pending) return;
    finalize(pending.visit, pending.closedAt);
    pending = null;
  }

  function closeActive(at = now()) {
    if (!visit) return;
    accrue(visit, at);
    pending = { visit, closedAt: at };
    visit = null;
  }

  return {
    get enabled() { return on; },

    /** Turning off drops all collected state immediately. */
    setEnabled(value) {
      on = Boolean(value);
      if (!on) this.clear();
    },

    /** A material or section came on screen. `totalChars` / `fits` describe the text. */
    enterView({ section, contentId, totalChars, fits = false } = {}) {
      if (!on) return;
      const at = now();
      if (!measurable(section, contentId)) { closeActive(at); commitPending(); return; }
      if (visit && visit.section === section && visit.contentId === (contentId ?? null)) {
        // Same material again while its visit is active (lang/hash change, double trigger): one visit.
        if (Number.isFinite(totalChars)) visit.totalChars = totalChars;
        if (fits) visit.fits = true;
        return;
      }
      closeActive(at);
      if (pending && pending.visit.section === section && pending.visit.contentId === (contentId ?? null)
        && at - pending.closedAt <= DOUBLE_TRIGGER_MS) {
        visit = pending.visit; // resume: the earlier close was a double trigger
        pending = null;
        visit.runningSince = visible ? at : null;
        return;
      }
      commitPending();
      visit = {
        section,
        contentId: contentId ?? null,
        totalChars: Number.isFinite(totalChars) ? totalChars : null,
        fits: Boolean(fits),
        maxScroll: null,
        visibleMs: 0,
        runningSince: visible ? at : null,
      };
    },

    leaveView() {
      if (!on) return;
      closeActive();
    },

    /** Furthest bottom edge of the viewport as a share of scrollable height; cheap, in-memory. */
    reportScroll(fraction) {
      if (!on || !visit || !Number.isFinite(fraction)) return;
      const clamped = Math.min(1, Math.max(0, fraction));
      if (visit.maxScroll === null || clamped > visit.maxScroll) visit.maxScroll = clamped;
    },

    /** Page/app foreground visibility. Background time never counts as visible time. */
    setVisible(isVisible) {
      if (!on || isVisible === visible) return;
      const at = now();
      visible = Boolean(isVisible);
      if (!visible) {
        hiddenAt = at;
        if (visit) { accrue(visit, at); visit.runningSince = null; }
        return;
      }
      let away = hiddenAt === null ? 0 : at - hiddenAt;
      if (away < 0) { addError('clock_anomaly'); away = 0; }
      hiddenAt = null;
      if (!visit) return;
      if (away >= BACKGROUND_CLOSE_MS) {
        const { section, contentId, totalChars, fits } = visit;
        closeActive(at - away);
        commitPending();
        this.enterView({ section, contentId: contentId ?? undefined, totalChars, fits });
      } else {
        visit.runningSince = at;
      }
    },

    /** Successful user action; call once per action, never per scroll/tap tick. */
    featureUse(featureId, section) {
      if (!on) return;
      addCell(utcDay(now()), { e: 'feature_use', feature_id: featureId, section, n: 1 });
    },

    reportError(errorId) {
      if (!on) return;
      addError(errorId);
    },

    /** Close the open visit (pagehide / app paused) so it is not lost. */
    flush() {
      if (!on) return;
      closeActive();
      commitPending();
    },

    /** Validated contract packets for all collected days, newest data included. Does not send. */
    snapshot() {
      if (!on) return [];
      const packets = [];
      for (const day of [...days.keys()].sort()) {
        const cells = [...days.get(day).values()];
        for (let i = 0; i < cells.length; i += LIMITS.maxCellsPerPacket) {
          const packet = {
            schema_version: SCHEMA_VERSION,
            day,
            platform,
            app_version: coarseAppVersion(appVersion),
            region,
            cells: cells.slice(i, i + LIMITS.maxCellsPerPacket),
          };
          if (validatePacket(packet, { publicIds }).length === 0) packets.push(packet);
        }
      }
      return packets;
    },

    clear() {
      days.clear();
      cellCount = 0;
      visit = null;
      pending = null;
      hiddenAt = null;
    },

    /** Drop whole days older than the local retention window (contract §11). */
    pruneOlderThan(keepDays = LIMITS.maxLocalDays) {
      const cutoff = utcDay(now() - keepDays * 86400000);
      for (const day of [...days.keys()]) {
        if (day < cutoff) {
          cellCount -= days.get(day).size;
          days.delete(day);
        }
      }
    },
  };
}
