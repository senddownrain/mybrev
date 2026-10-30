/**
 * R03: QA-only transport of the WEB collector to the closed analytics staging (docs/analytics-staging-contract.md).
 *
 * Reachable ONLY through the compile-time flag VITE_ANALYTICS_STAGING=true (see src/main.js); in a normal build this
 * module and the staging URL are not in the bundle. No consent UI is involved: this is an engineering gate for synthetic
 * QA traffic, it does not make real collection permitted. Real collection stays OFF until a separate release card.
 *
 * What leaves the browser: one contract-v2 packet (aggregated cells of ONE CLOSED UTC day, <= 16 KiB) per request, as
 * `text/plain` (no CORS preflight), POST, `credentials: omit`, `referrerPolicy: no-referrer`. No ID of a user / device /
 * session / packet, no path, query, referrer, text or search string: `validatePacket` (whitelist + public inventory) is run
 * on every packet right before sending.
 *
 * Delivery is AT-MOST-ONCE and never retried. A day is REMOVED from the collector and from the persisted buffer (and
 * recorded in a small sent-ledger) BEFORE the request. Timeouts, 4xx/5xx and thrown errors under-count by design.
 * Kill switch: the server answering 503 `ingest_disabled` pauses sending for 24 h and drops the closed day; nothing is
 * queued for later. The host can also call `pause()`.
 *
 * Everything is injected (fetch, key-value store, clock, lock): no DOM here, so it runs under plain Node in tests.
 */
import { LIMITS, validatePacket } from './contract.js';

export const SENT_KEY = 'analytics_staging_sent_v1';
export const PAUSE_KEY = 'analytics_staging_pause_v1';
/** Matches the server window (MAX_DAY_AGE_DAYS = 2): an older day would be answered 400 day_out_of_range. */
export const MAX_DAY_AGE = 2;
/** A closed day with fewer distinct cells is not sent (tiny packets are the most identifying) and is dropped. */
export const MIN_CELLS = 3;
export const REQUEST_TIMEOUT_MS = 5000;
export const PAUSE_MS = 24 * 60 * 60 * 1000;
/** At most this many closed days per flush. */
export const MAX_PACKETS_PER_FLUSH = 3;

const DAY_MS = 86400000;
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Only https, or plain http to the loopback host (local R02 fallback). Anything else disables the transport. */
export function isAllowedEndpoint(url) {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch { return false; }
}

/**
 * @param {object} o
 * @param {string} o.url base URL of the staging (without path)
 * @param {{get,set,remove}} o.kv device-local store (localStorage surface)
 * @param {object} o.collector WEB collector (needs `snapshot`, `takeDays`)
 * @param {Set<string>} o.publicIds public content_id inventory
 * @param {() => void} [o.persist] rewrites the persisted buffer WITHOUT the taken days; must throw if it cannot
 * @param {typeof fetch} [o.fetchFn]
 * @param {() => number} [o.now]
 * @param {() => boolean} [o.isOnline]
 * @param {(job: () => Promise<any>) => Promise<any>} [o.withLock] cross-tab single flight (Web Locks); must skip when taken
 */
