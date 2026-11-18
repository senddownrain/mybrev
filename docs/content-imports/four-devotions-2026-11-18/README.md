# Four devotional texts — staging only

This is an **unpublished import candidate** for four texts from user-supplied PDF extracts. The Markdown files are in the canonical MyBrev prayer format; no Firestore data, category, app bundle, hosting deployment or content manifest has been changed.

## Source / mapping

- See `manifest.json` for stable draft IDs, titles, printed page labels, source PDFs and SHA-256 checksums.
- The intended existing public section is «Набажэнствы» and its existing tag is `Набажэнства`. Verify the actual category ID and membership before writes; do not create a duplicate category.
- Use `title` as a separate Firestore field; do not prepend `#` to `text`. Store `textFormat: 'mybrev-markdown'` and `textFormatVersion: 1`.
- Rubrics follow `:::rubric` + `:::`; sections follow Markdown headings; `Ц.:` / `Н.:` are speaker markers. Keep multiple alternative prayers, Scripture, the four procession stations and the blessing cross glyph `✠`.
- The original extracts do not identify the full book title/publisher. Verify the approved bibliography for `source` and `sourceBook`; do not infer or fabricate it. **No production apply until source and text are reviewed.**

## Validation / continuation

1. Read `AGENTS.md`, `docs/prayer-formatting-standard.md`, `docs/prayer-markdown.md`, `docs/prayer-categories-contract.md`, `docs/app-content-distribution.md`.
2. Compare the four files line by line with the original PDF page images, particularly printed pages 296–298 and 302–303 whose embedded text layers are corrupted. Independently verify liturgical formulas and Scripture references.
3. Prepare an idempotent local import dry-run based on existing authorized snapshot: detect duplicates by exact ID and content, preserve existing unrelated fields, log page provenance and hash.
4. Only after confirmed production quota and authorization, use the existing canonical mutation/import path with preconditions and readback verification. Never refresh the snapshot or run live audits as part of a dry-run.
5. For Flutter, validate the renderer and content distribution contract; `npm run content:manifest` must report `SAFE CONTENT PATCH` before an explicitly authorized `-- --apply`. Do not override MASS CONTENT REBUILD or schema gates.
6. Add Markdown/renderer tests, Web mobile/desktop visual checks, and Flutter parser tests if there is a demonstrated discrepancy. Report exact status separately as `prepared`, `proofread`, `imported`, `verified`, `published`.

Status: **PREPARED / NOT PROOFREAD BY AN INDEPENDENT REVIEWER / NOT IMPORTED / NOT DEPLOYED**.

## Safe local preflight (added in this PR)

Run `node --test tests/four-devotions-content.test.mjs` to validate immutable checksums and the basic Markdown structure. No Firebase access is needed.

Run `node scripts/validate-four-devotions.mjs` to inspect exactly four staged documents without Firestore access or writes. For local duplicate/category verification, use an existing complete snapshot:

```sh
node scripts/validate-four-devotions.mjs --snapshot backups/firestore-snapshot-static --out backups/four-devotions/plan.json
```

The private `plan.json` includes the full proposed text and must NOT be committed. If the snapshot lacks either public or priest-protected prayers/categories, the validator refuses to compare. This command is **not** an apply mechanism; it makes 0 Firestore requests and 0 writes. An explicit verified release operation via the existing approved migration machinery is still required for the documents to become visible in Web and Flutter.
