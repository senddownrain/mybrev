# Ordo engine: ambiguous cases

Decisions taken in stage 3 that need liturgical confirmation or source validation (stage 6).

## Rules

1. **St Joseph in Holy Week** — engine anticipates to the Saturday before Palm Sunday
   (CDW 2008; e.g. 2035-03-17, 2046-03-17). The Belarusian calendars (Vitebsk 2025/26, "АС, 60")
   only state the general "nearest free day" rule, which would give a date after the Easter octave.
2. **Coinciding General-Calendar solemnities** (Sacred Heart × Nativity of John the Baptist
   2033, 2038, 2044; × Peter and Paul 2057) — engine keeps the solemnity of the Lord and moves the
   other to the next free day (e.g. 2033-06-25). In 2022 the CDW anticipated John the Baptist to
   23 June instead. A year override is the intended tool if a decree says otherwise.
3. **All Souls on Sunday** (2031, 2036, 2042 …) — primary is All Souls (row 3). Whether the Office
   is of the Sunday or of the dead is left as a descriptor note; the Mass is of All Souls.
4. **Compline in the Christmas octave and on All Souls** — *resolved by the sources (stage 6)*:
   days of the Christmas octave use Sunday Compline after I or II Vespers and have II Vespers
   (Minsk 26/30.12.2025, Vitebsk, Grodno). All Souls keeps the current weekday's Compline.
5. **Mary, Mother of the Church** coinciding with another obligatory memorial — engine treats
   them as a legal choice (Marian memorial first). CDW 2018 guidance should be confirmed.
6. **Christ the High Priest** — national (proper) feast: row 8, not row 5. It is therefore
   omitted if it meets a General-Calendar feast (e.g. Visitation 31 May).
7. **Holy Thursday** — row 2 during the day (Triduum starts with the evening Mass); the note
   selector phase `triduum` already includes Thursday.
8. **Diocesan principal patrons** stored as `Урачыстасць` in `fixedCalendar.js` are rows 4
   (proper solemnity) although GNLYC 8a lists the diocesan patron as a feast; the data wins.
9. **National layer** — which `fixedCalendar` entries without `place` are Belarus proper
   (rows 11/12 instead of 10/12) is a heuristic list in `fixedCelebrations.js` (Casimir, Andrew
   Bobola, OL of Budslau, OL of Ostra Brama, Raphael Kalinowski, Jurgis Matulaitis, Bolesława
   Lament). It only matters when proper and general memorials coincide.
10. **Saturday memorial of the BVM** is a legal alternative on Ordinary Time Saturdays without an
    obligatory memorial, but there is no `days` document for it, so no card is shown (the Common
    of the BVM would need a days document or a template route). Pinsk and Grodno also print it in
    Christmas/Easter time and next to obligatory memorials (EXPECTED_DIOCESAN_DIFFERENCE).
11. **Office for the Dead** — stage 4 offers it as a votive card only on ordinary weekdays
    (row 13, optional memorials allowed) and uses it as the Office of All Souls when the 2.11
    document is missing. Whether it should also be offered on other days needs a decision.
12. **Christmas week numbering** — the Baptism Sunday gets Christmas week 3 (legacy
    `calculateChristmasPeriodWeek`); its psalter week is irrelevant (proper psalms).
13. **Colours** are heuristics (martyr/apostle/evangelist → `ruber`; 27.12 and Lord/BVM →
    `albus`).

## Sources vs current MyBrev

14. **Ascension** — Thursday (Minsk/Vitebsk 2026). *Resolved*: `calendarStore` now takes the
    engine's dates; a stored `yearOptions` value still overrides and is logged.
15. **Immaculate Conception on an Advent Sunday** (2024, 2030) — *resolved*: `dayOptions` come
    from the engine (Sunday; the solemnity on Monday).
16. **I Vespers of feasts** — *resolved*: the Hours follow the engine (a feast has I Vespers only
    as a feast of the Lord on a Sunday). Minsk prints I Vespers of the Presentation on Sunday
    1.02.2026 (Presentation on Monday) — recorded as a source deviation, not followed.
17. **Vitebsk 27.12.2026** — the calendar prints "прапускаецца свята святых Немаўлят"; by the
    Table the omitted feast is St John (27.12) and the Innocents stay on 28.12 (as the same
    calendar prints for 28.12). Likely a typo in the source.
