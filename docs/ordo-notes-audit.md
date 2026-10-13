# Ordo notes: semantic audit

Згенеравана `node scripts/ordo/build.mjs` — не рэдагаваць уручную. Рэвізія публікацыі заўваг: **5**.
Правілы: `scripts/ordo/lib/note-guards.mjs`.

| | |
|---|---|
| Апублікаваных заўваг | 1338 |
| Выпраўлена аўтаматычна (месяц / шчыльнасць) | 40 |
| Дакладная дата / год (у т.л. 131 падзеленых па днях) | 175 |
| Кананічныя правілы (І чацвер / пятніца / субота) | 3 |
| Схавана да праверкі (не публікуюцца) | 45 |
| Апублікавана з пазнакай NEEDS_REVIEW | 46 |

## Coverage by diocese

«Уласныя» — заўвагі, якія назіраліся ў календары дыяцэзіі; «бачныя» — разам з агульнабеларускімі.
Агульныя заўвагі (front matter Гродна / Пінск) аднаўляюцца `scripts/ordo/lib/general-notes.mjs`;
прапушчаныя абзацы — з прычынай (табліцы, правілы першынства, якія лічыць engine, абавязак Імшы
«pro populo», індэксы, грошы/ахвяраванні, персанальныя даныя духавенства). Тамы Лекцыянарыя /
Літургіі гадзін — асобная катэгорыя `books` (метаданыя, не «Асаблівыя заўвагі»).

| Дыяцэзія | Уласныя | Бачныя | Агульныя заўвагі | Тамы (books) | NEEDS_REVIEW | Абзацаў front matter | Прапушчана front matter |
|---|---|---|---|---|---|---|---|
| minsk-mohilev | 141 | 179 | 0 | 6 | 2 | 0 | — |
| vitebsk | 396 | 413 | 0 | 0 | 16 | 0 | — |
| pinsk | 526 | 552 | 14 | 0 | 5 | 14 | index-or-fragment 16, precedence-table-computed-by-engine 13, pastor-mass-pro-populo-obligation 3, table 2, patrons-list 1, table-of-the-year 1, holy-days-of-obligation-list 1 |
| grodno | 352 | 374 | 113 | 51 | 23 | 121 | table 42, heading 18, pastor-mass-pro-populo-obligation 15, patrons-or-table 8, precedence-rule-computed-by-engine 3, excluded:money 1 |

Высокі працэнт супадзення з календарамі не лічыцца поспехам, калі «Чэрвеньскае набажэнства» паказваецца ў кастрычніку:
сэнс тэксту правяраецца асобна ад частаты.

## Fixed automatically

Месяц у тэксце («Чэрвеньскае…», «маёвыя…») або рэдкія выпадкі (чатыры чэрвеньскія нядзелі ≠ «кожная нядзеля Звычайнага перыяду»).

