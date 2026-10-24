/**
 * P07: OFFLINE mock of the future client side (consent + local queue + sender). TEST ONLY / NO DATA SENT.
 *
 * Everything is injected: the key-value store (`kv`), the transport and the clock. There is no fetch, XHR, beacon, socket,
 * URL or SDK here, and nothing in `src/` imports this directory. The "transport" of the demo is a plain function call into
 * the P06 pure core (`handleIngest`) with an in-memory store: see `createMockBackend`.
 *
 * Gate (fail closed): the client is active only when ALL of
 *   - build flag ON (compile-time VITE_ANALYTICS_LOCAL / ANALYTICS_LOCAL in a real build; a constructor argument here),
 *   - server flag ON (kill switch; read through `serverFlag()`),
 *   - the user's consent is ON (default OFF, explicit action only).
 * If any is missing, `offer()` stores nothing, `flush()` sends nothing and no queue key is ever written.
 * With the build flag OFF the client does not even touch `kv`.
 *
 * Delivery is AT-MOST-ONCE: a packet is removed from the persisted queue BEFORE it is handed to the transport and is never
 * retried. A crash, a lost response, a 4xx/5xx or a throw therefore UNDER-counts (counted locally as `lost`), it never
 * double-counts. The consent itself lives only in the device-local `kv`, never in a remote profile.
 */
import { LIMITS, SCHEMA_VERSION, validatePacket } from '../../../src/utils/analytics/contract.js';
import { handleIngest } from './core.mjs';
import { createMemoryStorage } from './storage-memory.mjs';

export const CONSENT_KEY = 'analytics_mock_consent_v1';
export const QUEUE_KEY = 'analytics_mock_queue_v1';
export const MAX_QUEUE_BYTES = 64 * 1024; // same cap as the local test buffer on WEB (localStorage) and Flutter (Hive)
export const MAX_QUEUE_DAYS = LIMITS.maxLocalDays; // 14
/** A day with fewer distinct cells than this is held (and finally expires) instead of being sent: tiny packets are the most identifying. */
export const DEFAULT_MIN_CELLS = 3;
const DAY_MS = 86400000;

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const cellKey = (cell) => JSON.stringify({ ...cell, n: 0 });

/** In-memory `kv` with the surface of localStorage / Hive that the client needs; `ops` counts calls (tests). */
export function createMemoryKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  const ops = { get: 0, set: 0, remove: 0 };
  return {
    ops,
    get: (key) => { ops.get += 1; return data.has(key) ? data.get(key) : null; },
    set: (key, value) => { ops.set += 1; data.set(key, String(value)); },
    remove: (key) => { ops.remove += 1; data.delete(key); },
    has: (key) => data.has(key),
    size: (key) => (data.has(key) ? data.get(key).length : 0),
  };
}

/**
 * The transport contract (same shape as lib/analytics/transport.dart): `send(packet) -> Promise<{ status }>`.
 * Local, in-process only: it calls the P06 pure core with an in-memory store. `lose` simulates a lost request/response.
 */
export function createMockBackend({ now, publicIds, ingestEnabled = true, lose = () => false } = {}) {
  const storage = createMemoryStorage();
  const config = { ingestEnabled };
  const received = { calls: 0, accepted: 0 };
  const env = { config, now, publicIds, storage };
  return {
    storage, config, received,
    setIngestEnabled: (value) => { config.ingestEnabled = Boolean(value); },
    transport: {
      async send(packet) {
        received.calls += 1;
        if (lose()) throw new Error('simulated loss'); // no response at all
        const result = await handleIngest({ method: 'POST', bodyText: JSON.stringify(packet) }, env);
        if (result.status === 204) received.accepted += 1;
        return { status: result.status };
      },
    },
    /** Rows for the report layer (P06 `buildReport`) and for the P08 synthetic dashboard. */
    rows: () => storage.all(),
  };
}

/**
 * @param {object} o
 * @param {boolean} o.buildFlag      compile-time flag (false in every normal build)
 * @param {() => boolean} o.serverFlag  kill switch as seen by the client (remote config in the future)
 * @param {{get,set,remove}} o.kv    device-local store
 * @param {{ send: (packet: object) => Promise<{ status: number }> }} o.transport
 * @param {() => number} o.now
 * @param {Set<string>} o.publicIds
 */
