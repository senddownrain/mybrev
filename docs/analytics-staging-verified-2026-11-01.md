# Analytics staging: F1 + F2 verification, 2026-11-01

Base: `origin/main` @ `5d5e10c3837bda823faaeb43f2506b904283ee4b`. Everything here was **read-only** against Cloudflare. No ingest ON, no deploy, no resource created or changed, no Access change, no secret printed. Real user collection stays OFF (release-card not issued).

## Verdict

| Item | Status |
|---|---|
| F1 resources exist (account, D1, ingest Worker, migrations 0001/0002) | **DONE** (read-only) |
| F1 ingest stays OFF | **PARTIAL**: config default is `INGEST_ENABLED=false`, D1 saw 0 writes in 24 h; one GET to `/` returned 404 as designed. The 503 `ingest_disabled` on `POST /v2/ingest` was not requested (not allowed in this task) |
| F1 re-run OFF 8/8 → ON 22/22 → OFF | **BLOCKED**: needs the owner (writes: deploy with `INGEST_ENABLED=true`, real tokens). Runbook A. Last recorded result: contract §6.0, 2026-10-30 |
| F1 Workers/D1 usage before/after | **NOT MEASURED** (only the 24 h counters below; no QA run happened) |
| F1 current Free-plan limits | **NOT MEASURED** (not re-read from Cloudflare docs here; check before the run, Runbook A step 0) |
| F2 reports Worker deployed over staging D1 | **BLOCKED**: Worker `mybrev-analytics-reports-staging` does not exist on the account (Cloudflare code 10007); Access not configured. Runbook B |
| F2 401/403 on real workers.dev, JWT with real team/AUD | **BLOCKED** (nothing deployed) |
| F2 code and UI locally (workerd + SQLite, synthetic) | **DONE** (below) |
| F2 timing / read budget on real D1 | **NOT MEASURED** |
| Gate `DASHBOARD_PRIVATE_STAGING_PASS` | **NOT REACHED** |

## What was checked read-only

- `wrangler whoami` (wrangler 4.153.0): logged in via OAuth, scopes include `workers (write)` and `d1 (write)`. Email/account id not recorded here. Whether this is the project's intended account is the owner's call; the D1 found matches the contract's id, which supports it.
- `wrangler d1 list`: exactly one `mybrev-analytics-staging`, uuid `35c31d78-03fa-4178-b6b3-c116a116b699` (matches `wrangler.toml`), created 2026-10-30T06:29:43Z, size 36.9 kB. No duplicates. (The `num_tables` column showed 0 in `list`; migrations check below is authoritative.)
- `wrangler d1 migrations list DB --remote` (config `wrangler.toml`): "No migrations to apply" → 0001 and 0002 are applied.
- `wrangler d1 info`: `read_queries_24h=2`, `write_queries_24h=0`, `rows_read_24h=2`, `rows_written_24h=0`, replication disabled. These are the 24 h counters at ~2026-11-01 12:00 UTC, not a before/after measurement of a QA run.
- `wrangler deployments list --name mybrev-analytics-staging`: deployments exist (last 2026-10-30T06:34Z). `--name mybrev-analytics-reports-staging`: "Worker does not exist" → R05 not deployed.
- One GET `https://mybrev-analytics-staging.slovo-app.workers.dev/` → `404`, empty body, `cache-control: no-store`, `server: cloudflare`. Matches probe `GET / -> 404`; this does not by itself prove the ingest switch (needs a POST).

## Local checks (synthetic only)

- `node --test experiments/analytics-ingest/test/*.test.mjs` (= `npm run test:analytics-ingest`, Node 24.2.0): **127 tests, 127 pass, 0 fail**. Includes the R05 performance test (93 119 cells / 91 days, reads 55–166 ms on SQLite; not a D1 number).
- `node experiments/analytics-ingest/worker/run-reports-wrangler.mjs` (reports Worker in real workerd, local D1, wrangler 4.153.0, pinned throw-away JWKS): **11/11 PASS**: all three routes 401 without credentials, `/` 404, bearer 200 + `no-store`, RS256 JWT verified by WebCrypto 200, foreign-key JWT 401, expired JWT 401, strict CSP with nonce, CSV every `n >= 5`, token absent from logs.
- Local SQLite shim (`reports-local-server.mjs`), DB seeded with `seed-synthetic.mjs` (93 743 cells, 91 days), two ports: direct (no JWT) and a LOCAL ACCESS SIMULATOR (not Cloudflare):
  - Direct port: `/reports`, `/reports/api/summary`, `/reports/api/summary.csv` → 401 without credentials and 401 with a wrong bearer; the simulator port → 200 for all three. Invalid `days=30` → 400.
  - UI in the browser: banner `QA / SYNTHETIC — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ / ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ`, text states that people/devices/sessions are not in the data; period selector 7 / 28 / «всё хранение (до 90 дн.)»; platform all/web/android/ios; section selector; CSV button; blocks: opens by day, sections, catalogs, fv, er, sd, features, top public materials, measurement errors. All numbers shown as `≥`.
  - **Period is 91, not 90**: `PERIODS = [7, 28, 91]` (91 = 13 weekly blocks = the whole 90-day retention + today). Any wording "90" in the brief means this option.
  - Platforms (opens_shown): 7 d all 4818 / web 2402 / android 1415 / ios 1001; 28 d 18428 / 9376 / 5339 / 3713; 91 d 49017 / 25065 / 14272 / 9680.
  - CSV (28 d): 169 rows, minimum `n >= 5` (0 rows below 5).
  - k suppression nuance: the threshold applies to the **displayed aggregated cell** (day × platform × section, or week × catalog etc.), not to the stored raw counters. A DB with every counter set to 1 still shows cells whose summed `n >= 5` (171 opens); cells with sum below 5 are not shown, and totals are labelled lower bounds. Reading this as "rare underlying cells are hidden" would be wrong.
  - Empty DB returns a valid empty summary (state check in unit tests; the screenshot of an empty panel on real D1 is not done).
