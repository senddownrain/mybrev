# MyBrev Web production regression audit — 2026-10-19

Status: confirmed faulty deployment configuration, minimal fix prepared and locally smoke-tested. **The currently hosted site has not passed a direct smoke test; the incident is not declared resolved.**

Audited main: `764aa374b528283f9245105d37826e6bbec8619d`. No merge, deploy, content publication, Firestore/rules/manifest modification, or liturgical text change was performed.

## Deployment evidence and root cause

The successful [Hosting deployment 39311218836](https://github.com/senddownrain/mybrev/actions/runs/39311218836) ran main `764aa37` on 2026-10-19, starting at 19:28 UTC and finishing the Hosting release at 19:31:03 UTC. Job `118260991698` built and uploaded `assets/index-nvnW3EFQ.js`.

PR #142 / commit `764aa374b528283f9245105d37826e6bbec8619d` introduced this workflow without a `VITE_FIREBASE_*` environment on the build step. The existing CI workflow has these bindings, but step/job environments do not transfer between workflows. Firebase deploy's `--project ibreviaryby` and the service-account credential select the Hosting target; they do not populate Vite's client configuration.

A local rebuild of the audited main with all `VITE_*` variables removed succeeded before the fix and produced the **same `index-nvnW3EFQ.js` asset name** recorded in the deployment log. Its six client Firebase fields are `void 0`. A configured build targets `projects/ibreviaryby/databases/(default)` and loads the expected data. This is direct evidence of the defective deployed build, independently of the unavailable Hosting origin.

### Symptom 1: Hours cannot load / client reports offline

`src/plugins/firebase.js` consumes the Vite values at compile time. With projectId missing, the browser logs malformed document paths, including:

- `projects//databases/(default)/documents/liturgicalCalendarMeta/current`
- `projects//databases/(default)/documents/days/ordinary-w29-d2`

The unconfigured bundle cannot load Hours in a clean profile. This establishes the connectivity defect in the deployed build. After the SDK timeout/retry period, the same clean-profile browser displayed the exact reported sentence: `Failed to get document because the client is offline.` The warmup and day-list handlers logged the same FirebaseError. Thus both the malformed-project connection failure and the reported Hours error are reproduced from the deployed build configuration; this message does not establish an actual user network outage.

Separately, Hours UI handlers forwarded raw SDK `error.message` to readers. That presentation defect is confirmed by source inspection and a real browser offline test. The fix routes errors through the existing Belarusian Firestore error mapper, preserving its quota/permission distinctions.

### Symptom 2: standard prayer categories disappear

The unconfigured bundle's category loader independently reports `Failed to get documents from server`; its drawer has none of the three standard categories. The causal path is:

1. `getPrayerContent()` requests `prayers` and `prayerCategories` together through the same unconfigured database.
2. Failed reads leave the public stores empty in a clean profile.
3. `NavigationDrawer.vue` builds the menu from these stores; `buildPrayerCategoryMenu()` also requires a matching permitted prayer for non-admin users.

This is a separately observed category failure caused by the same missing configuration in the reproduced defective build. No evidence indicates that #135 deleted categories or that the production category documents need repair. With the correct configuration, the same code and current public Firestore data expose **Марыйныя, Літаніі, Навэнны** and 114 prayers without authentication. No category policy, fallback, data, or access-control change is proposed.

The current hosted site's exact state still needs direct verification: the session proxy denies `ibreviaryby.web.app` with CONNECT 403 / Chromium `ERR_TUNNEL_CONNECTION_FAILED`. A later deployment outside the inspected Actions history cannot be excluded by this audit. This limitation applies to both symptoms.

## Other reviewed changes

| PR | Commit | Finding |
| --- | --- | --- |
| #135 | `c8bf202` | Devotional office reader, form/view integration and parser tests; no Firebase initialization, menu-category or deployment configuration changes. All five public reader documents rendered in Chromium; alternatives exercised on the four offices. |
| #139 | `05356c7`, bump `58f2860` | Only CONTENT_REVISION changes. No document address or project selection change. |
| #141 | `79ac1c7` | Common office assembly and revision bump; configured smoke and 111 seasonal Common tests pass. No evidence connecting this logic to the deployment configuration failure. |
| #142 | `764aa37` | Confirmed missing client build environment in the successful Hosting deployment. |

`CONTENT_REVISION` changes freshness/revalidation, not document IDs or the persistent cache namespace. `createContentCache()` keeps old complete results if refresh fails and reads old revisions offline. By contrast, **missing projectId changes the public cache namespace from `mybrev-public-ibreviaryby-v1` to `mybrev-public-unconfigured-v1`**, so that defective bundle cannot recover the prior project's application cache. Revision bumps can expose an existing connectivity problem through refresh but do not create this malformed-project failure. No revision rollback or cache deletion is proposed.

Vite embeds `import.meta.env` at build time. Its `define: { 'process.env': {} }` does not replace the `import.meta.env.VITE_*` configuration. The Firestore service worker policy is NetworkOnly and was not modified. Connectivity was checked with fresh browser contexts and service workers blocked, eliminating installed PWA caches as a prerequisite for the observed local results.

## Minimal changes

- Bind the deployment build's Firebase variables exactly as in ordinary CI; also preserve optional analytics/Sentry bindings.
- Stop the deployment build if its client project differs from the fixed Hosting target `ibreviaryby`.
- Validate the six required Firebase client fields in Vite's build configuration before producing an artifact. Diagnostics contain variable names, not values. Development/preview serving remains available.
- Reuse the existing localized error mapper in the day list, resolved Hours loader and Compline loader.
- Add offline unit tests for the build guard and run them in CI.

## Actual verification

Local production build: `npm run build`, served by `npm run preview`, connected to the public production Firestore with no administrator login. Browser: installed Chromium, clean Playwright contexts, no ignored TLS errors. The audit did not use mock liturgical content or emulator data for these smoke checks.

| Check | Result |
| --- | --- |
| 390 × 844, 2026-10-18 | 1 day option; all 9 canonical hour routes render text. |
| 390 × 844, today 2026-10-19 | 4 day options; all 9 canonical hour routes render text. |
| 390 × 844, 2026-10-20 | 2 day options; all 9 canonical hour routes render text. |
| Public prayers/categories | 114 prayer list items; all three standard categories visible without admin login. |
| Five devotional readers | Dead laudes/vespers, Marian laudes/vespers and Gadzinki render substantive text; alternative buttons on the four offices were clicked. |
| Layout | No document horizontal overflow on checked 390px Hours/reader screens. Desktop 1440 × 900 shows today's 4 options. |
| Cold offline Hours | App shell loaded, Firestore requests blocked, actual browser set offline, navigation to uncached Hours: localized connection error with retry; screenshot inspected. |
| Firestore transport | Observed successful browser responses target only `projects/ibreviaryby/databases/(default)`. No page-level JS exceptions in the configured smoke. |
| Build guard | Missing-env build now exits 1 before bundling; configured build succeeds. |
| Targeted tests | 57 pass, 2 skipped: optional private source-parity fixtures unavailable. Includes cache, category menu, devotional reader, assembly, cache recovery and build guard. |
| Config/quota tests | 12/12 pass. |
| Seasonal Commons | 111/111 pass. |
| Changed-file ESLint / diff whitespace | Pass. |
| Direct production browser smoke / hosted-byte comparison | **Blocked by session network policy.** Deployment log asset hash was compared instead; no claim of current-origin smoke success. |

The local snapshot manifest `backups/firestore-snapshot/manifest.json` is absent. No snapshot refresh or mass Firestore audit was run. Live content access was limited to the requested browser smoke flows; no admin/editor actions were invoked. GitHub Actions secret values and settings were not inspected; build/deployment logs and the observed bundle establish the missing build bindings.

The unconfigured-bundle browser also reproduced the category subscription failure and missing standard categories independently of the Hours error. The successful configured smoke and the failed unconfigured smoke used the same main sources and current public database, with only the build environment changed.

Local evidence is retained under `/workspace/artifacts/mybrev-production-audit/`: smoke results, screenshots and test logs. The audit runner is preserved there as investigation evidence, not part of the shipped app.

Remaining production gate: permit the Hosting origin in the environment network configuration, then verify the served bundle and run the same clean-profile Hours/categories/reader flows against `https://ibreviaryby.web.app`. No deployment is authorized by this report.
