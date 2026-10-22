# Policy: liturgical texts must be source-exact (mandatory)

**Owner instruction, 2026-10-22. Applies to MyBrev Web, Flutter, importers, migration scripts, editors, AI/Codex, and all content-review tasks.**

## Absolute prohibition

No assistant, developer tool, LLM, importer, or application code may **compose, invent, reconstruct, paraphrase, translate, back-translate, grammatically correct, stylistically polish, modernize, interpolate or substitute** a prayer or any other liturgical text on its own. In particular:

- **Never** translate a Latin/Polish/Russian or other source to create a Belarusian liturgical prayer.
- **Never** write a plausible new prayer, even if doctrinally sound or consistent with the Latin original.
- **Never** insert a saint's name or title into a generic prayer, nor infer its grammatical case; do not assemble a prayer by filling prose placeholders unless that exact variable mechanism and its word forms are explicitly present in, and authorized by, the approved source.
- **Never** silently replace a missing or corrupted Proper prayer with a generic prayer of pastors/saints, or vice versa; follow only documented rubrics with verified source texts.
- Do not make **even obvious** textual corrections (spelling, punctuation, name declension, missing/extra words, apparent OCR errors) in a published liturgical text without establishing the exact approved source wording and owner approval. Mark them for review instead.
- Formatting (layout, HTML presentation, visual typography) may change without rewriting any prayer words or punctuation. Do not treat a display renderer as a text editor.

## Authoritative input: only direct, identifiable sources

Allowed starting materials for liturgical wording:

1. **Breviary texts supplied by the owner**, including pages, photographs, PDFs, or exact transcriptions.
2. **The previously extracted database from the former prayer book**, including an identifiable exported record or locally available verified snapshot that the owner designates as source material.

A website, Latin reference text, general model knowledge, OCR output, or an AI-generated proposal is **not** independently an approved Belarusian text source. A different direct source can be used **only if the owner explicitly selects and approves it**. OCR may assist in transcribing supplied pages, but must be checked against the original before use. The presence of text in the current repo or database is not in itself proof it was transcribed correctly.

For each added/replaced text, record provenance sufficient to verify the **exact wording**: physical edition/book + page or supplied file/page, or legacy export/snapshot + collection/document ID; where practicable include source hash, date of transcription, and review status. Preserve a verifiable mapping between field and source.

## When a defect is found

1. Identify the **current verbatim wording** and every affected location (source JSON, generated DB data, Firestore/snapshot, Web, Flutter bundle, and fields such as `officeOfReadingsPr`, `laudesPr`, `vesperPr`).
2. Identify the original **direct source**. Distinguish inherited transcription error from a runtime composition/rendering error; do not guess the cause.
3. If the approved direct source is not available, label the text `needs-source-verification`. State the uncertainty and request the relevant page/export. **Do not** invent a replacement, derive one from Latin, edit the content, or publish a purportedly corrected prayer.
4. Once the exact source is supplied and checked, propose **verbatim source → stored text** differences, with citations/provenance, for owner review.
5. Only after explicit owner approval implement the precise source-backed correction; keep changes to original text minimal and traceable. Update all required source/data/bundle copies using the project's authorized distribution workflow.
6. Never merge, write production Firestore, regenerate production bundles, or publish a content change as a side effect of an audit. Obtain explicit approval for those actions.

## Rubrics and reuse

A Proper prayer may legitimately be reused across the Office of Readings, Lauds and Vespers when source rubrics/data explicitly require this. Use explicit field references rather than creating a new prayer, and do not mistake such reuse for license to modify the words. A Common is a **separate, sourced liturgical text**, not a fallback that can be fabricated.

## Current cautionary example (not a corrected text)

The prayer for **St John Paul II (22 October)** stored in MyBrev contains an apparent incorrect nominal form `святога Ян Павел ІІ, папа`. This must be **flagged and checked against the owner's breviary or legacy prayer-book export**. Do not use any assistant-proposed Belarusian rewrite; such a rewrite is **unapproved and not a source**. The same entry also contains `Хрусту` in its responsory, likewise requiring source verification. Another candidate for review is St Pius V (30 April), with trailing `МАЙ`. These examples authorize **inspection only**, not unsourced text edits.

**Acceptance gate for any PR affecting liturgical text:** show exact source reference, verbatim diff, confirmation no AI translation/composition occurred, required approval, and impact on Web/Flutter. Without this evidence, the change is blocked.
