# RETIRED — production execution disabled before credentials

The protected run44185030376 stopped with Firestore code8 Quota exceeded before preparing any write; no retry. Actual source revision3 also predates the accepted Flutter calendar from main (bundled revision4; separate revision5 release remains pending) (#107). Candidate CI exposed a real regression (Juan Diego enabled in the older server snapshot). The final candidate must retain the exact accepted main calendar, so the old bundleSHA19ed… and this metadata-only plan are historical evidence, not an executable continuation.

Both the existing publisher CLI and protected workflow reject this exact plan before credential loading/Firestore access. A future, separately bounded plan must reconcile the already approved calendar using the existing calendar publication process, preserve newer production values, bind the revised single candidate SHA and verify manifest parity after quota recovery. No calendar migration or Firestore call was performed here.

## Historical plan and verification

The owner explicitly approved the additional four-index plan (canonical SHA256 `90c78bfdd348b96f37897be3ac0e6939876097f763b15dd76464a28b5a5cb3f4`) and then authorized completion of all required work: “все разрешаю. делай больше и даже максимум”. This scope completes metadata parity with all 16 existing public collections in the single final Flutter test candidate. No document content changes, prayer-source migration, mobile binary release or installed-client inventory claim.

Exact executable plan binary SHA256: `707e13042ed74996cf996aacbd9564c2dc3200448f05eca11946abe502d1e95a`.

Bundle aggregate SHA256: `19ed6b4b8247baa4d97e20a8404975b6f539a9531bf9061e1b063f73c9e9152c`, bundle content version `1794938564491`.

The existing publisher and coordinated transaction engine are reused. The ordinary MASS gate remains closed. Offline scope/SHA verification precedes credential loading. All 4,473 hash/size/updateTime catalog entries are fenced by live reference-only projections in the same transaction that atomically writes collection indexes and current. No uncached full-document reads are allowed; a changed updateTime stops publication. Maximum 12 metadata writes; two orphan indexes already match, so the baseline predicts 10 actual writes. Exactly 17 manifest documents are read back. CAS conflict/quota failure stops immediately; maxAttempts is one. Resume can only verify an already prepared atomic payload, never blindly repeat it.

Snapshots: one public-remainder capture (3,430 reads), reused liturgical readbacks and the existing verified catalog. Metadata review: 17 reads. Execution predicts 4,507 reads and 10 metadata writes, no content writes. Billing/quota dashboards are not accessible; these are instrumented operation counts.

Compatibility reuses the six reviewed updater source revisions and 102 prior source/unit checks. Two additional tests on the earliest real updater revision use all known collections from the final full bundle: successful mass activation/restart and interrupted download/restart both preserve local settings, favorites and personal prayers. Newer test clients return appReleaseRequired before document downloads; unknown additive schema-1 collection entries are ignored by older clients. Native smoke and installed-binary testing were not performed.

Local targeted publisher/transaction tests: 25 passed, zero failed. Final actual execution/readback evidence will be attached after the protected workflow succeeds.
