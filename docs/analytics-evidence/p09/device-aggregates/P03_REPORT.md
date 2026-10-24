# P03 — Mobile QA (iOS Simulator + Android emulator), 2026-10-24

Build under test: local branch `local/p03-combined` (NOT pushed) = origin/main `57c78b7` + #33 `af9080d` (P01 fit) + #36 `a02b570` (P04 hooks) → merge `668f778`. Flutter 3.41.4, Xcode 26.4.
Old report: Draft #21 `audit/analytics-v2-ios-simulator` @ `9aa4bd3` (main `014b14a`).
Flags: `--dart-define=ANALYTICS_LOCAL=true` only. No network analytics. Product code untouched.

## Environments
- iOS Simulator: iPhone 16, iOS 18.6, debug build (`flutter run`), app `by.mybrev.testflight2026`.
- Android emulator: AVD analytics_test, Pixel 7, Android 16 / API 36 arm64, 1080x2400, debug APK (179 MB).
- Physical iOS / Android: NOT TESTED (none available).

## Checks
| Check | Result |
|---|---|
| flutter analyze --no-fatal-infos | PASS (8 infos, 0 errors) |
| flutter test test/analytics | PASS (51 passed, 8 skipped) |
| full flutter test | FAIL: 1406 pass, 3 fail, all in `test/lectionary_parity_test.dart` ("Readings screen equals web screen for every legal option") — outside analytics; see P02 #32 triage |

## Scenario matrix (observed in Hive aggregates; JSON in this folder)
| Scenario | iOS sim | Android emu |
|---|---|---|
| today screen_view | PASS (n=2) | PASS (n=2) |
| Hour Laudes, scroll to end | PASS: sd=p100 (fv 60_180s) | PASS: sd=p100 (fv 15_60s) |
| Short song (~280 chars, fits screen) | **PASS sd=fit** (P01 proven; old report: p75_99) | **PASS sd=fit** |
| catalog_open songs / prayers_home | PASS | PASS |
| favorite add/remove (songs) | PASS feature_use both | PASS both |
| Bible bel→ru→bel real UI switch | **PASS**: UI switched to «Синодальный перевод/Бытие», `bible_language_change` n=2, content_id bible:ru:gn | **PASS** same |
| Readings (day) | PASS p75_99 (2 swipes) | PASS p100 (2 swipes; different swipe sizes, not comparable) |
| Mass order (multi-part, 1/5) | OBSERVED sd=p100, but confounded (I rotated to landscape; see note A) | NOT TESTED (tap missed, no cell) |
| Landscape rotate | PASS visually (Mass), no overflow seen | NOT TESTED |
| Background ≥5 min (331 s) | PASS: visit 1 closed on pause with fv 15_60s (background not added); new visit after resume | NOT TESTED |
| Background 9 s | NOT TESTED | NOT TESTED |
| Short/long prayer by ID, Ordo, Vespers, compendium part+node, 7 catalogs, back/forward, deep links, day change, empty/error page, font scale, SafeArea, multi-scrollable | NOT TESTED | NOT TESTED |
| Privacy of dump | PASS: no uuid/device/install/session/user/http/priest/:// strings; region UNKNOWN; platform ios/android; app_version 1.0 | PASS same |

Buffer size: iOS Hive file 4.7 KB, Android 2.6 KB (limit 64 KB). Missing fields: none seen; today has no text_read (not a text) as designed.

## Findings
- **Resolved vs #21:** `sd=fit` for a short text — proven on both platforms. "RUS tap does nothing" (old P2) was an automation miss: switching works and is counted.
- **Note A (unverified, not a confirmed bug):** Mass order is a 5-part list; `sd` reported p100 after one swipe + rotation. Probably per-part scroll metrics (rotation shortened content). Needs a controlled portrait repro with exact scroll distances before deciding whether sd semantics for multi-part texts are acceptable.
- **Note B:** after the app is resumed, a new `screen_view` for the same screen is recorded as a new visit (expected by design; counts are visits, not people).
- Non-analytics: 3 failing lectionary_parity tests on this combined tree (above).
- Tooling note: the iOS Simulator control needs taps with duration ≥0.15 s and screenshots lag ~1 action; Mac slept during the Android Gradle build (reported 21592 s), which inflated one foreground visit to fv=gte600s — clock artifact, not an app bug.

## Performance
NOT MEASURED. Simulator/emulator debug only; release/profile on a physical device required. Debug APK 179,100,545 B (single variant; no A/B built). A/B (flag off/on), cold start, memory, jank p95, I/O at close: NOT MEASURED. Commands for later: `flutter build apk --release [--dart-define=ANALYTICS_LOCAL=true]`, `flutter run --profile -d <device>` + DevTools timeline, 7+ interleaved runs.

## Extract & clean test aggregates
- iOS sim: `xcrun simctl get_app_container <udid> by.mybrev.testflight2026 data` → `Documents/analytics_local_v1.hive`; `strings` the last `[{"schema_version"` frame (Hive is append-log; take the LAST frame). App must be backgrounded (HOME) first to flush.
- Android: `adb shell run-as by.mybrev.playtest2026 cat app_flutter/analytics_local_v1.hive`.
- Clean: `xcrun simctl uninstall <udid> by.mybrev.testflight2026`; `adb uninstall by.mybrev.playtest2026`. Done at the end of this run.

## Side effects / rollback
Flutter auto-migrated ios/ files in the worktree (UIScene, Podfile) — reverted with git checkout. Nothing pushed, no PR created, no publication. Test apps uninstalled, emulator stopped. Local branch `local/p03-combined` exists only in this worktree.

Evidence files: ios_sim_aggregates_final.json, ios_sim_aggregates_run1.json (earlier partial), android_emu_aggregates_final.json, and1–8 Android screenshots (and2 Laudes end, and3 prayerbook, and4 songs, and5 short song, and6/and7 Bible bel/ru, and8 Mass attempt).
