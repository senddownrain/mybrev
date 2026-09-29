# Ordo engine (stage 3)

Pure ES modules in `src/utils/ordo/` that generate the liturgical calendar for any year from
permanent rules and existing MyBrev identities. No Firestore, Pinia or UI; nothing in the
current runtime calls it yet.

## API

```js
import { resolveLiturgicalDate, generateLiturgicalYear } from '@/utils/ordo';

resolveLiturgicalDate('2026-11-12', {
  country: 'BY',                 // default
  diocese: 'vitebsk',            // grodno | minsk-mohilev (alias minsk) | pinsk | vitebsk
  localChurch: {                 // optional LocalChurchContext
    id: 'x', titleCelebrationId: 'sv-casimir', patronCelebrationId: '…',
    dedicationDate: '09-20',     // MM-DD, DD.MM or { month, day }
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

## Stages 4–6

- **Stage 4 (Hours/`days`)**: in `liturgicalStore.resolveContext` use `resolveLiturgicalDate` (or
  `computeSeason` + `toYearOptions`) instead of Firestore `yearOptions`; build `dayOptions` from
  `options[]` only (no Office card for a suppressed weekday or for a fallback template); fetch
  documents with `daysRef`/`fallbackDaysRefs`/`seasonalDateId`; let the component resolver read
  `officeResolution.*.hours` for per-field chains, keep `allowedChoices` as UI choices, use
  `evening` for Vespers/Compline and `firstVespers.chain` to assemble I Vespers without `vesper1*`
  texts; replace `shouldShowTeDeum`, `usesSundayCompletorium`, `hasFirstVespersRank` with the
  descriptor flags; show commemorations via `buildCommemorationDescriptor`.
- **Stage 5 (Readings)**: `getReadingsForDate` takes `readingResolution` and runs its `lookup` in
  order, applying `cycle`/`readingCycle` with `selectReadingLectionaryVariants`; drop the local
  "dynamic > fixed > period" priority.
- **Stage 6 (validation)**: load the stage 1–2 parser output, align by `celebrationId` / date,
  compare with `generateLiturgicalYear(year, { diocese })` and classify
  (`MATCH`, `EXPECTED_DIOCESAN_DIFFERENCE`, …). Parser rules/notes become `dioceseLayer`
  (`add/modify/rules/notes`), `notes[]` (selectors in `notes.js`) or `yearOverrides`.

Open questions are listed in `docs/ordo-engine-ambiguities.md`.
