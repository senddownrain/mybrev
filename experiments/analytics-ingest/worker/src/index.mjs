/* global Response, TextEncoder, TextDecoder */
/**
 * MyBrev analytics STAGING Worker (R02). Routes:
 *   POST /v2/ingest            public, contract v2 packet <= 16 KiB -> 204 / 4xx / 503
 *   OPTIONS /v2/ingest         CORS preflight for allow-listed origins only
 *   GET  /v2/report            Authorization: Bearer REPORT_TOKEN (put Cloudflare Access in front too) -> k-suppressed report
 *   POST /v2/admin/ingest      Authorization: Bearer ADMIN_TOKEN, {"enabled":false} -> runtime kill switch (no redeploy)
 *   anything else              404 / 405
 * Fail closed: INGEST_ENABLED must be exactly "true"; unset tokens make report/admin answer 401. Nothing about a request
 * (body, URL, headers, IP, User-Agent, Origin) is stored or logged; log lines carry fixed codes and counters only.
 */
import { LIMITS } from '../../../../src/utils/analytics/contract.js';
import inventory from '../../../../src/utils/analytics/public-inventory.json' with { type: 'json' };
import { cleanup, handleIngest } from '../../src/core.mjs';
import { buildReport } from '../../src/report.mjs';
import { createD1Storage } from './d1-storage.mjs';

const publicIds = new Set(inventory.ids);
const REPORT_K = 5;
const DEFAULT_RETENTION_DAYS = 90; // project working value for staging, see docs/analytics-staging-contract.md

const int = (value, fallback) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const bare = (status, headers = {}) => new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });

function configFrom(env) {
  return {
    ingestEnabled: env.INGEST_ENABLED === 'true',
    maxDayAgeDays: int(env.MAX_DAY_AGE_DAYS, 2),
    dailyRowWriteBudget: int(env.DAILY_ROW_WRITE_BUDGET, 80000),
  };
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const [x, y] = [new Uint8Array(ha), new Uint8Array(hb)];
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function authorised(request, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false; // unset / weak secret: nobody gets in
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), secret);
}

/** Reads at most maxPacketBytes + 1 bytes: a huge body is never buffered. Returns null when over the limit. */
async function readCapped(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > LIMITS.maxPacketBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.maxPacketBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin');
  // Origin is NOT an access control (anyone can forge it outside a browser); it only decides whether a browser may read the reply.
  return origin && allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }
    : { vary: 'Origin' };
}

const log = (entry) => console.log(JSON.stringify(entry)); // fixed fields only (code, status, counters)

async function ingest(request, env, storage) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return bare(204, cors);
  if (request.method !== 'POST') return bare(405, { allow: 'POST, OPTIONS', ...cors });
  const config = configFrom(env);
  if (config.ingestEnabled) {
    try { if (await storage.ingestSwitchedOff()) config.ingestEnabled = false; } catch { return bare(503, cors); } // fail closed
  }
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (config.ingestEnabled && type !== 'application/json' && type !== 'text/plain') return bare(415, cors);
  const bodyText = config.ingestEnabled ? await readCapped(request) : ''; // OFF: the body is never read
  if (bodyText === null) { log({ code: 'payload_too_large', status: 413 }); return bare(413, cors); }
  let rowsWritten;
  const wrapped = { ...storage, async addCounts(args) { const r = await storage.addCounts(args); rowsWritten = r.rowsWritten; return r; } };
  const result = await handleIngest({ method: 'POST', bodyText }, {
    config, publicIds, storage: wrapped, now: () => Date.now(),
    log: (entry) => log({ ...entry, ...(rowsWritten !== undefined ? { rowsWritten } : {}) }),
  });
  return result.status === 204 ? bare(204, cors) : json(result.status, { code: result.code }, cors);
}

async function report(request, env, storage) {
  if (!(await authorised(request, env.REPORT_TOKEN))) return bare(401, { 'www-authenticate': 'Bearer' });
  try { return json(200, buildReport(await storage.all(), { k: REPORT_K })); } catch { return json(503, { code: 'storage_unavailable' }); }
}

async function admin(request, env, storage) {
  if (!(await authorised(request, env.ADMIN_TOKEN))) return bare(401, { 'www-authenticate': 'Bearer' });
  let body; try { body = JSON.parse(await readCapped(request) || '{}'); } catch { return json(400, { code: 'bad_json' }); }
  if (typeof body?.enabled !== 'boolean') return json(400, { code: 'invalid_request' });
  try { await storage.setIngestSwitch(body.enabled); } catch { return json(503, { code: 'storage_unavailable' }); }
  return json(200, { ingest_switch: body.enabled ? 'on' : 'off', master_variable: env.INGEST_ENABLED === 'true' ? 'true' : 'false' });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const storage = createD1Storage(env.DB);
    try {
      if (pathname === '/v2/ingest') return await ingest(request, env, storage);
      if (pathname === '/v2/report') return request.method === 'GET' ? await report(request, env, storage) : bare(405, { allow: 'GET' });
      if (pathname === '/v2/admin/ingest') return request.method === 'POST' ? await admin(request, env, storage) : bare(405, { allow: 'POST' });
      return bare(404);
    } catch {
      log({ code: 'internal_error', status: 500 });
      return bare(500);
    }
  },
  /** Cron trigger: retention. Days strictly older than today - RETENTION_DAYS are deleted. */
  async scheduled(_event, env) {
    const deleted = await cleanup(createD1Storage(env.DB), Date.now(), int(env.RETENTION_DAYS, DEFAULT_RETENTION_DAYS), { maxDayAgeDays: int(env.MAX_DAY_AGE_DAYS, 2) });
    log({ code: 'retention', deleted });
  },
};