| Заўвага | Дыяцэзія | Селектар цяпер | Чаму |
|---|---|---|---|
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="corpuschristi" + месяц 6 | month 6 from text |
| Пачатак маёвых набажэнстваў (Аг 863). | pinsk | celebration celebrationId="dedication-cathedral" + месяц 5 | month 5 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="heartofmary" + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="nativity-john-baptist" + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="sv-barnabas" + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="sv-boniface" + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | celebration celebrationId="sv-charles-lwanga-companions" + месяц 6 | month 6 from text |
| Пачатак чэрвеньскіх набажэнстваў (Аг 758– 773). | pinsk, grodno | celebration celebrationId="sv-justin" + месяц 6 | month 6 from text |
| Успамін св. Юстына, Мч. Пачатак чэрвеньскіх набажэнстваў. Міжнародны д | grodno | celebration celebrationId="sv-justin" + месяц 6 | month 6 from text |
| Наб. і літанія да свв. Апосталаў Пятра і Паўла (Аг 1056). Чэрвеньскае  | pinsk | celebration celebrationId="sv-peter-paul-apostles" + месяц 6 | month 6 from text |
| Свята Адведзінаў НПМ. Заканчэнне маёвых набажэнстваў. | grodno | celebration celebrationId="visitation-blessed-virgin-mary" + месяц 5 | month 5 from text |
| Успамін св. Караля Луангі і паплечнікаў, Мм. Заканчэнне актавы Божага  | grodno | nth-weekday-of-month isoWeekday=4 nth=1 + месяц 6 | coverage 0.08 → months 6 |
| Агульная Імша пра мучанікаў (пра панну мучаніцу) альбо пра паннаў (пра | vitebsk | nth-weekday-of-month isoWeekday=4 nth=1 + месяц 2 | coverage 0.08 → months 2 |
| Успамін св. Агаты, Пн Мч. Благаслаўленне хлеба і вады. I пятніца месяц | grodno | nth-weekday-of-month isoWeekday=5 nth=1 + месяц 2 | coverage 0.08 → months 2 |
| Забаронены ўсе іншыя цэлебрацыі разам з Імшамі за памерлых акрамя паха | vitebsk | nth-weekday-of-month isoWeekday=5 nth=1 + месяц 5 | coverage 0.08 → months 5 |
| спамін Св. Тэрэзы ад Дзіцятка Езус, Пн Д-рК. Заахвоціць да малітвы руж | grodno | nth-weekday-of-month isoWeekday=5 nth=1 + месяц 10 | coverage 0.08 → months 10 |
| I пятніца месяца. Адарацыя Найсв. Сакрамэнту і набажэнства да Найсв. С | grodno | nth-weekday-of-month isoWeekday=5 nth=1 + месяц 4 | coverage 0.08 → months 4 |
| Урачыстасць Найсв. Сэрца Езуса. Дзень малітвы аб святасці святароў (ад | grodno | nth-weekday-of-month isoWeekday=5 nth=1 + месяц 6 | coverage 0.08 → months 6 |
| ( белы ). Наб. у І суботу месяца (Аг 879, 887). | pinsk | nth-weekday-of-month isoWeekday=6 nth=1 + месяц 3 | coverage 0.08 → months 3 |
| Дыяцэзіяльны Дзень малітвы за дабрадзеяў. I нядзеля месяца (адарацыйна | grodno | nth-weekday-of-month isoWeekday=7 nth=1 + месяц 5, 10, 12 | coverage 0.25 → months 5,10,12 |
| І нядзеля месяца (адарацыйная). Запрасіць на Св. Імшу „на распачаццце  | grodno | nth-weekday-of-month isoWeekday=7 nth=1 + месяц 9 | coverage 0.08 → months 9 |
| Пачатак навэнны перад урач. НПМ Маці Міласэрнасці, галоўнай Апякункі д | grodno | nth-weekday-of-month isoWeekday=7 nth=1 + месяц 11 | coverage 0.08 → months 11 |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=10 dayOfWeek=4 + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=11 dayOfWeek=4 + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=11 dayOfWeek=5 + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=12 dayOfWeek=5 + месяц 6 | month 6 from text |
| Пачатак маёвых набажэнстваў. | vitebsk | period-day period="easter" week=4 dayOfWeek=6 + месяц 5 | month 5 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=11 dayOfWeek=6 + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period-day period="ordinary" week=12 dayOfWeek=6 + месяц 6 | month 6 from text |
| Навэнна да Духа Святога (Аг 641). | pinsk | any selectors=[{"type":"exact-date","date":"2026-05-16"},{"type":"exact-date","date":"2026-05-17"},{"type":"exact-date","date":"2026-05-18"},{"type":"exact-date","date":"2026-05-19"},{"type":"exact-date","date":"2026-05-20"},{"type":"exact-date","date":"2026-05-21"},{"type":"exact-date","date":"2026-05-22"},{"type":"exact-date","date":"2026-05-23"}] | coverage 0.19 → observed dates |
| Дні малітваў аб ураджаі (Крыжовыя дні, Аг 627). | pinsk | any selectors=[{"type":"exact-date","date":"2026-05-11"},{"type":"exact-date","date":"2026-05-12"},{"type":"exact-date","date":"2026-05-13"}] | coverage 0.07 → observed dates |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period period="ordinary" dayOfWeek=1 + месяц 6 | month 6 from text |
| Забаронены ўсе іншыя цэлебрацыі разам з Імшамі за памерлых, акрамя пах | vitebsk | any selectors=[{"type":"exact-date","date":"2026-06-07"},{"type":"exact-date","date":"2026-06-14"},{"type":"exact-date","date":"2026-07-05"},{"type":"exact-date","date":"2026-08-02"},{"type":"exact-date","date":"2026-10-04"}] | coverage 0.16 → observed dates |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period period="ordinary" dayOfWeek=2 + месяц 6 | month 6 from text |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period period="ordinary" dayOfWeek=3 + месяц 6 | month 6 from text |
| Наб. і малітвы да Маці Божай (Аг 846). | pinsk | any selectors=[{"type":"exact-date","date":"2026-04-18"},{"type":"exact-date","date":"2026-05-09"},{"type":"exact-date","date":"2026-05-23"}] | coverage 0.43 → observed dates |
| Наб. і малітвы да Маці Божай (Аг 846). | pinsk | any selectors=[{"type":"exact-date","date":"2026-05-30"},{"type":"exact-date","date":"2026-06-20"},{"type":"exact-date","date":"2026-06-27"},{"type":"exact-date","date":"2026-07-18"},{"type":"exact-date","date":"2026-09-19"},{"type":"exact-date","date":"2026-09-26"},{"type":"exact-date","date":"2026-10-10"},{"type":"exact-date","date":"2026-10-24"},{"type":"exact-date","date":"2026-10-31"},{"type":"exact-date","date":"2026-11-14"},{"type":"exact-date","date":"2026-11-28"}] | coverage 0.34 → observed dates |
| Чэрвеньскае набажэнства (Аг 758–773). | pinsk | period period="ordinary" dayOfWeek=7 + месяц 6 | month 6 from text |
| Б. Імша агульная аб НПМ, прэфацыя пра НПМ (№№ 52-53) | minsk-mohilev | period period="ordinary" dayOfWeek=7 + месяц 6 | coverage 0.06 → months 6 |
| Увечары Імша з нядзелі (гл. далей). | pinsk | any selectors=[{"type":"exact-date","date":"2026-02-07"},{"type":"exact-date","date":"2026-06-06"},{"type":"exact-date","date":"2026-06-20"},{"type":"exact-date","date":"2026-06-27"},{"type":"exact-date","date":"2026-07-04"},{"type":"exact-date","date":"2026-07-18"},{"type":"exact-date","date":"2026-09-05"},{"type":"exact-date","date":"2026-09-19"},{"type":"exact-date","date":"2026-09-26"},{"type":"exact-date","date":"2026-10-03"},{"type":"exact-date","date":"2026-10-10"},{"type":"exact-date","date":"2026-10-24"},{"type":"exact-date","date":"2026-11-07"},{"type":"exact-date","date":"2026-11-14"},{"type":"exact-date","date":"2026-11-28"}] | coverage 0.47 → observed dates |

## Promoted to recurring canonical rule

Першы чацвер, першая пятніца і першая субота месяца — адно правіла ўзроўню Беларусі кожнае
(`provenance.kind: app-normalization`), а не «Пінская дыяцэзія · 2026». Голыя дыяцэзіяльныя
копіі («І чацвер месяца.») выдалены; заўвагі з дадатковым зместам (Імша, набажэнства) засталіся.

| Правіла | Бачылі ў календарах |
|---|---|
| Першы чацвер месяца. | grodno, pinsk, vitebsk |
| Першая пятніца месяца. | grodno, pinsk, vitebsk |
| Першая субота месяца. | grodno, pinsk, vitebsk |

## Kept exact-date / year-instance

Тэкст з датай («– у чацвер, 1 кастрычніка, — …», «01.I.2028») — толькі той дзень таго года.
Падобныя тэксты розных дзён, якія раней зліваліся ў адно «рэгулярнае» правіла, падзелены: 131.

| Тып | Колькасць |
|---|---|
| падзелена па днях | 131 |
| з крыніцы | 44 |

## Hidden pending review

Не публікуюцца (няма ў `notes.json` і Firestore).

| Тэкст | Селектар | Прычына | Даты |
|---|---|---|---|
| Аб’явы на гэтую нядзелю гл.: с. 28. | celebration celebrationId="buptismofthelord" | refers to a page of the printed calendar | 2026-01-11 |
| Абрадавыя прадпісанні на ўрачыстасць (с. 33). | celebration celebrationId="corpuschristi" | refers to a page of the printed calendar | 2027-05-27 |
| Падчас кожнай св. Імшы благаслаўленне кадзіла і крэйды (с. 173) . | celebration celebrationId="epiphany-lord" | refers to a page of the printed calendar | 2027-01-06 |
| У дыяцэзіі: Аф. святоч., Імша агул. (імшал с. 1193), Хвала, прэф 49. С | celebration celebrationId="grodno-cathedral-dedication" | refers to a page of the printed calendar | 2027-12-06 |
| Літургія Божага Слова с. 164. | celebration celebrationId="grodno-cathedral-dedication" | refers to a page of the printed calendar | 2027-12-06 |
| Абрад благаслаўлення аўса (с. 183). | celebration celebrationId="holyfamily" | refers to a page of the printed calendar | 2026-12-27, 2027-12-26 |
| Абрадавыя прадпісання на Звычайны перыяд (с. 22). | celebration celebrationId="marymotherchurch" | refers to a page of the printed calendar | 2027-05-17 |
| Літургія Божага Слова с. 151. | celebration celebrationId="marymotherchurch" | refers to a page of the printed calendar | 2027-05-17 |
| Абрад благаслаўлення зерня на сяўбу (с. 182). | celebration celebrationId="nativity-blessed-virgin-mary" | refers to a page of the printed calendar | 2027-09-08 |
| Літургія Божага Слова с. 161. | celebration celebrationId="our-lady-czestochowa" | refers to a page of the printed calendar | 2027-08-26 |
| Літургія Божага Слова с. 166. | celebration celebrationId="our-lady-mother-mercy" | refers to a page of the printed calendar | 2027-11-16 |
| Абрадавыя прадпісанні на Вялікі Тыдзень (с. 25). | celebration celebrationId="palmsunday" | refers to a page of the printed calendar | 2027-03-21 |
| ПЕРЫЯД | celebration celebrationId="pentecost" | section heading or fragment, not a note | 2026-05-24 |
| ЎКАЗАННІ | celebration celebrationId="pentecost" | section heading or fragment, not a note | 2026-05-24 |
| Літургія Божага Слова с. 144. | celebration celebrationId="sv-casimir" | refers to a page of the printed calendar | 2027-03-04 |
| Благаслаўленне зёлак і вянкоў з кветак (с. 178). | celebration celebrationId="sv-charles-lwanga-companions" | refers to a page of the printed calendar | 2027-06-03 |
| Літургія Божага Слова с. 159. | celebration celebrationId="sv-maximilian-kolbe" | refers to a page of the printed calendar | 2027-08-14 |
| Капцёўка (Санктуарый), Рагозніца – урач. НПМ Каралевы Польшчы, тыт. ка | celebration celebrationId="sv-philip-james-apostles" | refers to a page of the printed calendar | 2027-05-03 |
| Літургія Божага Слова с. 157. | celebration celebrationId="sv-teresa-benedicta-cross" | refers to a page of the printed calendar | 2027-08-09 |
| (17 – 24 снежня) | fixed-date month=12 day=17 | section heading or fragment, not a note | 2025-12-17 |
| Абрадавыя прадпісанні на Нараджэнне Пана (с. 35). | fixed-date month=12 day=24 | refers to a page of the printed calendar | 2027-12-24 |
| Аб’явы на гэтую нядзелю гл.: с. 24. | fixed-date month=1 day=4 | refers to a page of the printed calendar | 2026-01-04 |
| 1-3 уласная Імша па выбары, І-V прэфацыя пра памерлых. Афіцый за памер | nth-weekday-of-month isoWeekday=7 nth=1 | generalized from one occurrence (coverage 0.00) | 2026-11-02 |
| Абрадавыя прадпісанні на перыяд Адвэнту (с. 34). | period-day period="advent" week=1 dayOfWeek=1 | refers to a page of the printed calendar | 2027-11-28 |
| Благаслаўленне мам чакаючых патомства (с. 184). | period-day period="advent" week=3 dayOfWeek=1 | refers to a page of the printed calendar | 2027-12-12 |
| У сувязі з успамінам св. Крыштафа, Мч, апякуна кіроўцаў і падарожнікаў | period-day period="ordinary" week=17 dayOfWeek=1 | refers to a page of the printed calendar | 2027-07-25 |
| Абрадавыя прадпісанні на Звычайны перыяд (с. 22). | period-day period="ordinary" week=1 dayOfWeek=2 | refers to a page of the printed calendar | 2027-01-11 |
| Літургія Божага Слова с. 149. | period-day period="ordinary" week=8 dayOfWeek=2 | refers to a page of the printed calendar | 2027-05-24 |
| Адносна ўспамінаў гл. с. 23 № 2аб. | period-day period="advent" week=3 dayOfWeek=3 | refers to a page of the printed calendar | 2025-12-16 |
| Асвячэнне свечак і благаслаўленне св. Блажэя (с. 174). | period-day period="ordinary" week=4 dayOfWeek=4 | refers to a page of the printed calendar | 2027-02-03 |
| Належыць таксама памаліцца гімнам «Te Deum» і малітвай за Святога Айца | period-day period="easter" week=6 dayOfWeek=7 | refers to a page of the printed calendar | 2027-05-08 |
| ІМША ВЯЧЭРЫ ПАНСКАЙ | period-phase period="holyweek" phase="triduum" | section heading or fragment, not a note | 2026-04-03 |
| VIII ЗВЫЧАЙНЫ ТЫДЗЕНЬ | period-phase period="ordinary" phase="after-pentecost" | section heading or fragment, not a note | 2026-05-25 |
| Належыць таксама памаліцца гімнам «Te Deum» і малітвай за Арцыпастыра  | period period="ordinary" dayOfWeek=3 | refers to a page of the printed calendar | 2027-05-25, 2027-10-26 |
| У дні неабавязковых успамінаў: у звычайныя дні Адвэнту да 17 снежня, м | period period="advent" | dated text without an observed date |  |
| У дні неабавязковых успамінаў: у звычайныя дні Адвэнту з 17 па 24 снеж | period period="advent" | dated text without an observed date |  |
| У звычайныя дні Адвэнту (да 16 снежня) забараняюцца: Імшы ў розных пат | period period="advent" | dated text without an observed date |  |
| Да 17 снежня (акрамя Нядзелі Адвэнту), у часе Адвэнту, можна цэлебрава | period period="advent" | dated text without an observed date |  |
| З 17 снежня падчас цэлебрацыі Святой Імшы бяруцца выключна імшальныя ф | period period="advent" | dated text without an observed date |  |
| (урачыстасць з актавай) | period period="christmas" | section heading or fragment, not a note | 2025-12-24 |
| (пасля Велікоднага перыяду) | period period="ordinary" | section heading or fragment, not a note | 2026-05-25 |
| БЛАГАСЛАЎЛЕННЕ СТРАЎ НА ВЕЛІКОДНЫ СТОЛ | relative celebrationId="eastersunday" offsetDays=-1 | section heading or fragment, not a note | 2026-04-04 |
| ПАСХАЛЬНАЯ ВІГІЛІЯ | relative celebrationId="eastersunday" offsetDays=-1 | section heading or fragment, not a note | 2026-04-04 |
| Абрадавыя прадпісанні на Вялікую Пятніцу (с. 29). | relative celebrationId="eastersunday" offsetDays=-2 | refers to a page of the printed calendar | 2027-03-26 |
| Ў ПА РАФІЯЛЬНА Й А ГЕНД ЗЕ | relative celebrationId="eastersunday" offsetDays=1 | section heading or fragment, not a note | 2026-04-06 |

## Needs manual review

Апублікаваныя, але з пазнакай `NEEDS_REVIEW` (канкрэтны дзень, рэдкі выпадак).

| Тэкст | Селектар | Дыяцэзія |
|---|---|---|
| Выкарыстоўваюцца тэксты чытанняў прадпісаныя на гэты дзень месяца. | fixed-date month=12 day=17 | grodno |
| Вігілійны вечар або аплаткавае спатканне (Аг 287). | fixed-date month=12 day=24 | pinsk |
| МАЛІТВА ПАСЛЯ ПОЎДНЯ ЛІТУРГІІ ГАДЗІНАЎ ЗАКАНЧВАЕ ПЕРЫЯД АДВЭНТУ. | fixed-date month=12 day=24 | pinsk |
| Падчас вызнання веры на словы “ і ўцелавіўся ад Духа Святога .. і стаў | fixed-date month=12 day=24 | grodno |
| Заканчэнне каляндарнага года. | fixed-date month=12 day=31 | grodno |
| У вечары гэтага дня цэлебруецца вігілійная святая Імша з урачыстасці А | fixed-date month=1 day=5 | vitebsk |
| 5. У трэці тыдзень верасня — квартальныя дні малітваў за дзяцей, молад | месяц 9 | pinsk |
| Нядзеля мае характар радасны (Gaudete). Можна карыстацца арнатам ружов | period-day period="advent" week=3 dayOfWeek=1 | grodno |
| Заканчэнне Велікоднай актавы. | period-day period="easter" week=2 dayOfWeek=1 | grodno |
| Дзень Маці ў дыяцэзіі. | period-day period="easter" week=6 dayOfWeek=1 | grodno |
| Гэтая Імша цэлебруецца ў літургічным адзенні фіялетавага альбо ружоваг | period-day period="lent" week=4 dayOfWeek=1 | vitebsk |
| Сёння можна ўпрыгожыць алтар кветкамі. | period-day period="lent" week=4 dayOfWeek=1 | pinsk |
| Нядзеля мае характар радасны (Laetare). Можна выкарыстоўваць ружовы ко | period-day period="lent" week=4 dayOfWeek=1 | grodno |
| Закрываюцца ўсе крыжы і абразы. | period-day period="lent" week=5 dayOfWeek=1 | pinsk |
| УРАЧЫСТАСЦЬ СВЯТЫХ ПЯТРА І ПАЎЛА, АПОСТАЛАЎ - Імша ў вігілію. | period-day period="ordinary" week=13 dayOfWeek=1 | vitebsk |
| Прапускаюцца ўспаміны св. Эўзэбія Вэрчэльскага, біскупа і св. Пятра Юл | period-day period="ordinary" week=18 dayOfWeek=1 | vitebsk |
| Сёння дзень мучаніцкай смерці бл. С. Стэлы i 10 Паплечніц, Мм Сясцёр Н | period-day period="ordinary" week=18 dayOfWeek=1 | grodno |
| Прапускаюцца ўспаміны св. Гераніма Эміліяні і св. Жазэфіны Бакіты, пан | period-day period="ordinary" week=5 dayOfWeek=1 | vitebsk |
| Гадавіна заснавання Мінска-Магілёўскай Архідыяцэзіі (1991) | period-day period="easter" week=2 dayOfWeek=2 | minsk-mohilev |
| Колер чырвоны. | period-day period="ordinary" week=14 dayOfWeek=2 | grodno |
| Колер белы. | period-day period="ordinary" week=33 dayOfWeek=2 | grodno |
| УРАЧЫСТАСЦЬ НАРАДЖЭННЯ СВЯТОГА ЯНА ХРЫСЦІЦЕЛЯ - Імша ў вігілію | period-day period="ordinary" week=12 dayOfWeek=3 | vitebsk |
| Гадавіна заснавання Віцебскай дыяцэзіі і гадавіна прызначэння кс. др У | period-day period="ordinary" week=28 dayOfWeek=3 | vitebsk |
| У Малітве Вернікаў памаліцца за Ардынарыя. | period-day period="ordinary" week=30 dayOfWeek=3 | grodno |
| Колер белы. | period-day period="easter" week=5 dayOfWeek=4 | grodno |
| УРАЧЫСТАСЦЬ УНЕБАЎШЭСЦЯ ПАНА – Імша ў Вігілію | period-day period="easter" week=6 dayOfWeek=4 | vitebsk |
| Колер чырвоны. | period-day period="ordinary" week=13 dayOfWeek=4 | grodno |
| Колер белы. | period-day period="ordinary" week=16 dayOfWeek=4 | grodno |
| Кар 7, 25–31; Пс 45 (44), 11–12. 14–15. 16–17. | period-day period="ordinary" week=23 dayOfWeek=4 | vitebsk |
| Колер чырвоны. | period-day period="ordinary" week=34 dayOfWeek=5 | grodno |
| Пачатак урачыстасцяў у Тракелях. | period-day period="ordinary" week=14 dayOfWeek=6 | grodno |
| Колер белы. | period-day period="ordinary" week=17 dayOfWeek=6 | grodno |
| Колер белы. | period-day period="ordinary" week=24 dayOfWeek=6 | grodno |
| 2 Ян 4–9; Пс 119 (118), 1–2. 10–11. 17–18. | period-day period="ordinary" week=32 dayOfWeek=6 | vitebsk |
| У Малітве Вернікаў памаліцца за Святога Айца. | period-day period="easter" week=6 dayOfWeek=7 | grodno |
| УРАЧЫСТАСЦЬ СПАСЛАННЯ ДУХА СВЯТОГА – Імша ў Вігілію | period-day period="easter" week=7 dayOfWeek=7 | vitebsk |
| Колер чырвоны. | period-day period="easter" week=7 dayOfWeek=7 | grodno |
| Паводле рашэння Канферэнцыі Біскупаў можна захаваць традыцыю закрыванн | period-day period="lent" week=4 dayOfWeek=7 | minsk-mohilev |
| Згодна з рашэннем Канферэнцыі Біскупаў можа захоўвацца звычай ад V Няд | period-day period="lent" week=4 dayOfWeek=7 | vitebsk |
| Колер белы. | period-day period="ordinary" week=12 dayOfWeek=7 | grodno |
| Колер чырвоны. Або: успамін св. Каятана, Прэзб. | period-day period="ordinary" week=18 dayOfWeek=7 | grodno |
| У Катэдры i непасв. касцёлах (некансэкр.) – | period-day period="ordinary" week=30 dayOfWeek=7 | grodno |
| 3 Ян 5–8; Пс 112 (111), 1–2. 3–4. 5–6. | period-day period="ordinary" week=32 dayOfWeek=7 | vitebsk |
| Першае чытанне ў будні per annum: год І | period-day period="ordinary" week=34 dayOfWeek=7 | vitebsk |
| Чытанні ў нядзелі, святы і ўрачыстасці: год В | period-day period="ordinary" week=34 dayOfWeek=7 | vitebsk |
| Юд 17. 20b–25; Пс 63 (62), 2. 3–4. 5–6. | period-day period="ordinary" week=8 dayOfWeek=7 | vitebsk |
