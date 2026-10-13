# Фіксаваныя святы: змест і прагалы

Згенеравана `npm run generate:fixed-feasts` — не рэдагаваць уручную.

| | |
|---|---|
| Крыніц у `patchs/feasts` | 228 |
| Sparse-дакументаў у `patchs/db-feasts` | 291 |
| з іх scaffolds (без уласных тэкстаў) | 34 |
| Templates у `patchs/db-templates` | 16 |
| Дакументаў з некалькімі Commons (раней N копій) | 87 |
| Старых копій, якія замяняюцца (`_legacyIds`) | 192 |
| Тэкставых указанняў → `_fieldRules` | 422 |
| `from-day` placeholders, якіх больш няма | 13158 |
| Нявырашаных спасылак | 0 |

## Наяўнасць тэкстаў Hours

| Статус | Колькасць |
|---|---|
| `proper` — ёсць уласныя тэксты | 248 |
| `common-only` — толькі агульныя тэксты | 42 |
| `day-fallback` — тэксты дня | 1 |

## Трэба дапісаць уручную (scaffolds)

Празднаванні, якія ёсць у календары, але не маюць файла ў `patchs/feasts`.
Яны паказваюцца ў Ordo і ў спісе варыянтаў дня; Афіцый збіраецца з агульных тэкстаў
або з дня.

| Дата | Празднаванне | Ранг | Дыяцэзія | Commons | Крыніца рашэння |
|---|---|---|---|---|---|
| 03.01 | Найсвяцейшага Імя Езуса | memoria-ad-libitum | — | няма: Афіцый дня | пацверджана |
| 27.02 | Св. Грыгорыя Нарэцкага, абата і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, religious | выведзена з назвы |
| 10.05 | Св. Яна Авільскага, прэзбітэра і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, pastors | выведзена з назвы |
| 05.09 | Св. Тэрэзы з Калькуты, панны | memoria-ad-libitum | — | virgins | выведзена з назвы |
| 17.09 | Св. Хільдэгарды Бінгенскай, панны і доктара Касцёла | memoria-ad-libitum | — | doctors-of-church, virgins | выведзена з назвы |
| 05.10 | Св. Фаўстыны Кавальскай, панны | memoria-ad-libitum | — | virgins | выведзена з назвы |
| 11.10 | Св. Яна XXIII, папы | memoria-ad-libitum | — | pastors | выведзена з назвы |
| 09.12 | Св. Яна Дыега Куаўхтлатаацына | memoria-ad-libitum | — | holy-men | пацверджана |
| 10.12 | Найсв. Панны Марыі Ларэтанскай | memoria-ad-libitum | — | blessed-virgin-mary | выведзена з назвы |
| 12.12 | Найсв. Панны Марыі з Гвадэлупы | memoria-ad-libitum | — | blessed-virgin-mary | выведзена з назвы |
| 26.10 | Бл. Цэліны Бажэнцкай, законніцы | memoria-ad-libitum | vitebsk | religious | выведзена з назвы |
| 26.03 | Св. Дызмы, Добрага Злачынцы | memoria-ad-libitum | pinsk | holy-men | пацверджана |
| 04.05 | Св. Фларыяна, мучаніка | memoria-ad-libitum | pinsk | martyr-one | выведзена з назвы |
| 27.06 | Маці Божай Нястомнай Дапамогі | memoria-ad-libitum | pinsk | blessed-virgin-mary | выведзена з назвы |
| 20.07 | Бл. Чэслава, прэзбітэра | memoria-ad-libitum | pinsk | pastors | выведзена з назвы |
| 17.08 | Св. Яцэка, прэзбітэра | memoria-ad-libitum | pinsk | pastors | выведзена з назвы |
| 22.08 | Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі | solemnitas | pinsk | blessed-virgin-mary | выведзена з назвы |
| 04.09 | Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц | memoria-ad-libitum | pinsk | martyrs-many, virgins | выведзена з назвы |
| 13.10 | Бл. Ганарата Казмінскага, прэзбітэра | memoria-ad-libitum | pinsk | pastors | выведзена з назвы |
| 04.12 | Св. Барбары, панны і мучаніцы | memoria-ad-libitum | pinsk | martyr-one, virgins | выведзена з назвы |
| 23.01 | Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна | memoria-ad-libitum | grodno | martyrs-many, martyr-one | выведзена з назвы |
| 24.05 | Найсв. Панны Марыі, Успамогі Вернікаў | memoria | grodno | blessed-virgin-mary | выведзена з назвы |
| 08.06 | Св. Ядвігі, каралевы | memoria | grodno | holy-women | пацверджана |
| 17.06 | Св. Брата Альберта Хмялёўскага, законніка | memoria | grodno | religious | выведзена з назвы |
| 02.08 | Найсв. Панны Марыі Анёльскай | memoria-ad-libitum | grodno | blessed-virgin-mary | выведзена з назвы |
| 18.08 | Бл. Санцыі Шымкавяк, панны | memoria-ad-libitum | grodno | virgins | выведзена з назвы |
| 01.09 | Бл. Браніславы, панны | memoria-ad-libitum | grodno | virgins | выведзена з назвы |
| 25.09 | Бл. Уладзіслава з Гельнёва, прэзбітэра | memoria-ad-libitum | grodno | pastors | выведзена з назвы |
| 13.10 | Бл. Ганарата Казмінскага, прэзбітэра | memoria-ad-libitum | grodno | pastors | выведзена з назвы |
| 13.11 | Свв. Бэнэдыкта, Яна, Мацвея, Ісаака і Крыстына, мучанікаў | memoria-ad-libitum | grodno | martyrs-many, martyr-one | выведзена з назвы |
| 18.11 | Бл. Караліны Кузкі, панны і мучаніцы | memoria-ad-libitum | grodno | martyr-one, virgins | выведзена з назвы |
| 19.11 | Бл. Саламеі, панны | memoria-ad-libitum | grodno | virgins | выведзена з назвы |
| 25.11 | Бл. Марыі ад Езуса Добрага Пастыра, панны | memoria-ad-libitum | grodno | pastors, virgins | выведзена з назвы |
| 04.12 | Св. Барбары, панны і мучаніцы | memoria-ad-libitum | grodno | martyr-one, virgins | выведзена з назвы |

## Нявырашаныя спасылкі ў крыніцах

Значэнне не з'яўляецца тэкстам і не распазнана як структураванае ўказанне; поле
лічыцца адсутным (дазволены fallback па Office descriptor).

| Файл | Поле | Значэнне |
|---|---|---|
_няма_

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
| _fieldRules | `{"ref":"officeOfReadingsPr"}` | 5 |
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
| _fieldRules | `{"ref":"laudesHymn"}` | 1 |
| Ва ўспамін твой, з Нешпараў | `{"ref":["vesperHymn","vesper1Hymn"]}` | 1 |
| Вялікі хор, з Ютрані | `{"ref":"laudesHymn"}` | 1 |
| Гімн з Гадзіны чытанняў | `{"ref":"officeOfReadingsHymn"}` | 1 |
| Гімн з І Нешпараў | `{"ref":"vesper1Hymn"}` | 1 |
| Гімн з Уласных тэкстаў пра святых. | `{"source":"proper"}` | 1 |
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
