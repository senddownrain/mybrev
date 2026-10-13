# Prayer formatting audit

Source: local snapshot exported 2026-10-12T10:28:16.428Z (version 20261012102816428).

Scanned documents: 105; string text fields/language versions: 269; non-string fields: 0.

Safe proposals: 0; review findings/proposals: 5885; manual findings: 15. Counts are findings, not unique prayers. Safe write plan: 0 documents.

All full before/after field and locale diffs are kept privately under ignored backups/prayer-formatting/. No prayer IDs or contents are included here.

Reason counts: {"emphasis":3794,"possible-rubric":467,"duplicate-line":697,"legacy-label":481,"markdown-marker":421,"ambiguous-label":15,"quotation":20}

Speaker counts: {"priest":82,"people":279,"celebrant":102,"cantor":24,"versicle":136,"response":96}

Production was not read or changed. This snapshot does not establish production completeness. The control prayer «Анёл Панскі» was not found by title in available local prayer snapshots; no authentic fixture or quote rewrite is claimed.

Architecture differences: ordinary prayer labels previously had no semantic renderer; HTML paste previously promoted standalone emphasis to rubrics. The new ordinary renderer is separate from the existing Mass adapter. Storage remains mybrev-markdown v1. See docs/prayer-formatting-standard.md for the contract and repeat/apply instructions.

Locale/field coverage: {"ru":74,"la":73,"be":74,"text":48}

Change proposals (before/after diffs): {"safe":0,"review":5,"manual":0}. Diagnostic notices: {"safe":0,"review":5880,"manual":15}. Ordinary emphasis and repeated liturgical formulas are notices for review, not automatic errors or rewrites.

Reproduce this report: node scripts/autofix-prayer-markdown.mjs --snapshot backups/priest-live-20261012 --rubrics

Validation on this change: 75 relevant tests passed. The isolated real-browser editor check passed (visual/Markdown mode, selection, autofix preview, undo/redo, HTML paste, theme and large font). The complete suite ran 739 tests: 726 passed, 4 skipped, 9 failed. All nine failing tests reproduce in an archive of the starting commit a3148d3: six lectionary audit tests (fixture coverage and Windows path assumptions), one Ordo seed snapshot comparison (line endings), and two Ordo screen tests (Windows path assumptions). No failure from this change remains in the relevant suite.

Control-case limit: an authentic local source for «Анёл Панскі» is still required before deciding whether its quote markers are import artifacts. Flutter still needs the token/role interpretation described in the contract; this task does not modify the Flutter repository.
