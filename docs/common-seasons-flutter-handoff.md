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
* Памер: самы вялікі дакумент `blessed-virgin-mary` ≈ 218 КБ (ліміт Firestore 1 МБ).

## 2. Як вызначаецца сезон

Не па колеры, назве, нумары тыдня ці фіксаваных датах — толькі **Ordo выбранага Office**: `period` і
`periodPhase` з `computeSeason(date)` (у Dart — адпаведны Ordo-рухавік; `ResolvedLiturgicalDay.period/periodPhase`).
Для I Нешпараў — сезон даты самога празднавання (кантэнт збіраецца для даты празднавання).

```text
advent → advent;  christmas → christmas;  lent → lent
holyweek: periodPhase == 'triduum' → null,  інакш → lent        // рашэнне, гл. docs/common-seasons.md
easter → easter;  ordinary → null
```

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

Прыярытэт у `assembleOffice` без змен: **свой Proper** → `_fieldRules` → Common (матэрыялізаваны па сезоне) → дзень.
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

1. Усе `cases` fixture: `materialize(template, period, periodPhase)[field]` → `expected.value.valueSha256`
   (`sha256(utf8(string))` або items, злучаныя `\u0000`), `length`, `plainStart/plainEnd`, `variant`, `source`.
2. `calendar`: `variantKey(computeSeason(date))` для 48 межавых дат 2026–2028 (Хрышчэнне Пана → Звычайны перыяд,
   Попельцовая серада, Пальмовая нядзеля, Вялікі чацвер → null, Уваскрасенне, Пяцідзясятніца, 1-я нядзеля Адвэнту, 24–25.12).
3. `assembly`: свой Proper перамагае (`provenance == 'proper'`), памятка «З дня», `church-dedication` Lent vs Easter
   (`vesper1Ant3`+`vesper1Ps3`, `officeOfReadingsR1`, `laudesR`), `blessed-virgin-mary` Адвэнт vs Нараджэнне (адна малітва).
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
Памер патча: ~1.5 МБ (14 дакументаў) — гл. `reports/liturgy/common-seasons-import-plan.json`.
