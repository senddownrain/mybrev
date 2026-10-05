# Літургічныя даныя: дэфіцыты

Згенеравана `npm run liturgy:audit` (2026-10-05). Не рэдагаваць уручную.

| Прыярытэт | Адкрыта | Наступнае дзеянне |
|---|---|---|
| **P0** | 7 | CRITICAL RUNTIME: Add the period document (text from the breviary); never invent it |
| **P1** | 15 | CRITICAL RUNTIME: Fill the week-specific reading in the temporal document |
| **P2** | 53 | MISSING PROPER HOURS: Add the proper texts or name a Common |

## CRITICAL RUNTIME

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | V нядзеля Вялікага посту | 2026-03-22@grodno … 2027-03-14@vitebsk (8) |  | whole Office | days | no document: the day is not offered in Hours | days/lent-w5-d1 | none | Add the period document (text from the breviary); never invent it | OPEN |
| P1 | sv-louis | 2026-08-25 … |  | officeOfReadingsR1 | temporal day | empty | text of the temporal day | empty field | Fill the week-specific reading in the temporal document | OPEN |
| P1 | sv-joseph-calasanz | 2026-08-25 … |  | officeOfReadingsR1 | temporal day | empty | text of the temporal day | empty field | Fill the week-specific reading in the temporal document | OPEN |
| P1 | our-lady-czestochowa | 2026-08-26 … |  | officeOfReadingsR1 | temporal day | empty | text of the temporal day | empty field | Fill the week-specific reading in the temporal document | OPEN |
| P1 | ordinary-w21-d3 |  |  | officeOfReadingsR1 | days/ordinary-w21-d3 | empty | week-specific text | empty | Not derivable (week-specific reading): enter from the breviary | OPEN |
| P1 | ordinary-w21-d3 |  |  | officeOfReadingsR2 | days/ordinary-w21-d3 | empty | week-specific text | empty | Not derivable (week-specific reading): enter from the breviary | OPEN |
| P1 | ordinary-w21-d4 |  |  | officeOfReadingsR1 | days/ordinary-w21-d4 | empty | week-specific text | empty | Not derivable (week-specific reading): enter from the breviary | OPEN |
| P1 | ordinary-w21-d4 |  |  | officeOfReadingsR2 | days/ordinary-w21-d4 | empty | week-specific text | empty | Not derivable (week-specific reading): enter from the breviary | OPEN |

## RAW INSTRUCTIONS STILL VISIBLE

_няма_

## SUSPICIOUS SHORT FIELDS

_няма_

## MISSING PROPER HOURS

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | patchs/feasts/14-02-sv-cyril-methodius.json |  |  | vesperHymn | patchs/feasts | Гімн, с. 1279 | the referenced text | Office descriptor fallback (day / Common) | Type the referenced text (page of the breviary) into the source | OPEN |
| P1 | patchs/feasts/common-texts/apostles.json |  |  | laudesHymn | patchs/feasts/common-texts | Гімн з Уласных тэкстаў пра святых. | the referenced text | Office descriptor fallback (day / Common) | Type the referenced text (page of the breviary) into the source | OPEN |
| P1 | 14-02-sv-cyril-methodius |  |  | vesperHymn | firestore days: fixed | Гімн, с. 1279 | the referenced text | Office descriptor fallback (day / Common) | Type the referenced text (page of the breviary) into the source | OPEN |
| P2 | Найсвяцейшага Імя Езуса | 03.01 |  |  | liturgicalProperTexts (scaffold) | no own texts, no Common | own texts (patchs/feasts) | the day | Add the proper texts or name a Common | OPEN |
| P2 | Св. Яна Дыега Куаўхтлатаацына | 09.12 |  |  | liturgicalProperTexts (scaffold) | no own texts, no Common | own texts (patchs/feasts) | the day | Add the proper texts or name a Common | OPEN |
| P2 | Св. Дызмы, Добрага Злачынцы | 26.03 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts, no Common | own texts (patchs/feasts) | the day | Add the proper texts or name a Common | OPEN |
| P2 | Св. Ядвігі, каралевы | 08.06 | grodno |  | liturgicalProperTexts (scaffold) | no own texts, no Common | own texts (patchs/feasts) | the day | Add the proper texts or name a Common | OPEN |

## MISSING COMMON / REUSABLE SOURCE

_няма_

## LEGACY DAYS DEPENDENCY

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 |  |  |  |  | liturgicalProperTexts | 0 celebrations depend on legacy fixed days in the web runtime | 0 |  | Legacy fixed `days` stay physically for the released Flutter app; remove after its migration | DONE |

