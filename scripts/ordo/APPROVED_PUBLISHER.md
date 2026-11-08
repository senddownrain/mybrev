# Guarded publisher for the owner-approved 71-operation PR #201 plan

The owner accepted the replacement plan at https://github.com/senddownrain/mybrev/pull/201#issuecomment-6714161064. The historical filename `NEW_PATCH_PLAN_NOT_AUTHORIZED.json` no longer describes its authorization status. `reports/ordo-approved-release/APPROVED_PATCH_PLAN.json` preserves its exact operations and adds the approval evidence.

Seal: `bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238`.
The entire approved private baseline is also fingerprinted, including all 332 IDs, exact data hashes and updateTimes. Replacing the baseline cannot authorize later changes.

The CLI defaults to an offline dry-run with `--plan`, `--baseline` and `--out` (private directory outside the checkout). `--live` is a scoped read-only preflight. Applying requires `--live --apply --confirm-hash` with the exact seal. One atomic transaction includes 71 writes and metadata revision 4. Notes6/properTexts6/templates4 are preserved. Independently corrected Trakai is explicitly forbidden as a write target. No automatic retry, deletion or data rollback exists.

Set `APPROVED_CALENDAR_TEST_SNAPSHOT` to the approved private baseline to run all publisher tests offline. Without it, snapshot-dependent tests skip; no test fetches production. A marker is written before commit; any unknown outcome must be reconciled read-only before a further decision. Rollback restores approved fields under a new revision 5, preserves independent revisions and texts, and disables newly created IDs. A rollback needs fresh post-publication preconditions and a separate decision; never lower revision or replay blindly.
