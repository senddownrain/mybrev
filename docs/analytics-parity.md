# Analytics v2 — WEB ↔ Flutter parity (P04)

Scope: prove, with a reproducible guard, that the WEB reference and the Flutter port agree on the
v2 contract, route mapping, visit accounting and `feature_use` coverage. **No contract change**
(`schema_version` stays 2), no network, no Firestore production, no liturgical text. Status words
follow `03_TEST_MATRIX_AND_EVIDENCE.md`.

## What is the guard

| Piece | Where | Role |
|---|---|---|
| Golden | `tests/fixtures/analytics-parity-v2.json` (WEB) = `test/fixtures/analytics/analytics-parity-v2.json` (Flutter), byte-identical | Contract surface (ids, buckets, limits, constants), pinned SHA-256 of `analytics-contract-v2.json` and the public inventory, content-id probes, 28 route cases, 16 synthetic visit scenarios with expected cells |
| Generator | `node scripts/analytics/parity.mjs --write` | Builds the golden **from the WEB sources**. WEB stays the source of truth |
| WEB guard | `tests/analytics-parity.test.mjs` (part of `npm run test:analytics`, already in WEB CI) | Fails if the committed golden is stale, or any route/probe/visit disagrees with the WEB code |
| Flutter guard | `test/analytics/analytics_parity_test.dart` | Replays the same golden through `contract.dart`, `route_mapper.dart`, `collector.dart` (android and ios) |
| Cross-repo check | `node scripts/analytics/parity.mjs --flutter <flutter checkout> --out parity.json` | Compares golden bytes, fixture bytes, the Dart lists in `contract.dart`, the Dart inventory SHA and all 750 Dart ids with WEB. Deterministic `parity.json` report |

The synthetic input contains **no real content**: ids come from the published inventory, texts are
character counts only, time is a fake clock (2026‑10‑15T10:00:00Z).

### When it fails

1. Drift in WEB code → the WEB test names the stale golden. Decide whether it is intended. If yes:
   `node scripts/analytics/parity.mjs --write`, copy the golden to Flutter, fix the Dart port, one
   decision. If no: revert the code.
2. Drift in Flutter → `analytics_parity_test.dart` shows the route/visit id and platform.
3. A contract change (new id, bucket, field) is **not** a parity fix: it is a v2→v3 decision and
   needs its own RFC with both migrations. P04 changes none.

### Inventory (750 ids)

`public-inventory.json` and `public_inventory.dart` are generated from the published app bundle by
`scripts/analytics/build-public-inventory.mjs` / the Dart generator (content version
`1791877294111`, SHA-256 `480dfd96…1311`). Both hold 750 ids (115 prayers, 447 songs, 31
compendium, 146 Bible, 9 hours, `mass:order`, `reading:day`), set‑equal. Nothing was adjusted by
hand. Check against the current Flutter bundle (`assets/content`, content version
`1792491714388`, 2026‑10‑20): `build-public-inventory.mjs --check` reports "out of date" only because
the `source.bundleContentVersion` metadata moved; the 750 ids and the SHA‑256 are identical
(0 added, 0 removed, 0 closed documents in the bundle). The metadata refresh is left to the next
real content publication so P04 does not touch the inventory. After a content publication the count may change; regenerate both from the new bundle, never
edit the number.

## `feature_use` coverage (27 contract ids)

