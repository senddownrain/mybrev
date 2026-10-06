# Літургічная база web: наступны этап — план

Дакумент апісвае стан на 2026-10-05 (`main` пасля `b37d6ce`) і мэтавы стан.
Flutter у гэтым этапе не мяняецца.

## 1. Current state

| Слой | Дзе | Стан |
|---|---|---|
| Calendar engine | `src/utils/ordo/*`, `calendar-definitions.json`, Firestore `liturgical*` | правільная база: layers, precedence, transfers, Year Overrides |
| Temporal day | `days` (period, `advent-17..24-12`, `christmas-25-12..12-01`, `feast-*`) | 735 дакументаў (snapshot 2026-10-05) |
| Proper (fixed) | `days` legacy: 156 матэрыялізаваных дакументаў + 179 копій «па Commons» | sparse-форма генеруецца (`patchs/db-feasts`, 290), але ў Firestore яе няма: старыя кліенты Flutter не ўмеюць збіраць Office |
| Commons / reusable | `liturgicalTemplates` (15, у т.л. `sunday-week-1`) | апублікавана 2026-10-01; `complementary-psalmody` адсутнічае, а assembler моўчкі падстаўляе дзень |
| Office assembler | `src/utils/ordo/officeAssembly.js` | працуе для sparse; legacy-дакументы ідуць праз `resolveLegacyTemplatePlaceholders` (fix 02.10) |
| Readings | `readings` (815) + `planReadings` | поўны тэкст; Ordo паказвае толькі «Чытанні дня» без цытат |
| Ordo notes | `notes.json` (1200) | генералізацыя ламае сэнс: «Чэрвеньскае набажэнства» → кожная нядзеля звычайнага перыяду; тэксты з дакладнай датай → «кожны І чацвер» |
| `/picker` | `FeastsPicker.vue` → `getAllFeastDays()` → увесь `days` | не канонічная крыніца календара |
| Дыяцэзія | `ordoDiocese` (адна) | Ordo ўжо мае фільтр некалькіх дыяцэзій (`buildDayUnion`) |
| Колеры | некалькі heuristics па назве/перыядзе | Ordo ведае vestment colour, але экраны яго не выкарыстоўваюць |

Чаму fixed празднаванні яшчэ ў legacy `days`: sparse-дакумент у `days` ламае
Flutter, выпушчаны да Office assembly. Таму імпарт sparse `days` чакаў рэліза.

## 2. Target state

```text
CALENDAR ENGINE   што празднуецца (ResolvedLiturgicalDay)
TEMPORAL DAY      days: period / seasonal date / dynamic
PROPER            liturgicalProperTexts: sparse Proper кожнага fixed празднавання
COMMON/REUSABLE   liturgicalTemplates: Commons, sunday-week-1, complementary-psalmody
OFFICE ASSEMBLER  officeAssembly.js: па рубрыках, без чытання фраз у runtime
READINGS          readings: поўны тэкст
READING REFS      reading-references (generated з readings): цытаты для Ordo
```

### Чаму асобная калекцыя `liturgicalProperTexts`

- Web перастае залежаць ад формы legacy `days`, а стары Flutter працуе далей:
  яго `days` не мяняюцца.
- Той самы sparse-фармат (`_schema: 2`), што ўжо чытаюць `officeAssembly.js`
  і Flutter-порт: новы фармат не патрэбны.
- Id дакумента = id з `days` (`02-10-holy-guardian-angels`), таму старыя
  спасылкі `/day/...`, `--pastors`, `--day` працуюць.
- Назва адпавядае ролі: «уласныя тэксты празднавання», без Common.

## 3. Што застаецца

Engine, YearOptions, transfers, Year Overrides і адмінка, Ordo month, фільтр
дыяцэзій Ordo, колеры date picker, lazy notes, `publicContentCache`, Mass /
Compendium / Songs, fix Анёлаў Ахоўнікаў (`resolveLegacyTemplatePlaceholders`).

## 4. Пераходны legacy

- fixed-дакументы ў `days` — толькі fallback, калі ў `liturgicalProperTexts`
  няма празднавання; лічыльнік залежнасцей — у аўдыце;
- `resolveLegacyTemplatePlaceholders` — для гэтага fallback;
- `getAllFeastDays` — да пераводу `/picker` на Ordo definitions.

## 5. Migration order

