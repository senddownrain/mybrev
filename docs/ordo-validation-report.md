# Ordo: проверка генератора по опубликованным календарям

> Генерируется `npm run ordo:validate` (`scripts/ordo/validate.mjs`). Полные результаты по
> каждому дню — `reports/ordo-validation.json` (не в git).

Каждый день из `src/data/ordo/evidence/<diocese>.json` (кроме "preview"-дней) сравнивается с
`generateLiturgicalYear(year, { diocese, notes })`. Выравнивание — по идентичности, а не по
гражданской дате: празднования — по `identity.id` (slug `days` / код подвижного праздника /
день периода), перенесённые — туда, куда их поставил движок; рубрики Нешпар/Комплеты — к вечеру
данной даты; заметки Гродно «на завтра» — к следующему дню; вигилия (24.12) — к торжеству.

Статусы: **MATCH**; **DIOC** = EXPECTED_DIOCESAN_DIFFERENCE (практика епархии / местного
костёла, которую движок сознательно не моделирует); **YEAR** = EXPECTED_YEAR_EXCEPTION (решение
одного года); **MORE** = SOURCE_MORE_DETAILED (источник знает больше, чем данные MyBrev);
**PARSER** = PARSER_UNCERTAIN (извлечённый факт ненадёжен); **MISMATCH** = GENERATOR_MISMATCH.
Каждый MISMATCH разобран: либо исправлен в движке/данных, либо записан в
`scripts/ordo/lib/validation-expectations.mjs` с причиной. «Разобранные» MISMATCH — ошибки
источника (опечатки, строки, скопированные с другого дня, противоречие общим нормам): движок под
них не подгоняется, но в статистике они остаются MISMATCH.

## Сводка по епархиям

Статус дня — худший статус его проверок. «Объяснено» = все статусы, кроме MISMATCH.

| Епархия | Дни | MATCH | DIOC | YEAR | MORE | PARSER | MISMATCH | MATCH | Объяснено | MISMATCH: разобрано / нет |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Мінск (2025–26) | 364 | 348 | 3 | 1 | 0 | 6 | 6 | **95.6%** | 98.4% | 6 / 0 |
| Віцебск (2025–26) | 364 | 325 | 2 | 1 | 5 | 6 | 25 | **89.3%** | 93.1% | 25 / 0 |
| Пінск (2026) | 369 | 335 | 25 | 0 | 7 | 1 | 1 | **90.8%** | 99.7% | 1 / 0 |
| Гродна (2027) | 371 | 319 | 41 | 0 | 3 | 3 | 5 | **86.0%** | 98.7% | 5 / 0 |

## Проверки

Доля MATCH среди дней, где источник позволяет проверку (например, I Нешпары проверяются только там,
где календарь их печатает; Te Deum — по типу Официя, напечатанному источником).

