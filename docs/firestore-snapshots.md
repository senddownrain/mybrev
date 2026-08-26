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
npm run db:snapshot:query -- --collection fixedDays --id office-for-dead
npm run db:snapshot:query -- --collection parsedData --where _date:==:26.08
npm run db:snapshot:query -- --collection parsedData --where _dayIds:array-contains:some-day-id
```

Node audit scripts can import `openFirestoreSnapshot` from
`scripts/lib/firestore-snapshot.mjs`. They should do all analysis and migration-payload generation
locally; a separate explicit `--apply` phase may write the prepared changes to Firestore later.

## Publication workflow

1. After quota resets, create the private backup once: `npm run db:backup`.
2. Inspect its manifest and query representative documents locally.
3. Use the local snapshot for analysis and dry-run migration generation.
4. Only when a migration has been verified, run its explicit Firestore apply phase.
5. Refresh the backup after successful migrations so the offline source matches production.
