# Local Firestore data workflow

The primary purpose of the snapshot is offline data work: audits, debugging, normalization, and
migration planning should not repeatedly read the live database.

`npm run db:backup` creates a complete private backup in `backups/firestore-snapshot`. It includes
top-level collections and nested subcollections. The directory is ignored by Git and must never
be copied to `public/` because it may contain admin or user data.

The export command reads every Firestore document. Run it only when read quota is available.
Local querying never contacts Firebase.

## Offline analysis

List available collections:

```powershell
npm run db:snapshot:query -- --list
```

Find a document or filter a collection:

```powershell
npm run db:snapshot:query -- --collection days --id office-for-dead
npm run db:snapshot:query -- --collection readings --where _date:==:26.08
npm run db:snapshot:query -- --collection readings --where _dayIds:array-contains:some-day-id
```

Node audit scripts can import `openFirestoreSnapshot` from
`scripts/lib/firestore-snapshot.mjs`. They should do all analysis and migration-payload generation
locally; a separate explicit `--apply` phase may write the prepared changes to Firestore later.

## Core collection replacement

The one-time migration copies `fixedDays` to `days` and `parsedData` to `readings`. Its snapshot
only needs to cover the two source collections. Existing `days` and `readings` data is obsolete
and is deliberately dropped during apply:

```powershell
npm run db:backup -- --output backups/core-collections-migration --collection fixedDays --collection parsedData
npm run db:migrate-core-collections -- --snapshot backups/core-collections-migration
```

After reviewing the generated plan, the explicit apply command is:

```powershell
npm run db:migrate-core-collections -- --snapshot backups/core-collections-migration --apply --confirm replace-core-collections
```

The apply phase first verifies that both live source collections still match the snapshot. It then
drops the obsolete target collections and recreates them from the snapshot. The source collections
`fixedDays` and `parsedData` are retained as a rollback source for now.

## Publication workflow

1. After quota resets, create the private backup once: `npm run db:backup`.
2. Inspect its manifest and query representative documents locally.
3. Use the local snapshot for analysis and dry-run migration generation.
4. Only when a migration has been verified, run its explicit Firestore apply phase.
5. Refresh the backup after successful migrations so the offline source matches production.
