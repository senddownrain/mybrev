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
`prayers`, `prayerCategories` or `songs`, republish the app content manifest
(`npm run content:manifest -- --apply`), otherwise the Flutter app rejects the change. See
`docs/app-content-distribution.md`.
