# Сезонныя варыянты агульных тэкстаў (Commons)

Агульныя тэксты (`liturgicalTemplates`, `_kind: 'common'`) у трох тамах Літургіі
гадзінаў маюць сезонныя адрозненні: Адвэнт / Нараджэнне Пана (том I), Вялікі
пост / Велікодны перыяд (том II); том III — Звычайны перыяд (базавы тэкст).

## Мадэль

Ідэнтыфікатар Common і яго плоскія базавыя палі (`vesper1Ant3`,
`officeOfReadingsR1`, `laudesPr`, …) **не мяняюцца** — гэта тэкст Звычайнага
перыяду (том III). Да іх дадаецца разрэджаны аб'ект дэльт:

```json
"_seasonalVariants": {
  "lent":   { "vesper1Ant3": "<p>…</p>", "vesper1Ps3": "<p>…</p>" },
  "easter": { "vesper1Ant3": "<p>…</p>" }
}
```

* Сезоны: `advent`, `christmas`, `lent`, `easter`. `ordinary` — гэта плоскі базавы тэкст і не дублюецца.
* Поле няма ў дэльце → **спадкуецца база** (няма override). Значэнне: радок або масіў радкоў → замена тэксту;
  `null` → у гэты сезон поле **наўмысна пустое** (`_fieldRules[field] = { omit: true }`);
  `{ "rule": { … } }` → структураванае правіла `_fieldRules` замест тэксту (напр. `{ "ref": "vesperHymn" }`).
* Нічога не дублюецца ў `days`/`liturgicalProperTexts`; новых шаблонаў няма.
* Старыя кліенты (Flutter да падтрымкі) ігнаруюць невядомае поле і чытаюць плоскія палі.
* Валідацыя: `src/utils/ordo/commonSeasons.js` → `validateSeasonalVariants` (дазволеныя сезоны, вядомыя палі
  `OFFICE_CONTENT_FIELDS`, тыпы, HTML, памер, пакінутая ў тэксце рубрыка кнігі «(Велікодны перыяд Аллелюя)»,
  «У Вялікі пост:»); выкарыстоўваецца генератарам і валідатарам публікацыі (`DOCUMENT_RULES.liturgicalTemplates`).

## Які сезон

Сезон бярэцца з **Ordo выбранага Office** (`resolved.period`, `resolved.periodPhase` = `computeSeason`
даты), не па колеры, назве святога ці дыяпазону дат.

| Ordo | варыянт |
|---|---|
| `advent` | `advent` |
| `christmas` (25.12 – Хрышчэнне Пана) | `christmas` |
| `lent` | `lent` |
| `holyweek`, фазы `palm-sunday` / `holy-week` | `lent` |
| `holyweek`, фаза `triduum` | няма (база) |
| `easter` (Уваскрасенне – Пяцідзясятніца) | `easter` |
| `ordinary` | няма (база) |

Рашэнне пра Вялікі тыдзень: рубрыка тома II — «У Вялікі пост»; Quadragesima ідзе да Імшы Вячэры Пана, таму
Пальмовая нядзеля і панядзелак–серада–(чацвер раніцай) бяруць тэксты Вялікага посту; Трыдуум не пост і не
Вялікдзень. На практыцы ніводнае Common-Office не цэлебруецца ў Вялікі тыдзень/Трыдуум (доказвае
`tests/common-seasons-assembly.test.mjs` па календары 2026–2030), таму гэтае рашэнне ніколі не вырашае рэальнае
свята. Патрабуе пацверджання рэдактара (`needs_review`).

I Нешпары бяруць сезон **самога празднавання** (яго даты): кантэнт I Нешпараў збіраецца ў тым жа
`assembleOffice` для даты празднавання.

## Выбар і прыярытэт (веб)

`materializeCommonForSeason(template, officeSeason)` — чыстая функцыя: бярэ плоскі шаблон і вяртае звычайны
плоскі аб'ект (без `_seasonalVariants`, з `_seasonal: { variant, fields }`); аргумент і кэш ніколі не мутуюцца;
без дэльты вяртае той жа аб'ект. `assembleOffice({ …, season })` чытае Commons праз
`seasonalTemplateGetter` (мемарызуецца на адзін выклік), таму ўсе шляхі (`fromTemplate`, `_fieldRules`
`source: common|template`, `vesper1*`, `allowCurrentDay`) бачаць сезонны тэкст, а `current-day`, `sunday-week-1`,
`complementary` — не. Парадак: свой Proper (`liturgicalProperTexts`) → `_fieldRules` → Common (з сезонам) → дзень.
Памятка «З дня» не змяняецца. Провенанс: `provenance[field] = 'common:<id>'`, а сезонныя палі —
`result.seasonal.fields[field] = '<variant>'` і `day._assembly.season`.