| Проверка | Мінск (2025–26) | Віцебск (2025–26) | Пінск (2026) | Гродна (2027) |
| --- | --- | --- | --- | --- |
| period | 100.0% (364/364) | 100.0% (364/364) | 100.0% (369/369) | 100.0% (371/371) |
| week | 100.0% (364/364) | 100.0% (364/364) | 100.0% (369/369) | 100.0% (371/371) |
| psalterWeek | 100.0% (336/336) | 95.5% (321/336; MISMATCH 15) | — | 100.0% (48/48) |
| primary | 99.7% (363/364; MISMATCH 1) | 99.5% (362/364; MISMATCH 2) | 99.7% (368/369; MISMATCH 1) | 98.7% (366/371; DIOC 1, PARSER 1, MISMATCH 3) |
| rank | 98.8% (159/161; PARSER 2) | 99.1% (341/344; PARSER 3) | 99.4% (170/171; PARSER 1) | 99.4% (180/181; DIOC 1) |
| color | 99.7% (363/364; YEAR 1) | 99.7% (359/360; MISMATCH 1) | 100.0% (368/368) | 99.7% (368/369; DIOC 1) |
| alternatives | 97.9% (94/96; DIOC 2) | 93.9% (92/98; DIOC 1, MORE 4, MISMATCH 1) | 71.7% (81/113; DIOC 25, MORE 7) | 58.7% (61/104; DIOC 40, MORE 3) |
| suppressed | — | 91.4% (32/35; MORE 3) | — | — |
| transfer | — | — | — | 100.0% (4/4) |
| firstVespers | 93.8% (60/64; MISMATCH 4) | 93.5% (58/62; MISMATCH 4) | 100.0% (62/62) | 98.4% (61/62; PARSER 1) |
| secondVespers | 100.0% (4/4) | 97.0% (64/66; MISMATCH 2) | 100.0% (1/1) | 100.0% (64/64) |
| compline | 100.0% (10/10) | 100.0% (29/29) | — | 100.0% (127/127) |
| officeType | 98.3% (357/363; DIOC 1, YEAR 1, PARSER 3, MISMATCH 1) | 98.6% (346/351; DIOC 2, PARSER 2, MISMATCH 1) | 99.7% (368/369; DIOC 1) | 98.4% (241/245; PARSER 1, MISMATCH 3) |
| teDeum | 99.7% (355/356; PARSER 1) | 99.7% (335/336; MISMATCH 1) | 100.0% (351/351) | 100.0% (238/238) |
| notes | 98.8% (85/86; PARSER 1) | 97.7% (170/174; YEAR 2, PARSER 2) | 100.0% (245/245) | 100.0% (190/190) |

## Разобранные ошибки источников (MISMATCH)

| Епархия | Дата | Проверка | Статус | Детали / причина |
| --- | --- | --- | --- | --- |
| minsk-mohilev | 2026-01-04 | firstVespers | MISMATCH | I Vespers of Epiphany printed on Sunday 4 Jan; Epiphany is Tuesday 6 Jan (its I Vespers are on 5 Jan). |
| minsk-mohilev | 2026-01-28 | officeType | MISMATCH | "Літургія гадзінаў з будня" on the obligatory memorial of St Thomas Aquinas. |
| minsk-mohilev | 2026-02-01 | firstVespers | MISMATCH | I Vespers of the Presentation (feast, Monday 2 Feb): feasts have no I Vespers unless a feast of the Lord falls on a Sunday (GNLYC 13); Sunday II Vespers (row 6) stand. |
| minsk-mohilev | 2026-06-13 | primary | MISMATCH | Immaculate Heart + St Anthony (obligatory): both become optional (Missal rubric); the calendar prints one as primary. |
| minsk-mohilev | 2026-09-20 | firstVespers | MISMATCH | I Vespers of the Sunday printed on the Sunday / the following Monday instead of the Saturday. |
| minsk-mohilev | 2026-11-16 | firstVespers | MISMATCH | I Vespers of the Sunday printed on the Sunday / the following Monday instead of the Saturday. |
| vitebsk | 2025-12-27 | secondVespers | MISMATCH | Generic "ІІ Нешпары" on the octave day; Holy Family (feast of the Lord on Sunday 28 Dec) has I Vespers (Minsk prints them). |
| vitebsk | 2026-01-04 | firstVespers | MISMATCH | "Камплета пасля І Нешпараў нядзелі" printed on the Sunday itself. |
| vitebsk | 2026-03-04 | primary | MISMATCH | St Casimir on a Lent weekday is only a commemoration (GNLYC 14, 16; Vitebsk rules: "толькі калекта"). |
| vitebsk | 2026-03-08 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-09 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-10 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-11 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-12 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-13 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-03-14 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-06-02 | color | MISMATCH | White printed for an Ordinary Time weekday (optional memorial of martyrs: green or red). |
| vitebsk | 2026-06-03 | secondVespers | MISMATCH | "ІІ Нешпары з урачыстасці Corpus Domini" on the eve (Wednesday); they are I Vespers. |
| vitebsk | 2026-06-13 | primary | MISMATCH | Immaculate Heart + St Anthony (obligatory): both become optional (Missal rubric); the calendar prints one as primary. |
| vitebsk | 2026-06-13 | alternatives | MISMATCH | Immaculate Heart + St Anthony (obligatory): both become optional (Missal rubric); the calendar prints one as primary. |
| vitebsk | 2026-08-10 | firstVespers | MISMATCH | "І Нешпары і Камплета з нядзелі" on a Monday feast (template copied from a Saturday). |
| vitebsk | 2026-08-22 | officeType | MISMATCH | Queenship of Mary printed as "успамін" but with "Афіцый са свята" and Gloria; universally a memorial. |
| vitebsk | 2026-08-22 | teDeum | MISMATCH | Queenship of Mary printed as "успамін" but with "Афіцый са свята" and Gloria; universally a memorial. |
| vitebsk | 2026-08-24 | firstVespers | MISMATCH | "І Нешпары і Камплета з нядзелі" on a Monday feast (template copied from a Saturday). |
| vitebsk | 2026-09-06 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-07 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-08 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-09 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-10 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-11 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-12 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| vitebsk | 2026-09-21 | firstVespers | MISMATCH | "І Нешпары і Камплета з нядзелі" on a Monday feast (template copied from a Saturday). |
| vitebsk | 2026-11-28 | psalterWeek | MISMATCH | Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II). |
| pinsk | 2026-06-13 | primary | MISMATCH | Immaculate Heart + St Anthony (obligatory): both become optional (Missal rubric); the calendar prints one as primary. |
| grodno | 2027-04-07 | primary | MISMATCH | St John Baptist de la Salle (obligatory memorial, 7 April, Wednesday after the Easter octave) not printed. |
| grodno | 2027-04-07 | officeType | MISMATCH | St John Baptist de la Salle (obligatory memorial, 7 April, Wednesday after the Easter octave) not printed. |
| grodno | 2027-06-05 | primary | MISMATCH | Immaculate Heart + St Boniface (obligatory): both become optional (Missal rubric); the calendar prints one as primary. |
| grodno | 2027-11-12 | officeType | MISMATCH | Obligatory memorial printed with the weekday Office line ("Аф. буд./звыч. перыяду"). |
| grodno | 2027-12-03 | officeType | MISMATCH | Obligatory memorial printed with the weekday Office line ("Аф. буд./звыч. перыяду"). |
| grodno | 2027-12-09 | primary | MISMATCH | Our Lady of Loreto printed on both 9 and 10 December (10 December is correct; 9 December is St Juan Diego). |

