# Analytics two-week baseline (2026-10-23)

Measured on current `main`, no unmerged fixes. Local logs are not committed; rerun with the commands below.

## Versions

| Repo | main SHA | Toolchain |
|---|---|---|
| `senddownrain/mybrev` | `5b88950c25d0908ebf477edc120b44ea7ea826cd` | Node 24.2.0, npm 11.3.0 (CI uses Node 20) |
| `senddownrain/ibreviarybyapp` | `86390f5fa0ab3266ee18708e8fc2911d85792bb7` | Flutter 3.41.4 / Dart 3.11.1 (pubspec: `>=3.41.4`) |

Open Drafts, not merged: WEB #137, #138; Flutter #21.

## WEB results

| Command | Result |
|---|---|
| `npm ci` | PASS (first attempt hit ECONNRESET, retry passed) |
| `npx eslint .` | PASS |
| `npm run test:analytics` | PASS: 46 tests, 45 pass, 0 fail, 1 skipped |
| `npm test` | FAIL: 1014 tests, 1002 pass, 1 fail, 11 skipped |
| `npm run build` | PASS |

Failing test: `tests/marian-feast-references.test.mjs:20` "Marian feast references are structured rules resolved from the Common" — `vesper1Ps1` resolves to `undefined`. Not analytics-related. Class: UNCLASSIFIED, liturgy area. The assertion expects the Sorrows memorial to get `vesper1Ps1` from the Common, but the assembled day has none; last touched by `4c007d1` (Saturday memorial by rubrics). Needs the liturgy owner.

**CI gap:** `.github/workflows/ci.yml` runs selected test groups (including `test:analytics`) but not `npm test`, so this failure is not seen by CI.

## Flutter results

| Command | Result |
|---|---|
| `flutter pub get --enforce-lockfile` | PASS |
| `flutter analyze --no-fatal-infos` | PASS, 8 infos |
| `flutter test test/analytics` | PASS: 44 pass, 1 skipped |
| `flutter test` | FAIL: 1398 pass, 1 skipped, 3 fail (about 6.5 min) |

| Failing test | Observation | Class |
|---|---|---|
| `prayerbook_stage5_test.dart:457` "Prayer category uses a single shared menu for management" | expected `/prayers/categories`, got `/prayers/category/user-category` | **STALE TEST (proven):** the screen opens via `context.push`, the destination is found, but `routeInformationProvider.value` still holds the underlying route. Asserting `routerDelegate.currentConfiguration.last.matchedLocation` makes the whole file pass (probe, reverted). Introduced by #26, whose CI ran only 2 tests |
| `ordo_day_flow_test.dart` "Rosary memorial has default weekday and assembled Marian Office" | expected hymn HTML differs from actual | **UNCLASSIFIED, content area.** Not caused by #27: the file also fails on `a8cc5ff^` (same assertion not confirmed). Needs the liturgical-text owner; no content touched here |
| `lectionary_parity_test.dart` "Flutter Readings screen equals the web screen for every legal option" | 10 `route-day-id` mismatches (grodno, our-lady-trakai: app id has `-memoria-ad-libitum` suffix); `documentedDifferences` is 0 | **UNCLASSIFIED, data parity** between web and app route ids; either a real divergence or an undocumented accepted difference |

The historical 31 failures after `8751196` did **not** reproduce on current `main`: the five named files (`readings_stage4_test`, `mass_reading_sets_widget_test`, `android_layout_lab_test`, `liturgical_screen_smoke_test`, `lectionary_model_test`) pass, apart from the three above which are different tests.

**CI gap:** `flutter-pr-ci.yml` ran only `test/liturgical_alternatives_test.dart` and `test/pastors_hymn_test.dart`. A green PR check did not cover the three failures above.

## Proposed CI changes (Flutter branch `ci/analytics-baseline-20261023`)

- New job `analytics-tests` in `flutter-pr-ci.yml`: `flutter test test/analytics`, 15 min timeout.
- New `flutter-full-suite.yml`: `workflow_dispatch` only, full `flutter test`, log uploaded as artifact (14 days), 30 min timeout. No schedule until a manual run confirms duration on the runner.
- First full-suite run on GitHub is triggered by a temporary `pull_request` trigger in the workflow (workflow_dispatch needs the file on `main`). Remove that trigger before merge.

## Node 24 / `node:sqlite` (Draft #138, not merged)

#138 adds `test:analytics-ingest` (`node --test experiments/analytics-ingest/test/*.test.mjs`), where `sqlite.test.mjs` needs `node:sqlite`. WEB CI uses Node 20, so do not change the main job. Proposal for the #138 branch: a separate job `analytics-ingest` with `node-version: '24'`, `npm ci`, `npm run test:analytics-ingest`, path-filtered to `experiments/analytics-ingest/**`. Not applied or run.

## File owners and parallel-work risks

| Area | Open PRs touching it | Risk |
|---|---|---|
| WEB `.github/workflows/ci.yml` | none open | proposal above touches only #138 |
| WEB `src/utils/analytics/*`, `tests/analytics-*` | #137, #138 (docs / experiments) | low; keep contract changes out of P00 |
| WEB liturgical data and Marian tests | #146, #150 | content area, do not edit from analytics work |
| Flutter `flutter-pr-ci.yml` | #23 (Codex cloud environment), #30 | possible workflow conflicts; rebase before merge |
| Flutter `lib/analytics/*` | #21 (docs only) | low |

## Status lists

- MUST FIX: 1 WEB + 3 Flutter failing tests above (classify first); WEB CI does not run `npm test`.
- NOT TESTED: GitHub runner results for the new workflows, #138 on Node 24 `node:sqlite` in CI, iOS/Android devices.
- EXTERNAL GATE: legal review and owner approval for any network analytics.

## Rerun

```bash
# WEB
npm ci && npx eslint . && npm run test:analytics && npm test && npm run build
# Flutter
flutter pub get --enforce-lockfile && flutter analyze --no-fatal-infos
flutter test test/analytics && flutter test
```
