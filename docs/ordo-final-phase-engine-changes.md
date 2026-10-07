# Ordo: final phase engine changes (for the Flutter port)

Web branch `feature/final-ordo`. The Dart port in `ibreviarybyapp/lib/ordo` must follow these
changes 1:1. The regenerated parity fixture is
`reports/flutter-ordo-parity/ordo_parity.json.gz` (schema **2**, 2025–2032, 4 dioceses,
built with `--notes-file src/data/ordo/notes.json` = notes revision 4):

```
node scripts/ordo/build-flutter-parity-fixture.mjs --snapshot backups/firestore-snapshot \
  --notes-file src/data/ordo/notes.json --out reports/flutter-ordo-parity/ordo_parity.json.gz
```

Against the previous fixture (schema 1): 20 days change primary/alternatives (Immaculate Heart
collisions), 8 evenings + 28 office/hours records (All Souls on Sunday 2025/2031 + the IH days),
transfers gain `computedDate`, and the note ids changed (notes revision 4, renumbered).

## 1. Display / precedence (`display.js`)

| Case | Before | Now |
|---|---|---|
| Immaculate Heart + another obligatory memorial (13.06.2026, 5.06.2027, 28.06.2025, 21.06.2031 …) | both demoted to optional (`demotedFrom`), weekday primary | **two memorial choices, no weekday**: primary = Immaculate Heart (Marian first by `compareCandidates`), alternative = the other obligatory memorial (also a proper row-11 one); temporal suppressed `weekday-under-memorial`. Rules: `concurrent-obligatory-memorials-legal-choice` + `concurrent-obligatory-memorials-choice`. `demotedFrom` no longer produced. |
| Mary, Mother of the Church + obligatory memorial | same-row memorials already a choice | unchanged for row 10; now also a proper row-11 memorial is a choice (`rules.concurrentObligatoryMemorials: 'legal-choice'` on `mary-mother-church`). |
| Christ the High and Eternal Priest + another **feast** | other feast or CHP `impeded-omitted` | both legal options; the alternative has `provisional: true`; rule `christ-high-priest-collision-both-options` (`status: 'provisional'`). Solemnity collisions unchanged. |
| All Souls on a Sunday (2025, 2031 …) | All Souls primary for everything | `primary` (Mass, readings, colour, title) = All Souls; new `display.officePrimary` = the Sunday (`officeOnly: true`). Rule `all-souls-sunday-split`. The Sunday is **not** in `suppressed`. |

The definitions value `concurrentObligatoryMemorials: 'both-optional'` (published revision 2)
must be read as `'legal-choice'` (same semantics). Bundled definitions are revision 3.

## 2. Resolved day (`index.js`)

New fields on every `ResolvedLiturgicalDay`:

- `sources: { office, mass, split }` — `{ optionId, celebrationId, kind, officeKind, title }`.
  `split` is true only for All Souls on Sunday.
- `officeOptions` — legal Offices of the Hours: `[primary, ...alternatives]`, or `[Sunday]` when split.
  `officeResolution.primary` is built from `officePrimary`; `officeResolution.alternatives` is empty when split.
- `firstVespers` / evening use the Office source (`resolveEvening` reads `display.officePrimary`).
- `books: { lectionaryVolume?, hoursVolume?, noteIds } | null` — see §5.
- candidates may carry `transferOverride`, `transferBlocked`, `impededWithoutTransfer`, `provisional`.
- `readingResolution.*.variants` for All Souls: three `{ id: 'all-souls-mass-N', ordinal }`,
  `variantsKind: 'reading-sets'` (the reading sets themselves come from the readings model).

Hours (`ordoDayOptions.js`) iterate `officeOptions`; the votive Office for the Dead card is not
offered when `sources.split`.

## 3. Year Overrides (`yearOverrides.js`)

Canonical record (legacy `from`/`to` and free-text `source` normalized by `normalizeYearOverride`):

```
{ year, scope, dioceseId?, targetCelebrationId, action,
  originalDate, computedDate?, effectiveDate,     // from / to are mirrors for old builds
  reason, sourceNote?, source: 'auto-transfer'|'manual', status: 'needs-review'|'confirmed', enabled,
  transferRule?, transferCase?, rankEvidence?, generator? }
```

- Defaults: no/unknown `source` → `manual` (free text moves to `sourceNote`); `status` →
  `needs-review` for auto, else `confirmed`.
- A **transfer override** is `action: 'move'` with `source: 'auto-transfer'` or a `computedDate`.
  It is NOT applied by `applyYearOverrides`; the transfer step uses it.
- `selectYearOverrides` returns normalized records; the tag `yearOverride` on a placement now has
  `source`, `status`, `overrideId`.

## 4. Transfers (`transfers.js`, `yearPlan.js`)

- `resolveTransfers(byDate, seasonOf, basePrecedenceOf, { overrides })`: for an impeded solemnity the
  algorithm date is `computedDate`; a matching transfer override (`targetCelebrationId`, `originalDate`)
  sets the effective date (`effectiveDate`; equal to the original date = impeded without transfer).
  Transfer records: `{ celebrationId, from, to, computedDate, rule, override? }`.
- A diocesan solemnity (layer `diocese`) is transferred only when its rank is confirmed by a
  calendar: `src/data/ordo/transfer-rank-evidence.js` (Budslau/Minsk, Josaphat/Vitebsk,
  Bobola + Lahishyn/Pinsk, Mother of Mercy/Grodno). Otherwise `impededWithoutTransfer`,
  `transferBlocked: 'rank-not-source-confirmed'` (suppressed reason `impeded-without-transfer`).
- Unused transfer overrides: `confirmed` ones are applied as plain moves; pending auto ones are
  reported in `plan.staleTransferOverrides`.
- Context flag `ignoreTransferOverrides` (part of the plan cache key) gives the pure algorithm.

Materialization (`transferOverrides.js`): ids `auto-transfer-<year>-<belarus|dioceseId>-<celebrationId>`;
one Belarus record when all four dioceses compute the same transfer of a non-diocesan
celebration. Reconciliation is idempotent (create / unchanged / update only while auto +
needs-review / keep-manual / stale-report). Script: `npm run ordo:materialize-transfers`
(dry run; `--live --apply` to write). Dry run 2025–2035: `docs/ordo-auto-transfers.md`.

## 5. Ordo notes (revision 4)

- New category `books` with `books: { lectionaryVolume?, hoursVolume? }` (published field
  `books` in `liturgicalOrdoNotes`). `selectOrdoNotes` still returns them; the engine moves them
  to `day.books` (most specific selector wins: celebration → day → phase → period) and removes
  them from `day.ordoNotes`. UI: one line in the facts list above the notes.
- Grodno/Pinsk front-matter notes (`basis: 'general-notes'`, `provenance.kind: 'general-notes'`)
  use the existing selector types; `relative` selectors now also use engine ids
  (`easter-sunday`, `ash-wednesday`, `ascension`), `celebration` selectors `palm-sunday`,
  `corpus-christi`, `ash-wednesday`.
- Note ids were renumbered by the rebuild (republish with `ordo:import-calendar --prune`).
