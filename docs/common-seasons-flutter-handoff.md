# Flutter: сезонныя варыянты агульных тэкстаў — кантракт для рэалізацыі

Гэта матэрыял для **асобнага** наступнага промпта Flutter; у гэтым рэпазіторыі Flutter не змяняўся.
Крыніца ісціны — вэб: `src/utils/ordo/commonSeasons.js`, `src/utils/ordo/officeAssembly.js`,
парытэтны fixture `reports/liturgy/common-seasons-flutter-fixture.json`
(`node scripts/liturgy/common-seasons-fixture.mjs`). Агульная дакументацыя: `docs/common-seasons.md`.

## 1. JSON-схема

`liturgicalTemplates/{id}` (`_kind: 'common'`) атрымлівае неабавязковае поле:

```json
"_seasonalVariants": {
  "<season>": { "<officeContentField>": <value> }
}
```

* `<season>` ∈ `advent | christmas | lent | easter`. Іншыя ключы — недапушчальныя (валідатар публікацыі адмаўляе).
* `<officeContentField>` ∈ `OFFICE_CONTENT_FIELDS` (без `officeOfReadingsTeDeum`).
* `<value>`: `string` (HTML) | `string[]` (калі плоскае поле — масіў; захоўваецца форма базы) | `null` (наўмысна пустое) |
  `{ "rule": <_fieldRules entry> }`.
* Плоскія палі і `_fieldRules` шаблона — гэта Звычайны перыяд. **Старыя кліенты чытаюць іх і не падаюць.**
* Памер: самы вялікі дакумент `blessed-virgin-mary` ≈ 272 КБ (ліміт Firestore 1 МБ), усяго 16 шаблонаў ≈ 2.0 МБ.
* Значэнне поля можа быць **поўнай заменай чытання** (загаловак, спасылка, тэкст, рэспансорый — адзін радок/блок HTML),
  а не толькі фразай; схема не змянілася, `<value>` чытаецца па-ранейшаму як замена ўсяго поля.

## 2. Як вызначаецца сезон

Не па колеры, назве, нумары тыдня ці фіксаваных датах — толькі **Ordo выбранага Office**: `period` і
`periodPhase` з `computeSeason(date)` (у Dart — адпаведны Ordo-рухавік; `ResolvedLiturgicalDay.period/periodPhase`).
Для I Нешпараў — сезон даты самога празднавання (кантэнт збіраецца для даты празднавання).

```text
advent → advent;  christmas → christmas;  lent → lent
holyweek: periodPhase ∈ {'palm-sunday','holy-week'} → lent;  'triduum' або невядомая фаза → null
easter → easter;  ordinary → null
```

Вялікі тыдзень вызначае **фаза** Ordo, не перыяд і не грамадзянская дата: `computeSeason` ставіць `periodPhase: 'triduum'`
на ўвесь Вялікі чацвер (з даты чацвярга, не з гадзіны Імшы Вячэры Пана), на Вялікую пятніцу і Вялікую суботу; Уваскрасенне —
`easter`. Таму раніца Вялікага чацвярга (па кнізе яшчэ Пост) таксама чытае плоскі тэкст; ніводнае Common-Office ў гэтыя
дні не цэлебруецца (тэст `NR-011` правярае 2026–2060 па чатырох дыяцэзіях), таму рашэнне ніколі не вырашае рэальнае свята.
`variantKey({period:'holyweek'})` без фазы → `null` (Вялікі тыдзень без фазы не адрозніць ад Трыдуума).

## 3. Функцыя выбару і прыярытэт

```text
materializeCommonForSeason(template, season):
  key = variantKey(season); delta = template._seasonalVariants?[key]
  if delta пусты → template (той самы аб'ект)
  flat = copy(template) без _seasonalVariants;  rules = copy(flat._fieldRules)
  for (field, value) in delta:
     поле не з OFFICE_CONTENT_FIELDS або TeDeum → прапусціць
     String | List<String>  → flat[field] = value; rules.remove(field)
     null                   → flat.remove(field); rules[field] = {omit: true}
     {rule: valid}          → flat.remove(field); rules[field] = rule
     інакш → ігнараваць поле цалкам (не часткова)
  flat._seasonal = {variant: key, fields: [прымененыя]}
```

