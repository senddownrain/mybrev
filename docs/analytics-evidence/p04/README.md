# P04 evidence (WEB)

Base `origin/main` 6e0b708, Node v24.2.0 (CI uses 20), macOS arm64, JDK 21 + Chromium for Testing (Playwright 1228), build-only dummy VITE_FIREBASE_* from ci.yml. Firestore emulator only; no production access, no analytics network.

| Command | Result |
|---|---|
| `npx eslint .` | PASS (eslint.log, exit 0) |
| `npm run test:analytics` | PASS 52 tests: 51 pass, 1 skipped ("inventory is in sync with the app bundle" needs the bundle next to the repo; run by hand below), 0 fail — includes 6 new parity tests (test-analytics.log) |
| `npm test` | PARTIAL: 1016/1028 pass, 1 FAIL `tests/marian-feast-references.test.mjs` "Marian feast references are structured rules resolved from the Common" — fails identically on a clean `origin/main` worktree (verified), unrelated to analytics (npm-test-summary.txt) |
| `npm run analytics:smoke` | PASS exit 0, 23 screen/metric checks ok (smoke.log, smoke.json) |
| `npm run analytics:perf` | PASS exit 0, A/B builds (flag off/on) on the same emulator data (perf.log); request hosts are the local server/emulator and Google Fonts only |
| `npm run build` | PASS exit 0 |
| `node scripts/analytics/parity.mjs --flutter <flutter p04 checkout>` | PARITY OK, problems [] (Flutter repo evidence has parity.json) |

Drift negatives (all FAIL as intended, then restored): WEB `p75_99` renamed → stale golden + `contract.dart scrollBuckets differs`; Flutter golden bucket changed → 2 parity tests fail; Flutter `hour_switch` hook removed → coverage test fails.

Inventory vs current Flutter bundle: `node scripts/analytics/build-public-inventory.mjs --bundle <ibreviarybyapp>/assets/content --check` says out of date, but a rebuild gives the same 750 ids and the same SHA-256 (480dfd96…); only `bundleContentVersion` metadata differs (1791877294111 → 1792491714388). Not changed in P04.
