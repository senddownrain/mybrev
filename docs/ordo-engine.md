# Ordo engine (stage 3)

Pure ES modules in `src/utils/ordo/` that generate the liturgical calendar for any year from
permanent rules and existing MyBrev identities. No Firestore, Pinia or UI. Since stages 4–5 the
Hours and Readings runtime resolve every date through it (see *Runtime* below).

## API

```js
import { resolveLiturgicalDate, generateLiturgicalYear } from '@/utils/ordo';

resolveLiturgicalDate('2026-11-12', {
  country: 'BY',                 // default
  diocese: 'vitebsk',            // grodno | minsk-mohilev (alias minsk) | pinsk | vitebsk
  localChurch: {                 // optional LocalChurchContext
    id: 'x', titleCelebrationId: 'sv-casimir', patronCelebrationId: '…',
    dedicationDate: '09-20',     // MM-DD, DD.MM, { month, day } or 'unknown' (last Sunday of October)
    isCathedral: false,
  },
  yearOverrides: [],             // YearOverride[] (see yearOverrides.js)
  notes: [],                     // OrdoNote[] (future src/data/ordo/notes.json)
  dioceseLayer: null,            // extra { add, modify, rules, notes } for the diocese
});
generateLiturgicalYear(2027, context); // ResolvedLiturgicalDay[] for 1.1–31.12
```

`ResolvedLiturgicalDay`:

| field | meaning |
|---|---|
| `date`, `context` | ISO date; normalized country/diocese/local church |
| `period`, `periodPhase`, `week`, `dayOfWeek` | same keys/numbering as `computeLiturgicalContext` (1 = Sunday) |
| `psalterWeek`, `readingCycle` | `calculatePsalterWeek`; `{ liturgicalYear, sunday: A/B/C, weekday: 1/2 }` |
| `color`, `colorAlternatives` | Latin rubrical names (`albus`, `ruber`, `viridis`, `violaceus`, `rosaceus`, `niger`) |
| `candidates[]` | everything found for the date, with `status` `active` / `transferred` / `removed` |
| `primary`, `alternatives[]`, `commemorations[]`, `suppressed[]` | display resolution (with `reason` on suppressed) |
| `options[]` | the legal Offices a picker may show (primary + alternatives only) |
| `officeResolution` | `{ primary, alternatives[], commemorations[], firstVespers, evening }` |
| `readingResolution` | `{ primary, alternatives[], commemorations[] }` built from the same candidates |
| `ordoNotes[]` | matching notes (display-only unless they carry an `effect`) |
| `appliedRules[]`, `appliedLayers[]` | audit trail: transfers, overrides, layer changes, Vespers conflicts … |

## Pipeline

```
movableFeasts  computus + anchors (Ash Wed … Christ the King, Holy Family, Baptism)
season         period / week / phase / psalter week / lectionary cycle
fixedCelebrations  fixedCalendar.js → ids + category + days/readings identities
layers         universal → belarus → diocese (add/modify/rules/notes) → local church
yearPlan       place every celebration in the year → year overrides → transfers
candidates     temporal day + placed celebrations + transferred/removed + Saturday BVM
display        Table of Liturgical Days → primary / alternatives / commemorations / suppressed
office         Office descriptor per legal option; I/II Vespers; Compline; Te Deum
readings       Readings descriptor per legal option (same identities)
notes          selector evaluation for Ordo notes
```

Precedence rows (GNLYC 59) are in `precedence.js`; the temporal row of each date in
`season.temporalPrecedence`. Permanent transfers (`transfers.js`) cover solemnities impeded by a
higher day (next free day outside rows 1–8; Sunday of Advent/Lent/Easter → Monday), the
Annunciation in Holy Week/Easter octave (Monday after Divine Mercy), St Joseph in Holy Week
(Saturday before Palm Sunday) and coinciding solemnities (Lord > BVM > saints). Impeded feasts and
memorials are omitted; memorials on 17–24 Dec, in the Christmas octave and on Lent weekdays
become `commemoratio`.

## Mapping to existing identities

| engine | `days` | `readings` |
|---|---|---|
| temporal candidate `daysRef` | `id` = `getPeriodDayDocumentId` (`<period>-w<week>-d<day>`), `seasonalDateId` = `getSeasonalDateExceptionId` (`advent-DD-12`, `christmas-DD-MM`), `fixedDateOnly` for 25.12, 26.12 … 06.01, `psalterDayId` as in `withPeriodPsalterFallback` | `readingsRef` = `_periodType/_periodWeekNumber/_dayOfWeek` (week 0 → `[0, null]`) or `_date` for Advent 17–24 / Christmas dates |
| fixed celebration `daysRef` | `{ _date, _rank, _place? }`; diocesan variants keep `fallbackDaysRefs` to the universal doc; templates come from the doc's `_templates` | `{ _date }` + `title` hint (for `selectCalendarDayVariants`) |
| movable celebration | `{ _feast: 'feast-…' }` from `FEAST_NAME_MAP` | `{ _feast }` + Sunday cycle |
| local dedication | `{ source: 'template', template: 'church-dedication' }` | Common of the dedication |

