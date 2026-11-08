# 28 October 2026: editor/public source mismatch

Investigated against `origin/main` b5d7687 (includes #199), 6 November 2026.
No production writes, collection scans, snapshot refreshes or deployments were performed.
The local `backups/firestore-snapshot/manifest.json` was absent. Read-only service-account
REST requests were limited to `_date == '28.10'` in `days` and `liturgicalProperTexts`
(limit 10), and individual source documents. Credentials are never included here.

## Proven cause

The editor and public resolver preferred different collections for the same ID:

| Stage | Source / result |
| --- | --- |
| Old `DayEditor.loadDay()` | `days/28-10-sv-simon-jude-apostles` exists, so it returned before checking Proper |
| Stored legacy `vesperInter` | Correct `хто рупліва`; updateTime `2026-10-28T18:32:39.257237Z` |
| Public `buildOrdoDayOptions()` | Prefers `liturgicalProperTexts/28-10-sv-simon-jude-apostles` |
| Stored Proper | `_schema: 2`, `_celebrationId: sv-simon-jude-apostles`, `_templates: [apostles]`, `_defaultTemplate: apostles`; **no `vesperInter`**, no rule for that field; updateTime `2026-10-13T11:39:08.307845Z` |
| `assembleOffice()` | No own override/rule, so the Vespers descriptor supplies `common:apostles` |
| Actual text | `liturgicalTemplates/apostles.vesperInter`, updateTime `2026-10-18T11:21:22.109289Z`; contains `хторупліва` |
| Temporal fallback | `days/ordinary-w30-d4` (ordinary week 30, Wednesday), different intercessions; not selected for this field |
| Public route | `fetchContentForDate` → `contentDayMap` → `findResolvedDayById` → `useResolvedLiturgicalDay` → `Vesper.vesperDay.vesperInter` |
| Display | `Inters` → `AlternativeText` → `getLiturgicalAlternatives(..., 'intercession')` → `formatIntercessions` → `v-html` |

The service's actual pure functions were executed on the four live documents, with
`resolveRuntimeDay('2026-10-28')`, Minsk–Mahilioŭ. The public result was `_assembly:
{ choice: 'apostles', template: 'apostles', sparse: true }`. Its `vesperInter` was
byte-for-byte the Common, not the corrected legacy value. Caching that assembled day
preserves this source selection; removing the cache would still select the typo.

## HTML and Unicode evidence

`␠` denotes U+0020. There are **no inline tags** at the disputed word boundary.

Legacy Firestore and old editor preview:

```html
<p style="text-align: justify;">–дай усім, хто рупліва сее слова, з радасцю збіраць плён.</p>
```

Visible: `–дай␠усім,␠хто␠рупліва␠сее␠слова,`

`хто р`: `U+0445 U+0442 U+043E U+0020 U+0440`.

Common Firestore, selected assembly, and alternative HTML:

```html
<p style="text-align: justify;">–дай усім, хторупліва сее слова, з радасцю збіраць плён.</p>
```

Visible: `–дай␠усім,␠хторупліва␠сее␠слова,`

`хтор`: `U+0445 U+0442 U+043E U+0440`.

After `formatIntercessions`, the response begins with
`<span class="intercessions__marker">–</span>&nbsp;дай усім, хторупліва сее слова, …`.
The formatter changes the dash presentation and paragraph classes, not the missing
space inside `хторупліва`. This rules out hypothesis C for the live example.
Hypothesis A is also excluded for the already-saved legacy correction: the correct
U+0020 exists in the server document. No historical request log is available, so
this does not reconstruct the user's original click sequence or commit payload.

## Code changes

- Prefer the published, non-obsolete Proper in the editor, matching public assembly.
  Resolve Common-choice links to the base Proper, preserve exact diocesan IDs and
  keep ordinary/unpublished feasts editing `days`. A read failure stops editing;
  it cannot silently redirect writes to a legacy copy or create a blank day.
- Load the editing document from the server. For Proper previews, revalidate the
  existing Common cache. Show the destination path and the inherited source path.
- Keep existing Quill staging: “Захаваць поле” updates `v-model`; “Захаваць усё”
  builds a sparse update of changed own fields/rules, commits the existing batch,
  invalidates the existing public cache and reads every changed document from the
  server. Only exact successful readback produces the success notification.
- Sparse edits create a feast-specific own override, which the public assembler
  already prioritizes over `_fieldRules`, Commons and temporal inheritance.
- No word-specific replacement is added to application code or HTML formatting.

## Production repair still required

The code fix does not migrate the correction from `days` or modify the Common.
The prepared, unapplied [single-field patch](2026-10-28-vesperInter-proposed-patch.json)
contains the complete old/new HTML for `liturgicalTemplates/apostles.vesperInter`.
It changes only `хторупліва` to `хто рупліва` by inserting U+0020. This corrects the
shared source for all Offices inheriting it. Require an exact current-value check
and separate owner permission before applying it.

Alternatively, after deploying the editor fix, edit/save the inherited field for
this feast; that writes `liturgicalProperTexts/28-10-sv-simon-jude-apostles.vesperInter`
as an own override. The Common then remains unchanged for other feasts.
Do not automatically copy every legacy field: it would defeat the sparse model.

## Validation and limits

- `node tests/day-editor-persistence.test.mjs`: eight regressions, including this
  live-data example, save/reopen/public equality across Office text fields,
  references, source variants, ordinary days, readback rejection and inline spaces.
- `npm test`: 1,119 passed, 11 skipped, zero failures (full suite, with local
  network/process permissions). The initial sandboxed run failed four files due
  to denied local sockets, browser launch and child processes; these pass with
  those permissions.
- `npm run lint` and `npm run build`: passed. Build retains the existing large
  chunk advisory.
- `npm run smoke:day-editor`: actual DayEditor, Quill, public services, Pinia,
  persistent cache, Vesper and formatting, with a **local Firestore double**.
  Checks the exact changed document/field payload, staged-vs-persisted state,
  reload/reopen, existing cache, fresh session, rejected commit and bad readback.
  This is not a Firebase SDK/emulator or production write test.
- The live Firestore source chain was verified read-only as described above.
  Direct browsing of `ibreviaryby.web.app` is unavailable under the environment's
  network allowlist. No claim is made that the deployed site is already fixed.
- After merge, deployment and an approved data correction (or an editor save),
  verify the supplied public URL in the same browser, a new session and after
  the existing 15-minute cache TTL on another device. Confirm `хто рупліва` in
  DOM text and the server field. No Hosting deploy has been attempted here.