## ADVENT 17–24

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 |  |  |  |  |  | 2025–2032: {"PASS":864} |  |  | Re-run after data changes (npm run liturgy:audit) | DONE |

## CHRISTMAS 25.12–12.01

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 |  |  |  |  |  | 2025–2032: {"PASS":864} |  |  | Re-run after data changes (npm run liturgy:audit) | DONE |

## READINGS WRONG CITATION

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | Унебаўзяцце Найсв. Панны Марыі (assumption-blessed-virgin-mary) | 2026-08-15, 2027-08-15 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | document лк 11, calendars лк 1 | 1 чыт. (т. VI): Ап 11, 19a; 12, 1-6a.10ab; Пс 45 (44), 10bc. 11-12. 14-15. 16-17. 2 чыт.: 1 Кар 15,  | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |
| P0 | Гадавіна пасвячэння катэдральнага касцёла (grodno-cathedral-dedication) | 2027-12-06 | grodno |  | readings | document мц 16, calendars ян 4 | 1 Вал 8,22-23.27-30 Ян 4,19-24 | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |
| P0 | Св. Бонавэнтуры, біскупа і доктара Касцёла (sv-bonaventure) | 2026-07-15, 2027-07-15 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | document мц 23, calendars мц 10 | 1 чыт. (т. VI): Эф 3, 14-19; Пс 119 (118), 9-10. 11-12. 13-14. Ев.: Мц 10, 24-33. | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |
| P0 | Св. Клары, панны (sv-clare) | 2026-08-11, 2027-08-11 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | document мц 19, calendars мц 18 | 1 чыт. (т. VI): Флп 3, 8-14; Пс 16 (15), 1-2а і 5. 7-8. 11. Ев.: Мц 18, 15-20. | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |
| P0 | Св. Пятра і Паўла, апосталаў (sv-peter-paul-apostles) | 2026-06-29, 2027-06-29 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | document ян 21, calendars мц 16 | 1 чыт. (т. VI): Дз 12, 1-11; Пс 34 (33), 2-3. 4-5. 6-7. 8-9. 2 чыт.: 2 Цім 4, 6-8. 17-18. Ев.: Мц 16 | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |
| P0 | Гадавіна пасвячэння катэдральнага касцёла (vitebsk-cathedral-dedication) | 2026-10-10 | vitebsk |  | readings | document мц 16, calendars ян 2 | 1 Чыт.: Эзх 47, 1–2. 8–9. 12; Пс 46 (45), 2–3. 5–6. 8–9; 2 Чыт.: 1 Кар 3, 9с–11. 16–17; Ев.: Ян 2, 1 | the wrong text is shown | Replace the readings document text (Mass of the day, not of the vigil / another day) | OPEN |

## READINGS MISSING

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | Гадавіна пасвячэння катэдральнага касцёла (dedication-cathedral) | 2026-05-01 | pinsk |  | readings | citation only | Дз 7, 44–50 або 1 Кар 3, 9b–11. 16–17; Мц 16, 13–19 | citation shown, no text | Add the readings text | OPEN |
| P2 | Найсв. Панны Марыі Чэнстахоўскай (our-lady-czestochowa) | 2026-08-26, 2027-08-26 | minsk-mohilev, pinsk, grodno |  | readings | citation only | Іс 2, 2-5 або Гал 4, 4-7; Пс 48 (47), 2-3, 9-11. 13. 14. 15. Ев.: Ян 2, 1-11. | citation shown, no text | Add the readings text | OPEN |
| P1 | Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі (our-lady-lahishyn) | 2026-08-22 | pinsk |  | readings | no document, no citation |  | Ordo: «тэкст пакуль недаступны» | Add the readings or at least the citation | OPEN |
| P1 | Найсв. Панны Марыі Тракельскай (our-lady-trakai) | 2027-07-10 | grodno |  | readings | no document, no citation |  | Ordo: «тэкст пакуль недаступны» | Add the readings or at least the citation | OPEN |
| P2 | Св. Андрэя Зунг Лака, прэзбітэра, і паплечнікаў, мучанікаў (sv-andrew-dung-lac-companions) | 2026-11-24, 2027-11-24 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | citation only | 1 чыт.: Мдр 3, 1-9; Пс 126 (125), 1-2ab. 2cd-3. 4-5. 6. Ев. Мц 10, 17-22. | citation shown, no text | Add the readings text | OPEN |
| P2 | Св. Антонія Падуанскага, прэзбітэра і доктара Касцёла (sv-anthony-padua) | 2026-06-13 | minsk-mohilev, vitebsk, pinsk |  | readings | citation only | 1 чыт. (т. VI): Іс 61, 1-3а; Пс 89 (88), 2-3. 4-5. 21-22. 25 і 27. Ев.: Лк 10, 1-9. 1 чыт. (т. VI):  | citation shown, no text | Add the readings text | OPEN |
| P2 | Св. Максімільяна Марыі Кольбэ, прэзбітэра і мучаніка (sv-maximilian-kolbe) | 2026-08-14, 2027-08-14 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | citation only | 1 чыт. (т. VI): 2 Цім 2, 22b-26; Пс 37 (36), 3-4. 5-6. 30-31. Ев.: Ян 17, 20-26. 1 чыт. (т. VI): 1 К | citation shown, no text | Add the readings text | OPEN |
| P2 | Св. Станіслава Косткі, законніка (sv-stanislaus-kostka) | 2026-09-18, 2027-09-18 | minsk-mohilev, pinsk, grodno |  | readings | citation only | 1 чыт. (т. VI): Мдр 4, 7-15 альбо 1 ян 2, 12-17; Пс 148, 1-2. 11-13а. 13с-14 Ев.: Лк 2, 41-52. | citation shown, no text | Add the readings text | OPEN |

