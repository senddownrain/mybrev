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
- Стало (конец поля): officeOfReadingsAnt2: 2 ант. Яны абвяшчалі справу Бога * і зразумелі Яго ўчынкі. | officeOfReadingsPs2: се людзі будуць іх баяцца. Яны абвесцяць справу Бога * і зразумеюць Яго ўчынкі. А справядлівы ўзрадуецца ў Пану † і будзе шукаць прыбежышча ў Ім, * і праславяцца ўсе праведныя сэрцам. Ант. Яны абвяшчалі справу Бога * і зразумелі Яго ўчынкі.
- Основание: Volume III prints «абвяшалі справу» (2 ант., line 1703) and «абвяшалі справы» (closing antiphon, line 1733) while the verse of the same psalm in the same volume reads «абвесцяць справу Бога»; the verb is «абвяшчаць» everywhere else in the three volumes; Volumes I and II print «абвяшчалі справу» in both antiphons. The psalm body is identical in Volume II and in the stored base (checked word by word).
- Строки источников: officeOfReadingsAnt2: том I 1127–1127, том II 1209–1209, том III 1703–1704; officeOfReadingsPs2: том I 1128–1154, том II 1210–1236, том III 1705–1734
- Автопроверка: база совпадает с томами (тест)

### NR-010 · опечатка тома II «аллеюя»

- Не база: в тексте тома II (строки 118, 527, 1167; 4 слова) напечатано «аллеюя», всюду в трёх томах — «аллелюя». В сезонных вариантах исправлено; базовые поля опечатки не содержат.

## Найдено, но НЕ изменено (решение владельца)

Found by the comparison and NOT changed: the base fields of Ordinary Time stay as printed in Volume III unless the correction is proven and approved (see the open questions D-4 and D-6).

### Редакция перевода: тома I и II совпадают между собой и расходятся с томом III (90 полей)

