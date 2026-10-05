# Фіксаваныя святы: змест і прагалы

Згенеравана `npm run generate:fixed-feasts` — не рэдагаваць уручную.

| | |
|---|---|
| Крыніц у `patchs/feasts` | 227 |
| Sparse-дакументаў у `patchs/db-feasts` | 290 |
| з іх scaffolds (без уласных тэкстаў) | 34 |
| Templates у `patchs/db-templates` | 16 |
| Дакументаў з некалькімі Commons (раней N копій) | 87 |
| Старых копій, якія замяняюцца (`_legacyIds`) | 192 |
| Тэкставых указанняў → `_fieldRules` | 415 |
| `from-day` placeholders, якіх больш няма | 13408 |
| Нявырашаных спасылак | 2 |

## Наяўнасць тэкстаў Hours

| Статус | Колькасць |
|---|---|
| `proper` — ёсць уласныя тэксты | 247 |
| `common-only` — толькі агульныя тэксты | 39 |
| `day-fallback` — тэксты дня | 4 |

## Трэба дапісаць уручную (scaffolds)

Празднаванні, якія ёсць у календары, але не маюць файла ў `patchs/feasts`.
Яны паказваюцца ў Ordo і ў спісе варыянтаў дня; Афіцый збіраецца з агульных тэкстаў
або з дня.

| Дата | Празднаванне | Ранг | Дыяцэзія | Commons (выведзена з назвы) |
|---|---|---|---|---|
| 03.01 | Найсвяцейшага Імя Езуса | memoria-ad-libitum | — | — |
| 27.02 | Св. Грыгорыя Нарэцкага, абата і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, religious |
| 10.05 | Св. Яна Авільскага, прэзбітэра і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, pastors |
| 05.09 | Св. Тэрэзы з Калькуты, панны | memoria-ad-libitum | — | virgins |
| 17.09 | Св. Хільдэгарды Бінгенскай, панны і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, virgins |
| 05.10 | Св. Фаўстыны Кавальскай, панны | memoria-ad-libitum | — | virgins |
| 11.10 | Св. Яна XXIII, папы | memoria-ad-libitum | — | pastors |
| 09.12 | Св. Яна Дыега Куаўхтлатаацына | memoria-ad-libitum | — | — |
| 10.12 | Найсв. Панны Марыі Ларэтанскай | memoria-ad-libitum | — | blessed-virgin-mary |
| 12.12 | Найсв. Панны Марыі з Гвадэлупы | memoria-ad-libitum | — | blessed-virgin-mary |
| 26.10 | Бл. Цэліны Бажэнцкай, законніцы | memoria-ad-libitum | vitebsk | religious |
| 26.03 | Св. Дызмы, Добрага Злачынцы | memoria-ad-libitum | pinsk | — |
| 04.05 | Св. Фларыяна, мучаніка | memoria-ad-libitum | pinsk | martyr-one |
| 27.06 | Маці Божай Нястомнай Дапамогі | memoria-ad-libitum | pinsk | blessed-virgin-mary |
| 20.07 | Бл. Чэслава, прэзбітэра | memoria-ad-libitum | pinsk | pastors |
| 17.08 | Св. Яцэка, прэзбітэра | memoria-ad-libitum | pinsk | pastors |
| 22.08 | Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі | solemnitas | pinsk | blessed-virgin-mary |
| 04.09 | Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц | memoria-ad-libitum | pinsk | martyrs-many, virgins |
| 13.10 | Бл. Ганарата Казмінскага, прэзбітэра | memoria-ad-libitum | pinsk | pastors |
| 04.12 | Св. Барбары, панны і мучаніцы | memoria-ad-libitum | pinsk | martyr-one, virgins |
| 23.01 | Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна | memoria-ad-libitum | grodno | martyrs-many, martyr-one |
| 24.05 | Найсв. Панны Марыі, Успамогі Вернікаў | memoria | grodno | blessed-virgin-mary |
| 08.06 | Св. Ядвігі, каралевы | memoria | grodno | — |
| 17.06 | Св. Брата Альберта Хмялёўскага, законніка | memoria | grodno | religious |
| 02.08 | Найсв. Панны Марыі Анёльскай | memoria-ad-libitum | grodno | blessed-virgin-mary |
| 18.08 | Бл. Санцыі Шымкавяк, панны | memoria-ad-libitum | grodno | virgins |
| 01.09 | Бл. Браніславы, панны | memoria-ad-libitum | grodno | virgins |
| 25.09 | Бл. Уладзіслава з Гельнёва, прэзбітэра | memoria-ad-libitum | grodno | pastors |
| 13.10 | Бл. Ганарата Казмінскага, прэзбітэра | memoria-ad-libitum | grodno | pastors |
| 13.11 | Свв. Бэнэдыкта, Яна, Мацвея, Ісаака і Крыстына, мучанікаў | memoria-ad-libitum | grodno | martyrs-many, martyr-one |
| 18.11 | Бл. Караліны Кузкі, панны і мучаніцы | memoria-ad-libitum | grodno | martyr-one, virgins |
| 19.11 | Бл. Саламеі, панны | memoria-ad-libitum | grodno | virgins |
| 25.11 | Бл. Марыі ад Езуса Добрага Пастыра, панны | memoria-ad-libitum | grodno | pastors, virgins |
| 04.12 | Св. Барбары, панны і мучаніцы | memoria-ad-libitum | grodno | martyr-one, virgins |