## READINGS AMBIGUOUS

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Пальмовая нядзеля Мукі Пана (palm-sunday) | 2026-03-29, 2027-03-21 | minsk-mohilev, vitebsk, pinsk, grodno |  | readings | 4 documents | one document per celebration |  | Link the right document (_dayIds) | OPEN |
| P1 | Св. Андрэя Баболі, прэзбітэра і мучаніка (sv-andrei-bobola) | 2026-05-16 | minsk-mohilev, vitebsk, pinsk |  | readings | 2 documents | one document per celebration |  | Link the right document (_dayIds) | OPEN |

## ORDO NOTES BAD SELECTOR

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 |  |  |  |  |  | 0 semantic violations in 73875 shown notes (2025–2032) |  |  | — | DONE |

## FIRESTORE / BUNDLED DRIFT

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 |  |  |  |  | liturgicalProperTexts | in sync | in sync |  | — | DONE |
| P2 |  |  |  |  | liturgicalTemplates | in sync | in sync |  | — | DONE |
| P2 |  |  |  |  | liturgicalCelebrations | in sync | in sync |  | — | DONE |
| P2 |  |  |  |  | liturgicalDioceseOverrides | in sync | in sync |  | — | DONE |
| P2 |  |  |  |  | liturgicalOrdoNotes | in sync | in sync |  | — | DONE |

## ENGINE AMBIGUITIES

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | sv-joseph |  |  |  |  | Св. Юзаф у Вялікім тыдні: 19 сакавіка выпадае на Вялікі тыдзень. | Урачыстасць пераносіцца на суботу перад Пальмовай нядзеляй |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | coinciding-general-solemnities |  |  |  |  | Супадзенне дзвюх урачыстасцяў агульнага календара: Найсвяцейшае Сэрца Пана Езуса супадае з Нараджэннем св. Яна Хрысціцеля або са свв. Пятром і Паўлам. | Урачыстасць Пана застаецца, другая пераносіцца на найбліжэйшы вольны дзень |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | all-faithful-departed |  |  |  |  | Успамін усіх памерлых вернікаў у нядзелю: 2 лістапада выпадае на нядзелю. | Галоўнае празднаванне — Успамін усіх памерлых; Імша за памерлых |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | mary-mother-church |  |  |  |  | Марыя, Маці Касцёла, супадае з іншым абавязковым успамінам: Панядзелак пасля Спаслання Духа Святога мае яшчэ адзін абавязковы ўспамін. | Абодва ўспаміны — на выбар, марыйны першы |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | christ-the-high-priest |  |  |  |  | Езус Хрыстус, Найвышэйшы і Вечны Святар, прапускаецца: Свята (уласны каляндар Беларусі, радок 8) супадае са святам агульнага календара або вышэйшым днём. | Свята ў гэтым годзе прапускаецца |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | immaculate-heart |  |  |  |  | Беззаганнае Сэрца Марыі супадае з абавязковым успамінам: Субота пасля ўрачыстасці Найсвяцейшага Сэрца мае яшчэ адзін абавязковы ўспамін. | Абодва ўспаміны становяцца неабавязковымі, галоўны — будзень |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |
| P2 | diocesan-patron-impeded |  |  |  |  | Урачыстасць апекуна дыяцэзіі перанесена: Уласная ўрачыстасць дыяцэзіі саступае дню з большым першынством. | Пераносіцца на найбліжэйшы вольны дзень |  | Confirm or override per year (/admin/ordo/year-overrides); docs/ordo-engine-ambiguities.md | OPEN |

