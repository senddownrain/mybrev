# Data-work instructions

When investigating Firestore data, preparing audits, or designing migrations:

1. Check for `backups/firestore-snapshot/manifest.json` first.
2. Use the local snapshot through `scripts/lib/firestore-snapshot.mjs` or
   `npm run db:snapshot:query -- ...` before making any live Firestore reads.
3. Treat the snapshot as the analysis source and Firestore as the eventual migration target.
4. Do not refresh the snapshot or run a live audit automatically. A refresh consumes Firestore
   reads and requires explicit user approval when quota availability has not been confirmed.
5. New audit and migration scripts should accept a local snapshot source. Separate analysis and
   dry-run generation from the final `--apply` Firestore write phase.

The snapshot is private and ignored by Git. Never copy the complete backup into `public/`, commit
it, or expose admin/authentication collections.

## App content manifest

After any write to `days`, `readings`, `liturgicalTemplates`, `invitatoriums`, `completoriums`,
`prayers`, `prayerCategories` or `songs`, the change reaches the Flutter app only after an explicit
publication: `npm run content:manifest` (validation + diff report), then `-- --apply` for a SAFE
CONTENT PATCH. A mass rebuild or a schema change is refused: it ships as a new bundle with an app
release (`npm run content:app-release`). Never override without the owner. See
`docs/app-content-distribution.md`.
