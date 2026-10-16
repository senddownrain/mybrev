# Universal liturgical lookup: Web / Flutter contract

Implemented in Web on branch `feature/universal-liturgical-picker-web`, based on
`origin/main` `b03bdbe2b8c89225db58a904fccdd789e0df2f91` (initial checkout HEAD/main
was `3f23bb152acd48cf134c92e32a6d0c0754b07eea`). Flutter can implement this
contract independently; this change does not require or modify a Flutter checkout.

## Three independent objects

### CatalogEntry

Permanent definition identity, independent of year. A feast has `id`, `title`,
`rank`, `dateRule`, `scope`, `dioceses`, `color`, `templates`, `daysRef`,
`fallbackDaysRefs`, `readingsRef`, `contentStatus`. The source is
`buildCalendarLayers()`, which uses **active published definitions**, falling back
to bundled `calendar-definitions.json`. Diocesan add/modify/suppress are applied
before constructing the list. Year overrides never remove an entry from this
catalog. Definition references and returned rows are not mutated by the preview.

Rows merge only if all definition fields other than diocesan provenance match.
Different titles, ranks, rules, colors **or source IDs** stay separate. In
particular Minsk and Pinsk Josaphat have the same rank but distinct Proper IDs.
A suppression in one selected diocese cannot remove a row in another. The
internal `key` includes the applicable dioceses; permanent `id` is unchanged.

The date-rule vocabulary is `fixed`, `movable`, `named`,
`last-weekday-of-month`. The first is shown as DD.MM; the others show their rule,
never an invented permanent civil date. Name/rank/diocese/nominal DD.MM search
does not depend on year. A DD.MM.YYYY search uses its DD.MM portion and does not
imply permission in that year. Filters are «Усе», «Нерухомыя», «Рухомыя».

A period entry has an ID `period:<source-position>`, `periodKey`, `week`,
`weekday` (Sunday = 1), or `specialDateKey` DD.MM, plus source references. The
catalog includes all potential weekly positions: Advent I–IV, Lent I–V and
week 0 Wednesday–Saturday, Holy Week, Easter I–VII plus Pentecost VIII/Sunday,
Ordinary Time I–XXXIV. Dated Advent entries are 17–24 December; Christmas has
25–31 December, 1–13 January and its Sunday positions. Potential positions exist
in the catalog even if their date or source document does not exist in a year.

Special Advent dates denote **weekday** sources: a Sunday on 17–24 December is
the separate week/Sunday entry. Dated Christmas ferias likewise cannot substitute
for a Sunday; fixed Proper carriers keep their identity on Sunday. January entries belong to the **selected civil
year**, not implicitly to the next year. A date outside the actual Christmas
period never resolves as Christmas. Dated Christmas sources held in fixed
Propers are shown as separate source documents, not fabricated seasonal days.

### CalendarOccurrence

Query inputs: entry, **civil year**, diocese, mode (`hours` / `readings`). Year
appears only after «Адкрыць у календары»: current year, next-year shortcut,
arbitrary integer year in the supported picker range 1583–4099. Dioceses come
from Settings; opening a row preserves the specific applicable diocese without
modifying Settings. A shared entry defaults to the primary diocese of Settings,
even when that diocese is not first in the selected list.

Outputs include `entryId`, `year`, `diocese`, `mode`, `originalDate`,
`effectiveDate`, `optionId`, `status`, `reason`, `canOpenHours`, `canOpenReadings`,
`color`. `getYearPlan()` supplies nominal/effective placements, transfers and
one-year removals. `resolveLiturgicalDate()` supplies legal descriptors. Period
dates are matched against exact semantic context in `getOrdoYear()`, **not**
estimated by weekday arithmetic. Merged temporal identities such as Ash
Wednesday/Easter use the actual Ordo option ID. A fixed carrier of a dated
Christmas source likewise uses the actual legal ID. A replaced temporal Office
is not silently selected as a normal alternative.

| Status | Meaning |
| --- | --- |
| `primary` | The selected mode's primary descriptor names this option. |
| `legal-alternative` | Its descriptor occurs in the selected mode's alternatives. |
| `commemoration` | Ordo permits only commemoratio; no independent Hours/Readings route. |
| `transferred` | Legal descriptor on an effective date different from the nominal date. Both dates are shown. |
| `suppressed/impeded` | Ordo omits/impedes the entry, the mode has no legal descriptor, or the exact period position does not exist. Reason distinguishes these. |
| `not-applicable-in-diocese` | The active diocesan layer excludes the definition. |
| `no-content` | An explicitly loaded preview confirms that the mode has no source content. This never grants permission. |

Hours permission checks `officeResolution.primary/alternatives`; Readings checks
`readingResolution.primary/alternatives`. This distinction matters on All Souls
Sunday: its Mass is legal but its independent Office is not. Commemorations
are checked separately and never promoted. An optional `calendarStatus` retains
rubrical status when confirmed absent content changes display status to
`no-content`; legal booleans remain independent of content availability.
Failures to fetch content do not establish confirmed absence.
An absent yearless Proper does not establish that the prescribed weekday
readings or declared current-day fallback are missing from a calendar date.

