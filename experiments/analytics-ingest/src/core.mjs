/**
 * Pure core of the offline ingest prototype: gate -> size -> parse -> validate -> normalize -> aggregate -> store.
 * No vendor SDK, no network, no clock of its own (`env.now()` is injected), no logging of content.
 * Nothing in the app imports this directory.
 */
import { LIMITS, SCHEMA_VERSION, validatePacket } from '../../../src/utils/analytics/contract.js';

export const STATUS = Object.freeze({
  OK: 204, BAD_REQUEST: 400, METHOD: 405, TOO_LARGE: 413, UNSUPPORTED_SCHEMA: 426, UNAVAILABLE: 503,
});
/** Fixed technical codes: the ONLY strings that may reach a log. */
export const CODES = Object.freeze([
  'ok', 'ingest_disabled', 'method_not_allowed', 'payload_too_large', 'bad_json', 'unsupported_schema',
  'invalid_packet', 'day_out_of_range', 'region_not_allowed', 'budget_exhausted', 'storage_unavailable',
]);

export const DEFAULT_CONFIG = Object.freeze({
  ingestEnabled: false, // kill switch: fail closed
  allowedRegions: Object.freeze(['UNKNOWN']), // D-04 = «региона нет»; a country header is never read
  maxDayAgeDays: 2, // clock skew / late delivery window (UTC days)
  dailyRowWriteBudget: 80000, // 80 % of the D1 Free 100 000 rows-written/day, see docs
});

const respond = (status, code, extra = {}) => ({ status, code, ...extra });
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);

/** Sums duplicate cells and returns [{ key, n }]; the key is a JSON array of the cell's allow-listed fields. */
export function normalizeCells(packet) {
  const sums = new Map();
  for (const cell of packet.cells) {
    const key = JSON.stringify([
      packet.day, packet.platform, packet.app_version, packet.region,
      cell.e, cell.section ?? '', cell.content_id ?? '', cell.metric ?? '', cell.bucket ?? '',
      cell.feature_id ?? '', cell.catalog_id ?? '', cell.error_id ?? '',
    ]);
    sums.set(key, (sums.get(key) || 0) + cell.n);
  }
  return [...sums].map(([key, n]) => ({ key, n }));
}

/**
 * @param {{ method: string, bodyText: string }} request  (headers are deliberately not part of the interface)
 * @param {{ config?: object, now: () => number, publicIds: Set<string>, storage: object, log?: (entry: object) => void }} env
 */
export async function handleIngest(request, env) {
  const config = { ...DEFAULT_CONFIG, ...(env.config || {}) };
  const log = (code, status, extra = {}) => env.log?.({ code, status, ...extra }); // fixed fields only
  const done = (status, code, extra) => { log(code, status, extra); return respond(status, code); };

  if (!config.ingestEnabled) return done(STATUS.UNAVAILABLE, 'ingest_disabled'); // before anything is read or parsed
  if (request.method !== 'POST') return done(STATUS.METHOD, 'method_not_allowed');
  const bodyText = typeof request.bodyText === 'string' ? request.bodyText : '';
  if (Buffer.byteLength(bodyText, 'utf8') > LIMITS.maxPacketBytes) return done(STATUS.TOO_LARGE, 'payload_too_large');

  let packet;
  try { packet = JSON.parse(bodyText); } catch { return done(STATUS.BAD_REQUEST, 'bad_json'); }
  if (packet && typeof packet === 'object' && packet.schema_version !== SCHEMA_VERSION) return done(STATUS.UNSUPPORTED_SCHEMA, 'unsupported_schema');
  const errors = validatePacket(packet, { publicIds: env.publicIds });
  if (errors.length) return done(STATUS.BAD_REQUEST, 'invalid_packet', { errors: errors.length }); // counts only, never the text of an error

  if (!config.allowedRegions.includes(packet.region)) return done(STATUS.BAD_REQUEST, 'region_not_allowed');
  const today = utcDay(env.now());
  const age = dayNumber(today) - dayNumber(packet.day);
  if (age < 0 || age > config.maxDayAgeDays) return done(STATUS.BAD_REQUEST, 'day_out_of_range');

  const rows = normalizeCells(packet);
  try {
    const result = await env.storage.addCounts({ today, rows, dailyRowWriteBudget: config.dailyRowWriteBudget });
    if (!result.ok) return done(STATUS.UNAVAILABLE, 'budget_exhausted');
  } catch {
    return done(STATUS.UNAVAILABLE, 'storage_unavailable'); // the storage rolled back; the client drops the packet
  }
  return done(STATUS.OK, 'ok', { cells: rows.length });
}

/** Retention: delete counters older than `retentionDays` UTC days (a primary-key range delete). */
export async function cleanup(storage, nowMs, retentionDays) {
  const cutoff = utcDay(nowMs - retentionDays * 86400000);
  return storage.deleteBefore(cutoff);
}

/** Cost model for the D1 Free plan: rows written per UTC day, one upsert per distinct cell per packet. */
export function costModel({ packetsPerDay, cellsPerPacket, budget = DEFAULT_CONFIG.dailyRowWriteBudget, hardLimit = 100000 }) {
  const rowsWritten = packetsPerDay * cellsPerPacket;
  return {
    packetsPerDay, cellsPerPacket, rowsWritten,
    shareOfFreeLimit: Number((rowsWritten / hardLimit).toFixed(3)),
    withinBudget: rowsWritten <= budget,
    maxPacketsPerDayAtThisSize: Math.floor(budget / cellsPerPacket),
  };
}