| id | WEB | Flutter | Flutter hook (successful state change, id only) |
|---|---|---|---|
| text_scale_change, theme_change, font_family_change, keep_screen_on_toggle | DONE | DONE (before P04) | `settings_provider.dart` |
| favorite_add / favorite_remove | DONE | DONE (before P04) | `songs_provider.dart`, `settings_provider.dart` |
| share_use | DONE | DONE (before P04) | `reading_detail_screen.dart` |
| psalmody_layout_change, bible_language_change | DONE | DONE (before P04) | `settings_provider.dart` |
| chords_toggle, chord_layout_change | DONE | DONE (before P04) | `songs_provider.dart` |
| mass_language_change, bible_chapter_nav, back_to_top | DONE | DONE (before P04) | `prayer_detail_screen.dart`, `bible_chapter_screen.dart`, `reader_scaffold.dart` |
| **text_settings_open** | DONE | **DONE (P04)** | `app_overflow_menu.dart`: «Шрыфт» panel opened |
| **picker_open** | DONE | **DONE (P04)** | `liturgical_calendar_sheet.dart` (calendar sheet / compact calendar), `readings_screen.dart` (date tap) |
| **date_pick** | DONE | **DONE (P04)** | same sheets: a date chosen in the calendar |
| **hour_switch** | DONE | **DONE (P04)** | `ora_screen.dart` `_openHour` (hour picker and «Далей») |
| **hour_option_select** | DONE | **DONE (P04)** | `hours_options_sheet.dart` `choose` (celebration / variant) |
| **chord_transpose** | DONE | **DONE (P04)** | `song_detail_screen.dart`, only when the clamped value actually changes |
| **mass_section_nav** | DONE | **DONE (P04)** | `prayer_detail_screen.dart`, section chosen in the sections sheet |
| **ordo_diocese_change** | DONE | **DONE (P04)** | `diocese_provider.dart` `toggle` (accepted change) / `setPrimary` (primary actually changed) — covers Settings and Ordo |
| copy_use | DONE | NOT APPLICABLE | Flutter has no copy-text action (no `Clipboard` use) |
| install_prompt_open | NOT APPLICABLE (no install UI in WEB) | NOT APPLICABLE | web-only by contract, and WEB has no custom prompt |
| search_open | DONE (Bible search sheet) | DEFERRED | Flutter search screens exist; P04 excludes search input, owner decides whether opening a search counts |
| search_submit | excluded | excluded | search input is never counted |
| offline_update_apply | NOT APPLICABLE | DEFERRED | content updates apply automatically in the background (`content_updates_provider.dart`); no user action or section to attribute |

Result: WEB 24/27 (unchanged), Flutter **22/27** (was 14; the task brief said 13 — the actual count
before P04, from a source scan, is 14). Remaining five are declared with a reason in
`test/analytics/analytics_feature_coverage_test.dart` and `tests/analytics-parity.test.mjs`; both
fail if a hook disappears, a new one appears unnoticed, or an unknown id is reported. The existing
`transport_and_guard_test.dart` still enforces that every call passes a literal contract id (no
values) and lists the files allowed to touch analytics.

No new buttons were added. Hooks are one-line calls guarded by `kAnalyticsLocal`
(`--dart-define=ANALYTICS_LOCAL=true`); without the flag they do nothing.

## Matrix: screen / metric / platform / QA level

Legend: **unit** = golden replay in both repos; **browser** = `analytics:smoke` Chromium vs local
emulator; **Android / iOS** = device or simulator run (P03 scope, not part of P04).

| Screen | Metrics | WEB unit | WEB browser | Flutter unit | Android | iOS |
|---|---|---|---|---|---|---|
| Today | screen_view | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Readings | fv, sd, er (`reading:day`) | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Hours (laudes/vesper…) | fv, sd, er | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Mass order | fv, sd, er | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Prayer short/long | fv, sd (`fit` only when it fits), er | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Song, Compendium, Bible | fv, sd, er, bible_language_change | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Catalogs (hours list, prayers, favorites, songs, Bible books, compendium) | catalog_open (no screen_view) | DONE | DONE | DONE | NOT TESTED | NOT TESTED |
| Login / Admin / personal prayer / priest-only / unknown | nothing | DONE | DONE | DONE (personal, unknown); Login/Admin NOT APPLICABLE | NOT TESTED | NOT TESTED |

Meaning (unchanged): `screen_view` = opens, not people; `fv` = foreground time; `er` = rough upper
bound estimate of reading time, not proof of reading; no text, query, id of a person, URL or date
of a read material enters a packet.

## Reproduce

```bash
# WEB (Node 20 in CI; 24 locally)
npm ci
npx eslint .
npm run test:analytics            # includes tests/analytics-parity.test.mjs
npm run analytics:parity          # same check + report on stdout
# browser checks need JDK >= 21 for the Firestore emulator and a Chromium:
#   BENCHMARK_BROWSER_PATH=<chromium> VITE_FIREBASE_*=<build-only dummies from .github/workflows/ci.yml>
npm run analytics:smoke
npm run analytics:perf
# cross-repo
node scripts/analytics/parity.mjs --flutter <path to ibreviarybyapp checkout> --out parity.json
```

Rollback: revert the commit; the guard files are additive. The Flutter hooks are independent
one-liners and can be reverted one by one; none changes behaviour without `ANALYTICS_LOCAL=true`.
