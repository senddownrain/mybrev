# Ordo: алгоритм разрешения литургического дня

> **Обновление (этап «Ordo next stage»).** Уровень собственного костёла (`LocalChurchContext`, «Мой касцёл») удалён: слои — `universal → belarus → diocese → year overrides`. `YearOptions` — только вычисляемый DTO, Firestore `yearOptions` не читается. Постоянный календарь хранится как декларативные определения (`liturgicalCelebrations`, `liturgicalDioceseOverrides`), ручные исключения года — в `liturgicalYearOverrides`. Актуальное описание: `docs/ordo-next-stage.md`.

Целевой pipeline (этапы 3–5). Уровни не смешиваются: каждый получает результат предыдущего
и ничего не «додумывает» за него.

```text
Date + { country: 'BY', diocese, localChurch?, yearOverrides? }
  │
  ▼ 1. YearContext        buildYearOptions(year) + movable dates + phases (без Firestore)
  ▼ 2. Calendar Resolver  ВСЕ кандидаты: period day, seasonal date doc, fixed (universal/BY/
  │                       diocese/_place), dynamic, local (title/dedication/patron), overrides
  ▼ 3. Precedence         таблица першынства + переносы + подавления + I/II Vespers конфликт
  ▼ 4. Display Resolver   PRIMARY, ALTERNATIVES (только законные), commemorations, suppressed
  ▼ 5. Office Resolver    для выбранного Office: источники по полям, sourceFallbacks vs allowedChoices
  ▼ 6. Component Resolver существующий resolveDayAgainstPeriod / templates / from-day → effectiveDay
  ▼ 7. Render
          ↘ Readings Resolver получает ту же ResolvedLiturgicalDay (этап 5)
          ↘ Ordo notes: selector-match по notes.json + scope (этап 3)
```

`ResolvedLiturgicalDay`: `date, period, periodPhase, week, dayOfWeek, psalterWeek, readingCycle
{sunday, weekday}, candidates[], primary, alternatives[], commemorations[], suppressed[]
{candidate, reason}, officeResolution, readingResolution, ordoNotes[], appliedRules[],
appliedLayers[]`.

## 1. Кандидаты (Calendar Resolver)

Каждый кандидат: `{ identity: {kind, id}, rank, source: 'period'|'seasonal'|'fixed'|'dynamic'|
'local'|'override', layer: 'universal'|'belarus'|'diocese'|'local'|'year', documentIds }`.
Fixed-варианты одного `celebrationId` сворачиваются по слою: diocese переопределяет ранг
universal (напр. св. Язафат: universal `memoria`, Мінск/Пінск `festum`, Віцебск `solemnitas`).
Ничего не отбрасывается на этом шаге.

## 2. Precedence

Ранги по таблице АНЛГ 59 (приведена в Віцебску, Пінску, Гродна → `CONFIRMED_PERMANENT_RULE`):

```text
I   1 Трыдуум | 2 Нараджэнне, Аб’яўленне, Унебаўшэсце, Спасланне; нядзелі Адвэнту/Посту/
    Велікодныя; Папяльцовая серада; будні Вялікага тыдня (пн–чц); Велікодная актава
    3 урачыстасці агульнага календара, Усіх памерлых | 4 уласныя урачыстасці (апякун месца,
    дэдыкацыя і тытул уласнага касцёла, заснавальнік ордэна)
II  5 святы Пана | 6 нядзелі Нараджэння і звычайныя | 7 святы НПМ і святых агульнага
    календара | 8 уласныя святы (галоўны апякун дыяцэзіі, гадавіна дэдыкацыі катэдры, …)
    9 будні 17–24.12, актава Нараджэння, будні Посту
III 10 абавязковыя ўспаміны агульнага календара | 11 уласныя абавязковыя ўспаміны
    12 неабавязковыя ўспаміны | 13 будні Адвэнту да 16.12, Нараджэння з 2.01, Велікодныя
    пасля актавы, звычайныя
```

Правила:
- Урачыстасць, імпедаваная днём высшего ранга, **переносится** на ближайший свободный день
  (Звеставанне 2027: 25.03 = Вялікі чацвер → 05.04, после Велікоднай актавы). Вычисляется,
  не override.
- Свята/ўспамін, импедаваныя нядзеляй/урачыстасцю, в этом году **опускаются** (Віцебск
  «Прапускаецца свята св. Андрэя», 30.11.2025).
- Абавязковы ўспамін в 17–24.12, актаве Нараджэння, буднях Посту → только `commemoratio`
  (Віцебск: «можна карыстацца толькі калектай»; Пінск: «Дазволена: усп. …»).
- На нядзелі, урачыстасці, святы, Папялец, Вялікі тыдзень, Велікодную актаву ўспамін не
  выкарыстоўваецца зусім → `suppressed`.
