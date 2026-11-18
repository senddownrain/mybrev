# Controlled calendar continuation

The owner explicitly authorized both operations on2026-11-18: “Разрешаю обе календарные операции”. This follows the original PR201 seal and the already reviewed PR217 two-entry decision. No mobile release was authorized/performed.

Revision4 was actually published and all71 operations verified at2026-11-18T09:44:09.388404Z. Exact unchanged operations SHA bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238; exact original baseline fingerprint c95e86a8fb40a96d8a331e9260f74393873061a6c7f8d7f38e562e3a0571f614. Existing publisher, fresh transaction, CAS, one commit, all332→335 scoped documents read back; no deletes/outside writes/retries. Independent notes6/properTexts6/templates4 preserved. Published Web calendar/PDF/Ordo checked in three themes without browser Firestore reads. Actual receipt is revision4-receipt.json; private state remains outside Git.

The separate revision5 plan binary SHA256 is **26eea49617ae1770cf0555b87a5bb49796359b39eb6c677248b1d0ad25025197**. It changes exactly enabled=false for sv-juan-diego and our-lady-guadalupe plus meta revision5/server publishedAt. It preserves document IDs, references, all content, independent revisions and335-document baseline. No generic import/prune is used. Existing calendar publisher/REST transport gain a narrow --december phase; default71-operation seal is unchanged. Adapter enforces exactly these3 paths/masks/values, max one commit; full fresh baseline IDs/hash/updateTime fence and full scoped readback are required. A durable attempt marker prevents blind retries. Rollback is a separately authorized blueprint under revision6.

Local validation: original10 publisher tests passed on the exact private baseline;5 followup tests passed both with the real revision4 readback and explicit synthetic CI fixture; targeted approved-calendar/December tests passed. Revision5 is NOT claimed published in this preparation commit.

The Web source remains a faithful PDF extraction; the existing editorial addendum and retained canonical aliases are not deleted. Runtime selection removes only the two entries, generation uses revision5, and all late main fixes are retained.
