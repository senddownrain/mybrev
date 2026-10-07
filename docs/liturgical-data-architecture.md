# Кананічная мадэль літургічных дзён

## Калекцыі

- `days` — калекцыя літургічных дзён і тэкстаў гадзін.
- `days` — мэтавая runtime-калекцыя дзён трох крыніц: `period`, `fixed`, `dynamic`.
- `templates` — агульныя тэксты. Дакумент не мае поля `_templateType`.
- `readings`, `prayers`, `yearOptions` захоўваюць адпаведна чытанні, малітвы і параметры календара.

У мэтавай `days` поле `_source` адрознівае тры схемы. Гэта дазваляе пакінуць адну кропку чытання для UI, але не змешваць крытэрыі пошуку.

## Сістэмныя палі

### Period day

Абавязковыя: `_source: "period"`, `_periodType`, `_periodWeekNumber`, `_dayOfWeek`, `_title`. Палі `_rank`, `_place`, `_templates` і `comment` не выкарыстоўваюцца.

### Fixed-date day

Абавязковыя: `_source: "fixed"`, `_date` (`DD.MM`), `_rank`, `_templates`, `_title`. Апцыянальныя: `_place` і `comment`. `_place` захоўваецца як адзін slug або як масіў slug-кодаў, калі адзін і той жа дакумент з аднолькавым рангам дзейнічае ў некалькіх мясцовых календарах.

ID мае выгляд `DD.MM-_rank[-_place]-slug`. Пошук усіх варыянтаў дня робіцца па `_source` і `_date`, а не па ID.

### Dynamic day

Абавязковыя: `_source: "dynamic"`, `_feastKey`, `_title`. Іншыя метаданыя дадаюцца толькі калі яны сапраўды апісваюць дынамічнае свята.

## Рэзалвер поўнага дня

UI гадзінаў атрымлівае ўжо сабраны `effectiveDay` і не ведае пра `templates`. Зліццё выконваецца ў парадку:

1. дзень перыяду;
2. першы шаблон з `_templates` (карыстальнік можа выбраць іншы ў `OrasList`);
3. уласныя палі fixed-date дня.

Больш канкрэтная крыніца перазапісвае папярэднюю. Значэнні `from-day`, `[from-day]`, `from-first-week` і `from-own-texts` — спасылкі, а не тэкст для паказу. Рэзалвер павінен замяняць іх адпаведна бягучым днём перыяду, нядзеляй першага тыдня або ўласнымі/агульнымі тэкстамі. Варыянты `from-apostles` і памылковае `from-apostels` трэба нармалізаваць у спасылку на шаблон `apostles` падчас міграцыі.

## Этапы ўкаранення

1. Аўдыт `fixedCalendar.js` і `patchs/feasts` па `_date`, `_rank`, `_place`, праверка ID і спасылак на шаблоны.
2. Нармалізацыя JSON і імпарт у `days` без запісу няпоўных/неадназначных дакументаў.
3. Адзіны resolver/fetch-сэрвіс і выбар шаблона ў `OrasList`.
4. Пераключэнне кампанентаў гадзінаў на `effectiveDay`, а затым міграцыя ў `days` і ачыстка старых даных.

Каманда `npm run audit:fixed-feasts` заўсёды друкуе JSON-справаздачу. Для CI можна запусціць яе з `-- --strict`: тады невядомыя значэнні, спасылкі на адсутныя шаблоны і дублікаты ID завершаць працэс з памылкай. Розніца пакрыцця застаецца часткай справаздачы, бо яна з'яўляецца планам далейшага напаўнення, а не тэхнічнай памылкай аўдытара.

## Структураваныя правілы палёў (`_fieldRules`) — кантракт для Flutter

Крыніца праўды: `src/utils/ordo/fieldRules.js` (спіс) і `src/utils/ordo/officeAssembly.js`
(рэзалвер). Тэкставыя ўказанні брэвіярыя («Гімн з Ютрані», «Гімн з Уласных тэкстаў пра
святых», «з нядзелі І тыдня») ператвараюцца ў правілы толькі пры генерацыі
(`scripts/lib/feast-content.mjs`); у runtime сыры беларускі тэкст ніколі не з'яўляецца
дырэктывай. Крыніца (`patchs/feasts/*.json`, `common-texts`) можа таксама задаваць
правіла яўна праз `_fieldRules`.

| Правіла | Значэнне | Новае ў фінальнай фазе |
|---|---|---|
| `{ ref: 'laudesHymn' }` / `{ ref: [...] }` | same-day field: поле таго ж сабранага Афіцыя (першае непустое) | — (18.11 `vesperHymn → laudesHymn`, Мацей `laudesHymn → officeOfReadingsHymn`, 02.11 малітвы `→ officeOfReadingsPr`) |
| `{ source: 'current-day' }` | тэмпаральны дзень даты | — |
| `{ source: 'sunday-week-1' }` | `liturgicalTemplates/sunday-week-1` | — |
| `{ source: 'common' }` | выбраныя агульныя тэксты | — |
| `{ source: 'template', template }` | названыя агульныя тэксты | — |
| `{ source: 'proper' }` | уласны тэкст празднавання; ужываецца ўнутры Common (Апосталы `laudesHymn`). Калі Proper тэксту не мае — поле пустое + `_integrityErrors` (`proper-text-missing`), **ніколі не будзень** | **так** |
| `{ source: 'complementary' }`, `{ source: 'office-for-dead' }` | шаблоны псалмодыі / Афіцыя за памерлых | — |
| `{ omit: true }` | наўмысна пустое | — |
| `allowCurrentDay: true` | мадыфікатар «… або з будня» | — |

Новыя палі scaffold-дакументаў `liturgicalProperTexts`: `_templatesConfirmed: true` (Common
пацверджаны ўладальнікам, `scripts/lib/scaffold-commons.mjs`) і `_officeSource: 'current-day'`
(03.01 Імя Езуса: Афіцый дня Каляд, без Common). Абодва інфармацыйныя: зборка робіцца з
`_templates` як раней. Parity fixture (`npm run ordo:flutter-fixture`) мае спіс
`fieldRuleKinds`; Dart-зборшчык павінен падтрымліваць кожны від.