| Поле | Том(а) | Различия (том III → тома I/II) |
|---|---|---|
| church-dedication.officeOfReadingsPs2 | I+II | «∅» → «чые»; «каго» → «∅» |
| church-dedication.officeOfReadingsR2 (существенно) | I+II | «прашэнні» → «малітвы»; «гораў» → «гор»; «камні» → «камяні»; «камені» → «камянях» |
| church-dedication.laudesHymn (существенно) | I+II | «няхай кожны атрымае» → «хай усе тут атрымаюць»; «аб чым просіць» → «чаго просяць»; «няхай» → «будуць»; «няхай будзе вечна» → «хай гучыць заўсёды» |
| church-dedication.laudesAntBen | I+II | «яго ў доме сваім» → «хрыста» |
| church-dedication.laudesPr | I+II | «народу» → «народа» |
| church-dedication.sext3R | I+II | «і» → «а я»; «двары» → «панадворкі» |
| church-dedication.vesperHymn | I+II | «і» → «так» |
| church-dedication.vesperAnt1 | I+II | «шацёр свой» → «жыллё сваё» |
| church-dedication.vesperPs1 | I+II | «святыя шатры» → «святое жыллё» |
| church-dedication.vesperPr | I+II | «народу» → «народа» |
| church-dedication.vesper1Ant2 | I+II | «∅» → «горад божы» |
| church-dedication.vesper1Ps2 | I+II | «∅» → «горад божы» |
| church-dedication.vesper1Inter | I+II | «адкідаеш» → «адкідваеш» |
| church-dedication.vesper1Pr | I+II | «народу» → «народа» |
| blessed-virgin-mary.officeOfReadingsPs2 | I+II | «святыя шатры» → «святое жыллё» |
| blessed-virgin-mary.laudesAnt1 | I+II | «прыйшо» → «прыйшло» |
| blessed-virgin-mary.vesperHymn | I+II | «хрыста бога» → «хрыстабога» |
| blessed-virgin-mary.vesperAntMag | I+II | «што» → «няхай» |
| blessed-virgin-mary.vesper1R | I+II | «нараджэння» → «∅»; «марыя» → «∅»; «нараджэння» → «∅» |
| blessed-virgin-mary.vesper1AntMag | I+II | «паглядзеў» → «глянуў» |
| blessed-virgin-mary.vesper1Inter | I+II | «ўсемагутнага» → «усемагутнага»; «валадарку» → «владарку» |
| apostles.sext2R | I+II | «12а» → «12 а» |
| apostles.vesperPs3 | I+II | «бо ён» → «i» |
| apostles.vesperR | I+II | «пана» → «∅» |
| apostles.vesperInter | I+II | «рупліва» → «працавіта» |
| apostles.vesper1Ant1 | I+II | «дванаццаць» → «∅»; «∅» → «дванаццаць» |
| apostles.vesper1Ant2 | I+II | «і» → «i» |
| apostles.vesper1Ps1 | I+II | «дванаццаць» → «∅»; «∅» → «дванаццаць» |
| apostles.vesper1Ps2 | I+II | «і» → «i» |
| apostles.vesper1Ps3 | I+II | «бо ён» → «i» |
| apostles.vesper1Inter | I+II | «рупліва» → «працавіта» |
| martyrs-many.officeOfReadingsPs2 | I+II | «належыць хваліць яго» → «прыстоіць спеў хвалы» |
| martyrs-many.officeOfReadingsR2 (существенно) | I+II | «∅» → «хвалебна»; «хвалу» → «∅»; «самому быць» → «асабіста паказацца»; «пана за» → «∅» |
| martyrs-many.laudesAnt1 | I+II | «хрыста» → «∅» |
| martyrs-many.sext1R | I+II | «навекі» → «на векі» |
| martyrs-many.vesperHymn | I+II | «зноў жадае» → «прымушае»; «адкінуў» → «адрокся»; «падавалі» → «падалі» |
| martyrs-many.vesper1Ps3 | I+II | «ніякага» → «∅» |
| martyr-one.officeOfReadingsHymn (существенно) | I+II | «ў цярпенні» → «праз цярпенне»; «ты» → «∅»; «∅» → «ты»; «й найсвяцейшаму» → «і святому» |
| martyr-one.officeOfReadingsPs2 | I+II | «палючы» → «пякучы» |
| martyr-one.officeOfReadingsR2 | I+II | «спажывай» → «пажывай»; «гасцей» → «бяседнікаў»; «удзяліў» → «ўдзяліў» |
| martyr-one.laudesHymn (существенно) | I+II | «ідзеш слядамі» → «крочыш следам»; «небе» → «нябёсах»; «адары» → «∅»; «∅» → «напоўні» |
| martyr-one.sext1R | I+II | «навекі» → «на векі» |
| martyr-one.vesperHymn (существенно) | I+II | «правіны» → «віны»; «у» → «ў»; «праз» → «за»; «правіны» → «віны» |
| martyr-one.vesperAnt1 | I+II | «ісці» → «пайсці» |
| martyr-one.vesperAnt2 | I+II | «будзе» → «∅» |
| martyr-one.vesperPs1 | I+II | «ісці» → «пайсці» |
| martyr-one.vesperPs2 | I+II | «будзе» → «∅» |
| martyr-one.vesper1Ps1 | I+II | «які ў нябёсах» → «∅» |
| pastors.officeOfReadingsHymn (существенно) | I+II | «зядноўваў авечак якіх» → «яднаў тваю паству якую»; «намасціў яго» → «∅»; «∅» → «намасціў яго»; «∅» → «рушыць у бой» |
| pastors.officeOfReadingsPs2 | I+II | «8» → «9»; «∅» → «ты ж пане узвышаны навекі» |
| pastors.officeOfReadingsPs3 | I+II | «∅» → «бо» |
| pastors.laudesHymn | I+II | «усё» → «ўсё» |
| pastors.laudesPr | I+II | «душаў» → «душ»; «народу» → «народа» |
| pastors.sext3R | I+II | «пан» → «∅»; «∅» → «пан» |
| pastors.vesperHymn | I+II | «збавеннаю» → «збаўленнаю»; «мы кожны год» → «штогод» |
| pastors.vesperPs3 | I+II | «3 4» → «34» |
| pastors.vesperPr | I+II | «душаў» → «душ»; «народу» → «народа» |
| pastors.vesper1Ps2 | I+II | «∅» → «праслаўляй душа мая пана» |
| pastors.vesper1Pr | I+II | «душаў» → «душ»; «народу» → «народа» |
| doctors-of-church.officeOfReadingsR2 | I+II | «трымценнем» → «трапятаннем» |
| doctors-of-church.vesperHymn | I+II | «стварэнне» → «што ўчыніў»; «гэтай жанчыны» → «∅» |
| doctors-of-church.vesper1R | I+II | «17 18» → «1718» |
| virgins.officeOfReadingsHymn | I+II | «спаслаў» → «∅»; «сваю» → «спаслаў» |
| virgins.officeOfReadingsAnt1 | I+II | «абраннік» → «абраннікам»; «∅» → «ёсць» |
| virgins.officeOfReadingsPs1 | I+II | «абраннік» → «абраннікам»; «∅» → «ёсць» |
| virgins.officeOfReadingsPs2 | I+II | «афіра» → «афіру» |
| virgins.laudesHymn | I+II | «увайшла» → «ўвайшла» |
| holy-men.officeOfReadingsHymn | I+II | «у» → «ў» |
| holy-men.officeOfReadingsPs2 | I+II | «∅» → «ты ж пане узвышаны навекі» |
| holy-men.officeOfReadingsPs3 | I+II | «∅» → «бо» |
| holy-men.laudesHymn | I+II | «для» → «ў»; «цярпенняў» → «цярпеннях»; «∅» → «каб» |
| holy-men.sext2R | I+II | «26 27а» → «2627а» |
| holy-men.vesperHymn | I+II | «у» → «ў»; «слуг» → «слугаў»; «да зорак» → «ў неба» |
| holy-men.vesperR | I+II | «28 30» → «2830» |
| holy-men.vesper1Ps2 | I+II | «∅» → «праслаўляй душа мая пана» |
| holy-women.officeOfReadingsPs2 | I+II | «афіра» → «афіру» |
| holy-women.officeOfReadingsR1 (существенно) | I+II | «вышэй» → «∅»; «1583» → «1787»; «∅» → «саламона»; «прасніцы» → «прaсніцы» |
| holy-women.laudesR | I+II | «жыве» → «∅»; «жыве» → «∅» |
| holy-women.vesperHymn | I+II | «пастамі» → «постам»; «што ў» → «у» |
| holy-women.vesperAnt3 | I+II | «благаслаўлёна» → «благаслаўлёнай» |
| holy-women.vesperPs3 | I+II | «благаслаўлёна» → «благаслаўлёнай» |
| holy-women.vesperInter | I+II | «мучанікаў» → «мучаніц» |
| holy-women.vesper1Inter | I+II | «мучанікаў» → «мучаніц»; «гэтым» → «тым жа» |
| religious.officeOfReadingsR2 | I+II | «дарозе» → «шляху»; «скіроўвацца» → «накіроўвацца»; «∅» → «як» |
| religious.laudesHymn (существенно) | I+II | «спазнаць» → «пазнаць»; «агонь» → «полымя»; «гэты слуга твой адданы жадаў» → «гэтыя шчырыя слугі жадалі»; «поўны» → «∅» |
| religious.vesperAntMag | I+II | «мной» → «мною» |
| religious.vesper1AntMag | I+II | «або» → «∅» |
| religious.vesper1Pr | I+II | «у» → «ў» |
| works-of-mercy.officeOfReadingsR2 | I+II | «камень» → «камяні» |
| educators.officeOfReadingsR2 (существенно) | I+II | «мурам» → «мyрам»; «будзем» → «∅»; «рупіцца» → «прыкладзем намаганні»; «бліжняга» → «братоў» |