## Нявырашаныя спасылкі ў крыніцах

Значэнне не з'яўляецца тэкстам і не распазнана як структураванае ўказанне; поле
лічыцца адсутным (дазволены fallback па Office descriptor).

| Файл | Поле | Значэнне |
|---|---|---|
| 14-02-sv-cyril-methodius.json | vesperHymn | ["Гімн, с. 1279"] |
| common-texts/apostles.json | laudesHymn | ["Гімн з Уласных тэкстаў пра святых."] |

## Нармалізаваныя ўказанні

| Указанне | Правіла | Разоў |
|---|---|---|
| [from-day] | `{"source":"current-day"}` | 111 |
| from-day | `{"source":"current-day"}` | 53 |
| from-first-week | `{"source":"sunday-week-1"}` | 48 |
| з нядзелі І тыдня | `{"source":"sunday-week-1"}` | 21 |
| з Агульных тэкстаў пра Апосталаў | `{"source":"template","template":"apostles"}` | 19 |
| з Агульных тэкстаў пра Найсв. Панну Марыю | `{"source":"template","template":"blessed-virgin-mary"}` | 19 |
| from-apostles | `{"source":"template","template":"apostles"}` | 12 |
| Антыфоны і псальмы з бягучага дня | `{"source":"current-day"}` | 9 |
| Антыфоны і псальмы з бягучага дня тыдня | `{"source":"current-day"}` | 9 |
| з бягучага дня | `{"source":"current-day"}` | 9 |
| з нядзелі I тыдня | `{"source":"sunday-week-1"}` | 9 |
| Псальмы з бягучага дня з антыфонай | `{"source":"current-day"}` | 9 |
| Псальмы з бягучага дня разам з антыфонай з адпаведнага Афіцыя | `{"source":"current-day"}` | 9 |
| Псальмы з бягучага тыдня | `{"source":"current-day"}` | 9 |
| from-own-texts | `{"ref":"laudesPr"}` | 7 |
| Астатняе з Агульных тэкстаў, с. 1400-1401. | `{"source":"common"}` | 6 |
| Псальмы і песня з Агульных тэкстаў пра Найсв. Панну Марыю | `{"source":"template","template":"blessed-virgin-mary"}` | 6 |
| from-apostels | `{"source":"template","template":"apostles"}` | 4 |
| з Агульных тэкстаў пра аднаго мучаніка | `{"source":"template","template":"martyr-one"}` | 3 |
| з Агульных тэкстаў пра пастыраў | `{"source":"template","template":"pastors"}` | 3 |
| Каротакае чытанне з Агульных тэкстаў пра Апосталаў, с. 1457-1458. | `{"source":"template","template":"apostles"}` | 3 |
| Малітва, як пададзена вышэй. | `{"ref":"laudesPr"}` | 3 |
| Псальмы з Агульных тэкстаў пра аднаго мучаніка | `{"source":"template","template":"martyr-one"}` | 3 |
| Псальмы з Агульных тэкстаў пра мучанікаў | `{"source":"template","template":"martyrs-many"}` | 3 |
| Псальмы з Агульных тэкстаў пра Найсв. Панну Марыю | `{"source":"template","template":"blessed-virgin-mary"}` | 3 |
| Гімн з Ютрані | `{"ref":"laudesHymn"}` | 2 |
| Просьбы з агульных тэкстаў пра Апосталаў | `{"source":"template","template":"apostles"}` | 2 |
| Просьбы з Агульных тэкстаў пра Апосталаў | `{"source":"template","template":"apostles"}` | 2 |
| Просьбы з Агульных тэкстаў пра святых жанчын, або з будня | `{"source":"template","template":"holy-women","allowCurrentDay":true}` | 2 |
| Просьбы з Агульных тэкстаў пра святых мужчын, або з будня | `{"source":"template","template":"holy-men","allowCurrentDay":true}` | 2 |
| Ва ўспамін твой, з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| Вялікі хор, з Ютрані | `{"ref":"laudesHymn"}` | 1 |
| Гімн з Гадзіны чытанняў | `{"ref":"officeOfReadingsHymn"}` | 1 |
| Гімн з І Нешпараў | `{"ref":"vesper1Hymn"}` | 1 |
| Гімн Каштоўны камень, з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| Дачка Магдаліі, з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| з Агульных тэкстаў пра святых жанчын | `{"source":"template","template":"holy-women"}` | 1 |
| Малітва з Агульных тэкстаў | `{"source":"common"}` | 1 |
| Просьбы з Агульных тэкстаў пра Найсв. Панну Марыю | `{"source":"template","template":"blessed-virgin-mary"}` | 1 |
| Сярод святых з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| Ты гонар з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| Усё бярэцца з актавы Нараджэння Пана, з 26 снежня | `{"source":"current-day"}` | 1 |
| Усё бярэцца з актавы Нараджэння Пана, з 27 снежня | `{"source":"current-day"}` | 1 |
| Усё бярэцца з актавы Нараджэння Пана, з 28 снежня | `{"source":"current-day"}` | 1 |
| Цябе Марта, з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