- Not done: screenshots saved as files (UI was inspected in the in-app browser only), empty-panel screenshot, 503 `storage_unavailable` on real D1 (covered by `--simulate-storage-error` in tests only).

## Findings that matter for the run

1. `wrangler.reports.toml` has a **placeholder** `database_id` (`00000000-…`). Before deploy the owner must put the same real id as in `wrangler.toml` (not a secret). A deploy with the placeholder would fail or point nowhere; do not commit anything else into that file except `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` (not secrets).
2. The ON probe **ends with the admin switch ON** (last two probe steps flip it off then on). Ingest accepts only if both the `INGEST_ENABLED="true"` variable and the D1 runtime switch allow it. After QA do **both**: redeploy without the var override (default `false`) and send the admin OFF.
3. The Worker verifies the JWT itself, so the bare `workers.dev` host is refused even if the Access application is mispointed; Access is the second layer. Still the Access app must cover the reports hostname, otherwise browsers never get a login.
4. Contract §6.0 and `docs/analytics-week-closeout.md` (still `STAGING_BLOCKED_BY_ACCESS`) are stale; not edited in this PR (task was read-only + this report). Follow-up after the owner's run.

# Runbook

All commands from `experiments/analytics-ingest`. Tokens are exported in the owner's shell from their password manager and never written to files, logs or chat.

## A. F1: OFF 8/8 → ON 22/22 → OFF, quota measurement (owner)

0. Read the current Free limits for Workers and D1 (requests/day, CPU, D1 rows read/written per day, storage) at the Cloudflare docs and copy the numbers with the date into the report. Worst case to check against: `DAILY_ROW_WRITE_BUDGET=80000` writes/day vs the D1 daily write limit; report read cap 20 000 cells per `GET /v2/report`.
1. Baseline (read-only): `npx wrangler d1 info mybrev-analytics-staging` → record `rows_read_24h`, `rows_written_24h`. Dashboard → Workers & Pages → `mybrev-analytics-staging` → Metrics (requests, CPU) and D1 → Metrics: screenshot.
2. OFF 8/8:
   ```bash
   export REPORT_TOKEN=... ADMIN_TOKEN=...   # from the password manager
   node worker/probe.mjs --base https://mybrev-analytics-staging.slovo-app.workers.dev --expect off
   ```
   Expect `all probes PASSED` (8 checks).
3. ON (QA window): `npx wrangler deploy --var INGEST_ENABLED:true`.
4. ON 22/22:
   ```bash
   node worker/probe.mjs --base https://mybrev-analytics-staging.slovo-app.workers.dev --expect on
   ```
   Expect 22 PASS: 204, 400/413/415/426 error cases, 20 parallel = 204, report delta exactly 65, `k=5`, kill switch OFF→503 without redeploy, ON→204.
5. Back to OFF, **both layers**:
   ```bash
   curl -sS -X POST -H "authorization: Bearer $ADMIN_TOKEN" -d '{"enabled":false}' https://mybrev-analytics-staging.slovo-app.workers.dev/v2/admin/ingest
   npx wrangler deploy            # default config: INGEST_ENABLED="false"
   node worker/probe.mjs --base https://mybrev-analytics-staging.slovo-app.workers.dev --expect off
   ```
   Expect 8/8 again (the ingest 503 `ingest_disabled` is part of it).
6. After: `npx wrangler d1 info mybrev-analytics-staging` → deltas of `rows_read_24h`/`rows_written_24h` against step 1 (the probe sends 1 + 20 + several valid packets; compare with the 65-count delta and the row-write budget guard). Dashboard screenshots for requests/CPU. Anything not shown stays NOT MEASURED.
7. Evidence to attach: the four probe outputs, the two `d1 info` outputs, Dashboard screenshots, the current limits with date, `wrangler deployments list` showing the final deployment, SHA of the repo.

## B. F2: reports Worker + Cloudflare Access (owner for 1–4, then Claude can verify)