1. Аўдыт палёў (усе крыніцы) → пашырэнне нармалізацыі ў `feast-content.mjs`.
2. `complementary-psalmody` з праверанага тэксту → `liturgicalTemplates`.
3. Web: `liturgicalProperTexts` → assembler; legacy толькі fallback.
4. Advent 17–24 / Christmas 25.12–12.01: аўдыт 2025–2032, выпраўленні.
5. Reading references + Ordo UI.
6. Notes: семантычныя guards, перабудова, republish з revision bump.
7. Некалькі дыяцэзій у Settings, union на Hours/Readings.
8. Адзіны colour resolver.
9. UX: «Святкаванні дня», дзеянні радкоў Ordo, капсула «Літургія», «Выбраць», overflow, `/picker`.
10. Firestore: backup → dry-run → apply → verify; `CONTENT_REVISION` bump.
11. `npm run liturgy:audit`, master deficit report, валідацыя па чатырох календарах.

## 6. Рызыкі

| Рызыка | Мера |
|---|---|
| Квота Firestore (бясплатны план) | аналіз па лакальным snapshot (`AGENTS.md`); поўны export толькі літургічных калекцый |
| Стары кэш змешвае legacy і новы Office | `CONTENT_REVISION` bump разам з публікацыяй |
| Новы Proper горшы за працуючы legacy | параўнанне assembled ↔ legacy ў аўдыце; legacy fallback застаецца |
| Нармалізацыя ператворыць сапраўдны кароткі тэкст у правіла | field-aware heuristics; няўпэўненае → NEEDS_REVIEW, не правіла |
| Notes знікнуць там, дзе былі правільныя | дакладныя даты і бяспечныя recurring selectors застаюцца; астатняе → review |

## 7. Вынік этапу (2026-10-06)

Апублікавана ў Firestore (backup → dry-run → apply → verify; журнал —
`reports/liturgical-firestore-migration.json`):

| Што | Колькасць | Revision |
|---|---|---|
| `days`: рамонт `ordinary-w21-d3/d4` (з кансэнсусу тыдня псалтыра) | 2 | — |
| `liturgicalTemplates`: `complementary-psalmody` (+1 абнаўленне) | 2 | `templatesRevision` 1 |
| `liturgicalProperTexts` | 290 | `properTextsRevision` 1 |
| `liturgicalCelebrations` / overrides | 1 абнаўленне | calendar 2 |
| `liturgicalOrdoNotes` (rev 2 → 3, падзел па датах, «сёння» guard) | 116 + 1023 + 1; 112 superseded (з backup) | notes 3 |

`CONTENT_REVISION` = `2026-10-05T19:10:00Z`. Legacy fixed `days` не выдалены
(іх чытае стары Flutter). Drift Firestore ↔ bundled: усе калекцыі in sync.

Рашэнні:

- **`liturgicalProperTexts`** — асобная калекцыя (тыя ж id, што legacy days):
  новы web чытае яе, стары Flutter — `days`; адна калекцыя не магла служыць абодвум.
- **Reading references** — bundled праекцыя `readings` (`src/data/ordo/reading-references.json`,
  `npm run liturgy:reading-references`); на Ordo без запыту ў Firestore.
  Тыдзень `null` = Firestore `== null` (дні пасля Папяльца), не тыдзень 0.
- **`/picker` застаецца**: пошук па літургічнай пазіцыі і святу з рэальнай
  датай; цяпер праз рухавік (`ordoDateForPosition`), не legacy-разлік.
- **Notes**: дата з днём тыдня / «сёння» → асобны запіс на гэты дзень;
  месячнае набажэнства → толькі ў назіраных месяцах; першы чацвер/пятніца/субота —
  канонічныя app-normalization нататкі; загалоўкі і спасылкі на старонкі → review.

Праверка: `npm run liturgy:audit` — Hours sources (target runtime: 0 сырых
інструкцый, 0 legacy-залежнасцей), Advent/Christmas 864/864 PASS, notes 0
семантычных парушэнняў, чатыры календары не горш (Мінск 95.6 %, Віцебск 89.6 %,
Пінск 90.8 %, Гродна 86.0 %). Што засталося — `docs/liturgical-data-deficits.md`
(P0/P1 — рэдакцыйныя даныя: тэксты з брэвіярыя і лекцыянарыя, якіх у базе няма).
