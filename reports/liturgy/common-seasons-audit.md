# Агульныя тэксты: сезонныя варыянты — аўдыт

Крыніцы: `01_advent_christmas_utf8.txt` (sha256 400d1242eedc…), `02_lent_easter_utf8.txt` (sha256 a084c86cf4da…), `03_ordinary_utf8.txt` (sha256 2c8f53b66bbf…).

## Лічбы

- Common: 13; клетак матрыцы Common × поле × сезон: 2276
- Том I: распазнана адзінак 525, палёў 446, парсерных заўваг 0
- Том II: распазнана адзінак 548, палёў 445, парсерных заўваг 0
- Том III: распазнана адзінак 540, палёў 446, парсерных заўваг 0
- Палёў са сезонным варыянтам (запісана ў `_seasonalVariants`): 426 (advent: 7, christmas: 7, lent: 82, easter: 330)
- Яўных сезонных умоў: 451; рэдакцыйных адрозненняў (не сезонных): 500
- Не прыменена (форма Аллелюя ў К./Н.): 97 элементаў; needs_review: 12

## Катэгорыі

| Катэгорыя | Клетак |
|---|---|
| ordinary_base | 977 |
| seasonal_explicit | 451 |
| editorial_difference | 500 |
| missing_source | 314 |
| seasonal_structural | 34 |

## Статусы

| Статус | Клетак |
|---|---|
| inherit | 1803 |
| variant | 426 |
| review | 47 |

## needs_review

### NR-001 · alleluia-versicle-form
**Form of Alleluia added to K./Н. versicles and responsory responses**
«(Велікодны перыяд Аллелюя)» follows 97 K./Н. lines in 51 fields. The volumes print no Easter form of such lines (only of antiphons), so the text was NOT generated; the stored base is inherited in Easter for these elements.
- Прапанова: append «, аллелюя.» before the final full stop (rule alleluia-v1-versicle); confirm the punctuation and then run the parser with --include-unverified
- Палёў: 51 (church-dedication.officeOfReadingsVers, church-dedication.officeOfReadingsR2, church-dedication.sext1R, church-dedication.sext2R, church-dedication.sext3R, blessed-virgin-mary.officeOfReadingsVers, blessed-virgin-mary.officeOfReadingsR2, blessed-virgin-mary.sext1R, blessed-virgin-mary.sext2R, blessed-virgin-mary.sext3R, apostles.officeOfReadingsVers, apostles.sext1R, …); поўны спіс у JSON

### NR-002 · element-unresolved · church-dedication.officeOfReadingsAnt2 · easter
- Прычына: text after the annotation: «†»
- Крыніца: том II, радкі 196–196
- Тэкст: 2 ант. Якія мілыя Твае шатры, * Пане Магуццяў! †

### NR-003 · element-unresolved · apostles.officeOfReadingsPs2 · easter
- Прычына: low-confidence match (similarity 0.78) between the annotated element and the stored block; applied, please verify
- Крыніца: том II, радкі 1210–1235
- Тэкст: Ант. Яны абвяшчалі справу Бога * і зразумелі Яго ўчынкі.

### NR-004 · element-unresolved · religious.officeOfReadingsR1 · easter
- Прычына: no stored block matches the annotated element (best similarity 0.09)
- Крыніца: том II, радкі 5066–5080
- Тэкст: Н. Кожны, хто дзеля Майго імя пакінуў дом, ці братоў, ці сясцёр, ці айцоў, ці маці, ці дзя

### NR-005 · element-unresolved · religious.officeOfReadingsR1 · easter
- Прычына: no stored block matches the annotated element (best similarity 0.12)
- Крыніца: том II, радкі 5066–5080
- Тэкст: Н. Патрэбна толькі адно. * Яна выбрала найлепшую частку, якая не адымецца ў яе.

### NR-006 · element-unresolved · works-of-mercy.officeOfReadingsR1 · easter
- Прычына: no stored block matches the annotated element (best similarity 0.19)
- Крыніца: том II, радкі 5160–5169
- Тэкст: Н. Любоў да Бога ёсць у тым, каб мы захоўвалі Ягоныя запаведзі, * а запаведзі Яго не з’яўл

### NR-007 · base-defect-kn-swapped · apostles.officeOfReadingsVers · advent
- Прычына: К./Н. labels are swapped in the stored base (the volume of the season prints them correctly)
- Крыніца: том I, радкі 1184–1185
- Том: «к. апосталы абвяшчалі хвалу і магутнасць пана. н. і цуды, якія ён учыніў.» / захаваны: «н. апосталы абвяшчалі хвалу і магутнасць пана. к. і цуды, якія ён учыніў.»
- Прапанова: fix the К./Н. labels in patchs/feasts/common-texts (separate editorial change; not part of the seasonal variants)

### NR-008 · base-defect-kn-swapped · virgins.officeOfReadingsVers · advent
- Прычына: К./Н. labels are swapped in the stored base (the volume of the season prints them correctly)
- Крыніца: том I, радкі 3347–3348
- Том: «к. ты паказаў мне шляхі жыцця. н. напоўніў мяне радасцю сузірання твайго аблічча» / захаваны: «н. ты паказаў мне шляхі жыцця. к. напоўніў мяне радасцю сузірання твайго аблічча»
- Прапанова: fix the К./Н. labels in patchs/feasts/common-texts (separate editorial change; not part of the seasonal variants)

### NR-009 · base-defect-kn-swapped · holy-women.officeOfReadingsVers · advent
- Прычына: К./Н. labels are swapped in the stored base (the volume of the season prints them correctly)
- Крыніца: том I, радкі 4328–4329
- Том: «к. разважанні майго сэрца заўжды перад табою. н. пане, мая дапамога і мой адкупі» / захаваны: «н. разважанні майго сэрца заўжды перад табою. к. пане, мая дапамога і мой адкупі»
- Прапанова: fix the К./Н. labels in patchs/feasts/common-texts (separate editorial change; not part of the seasonal variants)

### NR-010 · source-misprint-corrected
- Прычына: misprint «аллеюя» (every other occurrence reads «аллелюя»)
- Прапанова: confirm the correction

### NR-011 · holy-week-mapping
- Прычына: Ordo period `holyweek` (Palm Sunday–Holy Thursday) takes the Lent variants; the Triduum takes none. The rubric of Volume II says «У Вялікі пост».
- Прапанова: confirm; no Common-based Office is legal in Holy Week/Triduum (proved by tests/common-seasons-calendar.test.mjs)

### NR-012 · blessed-virgin-mary-saturday-memorial · blessed-virgin-mary
- Прычына: The stored Common merges the main texts and the «Успамін Найсв. Панны Марыі ў суботу» alternatives into the same fields; seasonal prayers of Volume I replace the whole list of optional prayers in Advent/Christmas.
- Прапанова: confirm that in Advent and the Christmas season the six optional prayers are not offered (Volume I prints only the seasonal prayer)

## Парсерныя заўвагі (магчымыя страты)

- Том I: няма
- Том II: няма
- Том III: няма

Поўная матрыца (Common × гадзіна × поле × сезон) — у `common-seasons-audit.json`.

