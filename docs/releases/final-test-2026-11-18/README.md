# Final16-collection metadata publication after real calendar5 readback

The owner authorized full public manifest parity and explicitly authorized both calendar operations on2026-11-18. Calendar4/71 and calendar5/3 have actually committed and all scoped data were readback-verified. See calendar5-receipt.json and docs/releases/calendar-final-2026-11-18/revision4-receipt.json. Source PDF/independent revisions are preserved. No APK/store/iOS release or installed-client/native evidence is claimed.

Final exact plan SHA256: **ae362f365a88754478504544d52b515eb46835f147ace9493cc2d037405c9da2**.
Single bundle aggregate SHA256: **203f7ef439bb1b9d90cb8e6a4e9d8efec7a34e6fb7a3c41850eeca7f20838184**, contentVersion1794995935449,4476 public documents/16 collections.

Only11 metadata documents are written, atomically:10 changed indexes and current. Other index payloads already match; all17 are read back. Full4476-document hash/size/updateTime catalog is fenced by metadata projections in that same transaction. The eight private access-policy documents are read/fenced by a single aggregate SHA; their bodies/IDs are not committed or published. Any ID/updateTime/policy drift stops the publication; maxUncachedDocumentReads0, maxAttempts1. Atomic attempt journal/readback-only resume remain enforced. Ordinary MASS stays closed, and the old707e… plan remains retired.

Source reconstruction reused yesterday's verified snapshots. Fresh metadata preflight found322 changes:321 already published canonical prayer-source updates and one newer Simon/Jude Proper. Read precisely those322 documents from the saved checkpoint, no repeated full content scan or source migration. Two conservative metadata-only passes stopped at40/200 changed-document bounds; the second saved all IDs/updateTimes and was reused for those targeted reads. Newer production values are retained; privacy checks exclude protected/draft data. All original7791 days/templates fields still have unchanged server updateTimes and the verified receipts are reused.

Final code reuses scripts/content/publish-manifest.mjs and publishCoordinatedManifest; no parallel publisher or --allow-large-patch. Both protected workflow and CLI validate the exact plan, calendar receipt, immutable catalog/manifests and actual two-test legacy-updater proof before credentials. Targeted coordinator/reviewed-manifest tests:29 passed; old scope/gate/default behaviors preserved.

Expected execution:4518 reads (4476 metadata +34 manifest +8 policy),11 metadata writes,0 content writes. These are instrumented operation counts, not a project-wide quota/billing claim. Any RESOURCE_EXHAUSTED/conflict stops without retry. Successful actual execution and receipt will be recorded separately; this preparation is not publication evidence.
