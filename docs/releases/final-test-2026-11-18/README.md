# Final16-collection metadata publication after real calendar5 readback

The owner authorized full public manifest parity and explicitly authorized both calendar operations on2026-11-18. Calendar4/71 and calendar5/3 have actually committed and all scoped data were readback-verified. See calendar5-receipt.json and docs/releases/calendar-final-2026-11-18/revision4-receipt.json. Source PDF/independent revisions are preserved. No APK/store/iOS release or installed-client/native evidence is claimed.

Final exact plan SHA256: **585910950d765c8181791c688f3d60d7043aaf862c553536c570330b4dea5f04**.
Single bundle aggregate SHA256: **bce11ef5e1cc59818a2f2563c12c5814a8b445852515df0bfafb21d57174c69d**, contentVersion1794997584628,4474 public documents/16 collections.

Only11 metadata documents are written, atomically:10 changed indexes and current. Other index payloads already match; all17 are read back. Full4474-document hash/size/updateTime catalog is fenced by metadata projections in that same transaction. The eight private access-policy documents are read/fenced by a single aggregate SHA; their bodies/IDs are not committed or published. Any ID/updateTime/policy drift stops the publication; maxUncachedDocumentReads0, maxAttempts1. Atomic attempt journal/readback-only resume remain enforced. Ordinary MASS stays closed, and the old707e… plan remains retired.

Source reconstruction reused yesterday's verified snapshots. Fresh metadata preflight found322 changes:321 already published canonical prayer-source updates and one newer Simon/Jude Proper. Read precisely those322 documents from the saved checkpoint, no repeated full content scan or source migration. Two conservative metadata-only passes stopped at40/200 changed-document bounds; the second saved all IDs/updateTimes and was reused for those targeted reads. Newer production values are retained; privacy checks exclude protected/draft data. All original7791 days/templates fields still have unchanged server updateTimes and the verified receipts are reused.

Final code reuses scripts/content/publish-manifest.mjs and publishCoordinatedManifest; no parallel publisher or --allow-large-patch. Both protected workflow and CLI validate the exact plan, calendar receipt, immutable catalog/manifests and actual two-test legacy-updater proof before credentials. Targeted coordinator/reviewed-manifest tests:29 passed; old scope/gate/default behaviors preserved.

Expected execution:4516 reads (4474 metadata +34 manifest +8 policy),11 metadata writes,0 content writes. These are instrumented operation counts, not a project-wide quota/billing claim. Any RESOURCE_EXHAUSTED/conflict stops without retry. Successful actual execution and receipt will be recorded separately; this preparation is not publication evidence.


## Exact source amendment after a blocked transaction

Run44284033897 stopped before preparing any write: two public prayer records were independently deleted after preflight. Actual failed receipt and source-amendment.json are retained. Diagnostic3 point reads +16 count aggregations identified only prayers391 vs393; one391-ID query confirmed the two removals and zero other changed records. The same candidate/plan files are updated in place; stale deleted rows are not restored. No source migration, calendar rollback or content write occurred. Final target4474, same eleven metadata writes. A full live metadata checkpoint is now durably retained before the gate, and any ID conflicts are reported, so further drift can be reconciled without diagnostic full rescans. Resume receipts explicitly distinguish zero writes in the current run from historical acknowledged writes.
