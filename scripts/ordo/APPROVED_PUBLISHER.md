# Guarded publisher for the originally approved PR #201 plan

**BLOCKED as of 2026-11-07. Do not use the old plan on current production.**
Production metadata moved to notesRevision 6 and the Trakai override was independently corrected. The original sealed 72-operation plan is no longer applicable. The proposed 71-operation diff is not accepted and this publisher deliberately rejects it. See `docs/audits/belarus-own-calendar-2026/PRODUCTION_RELEASE_REPORT.md`.

`publish-approved-calendar.mjs` defaults to an offline dry-run with `--plan`, `--baseline` and `--out` (private directory outside the checkout). `--live` is a read-only scoped preflight. The separately gated apply path exists for review, requires the exact sealed plan, and has not been executed against production. Do not change the seal to bypass the current mismatch. Never commit snapshot or private output.

Tests run offline. Set `APPROVED_CALENDAR_TEST_SNAPSHOT` to the explicitly approved original private snapshot to execute all nine publisher tests. Without that variable, snapshot-dependent tests skip; no test fetches production automatically. Atomic commit failure is tested with a fake transport, not by writing test data to production.

Before an accepted replacement release: update the narrowly sealed instrument and rollback to the accepted exact plan, verify it offline, recheck live preconditions, and complete merge/Hosting/browser gates. Any unknown commit outcome must be reconciled read-only. Never retry blindly or lower calendar/notes revisions.