1. Zero Trust → Access → Applications → Add → Self-hosted. Application domain: the reports Worker host (`mybrev-analytics-reports-staging.<subdomain>.workers.dev`), path `/reports*` (plus the hostname in general is acceptable; the Worker answers 404 elsewhere). Policy: Allow, Include = the owner's emails only (no "Everyone"). Session duration short (e.g. 8 h).
2. Record the team domain (`<team>.cloudflareaccess.com`) and the application **AUD tag** (Application → Overview). Neither is a secret.
3. In `wrangler.reports.toml` set `database_id = "35c31d78-03fa-4178-b6b3-c116a116b699"`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, optionally `ACCESS_ALLOWED_EMAILS`; keep `DASHBOARD_MODE = "qa"`. Optional CLI layer: `npx wrangler secret put DASHBOARD_TOKEN -c wrangler.reports.toml` (≥ 24 chars, enter at the prompt).
4. `npx wrangler deploy -c wrangler.reports.toml`. The Worker has no cron, no ingest route and only SELECTs (`reports-storage.mjs`), but the D1 binding itself is read-write at Cloudflare level: say so in the evidence (read-only is by code, not by permission).
5. Unauthenticated, from a clean shell (no cookies):
   ```bash
   H=https://mybrev-analytics-reports-staging.<subdomain>.workers.dev
   for p in /reports /reports/api/summary /reports/api/summary.csv; do curl -s -o /dev/null -w "$p none %{http_code}\n" $H$p; curl -s -o /dev/null -w "$p badjwt %{http_code}\n" -H 'cf-access-jwt-assertion: a.b.c' $H$p; curl -s -o /dev/null -w "$p badtoken %{http_code}\n" -H 'authorization: Bearer wrongwrongwrongwrongwrong' $H$p; done
   ```
   Expect 401 (or the Access login redirect/403 if Access sits in front) for all nine. Also an incognito browser window to `$H/reports` → Access login page, never the panel.
6. Wrong-identity and expired-token cases: log in with an account **not** in the policy → Access denies (403 page) and, if reaching the Worker with a valid JWT of a non-listed email while `ACCESS_ALLOWED_EMAILS` is set → 403; an expired JWT (re-send a captured one after its `exp`, never printed in chat) → 401; a JWT from another Access app (different AUD) → 401.
7. Authorised: log in as the owner, open `/reports` → panel with banner `QA / SYNTHETIC`; `summary?days=7|28|91`, platform and CSV download → 200; `no-store` on every response (`curl -I` with the bearer, if DASHBOARD_TOKEN is set).
8. Real D1 measurements: for days = 7, 28, 91 time the API (`curl -w '%{time_total}'`, 5 runs) and take the D1 `rows_read_24h` delta per call from `d1 info`; compare with the 20 000-cell read cap. Empty DB: before any QA data, `/reports` shows the empty state and state ≠ error; with OFF ingest the summary shows `intake: switched_off`.
9. Data check: with synthetic QA packets from A in the DB, the panel's `opens_shown` for the day equals the `report` delta (65 for the probe cell, subject to k suppression: a day×platform×section cell below 5 is hidden).
10. Handoff: the private URL and who is allowed go into the owner's private note, never into the repo; screenshots of empty and filled panels.

Gate: `DASHBOARD_PRIVATE_STAGING_PASS` only if steps 5–9 all pass on the real hosts.

## C. Evidence checklist

- [ ] SHA of main used; `wrangler --version`; `whoami` redacted
- [ ] `d1 list`, `d1 migrations list --remote`, `d1 info` before/after
- [ ] Probe logs OFF 8/8, ON 22/22, OFF 8/8 (no tokens)
- [ ] Final state: switch OFF in D1 **and** `INGEST_ENABLED=false` deployment; one more `--expect off`
- [ ] Current Free limits with date and source link; worst-case estimate
- [ ] Access app config screenshot (policy, AUD masked), reports Worker deployment id
- [ ] 401/403/200 matrix for HTML, JSON, CSV: no token, bad token, expired, wrong AUD, wrong email, valid
- [ ] Timing and rows_read for 7/28/91 on real D1; empty-DB screenshot; filled-panel screenshot
- [ ] Doc updates: contract §6.0 and `analytics-week-closeout.md` after the run

# Owner action items (needed to complete F1 and F2)

1. Confirm the logged-in wrangler account is the project's (or give another login). I did not log in or search for tokens.
2. Read and record the current Cloudflare Free limits (Workers requests/CPU, D1 rows read/written, storage) with the date.
3. Run Runbook A steps 1–6 from your shell with `REPORT_TOKEN`/`ADMIN_TOKEN` (or tell me explicitly to run them and provide the tokens through your own shell); explicitly authorize turning ingest ON for the QA window.
4. Create the Cloudflare Access self-hosted application for the reports host with an owner-only policy; give me team domain and AUD (or put them into `wrangler.reports.toml` yourself).
5. Authorize and perform the reports Worker deploy (`wrangler deploy -c wrangler.reports.toml`) with the real `database_id`; optionally set `DASHBOARD_TOKEN`.
6. Provide one account outside the policy and one valid session so the 401/403/200 matrix can be run on the real host (or run Runbook B steps 5–8 yourself).
7. Decide who may see the private panel URL and where it is stored; confirm real collection stays OFF until a release-card.
8. After the run: approve updating contract §6.0 and `docs/analytics-week-closeout.md` (currently stale).