Прыярытэт у `assembleOffice`: **свой Proper** → `_fieldRules` → Common (матэрыялізаваны па сезоне),
далей толькі дазволеная рубрыкамі крыніца. Для памяткі «З дня» захоўваецца спалучэнне Proper і бягучага дня.
У PR #141 ужо прапанаваны Common-варыянт памяткі збірае тры асноўныя гадзіны святочна:
псальмы Ютрані — з нядзелі I тыдня, антыфоны — з Proper/Common; псальмодыя Гадзіны чытанняў і Нешпараў —
з Proper/Common. Дазволенае наследаванне базавага Common апісана ў `docs/common-office-festive-assembly.md`;
адвольнага буднічнага fallback тут няма. Першыя Нешпары для гэтага варыянта не ствараюцца.
Сезон ужываецца толькі да Common (`source: common|template`, `vesper1*`, выбар «Іншыя варыянты»); `current-day`,
`sunday-week-1`, `complementary`, `office-for-dead` яго не бачаць. Для шаблона-«template» `omit` у `_fieldRules`
Common азначае пусты тэкст (`origin: common:<id>:omit`). Памятка «З дня» і `allowCurrentDay` не змяняюцца.
`provenance[field]` застаецца `common:<id>`; дадаткова `seasonal.fields[field] = '<variant>'`.

## 4. Map / cache / bundle

* `ContentStore`/мапа шаблонаў захоўвае **сырыя** дакументы; матэрыялізацыя — на кожную зборку Office
  (мемарызацыя на выклік), ніколі не мутуйце мапу і не кладзіце матэрыялізаваны шаблон у агульны кэш.
* Кэш сабранага дня ключуецца (дата, дыяцэзія); пасля абнаўлення шаблонаў інвалідуйце яго (вэб: `CONTENT_REVISION`).
* Bundle (`assets/content/liturgicalTemplates.json.gz`): новае поле — частка дакумента; кадаванне радкоў
  (`STRING_REF`) вярнуе яго без змен. Фармат бандла і `schemaVersion` не мяняюцца.

## 5. Эквівалентныя Dart-тэсты

1. Усе `cases` fixture (5400 выпадкаў): `materialize(template, period, periodPhase)[field]` → `expected.value.valueSha256`
   (`sha256(utf8(string))` або items, злучаныя `\u0000`), `length`, `plainStart/plainEnd`, `variant`, `source`.
2. `calendar`: `variantKey(computeSeason(date))` для 48 межавых дат 2026–2028 (Хрышчэнне Пана → Звычайны перыяд,
   Попельцовая серада, Пальмовая нядзеля, Вялікі чацвер → null, Уваскрасенне, Пяцідзясятніца, 1-я нядзеля Адвэнту, 24–25.12).
3. `assembly` (11 выпадкаў): свой Proper перамагае (`provenance == 'proper'`), памятка «З дня», `church-dedication` Lent vs Easter
   (`vesper1Ant3`+`vesper1Ps3`, `officeOfReadingsR1`, `laudesR`), `blessed-virgin-mary` Адвэнт vs Нараджэнне (адна малітва).
   Пасля PR #141 у `memorial pastors easter` абноўлены толькі `expected.seasonalFields`: дададзены сезонныя
   антыфоны/псальмодыя асноўных гадзін і першае чытанне, прыбраны `vesper1*`. Схема 1, усе 5400 `cases`,
   хэшы тэкстаў, digest шаблонаў, астатнія 10 `assembly` і ўсе 48 `calendar` засталіся ранейшымі.