## Примеры остальных статусов

### EXPECTED_DIOCESAN_DIFFERENCE

| Епархия | Дата | Проверка | Статус | Детали / причина |
| --- | --- | --- | --- | --- |
| minsk-mohilev | 2025-12-31 | alternatives | DIOC | sv-sylvester-i never printed by minsk-mohilev |
| minsk-mohilev | 2026-03-04 | alternatives | DIOC | sv-casimir never printed by minsk-mohilev |
| minsk-mohilev | 2026-03-16 | officeType | DIOC | solemnity in the cathedral, feast in the diocese |
| vitebsk | 2026-07-21 | alternatives | DIOC | sv-lawrence-brindisi never printed by vitebsk |
| vitebsk | 2026-10-10 | officeType | DIOC | solemnity in the cathedral, feast in the diocese |
| vitebsk | 2026-10-25 | officeType | DIOC | Solemnity of the dedication in churches whose date is unknown (local church, last Sunday of October). |
| pinsk | 2025-12-29 | alternatives | DIOC | sv-thomas-becket never printed by pinsk |
| pinsk | 2025-12-31 | alternatives | DIOC | sv-sylvester-i never printed by pinsk |
| pinsk | 2026-01-10 | alternatives | DIOC | pinsk prints the Saturday BVM more widely |
| grodno | 2026-12-29 | alternatives | DIOC | sv-thomas-becket never printed by grodno |
| grodno | 2027-01-07 | alternatives | DIOC | sv-raymond-penyafort never printed by grodno |
| grodno | 2027-01-09 | alternatives | DIOC | grodno prints the Saturday BVM more widely |

### EXPECTED_YEAR_EXCEPTION