### Текст тома III, которого нет в базе (8 полей)

| Поле | Слов нет в базе | Что именно (слова тома III, нормализованные) |
|---|---|---|
| blessed-virgin-mary.officeOfReadingsHymn | 21 | «або»; «або гімн» |
| blessed-virgin-mary.laudesHymn | 16 | «або»; «або гімн» |
| blessed-virgin-mary.laudesR | 9 | «і кароткі рэспансорый на выбар з ніжэйпададзеных кароткае чытанне» |
| blessed-virgin-mary.laudesAntBen | 8 | «ант да песні захарыі на выбар з ніжэйпададзеных» |
| martyr-one.vesper1R | 80 | «кароткае чытанне рым 8 35 37 39 хто адлучыць нас ад любові хрыста няшчасце ці прыгнёт ці пераслед ці голад ці галеча ці небяспека ці меч над усім гэтым мы атрым» |
| holy-men.officeOfReadingsHymn | 8 | «пра некалькіх святых гімн будзем праслаўляць за веру» |
| holy-women.officeOfReadingsR2 | 27 | «другое чытанне выбіраюцца найбольш адпаведныя тэксты з ліку тых што былі пададзены ў агульных тэкстах пра святых мужчын 1587 або іншае пра святую якая жыла ў су» |
| religious.officeOfReadingsR1 | 62 | «першае чытанне пасланне св апостала паўла да філіпянаў 3 7 4 1 4 9»; «пра законніцу пс 45 44 2 н адкінула валадарства гэтага свету і ўсю прыгажосць яго дзеля любові да пана майго езуса хрыста яго пазнала і выбрала у яго паверыла і» |

