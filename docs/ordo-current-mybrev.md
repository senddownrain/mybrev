# Ordo: текущий pipeline MyBrev и расхождения с согласованным алгоритмом

Краткая карта того, как MyBrev сейчас решает «какой литургический день сегодня», и где это
расходится с алгоритмом из `.ordo-sources/claude_mybrev_ordo_resolver_master_prompt.md`
(разделы 9–19, 30). Примеры расхождений взяты из извлечённых календарей
(`src/data/ordo/evidence/*.json`).

## 1. Текущий pipeline

```text
calendarStore.getYearOptions(year)          Firestore `yearOptions` (Easter, Ash, Pentecost,
      │                                      Advent I, ordintaryWeeks1/2, ascension, corpusChristi)
      ▼
calendarStore.getDynamicDates(year)         moment-даты FEAST_NAME_MAP (holyFamily, baptismOfLord,
      │                                      christKing, sacredHeart, …) — вычисляются из yearOptions
      ▼
computeLiturgicalContext(date)              src/utils/liturgicalCalendar.js
      │  → { periodType, periodWeek, dayOfWeek(1=Нд), _feast }
      ▼
liturgicalContentService.fetchContentForDate
      └─ liturgicalDayService.fetchDaysForDate
           ├─ period:   days/{period}-w{N}-d{D} (+ psalter fallback ordinary-w{1..4}, advent←ordinary)
           ├─ fixed:    days where _date == DD.MM (все варианты `_rank`/`_place`)
           ├─ seasonal: days/advent-DD-12 (17–24.12), christmas-DD-MM (25.12–12.01,
           │            кроме 25–28.12, 01.01, 06.01 — там только fixed)
           ├─ dynamic:  days where _feast == code (holyfamily/buptismofthelord «эксклюзивны»:
           │            прячут period и fixed)
           └─ office-for-dead (всегда)
      │  resolveDayAgainstPeriod: from-day / from-first-week / from-own-texts, _fromDayFields,
      │  field-level fallback period → template → own
      ▼
dayOptions = period + dynamic + groupFixedCelebrationDays(fixed) + office-for-dead
      │  sort: getLiturgicalCelebrationPriority() (solemnity 0 < feast 1 < всё остальное 2),
      │        затем порядок источника (period 1, dynamic 2, fixed 3)
      ▼
OrasList.vue  → выбор карточки/шаблона → useResolvedLiturgicalDay(route id) → компоненты часов
      ├─ liturgicalOffice.usesSundayCompletorium(day)  (только по рангу solemnitas)
      ├─ liturgicalOffice.shouldShowTeDeum(day)       (ранг + октавы + нядзелі, без Посту)
      ├─ liturgicalVespers.getTomorrowFirstVespersOptions(tomorrowContent)
      │     (festum|solemnitas + наличие vesper1* в документе)
      └─ liturgicalPsalter.calculatePsalterWeek()

readingsService.getReadingsForDate()        СВОЙ приоритет: linked dayId > _feast > seasonal/fixed
                                            _date > period (year/cycle), независимо от dayOptions
```

Идентичности, которые уже есть и которые Ordo использует как ключи:

| Слой | Ключ | Где |
| --- | --- | --- |
| Период | `period` + `week` + `dayOfWeek` → `lent-w2-d4` | `getPeriodDayDocumentId` |
| Сезонная дата | `advent-20-12`, `christmas-02-01` | `getSeasonalDateExceptionId` |
| Fixed | `DD.MM` + `_rank` + `_place` (slug из `patchs/db-feasts/_id`) | `fixedCalendar.js`, `buildFixedDayId` |
| Dynamic | `feast-ascension` → `ascension` | `FEAST_NAME_MAP` |
| Common | `_templates` (`martyr-one`, `pastors`, …) | `templates` |

## 2. Что оставляем как есть

- Разделение `days` / `readings` / `templates`; Ordo не хранит тексты.
- `resolveDayAgainstPeriod` и маркеры `from-day`, `from-first-week`, `from-own-texts`,
  `_templates`, field-level fallback, current psalter — это и есть будущий Component Resolver.
- Date-based хранение Advent 17–24 и Christmas 25.12–12.01 (`advent-DD-12`, `christmas-DD-MM`).
- `_place` (строка или массив) как механизм епархиальных fixed-вариантов.
- `computeLiturgicalContext` как вычислитель period/week/day — теперь его можно кормить
  `buildYearOptions(year)` из `src/utils/liturgicalMovableDates.js` вместо Firestore.

## 3. Расхождения с алгоритмом

