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
4. **Compline in the Christmas octave and on All Souls** — engine uses the current weekday
   (Sunday Compline only for solemnities, Sundays, Triduum, Easter octave).
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
10. **Saturday memorial of the BVM** is offered as an alternative on Ordinary Time Saturdays
    without an obligatory memorial. Current `dayOptions` never shows it.
11. **Office for the Dead** is not a liturgical alternative (it is currently always listed in
    `dayOptions`); stage 4 should expose it as a votive option.
12. **Christmas week numbering** — the Baptism Sunday gets Christmas week 3 (legacy
    `calculateChristmasPeriodWeek`); its psalter week is irrelevant (proper psalms).
13. **Colours** are heuristics (martyr/apostle/evangelist → `ruber`; 27.12 and Lord/BVM →
    `albus`).

## Sources vs current MyBrev

14. **Ascension** — Minsk/Vitebsk 2026 give Thursday 14 May; `calendarStore.getDynamicDates`
    falls back to Pentecost − 7 days (Sunday) when `yearOptions.ascension` is missing. Engine: Thursday.
15. **Immaculate Conception on an Advent Sunday** (2024, 2030) — current `dayOptions` sorts the
    solemnity above the Sunday; engine keeps the Sunday and transfers to Monday.
16. **I Vespers of feasts** — `hasFirstVespersRank` accepts any `festum`; engine grants I Vespers
    to a feast only when a feast of the Lord replaces a Sunday of Christmas/Ordinary Time.
17. **Vitebsk 27.12.2026** — the calendar prints "прапускаецца свята святых Немаўлят"; by the
    Table the omitted feast is St John (27.12) and the Innocents stay on 28.12 (as the same
    calendar prints for 28.12). Likely a typo in the source.
18. **Vitebsk St Boniface** — the source has a memorial on 5 June; `fixedCalendar.js` has a
    Vitebsk variant on 06.06 (and `patchs/db-feasts` a stale Vitebsk cathedral dedication on
    05.06, while the source and `fixedCalendar.js` give 10.10). The engine follows
    `fixedCalendar.js`; stage 6 should confirm and fix the data.
19. **Vitebsk Braslau (8 Sept)** replaces the Nativity of the BVM in that diocese
    (`DIOCESAN_REPLACES`), because titles differ.
20. **Sources list memorials on 17–24 Dec as "будзень альбо ўспамін"** (e.g. Vitebsk 21.12);
    engine models them as commemorations, not as full alternative Offices.
