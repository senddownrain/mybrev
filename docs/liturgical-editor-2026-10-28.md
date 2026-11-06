# Editor/public mismatch on 28 October 2026

Status: root cause confirmed by four targeted production reads and replay through the public resolver. No production writes or Hosting deploy. The production page still needs the approved data correction and a post-publication check.

## Evidence

Read on 6 November 2026 using the supplied service account in memory. The local snapshot manifest was absent; no collection scans, snapshot refresh, or live collection audit was performed. Only these documents were read:

| Document | Relevant state | Firestore updateTime |
| --- | --- | --- |
| `days/28-10-sv-simon-jude-apostles` | `vesperInter` contains `хто рупліва` | `2026-10-28T18:32:39.257237Z` |
| `liturgicalProperTexts/28-10-sv-simon-jude-apostles` | `_schema: 2`, `_templates: [apostles]`; no own `vesperInter` or rule for that field | `2026-10-13T11:39:08.307845Z` |
| `liturgicalTemplates/apostles` | `vesperInter` contains `хторупліва` | `2026-10-18T11:21:22.109289Z` |
| `days/ordinary-w30-d4` | Temporal fallback for this date; not the selected intercessions source | `2026-08-28T13:23:55.582574Z` |

The legacy field has:

```html
<p style="text-align: justify;">–дай усім, хто рупліва сее слова, з радасцю збіраць плён.</p>
```

The Common has:

```html
<p style="text-align: justify;">–дай усім, хторупліва сее слова, з радасцю збіраць плён.</p>
```

With visible spaces: `хто␠рупліва` versus `хторупліва`. The boundary is `U+043E U+0020 U+0440` in `days`, and `U+043E U+0440` in the Common. There are no intervening tags, NBSPs or other hidden characters at this boundary. The full field strings and codepoint excerpts were retained locally under ignored `outputs/editor-investigation`; no credentials or complete documents are committed.

## Data path and cause

1. Before this fix `DayEditor.loadDay()` reads `days/<route id>` first and returns immediately when it exists. Only a missing legacy day leads to `liturgicalProperTexts`.
2. `InlineEditor.startEditing()` seeds Quill from that model (or, for a sparse Proper, the assembled preview). `Захаваць поле` copies Quill HTML into the parent model only. It does not contact Firestore.
3. `Захаваць усё` forms a batch. Legacy days use `batch.set(..., {merge: true})`; sparse Propers use changed own fields and `_fieldRules`, plus explicit field deletions. `sourceCollection/sourceDocId` determine the target.
4. The corrected production `days` field proves persistence of the space. Historical client payloads and click telemetry are unavailable, so the exact past browser operation cannot be reconstructed. Reopening the old editor reads the same corrected legacy document.
5. Public `fetchDaysForDate()` loads fixed legacy days and published sparse Propers. `buildOrdoDayOptions()` prefers `liturgicalProperTexts`; it uses legacy fixed days only when no Proper was published. The editor used the opposite priority.
6. For this date `assembleOffice()` resolves `vesperInter` as `common:apostles`: no own Proper field, no overriding rule, then the feast Office's Common chain. The temporal day does not win. Other rules, such as `vesperPr -> officeOfReadingsPr`, do not change intercessions.
7. `contentDayMap()` and `findResolvedDayById()` return the assembled legal Office for the route. Persistent caches store that result and the templates separately. PR #199 marks both stale after save, but refetching still selects the unchanged Common.
8. `useResolvedLiturgicalDay()` supplies `Vesper.vue`; on this date evening Vespers are those of the selected day. `Inters.vue -> AlternativeText.vue -> getLiturgicalAlternatives() -> formatIntercessions()` preserves the original missing separator. Replay using the four actual Firestore documents gives the same missing space before and after formatting.

Thus hypothesis A is disproved for the stored correction, B is confirmed, and C is disproved for this reproduction. No runtime word-specific whitespace substitution was added.

## Code change

The editor now prefers a valid published sparse Proper over a legacy day, including `--apostles` and `--day` route variants. Missing Propers still allow ordinary days and unpublished legacy feasts. Permission or network errors do not silently switch to the legacy copy. Server reads open the actual persisted source; the UI identifies the save destination and inherited provenance. An inherited edit becomes an own Proper override, which takes precedence over rules and Common content for that field.

Save success follows batch acknowledgement and a server read comparing exact HTML and field deletions. Map key ordering does not cause false mismatches. The Proper baseline comes from the readback. Cache invalidation from #199 remains after commit. A failed source load cannot save an empty fallback form.

## Production correction, not applied

`liturgical-editor-2026-10-28.patch.json` contains the exact old/new field values for **only** `liturgicalTemplates/apostles.vesperInter`. It inserts one U+0020 between `хто` and `рупліва`. Compare the complete field to `expectedOldValue` before applying, abort on drift, and use an update of this field only. This corrects the actual inherited source, so every Office using this Common receives the correction. It does not copy or migrate legacy days, change rules, or change other fields (including `vesper1Inter`).

Alternatively, after deploying the editor fix, an administrator can repeat the edit on this celebration: it will save an own `liturgicalProperTexts/28-10-sv-simon-jude-apostles.vesperInter` override, correcting this celebration alone. These are alternatives; neither action has been executed here.

The checked-in template import fixture also contains the typo. A future reimport must reconcile this editorial correction rather than overwrite it from the unchanged historical fixture.

## Verification and limits

- Targeted tests cover the live document topology on 28.10.2026, public source priority, exact save/readback/reopen values, Common variants, ordinary/unpublished days, error handling, deleted overrides, other fields (`laudesInter`, `vesperHymn`, `vesperR`), inline spaces/entities, and old persistent cache/new cache instances.
- Complete `npm test` with local process/network permissions: 1136 tests, 1125 passed, 11 skipped, zero failed. The first sandboxed run could not run local servers, Chromium or some child processes; rerunning with those local permissions resolved all four failed files.
- ESLint and production build passed. Build reports the existing large-chunk advisory.
- Passed: `scripts/smoke-liturgical-editor.mjs` runs the real Vue DayEditor and Quill with a local-only document transport. `EDITOR_SNAPSHOT_DIR=outputs/editor-investigation` replayed the four actual read documents; no Firebase connection or production writes. It checked local field save, the single-field batch target, readback, reopening, public assembly/formatting and a second browser context. The save-field button was activated with the keyboard because long imported HTML overlapped its pointer hit area in the isolated harness (which does not load the full application layout). This does not substitute for a real production write/read roundtrip or certify the deployed editor's layout.
- Direct access to the requested Hosting URL is blocked by this environment's outbound policy (proxy CONNECT HTTP 403). No deployed-page DOM or production save after the fix is claimed.

Remaining acceptance check: after an approved data update and publication of the code, open the exact production URL, edit/save/reopen the field, inspect the server readback and public DOM after reload, in a fresh session and with an old cache. No production completion claim should be made until this check succeeds.
