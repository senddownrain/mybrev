# 22 October — St John Paul II: source-verification blocker

Status: **needs-source-verification**. Recorded 2026-10-22. **Do not modify the liturgical wording without a second verified source and owner approval.**

## Material examined

- Owner-provided photograph in ChatGPT conversation dated 2026-10-22 (photograph of a Belarusian document containing the end of the second reading, responsory, and the concluding prayer for St John Paul II).
- `patchs/feasts/22-10-sv-john-paul-ii.json`
- `patchs/db-feasts/22-10-sv-john-paul-ii.json`

## Findings, with exact photographed wording

1. The photographed prayer has **`святога Ян Павел II, папа`** and the stored `officeOfReadingsPr` has the same words (with Belarusian Roman-number glyphs `ІІ`). The phrase appears grammatically suspicious, but the photo **does not establish an alternative wording**. Do not replace it with an assistant-generated Belarusian translation or infer a case ending.
2. The photographed responsory has **`Адчыніце дзверы Хрусту!`** and the stored `officeOfReadingsR2` also has **`Хрусту`**. This is an apparent typo **in the photographed document itself**, not an established transcription mismatch. Do not silently correct it to a guessed alternative.
3. The generated DB feast document reuses `officeOfReadingsPr` for `laudesPr` and `vesperPr` via `_fieldRules`. This is intentional; no evidence of runtime name interpolation was found for this entry.

## Required next action

Obtain an independent owner-designated direct source with the verified *exact* Belarusian words (e.g. another breviary printing/page or the prior prayer-book export, with precise record location), compare it line by line, then propose a minimal and source-cited correction for explicit owner review. No prayer text edits are approved by this report. If no better source is found, retain the recorded wording and the open verification flag.

## Publication impact

A future approved correction may need synchronized changes to the source feast JSON, generated DB feast JSON, production Firestore content (only in a separate authorized publication), and Flutter content distribution/bundle. Source JSON commits alone do not update the already deployed applications.

See `docs/liturgical-text-source-policy.md` for binding restrictions.