export function createStagingTransport({
  url, kv, collector, publicIds, persist = () => {}, fetchFn, now = Date.now,
  isOnline = () => true, withLock = (job) => job(), timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const endpoint = isAllowedEndpoint(url) ? `${String(url).replace(/\/+$/, '')}/v2/ingest` : null;
  const stats = { sent: 0, lost: 0, suppressed: 0, expired: 0, paused: 0, skipped: 0 };
  let busy = false;

  const readList = (key) => {
    try { const v = JSON.parse(kv.get(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const ledgerKey = (packet) => `${packet.day}|${packet.platform}|${packet.app_version}`;
  const pausedUntil = () => { const v = Number(kv.get(PAUSE_KEY)); return Number.isFinite(v) ? v : 0; };

  function pause(ms = PAUSE_MS) { try { kv.set(PAUSE_KEY, String(now() + ms)); } catch { /* storage unavailable: the in-memory stats still stop this page */ } stats.paused += 1; }

  /** Days already handed over (any tab). Used so a stale copy of a sent day in another tab is never re-sent or re-persisted. */
  function wasSent(packet) { return readList(SENT_KEY).includes(ledgerKey(packet)); }

  function markSent(packet) {
    const today = dayNumber(utcDay(now()));
    const keep = readList(SENT_KEY).filter((k) => today - dayNumber(k.split('|')[0]) <= LIMITS.maxLocalDays);
    keep.push(ledgerKey(packet));
    kv.set(SENT_KEY, JSON.stringify(keep)); // throws if the store is unavailable -> caller does NOT send
  }

  async function post(packet) {
    const controller = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(packet),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'error',
        keepalive: true,
        signal: controller?.signal,
      });
      let code = null;
      if (response.status !== 204) { try { code = (await response.json())?.code ?? null; } catch { /* no body */ } }
      return { status: response.status, code };
    } catch { return { status: 0, code: null }; } finally { if (timer) clearTimeout(timer); }
  }

  async function run() {
    const result = { sent: 0, lost: 0, suppressed: 0, expired: 0, reason: null };
    if (!endpoint) { result.reason = 'endpoint_not_allowed'; return result; }
    if (typeof fetchFn !== 'function') { result.reason = 'no_fetch'; return result; }
    if (pausedUntil() > now()) { result.reason = 'paused'; return result; }
    if (!isOnline()) { result.reason = 'offline'; return result; } // nothing taken, nothing lost: tried again on the next trigger
    const today = utcDay(now());
    const closed = (day) => day < today;
    const days = [...new Set(collector.snapshot().filter((p) => closed(p.day)).map((p) => p.day))].sort();
    let budget = MAX_PACKETS_PER_FLUSH;
    for (const day of days) {
      if (budget <= 0) break;
      const packets = collector.takeDays((d) => d === day); // mark: gone from memory
      try { persist(); } catch { result.reason = 'persist_failed'; break; } // cannot persist the removal -> never send (no replay)
      if (dayNumber(today) - dayNumber(day) > MAX_DAY_AGE) { result.expired += packets.length; stats.expired += packets.length; continue; }
      const tiny = packets.length === 1 && packets[0].cells.length < MIN_CELLS;
      if (tiny) { result.suppressed += 1; stats.suppressed += 1; continue; }
      let stop = false;
      for (const packet of packets) {
        if (budget <= 0 || stop) { result.lost += 1; stats.lost += 1; continue; }
        if (wasSent(packet) || validatePacket(packet, { publicIds }).length > 0) { result.suppressed += 1; stats.suppressed += 1; continue; }
        try { markSent(packet); } catch { result.reason = 'ledger_failed'; stop = true; result.lost += 1; stats.lost += 1; continue; }
        budget -= 1;
        const { status, code } = await post(packet);
        if (status === 204) { result.sent += 1; stats.sent += 1; continue; }
        result.lost += 1; stats.lost += 1; // no retry, accepted under-count
        stop = true; // do not hammer a failing endpoint
        if (status === 503 && (code === 'ingest_disabled' || code === 'budget_exhausted')) { pause(); result.reason = code; }
        else result.reason = `http_${status}`;
      }
      if (stop) break;
    }
    return result;
  }

  return {
    stats,
    endpoint,
    wasSent,
    pause,
    isPaused: () => pausedUntil() > now(),
    /** Called at start, on return to the foreground; single flight in this page and (with `withLock`) across tabs. */
    async flush() {
      if (busy) { stats.skipped += 1; return { sent: 0, lost: 0, suppressed: 0, expired: 0, reason: 'busy' }; }
      busy = true;
      try {
        const out = await withLock(run);
        return out ?? { sent: 0, lost: 0, suppressed: 0, expired: 0, reason: 'locked' };
      } finally { busy = false; }
    },
  };
}

/** Browser wiring used by src/main.js (only reachable through the compile-time gate). */
export function createBrowserStagingTransport({ url, collector, publicIds, persist }) {
  const withLock = (job) => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
    if (!locks?.request) return job();
    return locks.request('mybrev_analytics_staging_flush', { ifAvailable: true }, (lock) => (lock ? job() : null));
  };
  return createStagingTransport({
    url,
    kv: {
      get: (key) => window.localStorage.getItem(key),
      set: (key, value) => window.localStorage.setItem(key, value),
      remove: (key) => window.localStorage.removeItem(key),
    },
    collector,
    publicIds,
    persist,
    fetchFn: (...args) => window.fetch(...args),
    isOnline: () => navigator.onLine !== false,
    withLock,
  });
}
