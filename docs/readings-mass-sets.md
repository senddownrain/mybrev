# Чытанні Імшы: некалькі набораў (vigil / day, цыклы, ролі)

Фінальная фаза чытанняў (спецыфікацыя §4, §5, §14, §16–18, §20–21).

## Мадэль

`readings/<id>.massReadings` — новае, **адытыўнае** поле (`src/utils/massReadingSets.js`):

```text
massReadings: {
  schema: 1,
  flatSet: 'day' | null,          // які набор спраецыраваны ў плоскія палі гэтага дакумента
  sets: [{
    id, label ('Св. Імша ўдзень'), sourceLabel ('Імша ўдзень'), context, default?, referenceOnly?, note?,
    source: { url, parser: 'catholicby-lectionary@1', fetchedAt },
    sections: [ reading | psalm | acclamation | sequence | gospel | rubric ]   // парадак крыніцы
  }]
}
```

- `section.cycle` (A/B/C) — частка толькі аднаго цыкла: агульная база + цыклічнае Евангелле
  (Унебаўшэсце, Пальмовая нядзеля, Пасхальная вігілія) без трох копій першага чытання.
- `gospel.passion.blocks` — Мука Пана па ролях: `heading`, `rubric`, `paragraph.runs[{ role: narrator|christ|speaker|crowd }]`
  (маркеры крыніцы `Ев.`, `Е.`, `І.`, `Л.`). Плоскае `gospel.text` для старых праграм — той жа тэкст з маркерамі.
- `sequence` — асобная секцыя (Вялікдзень, Спасланне Духа Святога), таксама ў плоскім полі `sequence.text`.
- `conclusion: ''` — «Гэта слова Божае» не гаворыцца (3-е чытанне Пасхальнай вігіліі).
- `referenceOnly: true` — толькі цытаты, без тэксту; валідатар забараняе тэкст у такім наборы.

Выбар па змаўчанні (`defaultSetId`): яўны `default` → вечаровы/вігілійны набор, калі ёсць і ранішні/дзённы → першы.
Выбар захоўваецца ў маршруце `?set=<id>&year=<A|B|C>`. Не блытаць з выбарам Office option / Common.

## Сумяшчальнасць (Flutter і стары web)

- Плоскія палі (`reading1`, `psalm`, `reading2`, `alleluia`, `gospel`, `sequence`, `readingN/psalmN`) застаюцца
  праекцыяй аднаго набору (`projectSetToLegacy`): выпушчаныя праграмы чытаюць іх, як раней.
- Кананічны дакумент без плоскіх палёў (`feast-palmsunday`, `feast-ascension`, `holyweek-w1-d7--vigil`, `easter-w7-d7`)
  і reference-only дакументы (толькі `bible`) старыя праграмы прапускаюць (`hasReadingDocumentContent` = false).
- Legacy-дакументы, якія ахоплівае кананічны, маюць `_massReadingsRef: { doc, set, cycle?, projected }`;
  новы web іх хавае, калі кананічны дакумент таксама загружаны.
- `CONTENT_SCHEMA_VERSION` **не** павышаны (змена адытыўная); `DOCUMENT_SCHEMAS.readings.massReadings = 1`,
  `DOCUMENT_RULES.readings` валідуе `massReadings`.
- **Flutter (наступная фаза)**: дадаць чытанне `massReadings` у `ParsedReading`, селектар набору, рэндэр ролей,
  `rubric`/`sequence`/`referenceOnly`; ігнараваць дакументы з `_massReadingsRef`, калі ёсць кананічны. Пакуль гэтага
  няма, Flutter паказвае плоскія палі: 15.08 / 29.06 / 25.12 — дзённую Імшу (было: вігілія / ноч), Grodno/Vitebsk
  гадавіна пасвячэння катэдры — без тэксту (reference-only), новыя наборы (вігіліі, Імша ўначы/на світанні,
  ранішняя субота перад Пяцідзесятніцай) — недаступныя.

## Парсер

`scripts/liturgy/lib/lectionary-parser.mjs`: артыкул → візуальныя радкі (тлусты / курсіў / выраўноўванне / абзац)
→ state machine (набор, секцыя, цытата, загаловак, заканчэнне, «або», рэфрэн, акламацыя, ролі, рубрыкі)
→ `validateParsedPage`. Fixtures: `tests/fixtures/catholicby/*.html` (толькі articleBody + URL і дата),
абнаўленне: `node scripts/liturgy/fetch-lectionary-fixtures.mjs`.

| Старонка | Наборы / структура |
|---|---|
| 15.08 Унебаўзяцце | вігілія + дзень (default) |
| 29.06 Пётр і Павел | вігілія + дзень (default) |
| 24.06 Нараджэнне Яна Хрысціцеля | вігілія + дзень (default дзень, як 15.08/29.06; знойдзена поўным аўдытам Lectionary 2026-10-12, у плане міграцыі) |
| 06.08 Перамяненне Пана | 1 набор, Евангелле A/B/C (раней у legacy-дакуменце было адно; у плане міграцыі) |
| 15.07 Бонавэнтура, 11.08 Клара | 1 набор; цытаты = Catholic.by (Мц 23 / Мц 19; календары друкуюць іншае — крыніца §2 вышэй) |
| 16.05 Андрэй Баболя | 1 набор; дакумент Пінскай урачыстасці праецыруе той жа набор |
| 02.11 Усе памерлыя | 3 Імшы (першая — default); у нядзелю Mass = Усе памерлыя (план Ordo) |
| 16.03 гадавіна катэдры ў Мінску | 1 набор з уласнай старонкі |
| Пальмовая нядзеля | працэсія (Ев. A/B/C) + Імша (агульныя чытанні, рубрыкі, легенда роляў, Мука A/B/C па ролях) |
| Вялікі чацвер | Імша Хрызма (post/5100) + Імша Вячэры Пана (default) |
| Вялікая пятніца | 1 набор, Мука па ролях, рубрыка «Усе становяцца на калені…» |
| Пасхальная вігілія | 7 чытанняў + 7 псальмаў, рубрыкі, Эпістала, псальм, Ев. A/B/C |
| Велікодная нядзеля | дзень + секвенцыя (tryduum/5106) |
| Субота VII Велікоднага тыдня | ранішняя Імша (velikodny/5167) + Імша ў вігілію (velikodny/5172, default; old.catholic.by 103542 — кантрольная копія, супадае) |
| Пяцідзесятніца | Імша ўдзень + секвенцыя |
| Унебаўшэсце | агульныя чытанні + Ев. A/B/C |
| 24.12 | ранішняя (advent/4604) + Імша ў вігілію (urachystasci/5023, default) |
| 25.12 | Імша ўначы, на світанні, удзень (default) |