- Абавязковы ўспамін адсоўвае неабавязковыя (16.11 Вастрабрамская → св. Маргарыта і
  Гертруда не адзначаюцца).
- Local church: тытул/дэдыкацыя/апякун → урачыстасць (ранг I.4) только при `LocalChurchContext`.

## 3. Display Resolver

| Сітуацыя | PRIMARY | ALTERNATIVES | commemorations |
| --- | --- | --- | --- |
| будзень без святога | будзень | — | — |
| будзень + неабавязковыя ўспаміны | будзень | кожны ўспамін (+ НПМ у суботу ў звычайны перыяд) | — |
| абавязковы ўспамін | ўспамін | — (будзень **не** паказваецца; яго псалтыр/1-е чытанне ўнутры) | — |
| свята / урачыстасць | празднаванне | — | — |
| 17–24.12 / актава / будзень Посту + ўспамін | дзень перыяду | — | ўспамін як `commemoratio` |
| нядзеля + fixed святы/ўспамін | нядзеля (калі не свята Пана) | — | — (`suppressed`) |
| Office for the Dead | — | дазволены толькі ў дні, дзе допускается (табліцы Імшаў/ЛГ) | — |

## 4. Office Resolver: fallback ≠ choice

```ts
officeResolution = {
  officeType: 'solemnity'|'feast'|'memorial'|'commemoratio'|'weekday'|'sunday'|'triduum'|'octave',
  firstVespers: { from: celebrationId, sources } | null,
  secondVespers: boolean,
  compline: 'sunday-after-I'|'sunday-after-II'|'weekday',
  teDeum: boolean,
  fields: { [field]: { sourceFallbacks: Source[]; allowedChoices?: Source[][] } },
}
```

| Office | Гадзіна чытанняў / Ютрань / Нешпары | Малітва ўдзень | Камплета | Te Deum |
| --- | --- | --- | --- | --- |
| Урачыстасць | Proper → Common; І і ІІ Нешпары; Ютрань — нядзеля I тыдня | дадатковая псальмодыя | нядзельная (пасля І / ІІ Нешпараў) | так |
| Свята | Proper → Common; **без І Нешпараў** (акрамя свят Пана ў нядзелю); Ютрань — нядзеля I | бягучы дзень | будзённая | так |
| Ўспамін | псальмы бягучага дня; гімн/чытанне/рэспансорый/антыфоны/просьбы: Proper, інакш **choice** Common ↔ бягучы дзень; малітва — Proper; ГЧ: 1-е чытанне дня, 2-е агіяграфічнае → fallback | бягучы дзень | бягучы дзень | не |
| Commemoratio | Office дня перыяду + (ГЧ) агіяграфічнае чытанне + (Ютрань/Нешпары) антыфона і малітва святога | дзень | дзень | паводле дня |
| Трыдуум | уласныя; Нешпары не чытаюць удзельнікі вячэрняй літургіі | уласная | нядзельная (пасля ІІ Нешпараў) | не |

`sourceFallbacks` = Proper → Common → бягучы дзень (не альтэрнатывы для UI). `allowedChoices`
= сапраўдны выбар (Common ↔ дзень у ўспаміне) — захоўваецца, UI можа паказаць перамыкач.

## 5. I Vespers / II Vespers

1. `hasFirstVespersByRubrics(candidate)`: урачыстасць, нядзеля, свята Пана на нядзелю.
2. Сегодняшние II Vespers vs завтрашние I Vespers → побеждает высший ранг по таблице;
   при равенстве — сегодняшние II (агульныя нормы ЛГ).
3. Тексты: `vesper1*` дня → Proper; иначе Common (`_templates`) + псальмы Laudate
   (Віцебск: «Абодва псальмы ў І Нешпарах … з цыкла хвалебных псальмаў»).
4. Субота: І Нешпары нядзелі, калі толькі нядзеля не саступае (напр. урачыстасць у суботу).

## 6. Ordo notes

`notes.json` фильтруется по `scope` (universal/belarus/diocese/local) и `selector`
(вычисляется по YearContext). `displayOnly` заметки не влияют на Office; `effect` —
структурированные эффекты: абавязковае свята, пост/устрыманне, дыспенсацыя,
`suppressed-celebration` (объясняется precedence), `local-titular`.

## 7. Проверка (этап 6)

Для каждого дня источника сравнить с генерацией: period/week/psalter (`liturgical.*` уже
сверяется), primary + rank (`celebrations[role=primary]`), alternatives (`role=alternative/
permitted`), suppressed (`notes[tags∋suppressed]`), I/II Vespers и Compline
(`office.flags`), Te Deum, notes. Статусы: `MATCH`, `EXPECTED_DIOCESAN_DIFFERENCE`,
`EXPECTED_YEAR_EXCEPTION`, `SOURCE_MORE_DETAILED`, `PARSER_UNCERTAIN`, `GENERATOR_MISMATCH`.