Кэш: сезонны тэкст ніколі не трапляе ў агульны `liturgicalTemplates`-кэш; зборка робіцца на выклік. Кэш
сабранага кантэнту ключуецца датай і дыяцэзіяй (`contentKey`), таму сезоны розных дат не змешваюцца. Пасля
імпарту шаблонаў у Firestore трэба павысіць `CONTENT_REVISION` (`npm run content:version:bump`), інакш ужо
збераджаныя ў браўзеры дні застануцца без сезонных тэкстаў.

## Адмінка

`DayEditor.vue` паказвае сабраны Office (read-only прагляд) з падказкай «сезонны варыянт: …» і правіламі;
запіс заўсёды пераходзіць у ўласны тэкст Proper (`sparseUpdatePayload`), сабраны сезонны HTML ніколі не
пішацца ў базавы плоскі тэкст. **Рэдагаванне саміх `_seasonalVariants` у інтэрфейсе не рэалізавана** (занадта
вялікі UI): праўце `patchs/feasts/common-texts/*.json` і ганяйце парсер/генератар. Гэта сведчыць пра
свядомую недарабоўку, а не пра адсутнасць функцыі.

## Парсер і крыніцы

Крыніцы: `patchs/sources/common-seasons/0{1,2,3}_*_utf8.txt` (sha256 у
`tests/common-seasons-parser.test.mjs`; арыгіналы `.doc` — у сумесным архіве).

```bash
node scripts/liturgy/common-seasons.mjs --dry-run --report   # аналіз, нічога не піша (reports/liturgy/common-seasons-audit.{json,md})
node scripts/liturgy/common-seasons.mjs --check              # exit 1, калі common-texts не адпавядае парсеру
node scripts/liturgy/common-seasons.mjs --write              # абнавіць _seasonalVariants + patchs/sources/common-seasons/provenance.json
npm run generate:fixed-feasts                                # патч db-templates (толькі кэш, без Firestore)
node scripts/liturgy/common-seasons-import-plan.mjs          # план імпарту супраць лакальнага snapshot
node scripts/liturgy/common-seasons-fixture.mjs              # паритэтны fixture для Flutter
```

Парсер распазнае **структуру** (Common → гадзіна → кампанент → сезонная галіна), а не слова «Велікодны».
Сезонная галіна — гэта радкі «У Вялікі пост:/У Велікодны перыяд:/У перыяд Адвэнту:/У перыяд Нараджэння Пана:»
унутры кампанента, інлайн-ярлыкі «1 ант. у Вялікі пост:», сезонныя антыфоны пасля агульнага псальма, або
сезонны **блок** (марка, за якой ідзе новы кампанент — чытанне, антыфона да песні, просьбы, малітва).
Індэкс антыфонаў у канцы тома не парсіцца. Тэкст змяненага поля рэндэрыцца ў стылі існуючага HTML
(чырвоныя рубрыкі `*`, `†`, `/`, `К.`, `Н.`, `N.`); нязменная частка (напр. чытанне перад кароткім
рэспансорыем) бярэцца з існуючага HTML як носьбіт.

### «(Велікодны перыяд Аллелюя)»

Гэта рэдакцыйны загад **для аднаго элемента**, пасля якога стаіць. Для антыфоны: «…тэкст, / аллелюя.» (форма,
якую кніга сама друкуе ў 26 велікодных антыфонах; правіла `alleluia-v1`). Для радкоў К./Н. (версікулы і
адказы рэспансорыяў) форма не друкуецца ніводным з трох тамоў, таму **тэкст не ствараецца**: гэта
`needs_review` з прапановай «…, аллелюя.» (правіла `alleluia-v1-versicle`). Алелюя, што ўжо ўваходзіць у
базавы тэкст (Том III), не выдаляецца па-за Вялікім постам; у Вялікі пост яна здымаецца толькі там, дзе том II
не друкуе яе (напр. `church-dedication.laudesAntBen`).

### Што парсер НЕ лічыць сезонным

`editorial_difference` (арфаграфія, змененае слова паміж тамамі), «Або», «Пра аднаго/некалькіх»,
спасылкі «с. NNN». Поўная матрыца і ўсе спрэчныя месцы — у `reports/liturgy/common-seasons-audit.{json,md}`.