export function createMockClient({
  buildFlag = false, serverFlag = () => false, kv, transport, now = Date.now, publicIds,
  minCells = DEFAULT_MIN_CELLS, maxBytes = MAX_QUEUE_BYTES, ttlDays = MAX_QUEUE_DAYS, onPurge = () => {},
}) {
  const stats = { offered: 0, queuedCells: 0, rejected: 0, sent: 0, lost: 0, overflow: 0, purged: 0 };
  let flushing = false;

  const readConsent = () => buildFlag && kv.get(CONSENT_KEY) === 'true'; // anything but the literal 'true' is OFF
  const active = () => buildFlag && readConsent() && Boolean(serverFlag());

  function readQueue() {
    try {
      const parsed = JSON.parse(kv.get(QUEUE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; } // corrupt -> treated as empty, rewritten on the next write
  }
  function writeQueue(queue) {
    if (queue.length === 0) { kv.remove(QUEUE_KEY); return; }
    let list = queue;
    let text = JSON.stringify(list);
    while (text.length > maxBytes && list.length > 0) { // oldest day first, same as the real test buffers
      list = list.slice(1);
      stats.overflow += 1;
      text = JSON.stringify(list);
    }
    if (list.length === 0) kv.remove(QUEUE_KEY); else kv.set(QUEUE_KEY, text);
  }
  function expire(queue) {
    const today = dayNumber(utcDay(now()));
    return queue.filter((p) => today - dayNumber(p.day) <= ttlDays);
  }
  function purge() {
    if (!buildFlag) return;
    const had = kv.has ? kv.has(QUEUE_KEY) : kv.get(QUEUE_KEY) !== null;
    kv.remove(QUEUE_KEY);
    onPurge(); // also the in-memory collector buffer of the host
    if (had) stats.purged += 1;
  }

  /** Re-checks the gate; a closed gate wipes whatever is queued (fail closed, nothing is kept "for later"). */
  function enforce() {
    if (!buildFlag) return false;
    if (active()) return true;
    purge();
    return false;
  }

  return {
    stats,
    gate: () => ({ build: buildFlag, server: buildFlag ? Boolean(serverFlag()) : false, consent: readConsent() }),
    isActive: () => enforce(),
    consent: {
      get: () => readConsent(),
      /** Only an explicit user action calls this; nothing re-grants after revoke. */
      grant: () => { if (buildFlag) kv.set(CONSENT_KEY, 'true'); },
      /** Stop collecting, wipe the queue and the host buffer, never retry anything that was queued. */
      revoke: () => { if (!buildFlag) return; kv.set(CONSENT_KEY, 'false'); purge(); },
    },
    queue: () => (buildFlag ? readQueue() : []),
    /** A closed day of aggregated cells from the host collector. Merged into the queued day, validated, capped. */
    offer(packet) {
      stats.offered += 1;
      if (!enforce()) { stats.rejected += 1; return { accepted: false, reason: gateReason() }; }
      const errors = validatePacket(packet, { publicIds });
      if (errors.length) { stats.rejected += 1; return { accepted: false, reason: 'invalid_packet' }; }
      const queue = expire(readQueue());
      const same = queue.find((p) => p.day === packet.day && p.platform === packet.platform && p.app_version === packet.app_version);
      if (same) {
        const index = new Map(same.cells.map((c) => [cellKey(c), c]));
        for (const cell of packet.cells) {
          const hit = index.get(cellKey(cell));
          if (hit) hit.n = Math.min(hit.n + cell.n, LIMITS.maxCellCount);
          else if (same.cells.length < LIMITS.maxCellsPerPacket) { const copy = { ...cell }; same.cells.push(copy); index.set(cellKey(copy), copy); }
          else stats.overflow += 1;
        }
      } else queue.push(JSON.parse(JSON.stringify(packet)));
      queue.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      stats.queuedCells += packet.cells.length;
      writeQueue(queue);
      return { accepted: true };
    },
    /** App resume / daily trigger: hands every CLOSED day with >= minCells cells to the transport, once. */
    async flush() {
      const result = { sent: 0, lost: 0, held: 0 };
      if (flushing || !enforce()) return result;
      flushing = true;
      try {
        let queue = readQueue();
        const alive = expire(queue);
        if (alive.length !== queue.length) writeQueue(alive); // expiry is persisted, not only filtered
        queue = alive;
        const today = utcDay(now());
        const due = queue.filter((p) => p.day < today && p.cells.length >= minCells);
        result.held = queue.length - due.length;
        for (const packet of due) {
          if (!enforce()) break; // revoked / kill switch flipped between two sends: stop, queue already wiped
          queue = readQueue().filter((p) => p !== packet && !(p.day === packet.day && p.platform === packet.platform && p.app_version === packet.app_version));
          try { writeQueue(queue); } catch { break; } // cannot persist the removal -> do NOT send (fail closed, no duplicates)
          try {
            const response = await transport.send(packet);
            if (response && response.status === 204) { stats.sent += 1; result.sent += 1; }
            else { stats.lost += 1; result.lost += 1; } // 4xx/5xx: no retry
          } catch {
            stats.lost += 1; result.lost += 1; // thrown/lost: no retry, accepted under-count
          }
        }
      } finally { flushing = false; }
      return result;
    },
  };

  function gateReason() {
    if (!buildFlag) return 'build_flag_off';
    if (!serverFlag()) return 'kill_switch';
    return 'no_consent';
  }
}

export { SCHEMA_VERSION };
