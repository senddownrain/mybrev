# Christ the Eternal High Priest — Daytime Prayer

## Source and scope

**Authoritative input for this repair:** user-supplied Belarusian Word document `Чацвер пасля Спаслання Духа Святога.docx`, section **«МАЛІТВА НА ПРАЦЯГУ ДНЯ»** (followed by three hours and «Малітва з Ютрані»). The file also contains the entire feast Office, but the present repair deliberately covers **Daytime Prayer** only.

The document says: **«Псальмы з бягучага дня.»** All three daytime hours must therefore retain their own weekday hymn/psalmody while displaying the special feast antiphon, short reading and concluding collect.

The second and third hour both have the heading «Малітва пасля поўдня» in the supplied Word text. Because the three hours are in sequence and the scripture references identify them, the second is mapped to `sext2` (Малітва апоўдні) and the third to `sext3` (Малітва пасля поўдня). **The source document itself has not been edited.**

| Web hour | Database fields | Own short reading | Own antiphon | Verse + response |
|---|---|---|---|---|
| Terce, before noon | `sext1Ant1`, `sext1R`, `sext1Pr` | Гбр 7, 26–27 | «Праз Хрыста … доступ да Айца» | К. «Паколькі вы прымаеце ўдзел…»; Н. «Каб і ў час аб’яўлення…» |
| Sext, noon | `sext2Ant1`, `sext2R`, `sext2Pr` | 1 П 2, 4–5 | «Вы ўмацаваныя на падмурку…» | К. «Як вы прынялі Пана…»; Н. «Укаранёныя і збудаваныя…» |
| None, afternoon | `sext3Ant1`, `sext3R`, `sext3Pr` | 1 П 2, 9–10 | «Кожнаму з нас дадзена ласка…» | К. «Няхай валадарыць…»; Н. «Да якога вы пакліканыя…» |

The supplied concluding prayer of Lauds starts **«Божа, Ты дзеля хвалы Тваёй велічы…»** and ends **«Праз Пана нашага.»** The Word document explicitly says «Малітва з Ютрані.» It is repeated in all three `sext*Pr` fields, which works for both Web and eventual Flutter content distribution.

## Implementation in PR #183

- `src/data/liturgical/christ-high-priest-daytime-by.json` contains the complete Belarusian antiphons, readings, versicles/responses and concluding prayers from the supplied document.
- The source's verse and response are kept **inside each `sext*R` HTML field**, using the same layout as existing Office readings. No runtime schema change is necessary.
- Each of `sext*Ant2` and `sext*Ant3` is intentionally empty: one unique proper antiphon surrounds the three psalms of each daytime hour.
- `applyHighPriestDaytimeProper()` overlays these proper fields on the High Priest feast only. It also clears stale `_fromDayFields` references for these fields, so an older Firestore marker cannot replace an explicitly supplied reading.
- The rest of the movable-feast daytime resolver fills only weekday hymn and psalmody gaps, and preserves the feast's own readings and prayers.
- Six offline regression tests cover the Pinsk feast date, the complete field content, inheritance of all three daytime hours, re-resolution, other feasts and solemnities.

## Publication boundaries / remaining verification

The user-provided Word text is a **source supplied for the repair**, not evidence that the production Firestore document already has its fields or that the translation's ecclesiastical approval has been independently checked.

**Web:** after merging and deploying PR #183, the bundled content fallback should make the daytime Proper available even if Firestore still contains empty/stale source fields. The live URL must then be visually checked at `terz`, `sext` and `non` (the Web router uses `non`, not `none`) for Pinsk on 2026-05-28; also check the corresponding movable date for 2027.

**Firestore / Flutter:** this PR does not write to Firestore. The JSON is ready to become a field-level content patch for `days` documents of `feast-christthehighpriest`, after inspecting a local snapshot and confirming the live document IDs. Do not overwrite unrelated Office fields or perform quota-consuming live reads without explicit authorization. Once Firestore is patched, follow `AGENTS.md` and `docs/app-content-distribution.md` for the content manifest and Flutter publication.

**Source retention:** the entire 11-page Word file is *not* checked into the repository. Only the fields needed to correct this issue are committed.