4. Чыстая функцыя: пустая дэльта → той самы аб'ект; `null` → `omit`; `{rule}`; невядомае поле ігнаруецца; аргумент не мутуецца.
5. Валідацыя: невядомы сезон/поле, `""`, незбалансаваныя тэгі — адмова (як `validateSeasonalVariants`).
6. Рэгрэсія: ніводнае поле дня не змяшчае два сезонныя тэксты адначасова і не змяшчае «(Велікодны перыяд» / «У Вялікі пост:».

## 6. Публікацыя і несумяшчальнасці

Парадак (вэб, не рабіце без дазволу ўладальніка): `npm run generate:fixed-feasts` (ужо выканана) → лакальны backup →
`npm run ordo:import-feasts -- --apply --only templates` → `npm run content:version:bump` + дэплой вэб →
`npm run content:manifest` (вердыкт) і толькі пры SAFE CONTENT PATCH `-- --apply`.
Flutter: пакуль не ўкаранёны выбар сезону, прыкладанне чытае плоскія палі (Звычайны перыяд) і не падае — але ў Вялікі
пост / Вялікдзень / Адвэнт / Нараджэнне паказвае тэкст Звычайнага перыяду. Каб паказваць сезонныя тэксты, трэба
рэліз Flutter з гэтай функцыяй; публікацыя `_seasonalVariants` у манифест — аддзельна і пасля вырашэння
стратэгіі (аддаваць новы тэкст старым кліентам бяспечна, бо плоскія палі не змяняюцца).
Памер патча: ≈ 1.9 МБ (14 з 16 дакументаў), вердыкт рэальнага `classifyPatch` — SAFE CONTENT PATCH; гл.
`reports/liturgy/common-seasons-import-plan.json` і `reports/liturgy/common-seasons-ordo-import-offline-plan.json`.

## 7. Што змянілася пасля паўторнага аўдыту (на што звярнуць увагу Flutter)

* **Новыя поўныя чытанні/версікулы ў варыянтах.** Том I (Адвэнт + Нараджэнне) і том II (Пост + Пасха) друкуюць поўныя тэксты,
  якія адрозніваюцца ад тома III без лакальнай прыметы сезона: першае чытанне (`officeOfReadingsR1`) у 10 Common тома I
  (`apostles`: 1 Кар 1, 18 – 2, 5 замест 1 Кар 4, 1–16; `religious`: Эф 4, 1–24 замест Флп; `works-of-mercy`: 1 Ян 4, 7–21
  замест 1 Кар 12–13 і інш.), а таксама версікул і кароткія рэспансорыі `blessed-virgin-mary`. `religious` і
  `works-of-mercy` маюць гэтае чытанне ва ўсіх чатырох сезонах (у Вялікдзень з «аллелюя» ў адказах). Ніякай новай схемы:
  гэта звычайныя поля `_seasonalVariants`, толькі іх значэнне — цэлы блок HTML.
* **Пасхальнае «аллелюя» ў К./Н.** («…, аллелюя.») ужыта для 100 радкоў, толькі да элементаў, пасля якіх том II ставіць
  `(Велікодны перыяд Аллелюя)`; кароткія адказы («Н. Яна выбрала.») не змяняюцца. Антыфоны — «…, / аллелюя.», з «!» — «…! / аллелюя.».
* **`doctors-of-church`** атрымаў сезонныя палі `pastors` (28 палёў), калі яго поле не друкуецца ў раздзеле тома і роўна полю `pastors`.
* **Базавыя (плоскія) палі выпраўлены** (асобныя рэдакцыйныя камітэты): `officeOfReadingsVers` у `apostles`, `virgins`, `holy-women`
  (К./Н. былі перастаўлены) і антыфоны Пс 64 (63) у `apostles` («абвяшчалі справу»). Flutter, які чытае плоскія палі, атрымае
  гэтыя выпраўленні разам з абнаўленнем шаблонаў.
* Сезонныя варыянты не змяшчаюць прабелаў U+2005 (у крыніцах тамоў I/II): усе пераведзены ў звычайны прабел.
* Лічбы: advent 21, christmas 21, lent 84, easter 404 палёў (разам 530; было 426).
