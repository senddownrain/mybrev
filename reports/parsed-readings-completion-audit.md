# parsedData lectionary completion audit

Generated from the live production Firestore collections and the current worktree on 2026-08-24.

## Production result

The prepared migrations were applied after explicit user approval and then verified against a fresh production snapshot.

| Invariant | Final evidence | Status |
| --- | --- | --- |
| Use the `fixedDays` identity paradigm | All 822 `parsedData` documents have canonical IDs derived from their fixed-day, feast, or period selector. The post-migration identity dry-run plans 0 operations. | Complete |
| Map every reading document | The database audit maps 822/822 documents and reports 0 identity problems and 0 metadata changes. | Complete |
| Cover fixed dates, movable feasts, and periods | The runtime-equivalent audit resolves all 2,192 dates in 2023–2028. | Complete |
| Select the correct lectionary cycle | The six-year audit reports 0 A/B/C or 1/2 cycle mismatches. | Complete |
| Match ranks and places | Celebration documents link to the resolved `fixedDays` ID(s) and inherit canonical rank/place dimensions; calendar days without a celebration-specific Mass use the period reading. | Complete |
| Repair malformed fields | The migration corrected 1,963 fields in 780 documents. The final audit and normalization dry-run both report 0 remaining section/field problems. | Complete |
| Remove unusable placeholders | 13 documents with no usable reading text were backed up and removed. The final prune dry-run reports 822 usable of 822 and 0 placeholders. | Complete |
| Resolve legacy ID collisions safely | 45 live collision groups were converted to 47 targets, preserving the Christmas Vigil and second Sunday after Christmas as semantic variants. The final collision audit reports 0 groups. | Complete |

The main production audit now reports:

- `parsedDocuments`: 822
- `mappings.mapped`: 822
- `canonicalIds`: 822
- `documentsNeedingMetadataChanges`: 0
- `documentsWithIdentityProblems`: 0
- `documentsWithSectionProblems`: 0
- `idCollisions`: 0

Of the 742 `fixedDays` office templates, 521 have a direct celebration-specific reading link. The remaining 221 are still covered on their calendar dates by the canonical period/date fallback; they are not missing liturgical days. This is independently proven by the full-year gate below.

## Full-year gate

`reports/parsed-readings-year-coverage-audit.json` applies the same lookup priority and cycle-selection rules as runtime.

- Calendar years: 2023–2028
- Calendar days checked: 2,192
- Covered days: 2,192
- Missing days: 0
- Selected-cycle mismatches: 0
- Per-year coverage: 365/365, 366/366, 365/365, 365/365, 365/365, 366/366

The audit also guards the corrected Ordinary Time week numbering, Pentecost Vigil selector, Sunday A/B/C selection for movable solemnities celebrated on weekdays, and weekday 1/2 selection.

## Applied production migrations

1. Field normalization: 780 documents updated; 1,963 parser artifacts repaired.
2. Empty-placeholder pruning: 13 documents deleted.
3. Collision resolution: 45 groups / 94 sources converted to 47 canonical targets; 2 semantic variants preserved; 0 preflight conflicts.
4. Identity migration: 771 operations applied, comprising 678 ID moves and 93 metadata-only updates; 0 missing sources and 0 target conflicts.

The final dry-runs are idempotent:

- Field changes remaining: 0
- Empty placeholders remaining: 0
- Collision groups remaining: 0
- Identity operations remaining: 0

## Recovery artifacts

Each destructive stage created a JSON backup before writing:

- `reports/backups/parsedData-before-field-normalization-2026-08-24T16-09-38-998Z.json`
- `reports/backups/parsedData-empty-placeholders-2026-08-24T16-10-17-835Z.json`
- `reports/backups/parsedData-before-collision-resolution-2026-08-24T16-16-03-353Z.json`
- `reports/backups/parsedData-before-identity-migration-2026-08-24T16-19-52-518Z.json`

## Verification

- `node --test tests/liturgical-calendar.test.mjs tests/parsed-readings-identity.test.mjs`: 24 passed.
- `npm run test:audit`: 5 passed.
- `npm run test:fixed-feasts`: 5 passed.
- `npm run audit:parsed-readings-db`: all 822 documents canonical and clean.
- `npm run audit:parsed-readings-collisions`: 0 groups.
- `npm run audit:parsed-readings-years`: 2,192/2,192 days, 0 cycle mismatches.
- `npm run db:normalize-parsed-readings`: 0 remaining changes (dry-run).
- `npm run db:prune-empty-parsed-readings`: 0 remaining placeholders (dry-run).
- `npm run db:migrate-parsed-readings-identity`: 0 remaining operations (dry-run).
- `npm run db:export-parsed-data`: final production catalog exported.
- `npm run build`: succeeds, including PWA generation.