| # | Место | Сейчас | Должно быть (spec) | Пример из источников |
| --- | --- | --- | --- | --- |
| A | `getLiturgicalCelebrationPriority` | 3 уровня: solemnity > feast > остальное; сезон не учитывается | Полная таблица первенства (АНЛГ 59): Triduum, привилегированные нядзелі, Ash Wed, Holy Week, Easter/Christmas octave, 17–24.12, будні Посту, местный proper | 30.11.2025 (I нядзеля Адвэнту) св. Андрэй (festum) сортируется **выше** нядзелі; Віцебск: «Прапускаецца свята св. Андрэя». 25.01.2026 — то же с Навяртаннем св. Паўла |
| B | `dayOptions` | period + fixed + dynamic + office-for-dead — все документы, которые нашлись | Display Resolver: PRIMARY + только литургически допустимые ALTERNATIVES; будний день не показывается рядом с обязательным успамінам/святам | 03.12.2025 «Успамін св. Францішка Ксавэрыя» — MyBrev показывает и будний Адвэнту как равную карточку; Мінск: «Літургія гадзінаў з успаміну» |
| B2 | Привилегированные периоды | fixed optional memorial = полноценная опция | В 17–24.12, октаве Нараджэння, буднях Посту — только `commemoratio`; на нядзелі/урачыстасці/Holy Week/Easter octave — вообще нет | 29.12.2025 св. Тамаш Бэкет: Віцебск «можна карыстацца толькі калектай»; Пінск: «Дазволена: усп. …» в Пост |
| C | `hasFirstVespersRank` | любое `festum`/`solemnitas` с `vesper1*` заменяет вечер | I Нешпары: урачыстасці и нядзелі; святы — только святы Пана на нядзелю (Віцебск, «Парадак афіцыя»). Конфликт II Нешпараў сегодня vs I Нешпараў завтра — по таблице первенства | Віцебск: «Святы не маюць І Нешпараў, калі толькі гэта не святы Пана, якія прыпадаюць на нядзелю» |
| C2 | Наличие I Vespers | определяется наличием `vesper1*` текстов | «Имеет ли celebration I Vespers по рубрикам» отделено от «есть ли собственные тексты» (иначе Common) | 06.12.2025: «1-я нешпары з ІІ нядзелі Адвэнту» — нядзеля без `vesper1*` в fixed |
| D | `readingsService` | собственный порядок источников | Readings получают ту же `ResolvedLiturgicalDay` | 25.01.2026 (нядзеля): fixed-документ Навяртання ставится первым, Hours/источник — нядзеля |
| E | Seasonal exceptions | включаются по дате, вне precedence | Сезонный документ — кандидат в общем resolver-е; seasonal + saint → commemoratio | 17–24.12 + fixed optional memorial показываются как две равные опции |
| F | `_place` | только fixed-варианты по епархии | + local church (`LocalChurchContext`), cathedral (урачыстасць у катэдры, свята ў дыяцэзіі) | Віцебск 10.10: «У дыяцэзіі свята. У Катэдральным касцёле ўрачыстасць» |
| G | Compline | воскресная только для `solemnitas` | + Вялікі Чацвер/Пятніца/Субота, Велікодная актава («Камплета – як пасля 2-х Нешпараў на нядзелю») | Мінск 02–04.04.2026 |
| H | `yearOptions` | обязательный Firestore-документ на год | Генерация из постоянных правил | `buildYearOptions(2027)` совпадает с Гродна 2027 |
| I | Данные `fixedCalendar.js` | см. `ordo-diocesan-differences.md` | — | Марыя Магдалена: `memoria` → во всех 4 календарях **свята**; Усіх памерлых: `''` (= ad libitum); нет св. Фаўстыны, Хільдэгарды, Тэрэзы з Калькуты, Грыгорыя Нарэцкага, НПМ Ларэтанскай/з Гвадэлупы |
| J | Office for the Dead | всегда отдельная карточка | Разрешённый выбор только там, где ватыўны/за памерлых допустимы (таблицы Імшаў/ЛГ в Віцебску, Гродна) | нядзелі Адвэнту/Посту, урачыстасці |

### Выборочная проверка psalter week (оракул)

`calculatePsalterWeek` совпадает с заявленной в источниках неделей Псалтыра в 361 из 364
дней Мінска и 51 из 52 заявлений Гродна. Расхождения: Хрост Пана (Мінск II, MyBrev III),
Вялікдзень и Спасланне (источники продолжают неделю предыдущего раздела — дни имеют свой
proper), Віцебск: несколько недель с опечаткой в заголовке. Полная сверка — этап 6.

## 4. Какие структуры добавить

1. `YearContext` (movable dates + phases) — `liturgicalMovableDates.js` уже есть.
2. Candidate generator: все кандидаты с `identity` (period / seasonal / fixed / dynamic / proper / local / override).
3. Precedence table + правила переносов (урачыстасці) и подавлений.
4. Display Resolver: `primary`, `alternatives`, `commemorations`, `suppressed`.
5. Office Resolver: `sourceFallbacks[]` vs `allowedChoices[]`, I/II Vespers, Compline, Te Deum.
6. Ordo notes layer (`src/data/ordo/notes.json`) + YearOverride.
7. Общий `ResolvedLiturgicalDay` для Hours и Readings.