If no route is legal, a nearest-year proposal searches forward, then backward
at each distance, up to 12 years. Every proposal is resolved by Ordo again in
the **same diocese and mode**. If none is found, the UI says so and permits
manual year input. No guessed substitute week, period or date is returned.

### ContentPreview

This is an end-to-end source reader, independent of a civil date or permission.
`loadCatalogPreview()` accepts an injectable read-only source; the production
transport uses existing offline-aware reads/public content cache. It only reads
public `days`, `liturgicalProperTexts`, `liturgicalTemplates`, `readings`.
There is no full `days` collection scan, write, migration, audit, or publication.

Proper documents are read by the definition's real IDs, preferring sparse
`liturgicalProperTexts`, then legacy `days`, then explicit fallback references.
Movable sources use their real `_feast` selector. Commons use actual template
IDs, including available seasonal variants via the existing materializer.
Fields and structured instructions are shown **per source**, with separate
labels for Proper and Common. No current-day psalter is invented or assembled
from a convenient year. Canonical period documents are inspected directly;
missing generic positions may have dated sources available separately.

Readings are selected by existing `selectReadingDocuments()`: linked day IDs,
definition title, feast code or exact period identity. Another saint sharing a
date is not used. All stored A/B/C and I/II cycles remain reference views;
structured Mass sets retain set/cycle labels using `readingViewOfSet()` and the
existing `ParsedReadingCard`. Choosing/viewing a reference cycle never writes
a calendar selection. No weekday readings are invented for a yearless memorial.

Preview fields include `sources`, `readings`, `missing`, `errors`, `availability`
(`proper-and-common`, `proper-only`, `common-only`, `none`) and `status`
(`available-sources` / `no-content`). Empty sources, missing documents and failed
reads have explicit Belarusian messages. The screen states it is a source
reference, **not a complete Office for an impeded celebration**. The existing
Markdown conversion/renderer handles the source text safely.

## UI and navigation

Both platforms use «Па перыядзе» / «Па свяце», a result detail card,
«Праглядзець тэксты» and «Адкрыць у календары». There is no mandatory global year.

Web retains `/picker`, with query state (`tab`, search/filter, `entry`,
`catalogDiocese`, `panel`, calendar `year`/`calendarDiocese`, `mode`). Browser
history restores the query, and the explicit search-back button retains filters.
The selected mode controls both calendar navigation and picker bottom navigation.
Immediately before navigation, permission is re-resolved using current active
definitions. Only approved descriptor IDs reach `SelectedDay?option=...` or
`ReadingsByDate?option=...`. No bypass of existing target-screen guards exists.

Catalog vestment markers use `colorInfo().swatch` with a border from
`pickerSwatch()`, exactly the existing `VESTMENT_COLORS`: `albus`, `ruber`,
`viridis`, `violaceus`, `rosaceus`, `niger`. White remains a white fill with a
contrasting gold border. Catalog color is the celebration's own; legal color
segments of the civil date remain a separate existing calendar feature.
Marian decoration cannot introduce a blue vestment color.

| Vestment key | Existing fill | Marker border |
| --- | --- | --- |
| `albus` | `#f3ecd9` | `#d2b15f` |
| `ruber` | `#b33a3a` | same as fill |
| `viridis` | `#4d8a5b` | same as fill |
| `violaceus` | `#7a57a7` | same as fill |
| `rosaceus` | `#d88aa6` | same as fill |
| `niger` | `#2f2a30` | same as fill |

Every marker also has an on-surface contrasting outline; these are references to
the current shared constants, not a second palette.

## Source audit and regression evidence

Before editing, UI → definitions/layers/yearPlan/runtime → content services and
composable → target routes/tests were inspected. The old FeastsPicker used
`yearCelebrations(selectedYear)` and routed directly to the date. The old
PeriodPicker depended on a selected year and assembled date options. Both now
open definitions and sources without granting calendar permission. Existing
calendar resolver, legal day options, commemorations and ordinary content
assembler remain unchanged.

Local `backups/firestore-snapshot/manifest.json` was checked first and opened
through `scripts/lib/firestore-snapshot.mjs`. This local snapshot contains only
`fixedDays`, including `06-12-sv-nicholas`; it does not contain live Commons or
Readings. It was neither refreshed nor copied to public artifacts. Source
selection/rendering is additionally tested with tracked `patchs/db-feasts` and
`patchs/db-templates` input documents. These are test inputs, **not a claim of
live publication completeness**. No live Firestore audit or read was performed
to verify data availability.

Portable expected outputs: `tests/fixtures/liturgical-catalog-occurrences.json`.
Flutter must run the same cases against its current engine and definitions:

