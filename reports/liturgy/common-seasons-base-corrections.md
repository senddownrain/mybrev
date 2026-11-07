# Ведомость исправлений базовых текстов Common (отдельно от сезонных вариантов)

База = плоские поля `patchs/feasts/common-texts/*.json` (Звычайны перыяд, том III). Здесь только то, что **изменено в базе** отдельными коммитами по решениям редактора, и то, что найдено, но **не** изменено. Сезонные варианты (`_seasonalVariants`) — в `common-seasons-audit.md`.

## Подтверждённые исправления (применены)

### NR-007 · apostles.officeOfReadingsVers

- Коммит: «fix(liturgy): swap К./Н. labels in officeOfReadingsVers of apostles, virgins, holy-women»
- Было: Н. Апосталы абвяшчалі хвалу і магутнасць Пана. К. І цуды, якія Ён учыніў.
- Стало (конец поля): officeOfReadingsVers: К. Апосталы абвяшчалі хвалу і магутнасць Пана. Н. І цуды, якія Ён учыніў.
- Основание: Volumes I and II print «К. Апосталы абвяшчалі хвалу і магутнасць Пана. Н. І цуды, якія Ён учыніў.»; Volume III prints the labels reversed. The Proper of Ss. Philip and James (patchs/db-feasts/03-05-sv-philip-james-apostles.json) has К. first.
- Строки источников: officeOfReadingsVers: том I 1184–1185, том II 1266–1267, том III 1767–1769
- Автопроверка: база совпадает с томами (тест)

### NR-008 · virgins.officeOfReadingsVers

- Коммит: «fix(liturgy): swap К./Н. labels in officeOfReadingsVers of apostles, virgins, holy-women»
- Было: Н. Ты паказаў мне шляхі жыцця. К. Напоўніў мяне радасцю сузірання Твайго аблічча.
- Стало (конец поля): officeOfReadingsVers: К. Ты паказаў мне шляхі жыцця. Н. Напоўніў мяне радасцю сузірання Твайго аблічча.
- Основание: Volumes I and II print «К. Ты паказаў мне шляхі жыцця. Н. Напоўніў мяне радасцю сузірання Твайго аблічча.» (Пс 16 (15), 11); Volume III prints the labels reversed.
- Строки источников: officeOfReadingsVers: том I 3347–3348, том II 3781–3782, том III 4386–4388
- Автопроверка: база совпадает с томами (тест)

### NR-009 · holy-women.officeOfReadingsVers

- Коммит: «fix(liturgy): swap К./Н. labels in officeOfReadingsVers of apostles, virgins, holy-women»
- Было: Н. Разважанні майго сэрца заўжды перад Табою. К. Пане, мая дапамога і мой Адкупіцель.
- Стало (конец поля): officeOfReadingsVers: К. Разважанні майго сэрца заўжды перад Табою. Н. Пане, мая дапамога і мой Адкупіцель.
- Основание: ONLY Volume I prints «К. Разважанні майго сэрца заўжды перад Табою. Н. Пане, мая дапамога і мой Адкупіцель.»; Volumes II and III repeat the same reversed order (the first decision note assumed that Volume II is right: it is not). The versicle is the first half of Пс 19 (18), 15, the response the second half; every other Common of the three volumes prints К. before Н.
- Строки источников: officeOfReadingsVers: том I 4328–4329, том II 4777–4778, том III 5581–5583
- Автопроверка: база совпадает с томами (тест)

### NR-003 · apostles.officeOfReadingsAnt2 + officeOfReadingsPs2 (closing antiphon)

- Коммит: «fix(liturgy): apostles Ps 64 (63) antiphon wording (абвяшчалі справу)»
- Было: 2 ант. Яны абвяшалі справу Бога * і зразумелі Яго ўчынкі. / (closing) Ант. Яны абвяшалі справы Бога * і зразумелі Яго ўчынкі.
- Стало (конец поля): officeOfReadingsAnt2: 2 ант. Яны абвяшчалі справу Бога * і зразумелі Яго ўчынкі. | officeOfReadingsPs2: уецца ў Пану † і будзе шукаць прыбежышча ў Ім, * і праславяцца ўсе праведныя сэрцам. Хвала Айцу і Сыну, * і Духу Святому. Як была спрадвеку, цяпер і заўсёды, * і на векі вечныя. Амэн. Ант. Яны абвяшчалі справу Бога * і зразумелі Яго ўчынкі.
- Основание: Volume III prints «абвяшалі справу» (2 ант., line 1703) and «абвяшалі справы» (closing antiphon, line 1733) while the verse of the same psalm in the same volume reads «абвесцяць справу Бога»; the verb is «абвяшчаць» everywhere else in the three volumes; Volumes I and II print «абвяшчалі справу» in both antiphons. The psalm body is identical in Volume II and in the stored base (checked word by word).
- Строки источников: officeOfReadingsAnt2: том I 1127–1127, том II 1209–1209, том III 1703–1704; officeOfReadingsPs2: том I 1128–1154, том II 1210–1236, том III 1705–1734
- Автопроверка: база совпадает с томами (тест)

### NR-010 · опечатка тома II «аллеюя»

- Не база: в тексте тома II (строки 118, 527, 1167; 4 слова) напечатано «аллеюя», всюду в трёх томах — «аллелюя». В сезонных вариантах исправлено; базовые поля опечатки не содержат.

## Найдено, но НЕ изменено (решение владельца)

Found by the comparison and NOT changed: the base fields of Ordinary Time stay as printed in Volume III unless the correction is proven and approved (see the open questions D-4 and D-6).

### Редакция перевода: тома I и II совпадают между собой и расходятся с томом III (0 полей)

| Поле | Том(а) | Различия (том III → тома I/II) |
|---|---|---|

### Текст тома III, которого нет в базе (4 полей)

| Поле | Слов нет в базе | Что именно (слова тома III, нормализованные) |
|---|---|---|
| blessed-virgin-mary.officeOfReadingsHymn | 21 | «або»; «або гімн» |
| blessed-virgin-mary.laudesHymn | 16 | «або»; «або гімн» |
| blessed-virgin-mary.laudesR | 9 | «і кароткі рэспансорый на выбар з ніжэйпададзеных кароткае чытанне» |
| blessed-virgin-mary.laudesAntBen | 8 | «ант да песні захарыі на выбар з ніжэйпададзеных» |

