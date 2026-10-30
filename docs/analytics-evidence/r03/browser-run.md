# R03 — browser run (127.0.0.1, Browser pane / DevTools Network), 2026-10-26

Setup: QA build `VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true VITE_ANALYTICS_STAGING_URL=http://127.0.0.1:8788`,
`vite preview` on 127.0.0.1:4173; R02 `worker/local-server.mjs` (SQLite file, `INGEST_ENABLED=true`, `ALLOWED_ORIGINS=http://127.0.0.1:4173`).
Synthetic closed day 2026-10-25 seeded into `localStorage.analytics_local_v1` (4 cells, sum n = 9; one prayer id from the public inventory).

| Step | Observed |
|---|---|
| Load QA page | after ~3 s exactly one `POST http://127.0.0.1:8788/v2/ingest → 204` (Network panel; the tool also prints `ERR_ABORTED`, an artefact of `keepalive` — the server answered 204) |
| `window.__analyticsLocal.stagingStats` | `{sent:1, lost:0, …}` |
| `localStorage.analytics_staging_sent_v1` | `["2026-10-25\|web\|4.5"]` (ledger, no ids) |
| `localStorage.analytics_local_v1` | the sent day is gone; only today's `screen_view today` remains |
| Server log | `{"code":"ok","status":204,"cells":4,"rowsWritten":5}` |
| SQLite (`cell_counts`) | 4 rows, **sum(n) = 9** = client sum; no IP/UA/Origin/URL columns exist |
| Reload ×2 | no further POST (server log unchanged) — at-most-once |
| OFF build (`vite build`, no flags) on :4174, 7 s | `window.__analyticsLocal` undefined, no analytics localStorage keys, no resource matching `ingest|analytics|8788` |
