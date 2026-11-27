# F3 — WEB QA scenario log (2026-11-01, base 5d5e10c)

Local only: QA build (`VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true VITE_ANALYTICS_STAGING_URL=http://127.0.0.1:8799`, fake `VITE_FIREBASE_*` from `ci.yml`) via `vite preview` :4173; R02 `worker/local-server.mjs` (same `worker/src/index.mjs`, SQLite as D1) on 127.0.0.1:8799. Port 8788 was held by another process, so 8799 was used. No Cloudflare, no production Firebase. Closed days are SYNTHETIC (`make-seed.mjs`, real collector), not human behaviour.
The seed is written from `/privacy.html` (static page of the same origin, no collector): the app persists its own buffer on `pagehide` and would overwrite a seed written from the app page.

| # | Scenario | Observed (DevTools Network via browser pane + server log + SQLite) | Result |
|---|---|---|---|
| 1 | Seeded closed day 2026-10-31 (7 cells, Σn=7), open app, wait 7 s | exactly 1 `POST http://127.0.0.1:8799/v2/ingest → 204` (the tool prints `net::ERR_ABORTED` for `keepalive`, server answered 204); `stagingStats {sent:1,lost:0}`; `analytics_staging_sent_v1=["2026-10-31|web|4.5"]`; sent day gone from `analytics_local_v1`; server log `{"code":"ok","status":204,"cells":7,"rowsWritten":8}`; SQLite 7 rows, Σn = 7 = client | PASS |
| 2 | Reload ×2 after (1) | server log unchanged, no POST (at-most-once) | PASS |
| 3 | In-app navigation: Hours day screen (`/day/2026-11-01/ora/matins`), `/songs`, `/prayers/favorites`, `/bible`, `/settings` | collector snapshot of today: `screen_view today`, `catalog_open hours_list/songs/favorites`, `screen_view bible` + `text_read bible` (with public ids only, no paths/queries) | PASS (see limits) |
| 4 | Settings: click dark theme, click font-size `+` | `feature_use theme_change` and `feature_use text_scale_change` (section `settings`) appear | PASS |
| 5 | Kill switch: `POST /v2/admin/ingest {"enabled":false}`, seed day 2026-10-30, reload | 1 POST → `503 ingest_disabled`; `stagingStats {lost:1,paused:1}`; `analytics_staging_pause_v1` ≈ +24 h; day dropped, not re-buffered, no 2nd POST | PASS |
| 6 | Network failure: server stopped, seed day 2026-10-31, reload | 1 POST → `net::ERR_CONNECTION_REFUSED`; `{lost:1}`; day dropped; no retry within 7 s; no pause | PASS |
| 7 | Wrong schema, client side: seed a day with a cell carrying `user_id` | collector's `importPackets` rejects the whole packet (validatePacket); NO POST; `handOver()` → all zeros; forged packet purged from `analytics_local_v1` on next `pagehide` | PASS |
| 8 | Wrong schema, server side (curl, ingest switched back on) | valid → 204; `schema_version 3` → 426 `unsupported_schema`; extra field `user_id` → 400 `invalid_packet`; non-JSON → 400 `bad_json`; 20 000 bytes → 413; day 2026-10-01 → 400 `day_out_of_range` | PASS |
| 9 | Normal build (no QA flags) on :4174: open, navigate songs/favorites/bible/settings, fire `pagehide`/`visibilitychange` | `window.__analyticsLocal` and `__analyticsFeature` undefined; localStorage has no `analytics_*` key; 0 requests matching `ingest|analytics|879x`; only the app's own Firebase calls (fake project `demo-mybrev-ci`) | PASS |

DB at the end of the run: 8 rows, Σn = 10 (7 from the browser run + 3 from the curl check of #8, one key overlapping).

Limits (NOT TESTED / not provable here): with fake `VITE_FIREBASE_*` and no production Firestore the Hours/Matins and Song contents do not load, so no reader view (`fv`/`sd`/`er`) was produced by real navigation (the 7-cell seed does carry those cells); the UTC-day rollover was not waited for (synthetic closed day); no real Cloudflare D1, no private dashboard.