| Епархия | Дата | Проверка | Статус | Детали / причина |
| --- | --- | --- | --- | --- |
| minsk-mohilev | 2026-04-16 | color | YEAR | St Stanislaus kept on 16 April 2026 (year override); the source prints the weekday colour and Office line. |
| minsk-mohilev | 2026-04-16 | officeType | YEAR | St Stanislaus kept on 16 April 2026 (year override); the source prints the weekday colour and Office line. |
| vitebsk | 2026-03-08 | notes | YEAR | The first-Sunday devotion is printed on the second Sunday of March and June 2026. |
| vitebsk | 2026-06-14 | notes | YEAR | The first-Sunday devotion is printed on the second Sunday of March and June 2026. |

### SOURCE_MORE_DETAILED

| Епархия | Дата | Проверка | Статус | Детали / причина |
| --- | --- | --- | --- | --- |
| vitebsk | 2026-02-15 | suppressed | MORE | source omits: Прапускаецца ўспамін благаслаўлёнага Міхала Сапоцькі, прэзбітэра. |
| vitebsk | 2026-06-12 | suppressed | MORE | source omits: Прапускаецца ўспамін ad libitum благаславёных Антонія Ляшчэвіча МІС, Юрыя Кашыры |
| vitebsk | 2026-06-13 | suppressed | MORE | source omits: Прапускаецца ўспамін св. Антонія Падуанскага, прэзбітэра і доктара Касцёла. |
| pinsk | 2026-02-07 | alternatives | MORE | engine offers Saturday BVM; source silent |
| grodno | 2027-08-07 | alternatives | MORE | engine offers Saturday BVM; source silent; sv-cajetan never printed by grodno |
| grodno | 2027-09-11 | alternatives | MORE | engine offers Saturday BVM; source silent |

### PARSER_UNCERTAIN

| Епархия | Дата | Проверка | Статус | Детали / причина |
| --- | --- | --- | --- | --- |
| minsk-mohilev | 2025-12-24 | notes | PARSER | Christmas notes printed with the Vigil (24 Dec) were generalized to the Christmas day selector only. |
| minsk-mohilev | 2026-01-02 | officeType | PARSER | "з будня альбо з успаміну": the parser keeps the first alternative. |
| minsk-mohilev | 2026-02-09 | officeType | PARSER | memorial Office printed without a parsed celebration |
| vitebsk | 2025-12-24 | notes | PARSER | Christmas notes printed with the Vigil (24 Dec) were generalized to the Christmas day selector only. |
| vitebsk | 2026-03-30 | rank | PARSER | source rank sunday on a weekday ("ПАНЯДЗЕЛАК ВЯЛІКАГА ТЫДНЯ") |
| vitebsk | 2026-04-05 | officeType | PARSER | unparsed ": іі" |
| pinsk | 2026-03-30 | rank | PARSER | source rank sunday on a weekday ("ВЯЛІКІ ПАНЯДЗЕЛАК") |
| grodno | 2027-02-07 | firstVespers | PARSER | "І Нешп. і І Кампл. нядз." of Saturday 6 Feb read into the Sunday box of the PDF. |
| grodno | 2027-03-21 | officeType | PARSER | unparsed "пальм" |
| grodno | 2027-12-10 | primary | PARSER | unmapped primary "Маці Божай Ларэтанскай успамін абавязковы" |

## Что исправлено по результатам проверки

- Нешпары и Комплета в октаве Рождества: II Нешпары и воскресная Комплета (после I или II Нешпар),
  как в Минске (26 и 30.12.2025), Витебске и Гродно.
- Суббота Пасхальной октавы → I Нешпары II Пасхального воскресенья (равный ранг, воскресенье
  начинается с I Нешпар; Витебск, Пинск 11.04.2026).
- Цвета: Всех усопших — фиолетовый (альтернатива — чёрный); Великая суббота — белый Вигилии.
- Данные: Остробрамская — обязательное воспоминание во всей Беларуси, Кармельская — в Гродно;
  св. Иоанн Авильский (10.05, общий календарь); «Свв. Марфы, Марии и Лазаря» (29.07).
- Селекторы заметок: фазы периода парсера, заметки местных костёлов в контексте епархии,
  фатимский день 13-го числа каждого месяца.
