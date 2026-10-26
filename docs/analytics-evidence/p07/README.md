# P07 evidence (offline consent / mock transport). Synthetic data only, no network

Base: Draft #160 (`claude/p06-ingest-c0ab7d` @ 72b828f, itself on #138). Env: Node v24.2.0, macOS, no network proxy needed: the tests replace `fetch`, `net.Socket.connect` and `dns.lookup` with throwing counters and assert 0 calls.

| Command | Result |
|---|---|
| `npx eslint .` | PASS (0 problems) |
| `npm run test:analytics` | PASS 45, skipped 1 (SQLite-independent set, pre-existing skip), fail 0 |
| `npm run test:analytics-ingest` | PASS 72/72 (51 P06 + 21 P07), skipped 0 |
| `npm test` | PASS 970, skipped 9 (pre-existing), fail 0 |
| `npm run build` (fake Firebase env, no DSN) | PASS; `grep -rE "analytics_mock\|mock-client\|analytics_local_v1\|__analyticsLocal" dist` = 0 matches (normal build has neither the P07 layer nor the earlier test collector) |
| mutation check: drop the server-flag term from the gate | 2 P07 tests FAIL (gate matrix, kill-switch scenario); restored → 21/21 |
| `npm run analytics:smoke` / `analytics:perf` | NOT TESTED (not needed: no change to `src/`; no Firestore emulator run) |

## Manual demo run (`npm run analytics:consent-demo`, opened from disk in the built-in browser, CSP `connect-src 'none'`)
Transcript of the scripted clicks (counters from the page; `networkCalls` is the page's own counter of blocked fetch/XHR/beacon attempts):

1. consent OFF, 3 × "Read 3 pages", flush → `rejected 3, queue key absent, aggregator 0 cells, transportCalls 0, networkCalls 0`.
2. opt-in, read → queue `D-1: 9 cells, n=28`, still nothing sent.
3. flush → aggregator `9 cells, total n = 28`, `sent 1`, `transportCalls 1`, `networkCalls 0`.
4. read, then REVOKE → queue key absent, `purged 1`, gate INERT.
5. read, flush, relaunch after revoke → everything rejected, `consent=OFF` after relaunch, aggregator unchanged (28).
6. opt-in again, kill switch OFF, read, flush → `rejected`, nothing queued, `transportCalls` unchanged.

Not captured: screenshots (none saved); real-browser Network tab / OS proxy count of analytics requests is covered by the CSP and the in-page counters only: **developer should repeat step "Network = 0" in DevTools** (acceptance step).
