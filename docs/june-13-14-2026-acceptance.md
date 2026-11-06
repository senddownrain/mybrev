# 13–14 June 2026: acceptance, 6 November 2026

Status: **BLOCKED on actual liturgical content**, not certified by passing fixture tests.
Companion: https://github.com/senddownrain/ibreviarybyapp/pull/60

## Live read-only findings

The authorized service account was used in memory for exactly 12 targeted document GETs, using a self-signed JWT and the configured HTTPS proxy. No Firestore write, manifest publication, migration, deployment or release was performed. No private key or complete snapshot is committed.

All eleven `days/ordinary-w10-d7.vesper{Hymn,Ant1,Ant2,Ant3,Ps1,Ps2,Ps3,R,AntMag,Inter,Pr}` are **byte-for-byte identical** to `days/feast-trinity.vesper1*`. All eleven `days/ordinary-w11-d1.vesper1*` are empty. The bundled temporal documents have the same text as live Firestore. Therefore the Saturday fallback currently renders I Vespers of the Trinity beneath the XI Sunday title, both online and offline. Completeness and field routing cannot certify correctness.

The Trinity collect starts «Божа, ласкавы Ойча, Ты спаслаў на свет свайго Сына…»; XI Sunday's actual collect starts «Усемагутны Божа, наша моц і надзея…». The independent Web audit now blocks this inconsistent Sunday collect even without external HTML. This is a diagnostic, not a replacement for independent source comparison.

The exact repair candidates are all eleven `days/ordinary-w11-d1.vesper1*` fields, or the incorrect `days/ordinary-w10-d7.vesper*` source fields. Do not copy Sunday II Vespers wholesale. Do not automatically replace the Saturday document: check its other consumers and retain any legitimately shared psalm texts. The expected wording has NOT been independently verified here. `https://lh.catholic.by/` is denied by the environment proxy (CONNECT 403); fresh pages for 13 and 14 June 2026 are still required. No fabricated wording or unverified text patch was added.

Other live documents checked: `days/feast-heartofmary`, three `days/13-06-sv-anthony-padua--{pastors,doctors-of-church,religious}`, `liturgicalProperTexts/13-06-sv-anthony-padua`, and Commons `liturgicalTemplates/{blessed-virgin-mary,pastors,doctors-of-church,religious}`. These provide the memorial material; required texts assemble without empty fields. The data fields checked against the bundle agree (excluding import timestamps). The sparse Anthony Proper and Marian Common support the intended Proper/Common/weekday assembly.

## Validation and limits

- Synced the existing PR with current `main`, retaining all new work; no new PR, merge into main, or deployment.
- Regression now checks all non-Vespers Office fields in every Marian/Anthony variant across Minsk-Mohilev, Grodno, Pinsk and Vitebsk, no Te Deum on memorials, Saturday I Vespers routing, and every Sunday II Vespers field on 14 June. These tests validate assembly/provenance, not the truth of contaminated source text.
- CI additionally runs `content_offline_test.dart` and `ordo_content_update_test.dart`: bundled cold start, overlays, update hashes, atomic publication/crash recovery and calendar rebuild. See the final PR head's CI for execution results.
- The corresponding Web runtime assembled 24 date/diocese/variant combinations from the targeted live material: no empty required non-Vespers fields. Web visual smoke used production build, locally seeded assembled cache and blocked external requests: actual readers for Marian Lauds, Readings, daytime prayer, Saturday Vespers, Anthony Lauds and Sunday Vespers; light/dark, 390 px, 1.0/1.4 scale. No JS errors or horizontal overflow; inspected real screenshots confirm the Trinity error and Sunday's II Vespers.
- Flutter SDK, Android SDK/emulator and iOS device are absent locally. Flutter Chrome and native smoke were not performed. CI unit/widget tests are not a visual device check. Reproduce with `flutter devices`, then `flutter run -d chrome` on this branch; choose 13/14 June 2026 and each diocese, both memorials and Common variants, light/dark, large font, scroll and links. Repeat cold offline launch and after a content update/restart. Native smoke remains necessary before release.

Before merge: obtain the independent dated source, resolve the incorrect I Vespers content through a separately authorized publication (or a fully sourced reviewed bundled fix), rerun cross-platform text checks and targeted UI smoke. This task explicitly forbids Firestore writes, so no publication was attempted.

Web validation: full offline suite passed (1119 passed, 11 skipped, zero failures), targeted Hours/cache/source-audit tests passed, ESLint passed, production/PWA build passed. New audit regressions and 14 June routing assertions also passed after the audit changes. Inspected screenshots and the redacted live audit are in `audit-evidence/june-13-14-2026/`. No service-account data are included. The visual cache was seeded locally from the actual read-only data; this does not certify a live Firebase browser connection or first-install offline download.

Read-only diagnostic: `node scripts/liturgy/audit-heart-first-vespers.mjs --live` accepts injected `FIREBASE_SERVICE_ACCOUNT_B64` in memory, falling back to the local key-file argument when absent. Default mode remains offline snapshot only. Independent comparison still requires `--page path/to/13-june-2026.html`.