Celebration ids are the `patchs/db-feasts` slugs for the rule-relevant celebrations
(`annunciation-lord`, `sv-joseph`, `immaculate-conception`, `presentation-lord`, …) and a
transliterated title slug otherwise. `toYearOptions(year)` reproduces the Firestore `yearOptions`
document, so the engine can replace it.

## Data layers (stage 6a)

| File | Content |
| --- | --- |
| `src/data/ordo/fixed-identities.js` | generated (`npm run ordo:identities`): `fixedCalendar` entry → stable celebration id (the `patchs/db-feasts` slug the evidence uses) + its `days` document ids |
| `src/data/ordo/layers.js` | `BELARUS_LAYER` (national proper; Ostra Brama obligatory) and `DIOCESAN_LAYERS` (`add`/`modify` only, each entry with evidence item ids) — merged with the `_place` entries of `fixedCalendar.js` |
| `src/data/ordo/year-overrides.js` | the four one-year decisions no rule computes (Minsk 2026 St Stanislaus, Grodno 2027 ×3) |
| `src/data/ordo/notes.json` | parser notes; pass them as `context.notes` (the runtime does not load them — 1.3 MB; only the Ordo screen loads them as a lazy chunk) |

Both `layers.js` and `year-overrides.js` are applied by default (`dataYearOverrides: false` turns
the overrides off for a what-if comparison).

## Runtime (stages 4–5)

```
liturgicalStore.resolveContext(date, diocese)
  └─ resolveRuntimeDay(date, { diocese })            src/utils/ordo/runtime.js (memoized)
       ├─ Hours:    fetchDaysForDate (+ extra fixed dates) → buildOrdoDayOptions()  src/utils/ordoDayOptions.js
       │            cards = primary + legal alternatives only; Common variants = templates;
       │            commemorations on the primary card; Office for the Dead = votive (ordinary weekdays)
       │            every card carries `ordo` = optionDescriptor(): officeKind, teDeum, compline/complineDay,
       │            vespers { first | second | of-the-day }, sourceFallbacks, allowedChoices
       │            useResolvedLiturgicalDay → day._ordo; shouldShowTeDeum / getCompletoriumWeekday /
       │            eveningVespersModel read it (legacy rank rules only for days without a descriptor)
       └─ Readings: planReadings(day, { dayId }) → readingsService runs the queries,
                    orderReadingsByPlan() keeps the engine lookup order (no own priority)
```

- The diocese comes from Settings (`src/utils/ordoDiocese.js`, default Minsk–Mahilioŭ) and is part
  of the offline cache keys.
- Year options come from `mergeYearOptions()`: computed by the engine; a Firestore `yearOptions`
  document still overrides field by field and every discrepancy is logged. If the stored document
  changes the period of a date, the store logs it and uses the stored period for `days` lookups.
- I Vespers: whether a celebration has them is the engine's decision (`vespers.type === 'first'`);
  the texts are `vesper1*` field by field, else the celebration's Proper/Common Vespers fields
  (`assembleFirstVespers`).

## Ordo screen (`/ordo`, `/ordo/:date`)

- `src/views/Ordo.vue` + `src/layouts/default/OrdoBottomNav.vue` (day navigation and the shared
  date dialog); drawer entry «Літургічны каляндар».
- View model: `src/utils/ordoScreen.js` (pure): labels, `officeDirections`, `massSummary`,
  `groupOrdoNotes` (category groups; period introductions apart; one-year notes and announcements
  copied from another date are hidden), `buildMonthOverview` over the memoized
  `getOrdoYear(year, context)`, `listTitleCelebrations(diocese)`.
- Notes: `src/utils/ordoNotesLoader.js` — `import('../data/ordo/notes.json')`, a separate chunk
  that the startup code never imports statically (`tests/ordo-screen.test.mjs`).
- Local church: `src/utils/ordoLocalChurch.js` (localStorage `ordoLocalChurch`, off by default;
  Settings → Мой касцёл). `toEngineLocalChurch()` gives the `localChurch` context for the Ordo
  screen and for Hours/Readings (`resolveRuntimeDay(date, { diocese, localChurch })`); the
  content cache keys get a local-church part only when it is set.

## Validation (stage 6b)

`npm run ordo:validate` compares every published day with `generateLiturgicalYear(year, { diocese,
notes })` and writes `docs/ordo-validation-report.md` (+ `reports/ordo-validation.json`). Reviewed
differences are in `scripts/ordo/lib/validation-expectations.mjs`, thresholds in
`scripts/ordo/validation-thresholds.json` (checked by `tests/ordo-validation.test.mjs`).

Open questions are listed in `docs/ordo-engine-ambiguities.md`.
