/* global Response, btoa */
/**
 * MyBrev analytics PRIVATE READ API + dashboard (R05). A separate Worker from the ingest Worker (own wrangler config, own secrets),
 * bound to the same D1 database with READ-ONLY code (reports-storage.mjs has SELECTs only; the ingest, admin and cron paths are not imported here).
 *   GET /reports                      dashboard page (HTML, per-response CSP nonce)
 *   GET /reports/api/summary          ?days=7|28|91&platform=all|web|android|ios&section=all|<section>  -> k-suppressed summary (JSON)
 *   GET /reports/api/summary.csv      same filter -> CSV of that summary (already suppressed numbers only)
 *   anything else                     404 ; other methods 405
 * Every /reports* request is authorised first (Cloudflare Access JWT verified in the Worker, or bearer DASHBOARD_TOKEN): 401 / 403 otherwise.
 * All responses: Cache-Control: no-store. No request data is stored or logged (log lines = fixed codes).
 * Mode: DASHBOARD_MODE = "qa" (default; synthetic/QA banner) or "live" (only with a non-empty LIVE_RELEASE_CARD, else 503 mode_not_cleared).
 */
import { SECTIONS, PLATFORMS } from '../../../../src/utils/analytics/contract.js';
import inventory from '../../../../src/utils/analytics/public-inventory.json' with { type: 'json' };
import titleFile from '../../dashboard/public-titles.json' with { type: 'json' };
import { csp, renderPage } from '../../dashboard/ui.mjs';
import { PERIODS, buildSummary, dayOf, summaryToCsv } from '../../src/reports-rollup.mjs';
import { authorize } from './reports-auth.mjs';
import { createReportsReader } from './reports-storage.mjs';

const K = 5;
const SECURITY = {
  'cache-control': 'no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow', 'cross-origin-resource-policy': 'same-origin', 'cross-origin-opener-policy': 'same-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'interest-cohort=(), geolocation=(), camera=(), microphone=()',
};
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...SECURITY, 'content-type': 'application/json; charset=utf-8', 'content-security-policy': API_CSP, ...extra } });
const bare = (status, extra = {}) => new Response(null, { status, headers: { ...SECURITY, 'content-security-policy': API_CSP, ...extra } });
const log = (entry) => console.log(JSON.stringify(entry));

const publicIds = inventory.ids;
const titles = titleFile.titles;

export function parseFilter(searchParams) {
  const known = new Set(['days', 'platform', 'section']);
  for (const key of searchParams.keys()) if (!known.has(key)) return null;
  const days = Number(searchParams.get('days') ?? 7);
  const platform = searchParams.get('platform') ?? 'all';
  const section = searchParams.get('section') ?? 'all';
  if (!PERIODS.includes(days)) return null;
  if (platform !== 'all' && !PLATFORMS.includes(platform)) return null;
  if (section !== 'all' && !SECTIONS.includes(section)) return null;
  return { days, platform, section };
}

export function createReportsWorker({ now = () => Date.now(), fetchImpl } = {}) {
  async function summary(env, filter) {
    const reader = createReportsReader(env.DB);
    const t = now();
    const fromDay = dayOf(t - (filter.days - 1) * 86400000); // only the selected window is read
    const [{ rows, truncated }, off] = await Promise.all([reader.cellsFrom(fromDay), reader.ingestSwitchedOff()]);
    return buildSummary(rows, { now: t, ...filter, k: K, publicIds, titles, mode: env.DASHBOARD_MODE === 'live' ? 'live' : 'qa', intake: off ? 'switched_off' : 'not_switched_off', truncated });
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const { pathname } = url;
      if (pathname !== '/reports' && !pathname.startsWith('/reports/')) return bare(404);
      const auth = await authorize(request, env, { now: now(), ...(fetchImpl ? { fetchImpl } : {}) });
      if (!auth.ok) return json(auth.status, { code: auth.status === 403 ? 'forbidden' : 'unauthorized' });
      if (request.method !== 'GET') return bare(405, { allow: 'GET' });
      if (env.DASHBOARD_MODE === 'live' && !env.LIVE_RELEASE_CARD) return json(503, { code: 'mode_not_cleared' });
      try {
        if (pathname === '/reports' || pathname === '/reports/') {
          const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
          return new Response(renderPage(nonce), { status: 200, headers: { ...SECURITY, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp(nonce) } });
        }
        if (pathname === '/reports/api/summary' || pathname === '/reports/api/summary.csv') {
          const filter = parseFilter(url.searchParams);
          if (!filter) return json(400, { code: 'invalid_filter' });
          const result = await summary(env, filter);
          if (pathname.endsWith('.csv')) {
            return new Response(summaryToCsv(result), { status: 200, headers: { ...SECURITY, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="mybrev-analytics-summary.csv"', 'content-security-policy': API_CSP } });
          }
          return json(200, result);
        }
        return bare(404);
      } catch {
        log({ code: 'reports_storage_unavailable', status: 503 });
        return json(503, { code: 'storage_unavailable' });
      }
    },
  };
}

export default createReportsWorker();