## Reference-only (рэшта, без выдуманага тэксту)

| Дакумент | Цытаты | Крыніца |
|---|---|---|
| `04-12-grodno-cathedral-dedication`, `10-10-vitebsk-cathedral-dedication`, `01-05-pinsk-cathedral-dedication` (новы) | Нм 8, 2–4а. 5–6. 8–10; Пс 119 (118), 129–130. 132–133. 135. 144; Эф 2, 19–22; Мц 16, 13–19 | рашэнне ўладальніка §5.5 |
| `22-08-our-lady-lahishyn-pinsk` (новы), `05-07-our-lady-trakai-grodno` (новы) | Саф 3, 14–18 або Рым 12, 9–16аb; Лк 1, 39–59 | рашэнне ўладальніка §5.6 |

Цытаты толькі з календароў (без дакумента): our-lady-czestochowa, sv-andrew-dung-lac-companions,
sv-anthony-padua, sv-maximilian-kolbe, sv-stanislaus-kostka — NEEDS_REVIEW (тэкст з Lectionary не імпартаваны).
Мінск 16.03 застаецца з поўным тэкстам уласнай старонкі Catholic.by; яго можна выкарыстаць для іншых дыяцэзій
пасля пацвярджэння ўладальнікам.

## Міграцыя (Firestore не змяняўся)

```bash
node scripts/liturgy/migrate-readings-sets.mjs                    # dry run на backups/firestore-snapshot
node scripts/liturgy/migrate-readings-sets.mjs --projected <dir>   # + копія snapshot з планам (для аўдытаў)
node scripts/liturgy/migrate-readings-sets.mjs --apply             # live: backup, праверка змен, запіс
npm run content:manifest                                           # потым — публікацыя патча
```

Dry run (snapshot 2026-10-05): 29 абнаўленняў, 7 новых дакументаў, 0 папярэджанняў; усе дакументы праходзяць
`DOCUMENT_RULES`; `classifyPatch` супраць snapshot: 7 added + 29 changed, 513 KB — SAFE CONTENT PATCH. План: `reports/liturgy/readings-sets/plan.{json,md}`.
Аўдыт па спраецыраваным snapshot (`npm run ordo:audit-readings -- --snapshot <dir> --report-dir reports/liturgy/readings-audit-projected`):
MATCH 110→116, WRONG_CITATION 6→0, AMBIGUOUS 2→0, MISSING_CONTENT 2→0, REFERENCE_ONLY 6→10.
Пасля `--apply` і новага snapshot: `npm run ordo:audit-readings`, `npm run liturgy:reading-references`, `npm run liturgy:audit`.

## Рэдактар

`ParsedReadingEditor` для дакумента з `massReadings` адкрывае `MassReadingSetsEditor`: наборы (назва, id, кантэкст,
default, reference-only, заўвага, provenance — толькі чытанне), секцыі (дадаць / перамясціць / выдаліць), цыкл
секцыі, «або», рэфрэн і строфы, акламацыя, секвенцыя, рубрыкі, заканчэнне, Мука па ролях (тэкставая разметка
`Ев. / Е. / І. / Л.`, `# загаловак`, `> рубрыка`, без страт), папярэдні прагляд, спіс змененых палёў адносна імпарту,
«Адмяніць змены набору» / «Адмяніць». HTML санітызуецца (`sanitizeReadingHtml`), невядомыя палі захоўваюцца,
звязаныя legacy-дакументы (`projected`) зноў праецыруюцца пры захаванні. Legacy-дакумент можна перавесці на наборы.

## Поўны аўдыт Lectionary (2026-10-12)

`docs/lectionary-full-audit.md` + `reports/lectionary/*.json` (`npm run lectionary:crawl`, `npm run lectionary:audit`,
`npm run lectionary:resync`). Парсер ведае ўсе формы крыніцы, якія сустракаюцца на 617 артыкулах:
гады будняў `Год І / Год ІІ` (поле `year` секцыі), маркеры цыкла `Год А.` (і вывядзенне прапушчаных маркераў з зместу),
другі рэфрэн (`altChorus`, `altChorusRef`), «або/альбо» перад новым загалоўкам таго ж слота, загаловак з цытатай у
адным радку, доўгая/кароткая форма (`form: long|short`), прэамбула і калекта (`set.preface`, `set.prayers`),
паўторанае «Гэта слова Божае.», дэкаратыўныя літары. Кожны шаблон мае тэст у `tests/lectionary-audit.test.mjs`;
інварыянт «лішніх/страчаных слоў няма» правяраецца для ўсіх артыкулаў (`scripts/lectionary/lib/fidelity.mjs`).