- Nicholas: 06.12.2026 is impeded in Advent, white catalog entry, own ID
  `06-12-sv-nicholas`, Common `pastors`; preview succeeds independently, no
  ordinary Hours/Readings option route. In 2027 Ordo makes it a legal alternative.
- Ascension (named movable rule); Annunciation 2027 transfers 25 March → 5 April.
- Josaphat's diocesan ranks/source IDs; independent layer add/modify/suppress;
  annual suppression; suppressing one diocese does not erase another.
- Commemoration versus optional Office; All Souls Sunday's separate mode gates.
- Advent IV absent Saturday, all 17–24 December keys and Sunday distinction,
  Lent opening/Ash Wednesday, Holy Week/Triduum, Easter/Pentecost, Christmas
  civil-January boundary, absent Ordinary Time positions; verified nearby year.
- Real source-ID reads, partial/common-only/absent sources, failed reads, seasonal
  Commons, title/linked-ID reading identity, A/B/C and I/II, source/permission
  independence; no mutation of existing day options.
- Router/history/diocese preservation, correct mode navigation, white/red markers,
  320px and increased text in light/dark themes; real source renderer in a browser.

Commands (PowerShell expands the Ordo file list explicitly):

```powershell
$ordoTests = @(rg --files tests | Where-Object { $_ -match '(^|[\\/])ordo-[^\\/]+\.test\.mjs$' })
node --test @ordoTests
node --test tests/liturgical-picker.test.mjs tests/ordo-date-picker.test.mjs tests/ordo-screen.test.mjs tests/liturgy-ui-references.test.mjs
node scripts/smoke-catalog-ui.mjs
node scripts/smoke-calendar-ui.mjs
npm run build
```

Browser smoke uses the actual picker/source renderer and bottom navigation with
an offline transport replacement; calendar destinations are route stubs. Tests
assert zero external requests. They do not establish that every referenced text
is currently published, nor test production authentication/network availability.
Screenshots/logs remain in ignored `reports/`; no private snapshot is included.

Verified results in the Windows checkout:

| Check | Result |
| --- | --- |
| All `tests/ordo-*.test.mjs` through the PowerShell file list above | 206 passed; 0 failed. |
| Focused command above plus `tests/ordo-catalog.test.mjs` | 57 passed; 0 failed. |
| `node scripts/smoke-catalog-ui.mjs` | Passed actual source display, legal/blocked routes, return state, mode-specific bottom nav, diocese, A/B/C, missing position and source, 320px / 150% text / light and dark; no external requests. |
| `node scripts/smoke-calendar-ui.mjs` | Passed existing Hours / Readings / Ordo controls at 320, 360, 390 and 430px. |
| `npm run build` | Successful production/PWA build; existing large-chunk warning remains. |
| ESLint on added/changed picker modules and browser fixtures | No errors or warnings. |
| `git diff --check` | Passed. |
| `npm test` | 851 tests: 845 passed, 1 failed, 5 skipped. Failure is the existing source-byte hash assertion in `common-seasons-parser.test.mjs`, described below. |

The unrelated full-suite failure is caused by Windows CRLF checkout of
`patchs/sources/common-seasons/01_advent_christmas_utf8.txt`: actual SHA-256
`7491306fd53bbffa2c53c62ede5d4b9627a25a8fdf1aaf9b4f57b52cfc81a2e2`;
normalizing CRLF to LF produces exactly the test's expected
`400d1242eedc3d516c7c8b01ea63e12b6f3fde182ffd32e6649c314550959285`.
The test, parser and volume source have no differences from the base `origin/main`.
No text or assertion was changed to make the hash pass. The PR is draft while
this full-suite/environment check and live published-source completeness remain
unverified outside the local source fixtures.

Changed files are limited to:

- `src/utils/liturgicalCatalog.js`, `catalogOccurrence.js`, `catalogPreview.js`;
- `src/services/catalogPreviewService.js`;
- `src/components/liturgical/FeastsPicker.vue`, `PeriodPicker.vue`,
  `CatalogEntryDetails.vue`, `VestmentMarker.vue`;
- `src/views/LiturgicalPicker.vue`, `src/router/index.js`,
  `src/layouts/default/PickerBottomNav.vue`, `ReadingsBottomNav.vue`;
- `tests/ordo-catalog.test.mjs`, `tests/liturgy-ui-references.test.mjs`,
  `tests/fixtures/liturgical-catalog-occurrences.json`,
  `tests/ui/catalog-harness.mjs`, `tests/ui/catalog-preview-service.mjs`,
  `scripts/smoke-catalog-ui.mjs`, and this document.

## Flutter parity requirements

Keep definition IDs, date-rule types, period keys/week/day/special-date identities,
separate mode gates, statuses and nominal/effective dates identical. Use published
layered definitions, not yearly legal lists. Keep source preview independent and
unassembled, preserve all available reading cycles and Common variants, and give
honest partial/missing/unavailable messages. Revalidate legal option IDs at calendar
navigation. Match the existing palette values and white marker contrast without
confusing catalog color with legal calendar segments. UI layout can be native.