## NEEDS MANUAL REVIEW

| Severity | Празднаванне / дакумент | Дата | Дыяцэзія | Поле | Крыніца | Назірана | Чакаецца | Fallback | Дзеянне | Статус |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | Св. Грыгорыя Нарэцкага, абата і доктара Касцёла | 27.02 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: doctors-of-church, religious | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Яна Авільскага, прэзбітэра і доктара Касцёла | 10.05 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: doctors-of-church, pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Тэрэзы з Калькуты, панны | 05.09 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Хільдэгарды Бінгенскай, панны і доктара Касцёла | 17.09 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: doctors-of-church, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Фаўстыны Кавальскай, панны | 05.10 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Яна XXIII, папы | 11.10 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Найсв. Панны Марыі Ларэтанскай | 10.12 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Найсв. Панны Марыі з Гвадэлупы | 12.12 |  |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Цэліны Бажэнцкай, законніцы | 26.10 | vitebsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: religious | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Фларыяна, мучаніка | 04.05 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyr-one | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Маці Божай Нястомнай Дапамогі | 27.06 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Чэслава, прэзбітэра | 20.07 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Яцэка, прэзбітэра | 17.08 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P1 | Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі | 22.08 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц | 04.09 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyrs-many, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Ганарата Казмінскага, прэзбітэра | 13.10 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Барбары, панны і мучаніцы | 04.12 | pinsk |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyr-one, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна | 23.01 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyrs-many, martyr-one | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Найсв. Панны Марыі, Успамогі Вернікаў | 24.05 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Брата Альберта Хмялёўскага, законніка | 17.06 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: religious | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Найсв. Панны Марыі Анёльскай | 02.08 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: blessed-virgin-mary | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Санцыі Шымкавяк, панны | 18.08 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Браніславы, панны | 01.09 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Уладзіслава з Гельнёва, прэзбітэра | 25.09 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Ганарата Казмінскага, прэзбітэра | 13.10 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Свв. Бэнэдыкта, Яна, Мацвея, Ісаака і Крыстына, мучанікаў | 13.11 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyrs-many, martyr-one | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Караліны Кузкі, панны і мучаніцы | 18.11 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyr-one, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Саламеі, панны | 19.11 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Бл. Марыі ад Езуса Добрага Пастыра, панны | 25.11 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: pastors, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Св. Барбары, панны і мучаніцы | 04.12 | grodno |  | liturgicalProperTexts (scaffold) | no own texts; Commons inferred from the title: martyr-one, virgins | own texts (patchs/feasts) | Common / «З дня» | Check the inferred Commons; add the proper texts | OPEN |
| P2 | Аб’явы на гэтую нядзелю гл.: с. 28. / Лекцыянарый т. ІV (с. 321). / Лекцыянарый т. ІV (с. 335). |  |  |  | Ordo notes (hidden, not published) | 34 × refers to a page of the printed calendar |  |  | Decide: exact date, recurring rule or drop | OPEN |
| P2 | ПЕРЫЯД / ЎКАЗАННІ / (17 – 24 снежня) |  |  |  | Ordo notes (hidden, not published) | 10 × section heading or fragment, not a note |  |  | Decide: exact date, recurring rule or drop | OPEN |
| P2 | 1-3 уласная Імша па выбары, І-V прэфацыя |  |  |  | Ordo notes (hidden, not published) | 1 × generalized from one occurrence (coverage 0.00) |  |  | Decide: exact date, recurring rule or drop | OPEN |
| P2 | У дні неабавязковых успамінаў: у звычайн / У дні неабавязковых успамінаў: у звычайн / У звычайныя дні Адвэнту (да 16 снежня) з |  |  |  | Ordo notes (hidden, not published) | 5 × dated text without an observed date |  |  | Decide: exact date, recurring rule or drop | OPEN |
| P2 |  |  |  |  | Ordo notes (published) | 45 notes flagged NEEDS_REVIEW |  |  | docs/ordo-notes-audit.md → «Needs manual review» | OPEN |
| P2 | ordinary-w9-d4 |  |  | vesperHymn | days (psalter week) | differs from 7 equivalent documents | same psalter texts |  | Compare with the breviary | OPEN |
| P2 | all-faithful-departed, dedication-basilicas-peter-paul, holy-innocents |  |  |  | assembled Office ↔ legacy copy | 12 field differences not explained by the rubrics |  |  | reports/liturgy/hours-sources-audit.json → legacyComparison.unexplained | OPEN |

