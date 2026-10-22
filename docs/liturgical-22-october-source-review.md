# 22 October — St John Paul II: source-verification blocker

Status: **two exact corrections owner-approved on 2026-10-22; publication pending**. The owner explicitly instructed changing `святога Ян Павел ІІ, папа` to `святы Ян Павел ІІ, папа` and `Адчыніце дзверы Хрусту!` to `Адчыніце дзверы Хрысту!`. This is a documented direct owner correction to a photographed source containing typographical defects, **not an AI translation or reconstructed liturgical text**. Only these two changes are authorized; see MyBrev Draft PR #152.

## Material examined

- Owner-provided photograph in ChatGPT conversation dated 2026-10-22 (photograph of a Belarusian document containing the end of the second reading, responsory, and the concluding prayer for St John Paul II).
- `patchs/feasts/22-10-sv-john-paul-ii.json`
- `patchs/db-feasts/22-10-sv-john-paul-ii.json`

## Findings, with exact photographed wording

1. The photograph and original stored prayer both contain **`святога Ян Павел II, папа`** (stored with `ІІ`). The owner has now supplied and approved the **exact** replacement **`святы Ян Павел ІІ, папа`**. Do not substitute any assistant-generated alternatives.
2. The photo and stored responsory both contain **`Адчыніце дзверы Хрусту!`**. The owner explicitly approved the exact correction **`Адчыніце дзверы Хрысту!`**. It is a narrowly approved editorial correction, not an invisible import fix.
3. The generated DB feast document reuses `officeOfReadingsPr` for `laudesPr` and `vesperPr` via `_fieldRules`. This is intentional; no evidence of runtime name interpolation was found for this entry.

## Required next action

The owner has independently approved the **two exact replacements** documented above; implement and verify only those. Future disputed wording still requires the owner's direct source or exact explicit textual approval. After merge, perform a scoped Firestore migration and publish Flutter's safe content manifest patch using the documented guarded workflow; no other liturgical edits are approved.

## Publication impact

A future approved correction may need synchronized changes to the source feast JSON, generated DB feast JSON, production Firestore content (only in a separate authorized publication), and Flutter content distribution/bundle. Source JSON commits alone do not update the already deployed applications.

See `docs/liturgical-text-source-policy.md` for binding restrictions.