18. **Vitebsk St Boniface** — *fixed*: the 06.06 Vitebsk variant was removed from
    `fixedCalendar.js` (the source keeps 5 June). Firestore still has `06-06-sv-boniface-vitebsk`
    and the stale `05-06-vitebsk-cathedral-dedication`; they are no longer offered (no candidate)
    and can be deleted in a later data migration (planned as `mark-obsolete` by
    `scripts/ordo-migrate-ranks.mjs`, see `docs/ordo-firestore-followups.md`).
19. **Vitebsk Braslau (8 Sept)** replaces the Nativity of the BVM in that diocese
    (`DIOCESAN_REPLACES`), because titles differ.
20. **Sources list memorials on 17–24 Dec as "будзень альбо ўспамін"** (e.g. Vitebsk 21.12);
    engine models them as commemorations, not as full alternative Offices.

## Stages 4–6 (runtime and validation)

21. **Immaculate Heart + another obligatory memorial** (13.06.2026 St Anthony, 5.06.2027 St
    Boniface): the Missal makes both optional, so the weekday is primary with two alternatives.
    All four calendars print one of them as the primary celebration. The engine keeps the
    rubric; the validation marks these days as reviewed source simplifications.
22. **Pinsk patron in 2027** — St Andrew Bobola (proper solemnity) is impeded by Pentecost on
    16.05.2027; in Pinsk Mary, Mother of the Church is a feast (Pinsk 2026), which also impedes
    Monday, so the engine transfers the solemnity to Tuesday 18.05. To be confirmed by the 2027
    Pinsk calendar.
23. **Grodno proper from one year only** (2027): OL of Trakai as a feast on 10.07 (MyBrev: 5.07),
    St Adalbert 24.04 and St Stanislaus 8.05 as obligatory memorials, several blessed as optional
    memorials — modelled in `src/data/ordo/layers.js` from a single calendar. St John of Nepomuk
    (21.05.2027, transferred from 16.05) is not modelled (no permanent date in the evidence).
24. **Dedication of churches whose date is unknown** (Vitebsk/Pinsk 25.10.2026, Grodno
    31.10.2027: last Sunday of October) is a local-church rule — *implemented*:
    `LocalChurchContext.dedicationDate: 'unknown'` places the local solemnity on the last Sunday
    of October (Settings → Мой касцёл → «Дата невядомая»).
25. **Missing `days` documents** for legal options: Holy Name of Jesus (3.01), the universal
    optional memorials added in stage 6 (Gregory of Narek, John of Avila, Teresa of Calcutta,
    Hildegard, Faustina, John XXIII, Juan Diego, OL of Loreto, OL of Guadalupe), the diocesan
    additions of `layers.js` (e.g. OL of Łahiszyn, Pinsk's solemnity on 22.08) and the Saturday
    BVM. Alternatives without a document are not shown; a primary without one is shown with the
    texts of the day (`missingProper`). Firestore also still has the old ranks of Mary Magdalene
    (memoria) and All Souls (ad libitum); the runtime matches documents by id, so this only
    affects the legacy rank heuristics. Follow-ups: `docs/ordo-missing-content.md` (generated list)
    and `scripts/ordo-migrate-ranks.mjs` (rank plan), runbook `docs/ordo-firestore-followups.md`.
26. **I Vespers without `vesper1*` texts** are assembled from the celebration's own Vespers
    fields (Proper, completed with its Common at import). The Laudate psalms that some calendars
    prescribe for I Vespers of the Common are not in the data.
27. **Readings on memorials** follow the engine and the four calendars: the weekday readings are
    the default, the saint's readings an alternative (GIRM 357). A readings document linked to the
    chosen Hours card (`_dayId(s)`) is still shown first.
28. **Source errors kept as GENERATOR_MISMATCH** (reviewed, see the validation report): Vitebsk
    psalter-week headings (March/September 2026), rubrics copied from another day (Minsk 4.01,
    20.09, 16.11; Vitebsk 10.08, 24.08, 21.09, 3.06), Vitebsk's generic "II Vespers" on 27.12,
    Grodno's missing St John Baptist de la Salle (7.04.2027) and duplicated OL of Loreto (9.12).
29. **Christmas vigil notes** were generalized by the parser to the Christmas day only although
    they are printed on 24 December (PARSER_UNCERTAIN).
