# Ordo: Firestore follow-ups (runbook)

Data follow-ups of the Ordo engine work (`docs/ordo-engine-ambiguities.md` items 18, 21–29).
Everything is analysis-first: plans are generated locally, reviewed, and only then applied with a
service-account key. Nothing here changes the app code.

| Script | Writes | Output |
| --- | --- | --- |
| `scripts/ordo-fetch-public-cache.mjs` | nothing (anonymous REST reads) | `reports/ordo-firestore-cache/` |
| `scripts/ordo-migrate-ranks.mjs` | only with `--apply --confirm ordo-migrate-ranks` | `reports/ordo-migration-plan.json` (+ `-result.json`) |
| `scripts/ordo-missing-content.mjs` | never | `reports/ordo-missing-content.json`, `docs/ordo-missing-content.md` |

npm aliases: `npm run ordo:fetch-cache`, `npm run ordo:migrate-ranks -- …`, `npm run ordo:missing-content`.

## 1. Analysis source

The scripts read `backups/firestore-snapshot` when it exists (AGENTS.md); otherwise the
field-masked public cache in `reports/ordo-firestore-cache` (same format, `scope:
public-rest-field-mask`). Pass `--source <dir>` to choose explicitly.

Without a snapshot, build the cache once (≈900 document reads: all 735 `days` with metadata
fields only, plus the ≈160 `readings` that have `_date` or `_feast`):

```bash
node scripts/ordo-fetch-public-cache.mjs
```

The cache holds no text bodies, so it is only an analysis input. The apply phase never uses it as a
data source: every write re-reads the live document.

## 2. Dry runs

```bash
node scripts/ordo-migrate-ranks.mjs            # → reports/ordo-migration-plan.json
node scripts/ordo-missing-content.mjs          # → reports/ordo-missing-content.json + docs/ordo-missing-content.md
node scripts/ordo-missing-content.mjs --check  # CI-style staleness check of the Markdown
node --test tests/ordo-data-followups.test.mjs
```

## 3. Review the plan

`reports/ordo-migration-plan.json` has two lists:

- `writes` — what `--apply` would do. Each item has `collection`, `documentId`, `action`
  (`update`, `mark-obsolete`, or `delete` only with `--allow-delete`), `set`, a `precondition`
  (the value the plan was computed from), `reason`, `source`, `confidence` and `evidence`
  (evidence item ids of `src/data/ordo/evidence/*.json`, doc anchors, source files).
- `reviews` — never written: single-calendar rank changes (`rank-single-source`, with `proposed`),
  unowned documents left in place, identities that point to missing documents
  (`identity-relink`, a code fix), layer date moves and `<br>` titles (`title-markup`).

Check at least: every `update` against the fixedCalendar/layers entry named in `reason`; the
`mark-obsolete` successors (`supersededBy`) exist and carry the same texts; nothing in `reviews`
needs to be promoted. To promote a review item, change the data layer or `OBSOLETE_DECISIONS` in
`scripts/lib/ordo-data-followups.mjs` and regenerate — never hand-edit the plan.

Obsolete documents are marked, not deleted, by default: `_obsolete: true`, `_obsoleteReason`,
`_supersededBy`. The runtime already ignores them (no engine candidate owns them), but the legacy
`_date` query and `FeastsPicker` still list them until the app filters `_obsolete` or they are
deleted. Delete only after that review, with `--allow-delete` (the plan then shows `delete`).

## 4. Apply (later, with a service-account key)

The key is `patchs/serviceAccountKey.json` (git-ignored; not present on every machine). The apply
phase checks that the key's `project_id` matches the analysis source (`ibreviaryby`), regenerates the
plan from the same source, and runs each write in its own transaction: the live document is read,
the `precondition` compared, and a drifted or missing document is skipped (`drifted`/`missing` in
`reports/ordo-migration-plan-result.json`). Updated documents get `_ordoMigration` and
`_ordoMigratedAt`.

```bash
# 0. fresh analysis source (snapshot preferred)
npm run db:backup                                   # or: node scripts/ordo-fetch-public-cache.mjs
# 1. dry run and review
node scripts/ordo-migrate-ranks.mjs
# 2. apply updates + obsolete marks
node scripts/ordo-migrate-ranks.mjs --apply --confirm ordo-migrate-ranks \
  --service-account patchs/serviceAccountKey.json
# 3. (optional, after the app filters `_obsolete` or the review agrees) delete instead of mark
node scripts/ordo-migrate-ranks.mjs --allow-delete                     # review the delete plan
node scripts/ordo-migrate-ranks.mjs --allow-delete --apply --confirm ordo-migrate-ranks \
  --service-account patchs/serviceAccountKey.json
# 4. refresh the snapshot / cache and bump the content revision so clients refetch
npm run content:version:bump
```

Re-running is idempotent: applied items no longer differ and disappear from the next plan.

## 5. Firestore security rules

Rules are managed outside this repository. The follow-ups need:

- `days`, `readings`: public `get`/`list` (the app and the public cache read them anonymously);
  **no client writes** — migrations use the Admin SDK, which bypasses rules. The new
  `_obsolete*` / `_ordoMigration*` fields need no rule change.
- `compendium`, `compendiumMeta`: public read (reminder from `docs/compendium.md`);
  `compendiumMeta/current` is read first, then the units. No client writes.
- Keep `songs`, `invitatoriums`, `completoriums`, `yearOptions` public read-only as today; admin
  and user collections stay private (never in snapshots copied to `public/`).

A minimal shape:

```
match /databases/{database}/documents {
  match /days/{id}            { allow read: if true; allow write: if false; }
  match /readings/{id}        { allow read: if true; allow write: if false; }
  match /compendium/{id}      { allow read: if true; allow write: if false; }
  match /compendiumMeta/{id}  { allow read: if true; allow write: if false; }
}
```

(Adjust `write` to the existing admin-role check if the in-app editors write `days`/`readings`.)

## 6. Missing content

`docs/ordo-missing-content.md` lists celebrations the engine resolves without a `days` and/or
`readings` document, with the Common that can cover them (`patchs/feasts/common-texts/`) or the
proper texts they need. New `days` documents follow the existing import path
(`patchs/feasts/*.json` → `npm run generate:fixed-feasts` → import), then
`npm run ordo:identities` so the engine links them by id.
