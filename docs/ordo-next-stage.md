# Ordo — наступны этап (web): план і архітэктура

Толькі MyBrev / web. Flutter на гэтым этапе не змяняецца.

Чатыры слаі, якія не змешваюцца:

```text
CALENDAR DEFINITION   што існуе пастаянна (fixed / movable / diocese)   → Firestore + bundled snapshot
YEAR RESOLUTION       што адбываецца ў канкрэтным годзе                 → pure code (engine)
MANUAL YEAR OVERRIDE  выключнае рашэнне чалавека на адзін год           → Firestore, admin
CONTENT ASSEMBLY      адкуль бярэцца кожнае поле Hours / Readings       → Office resolver + templates
```

## 1. Implementation plan

### Што застаецца без змен

- `src/utils/ordo/`: `dates`, `season`, `movableFeasts` (computus, anchors, `toYearOptions`),
  `precedence`, `transfers`, `display`, `candidates`, `office` (descriptor), `readings`,
  `readingsPlan`, `notes` (selectors), `yearOverrides` (apply/validate), `index`
  (`resolveLiturgicalDate`, `generateLiturgicalYear`), `runtime`.
- Парадак: `Date → season → fixed + movable + Belarus + diocese → precedence →
  primary / alternatives / commemorations / suppressed → Office / Readings`.
- Advent 17–24.12 і date-based тэксты Божага Нараджэння (25.12 … 12.01): мяжа перыяду
  лічыцца да Хросту Пана, а ключ захоўвання тэкстаў — дата (`liturgicalDayResolution.js`).
- Evidence чатырох календароў і валідацыя (`npm run ordo:validate`).

### Files to remove

- `src/utils/ordoLocalChurch.js`, блок «Мой касцёл» у `Settings.vue`, local layer ў
  `ordo/layers.js`, `localChurch` у cache keys / stores / `runtime` / `ordoScreen`,
  група заўваг «Тытулы парафій і мясцовыя ўрачыстасці», парафіяльныя заўвагі ў
  `src/data/ordo/notes.json` (застаюцца толькі ў evidence).
- Чытанне Firestore `yearOptions` у `stores/calendar.js` і `stores/liturgical.js`.
- `src/data/ordo/year-overrides.js` і `src/data/ordo/layers.js` як runtime-крыніцы
  (становяцца seed-матэрыялам для `calendar-definitions.json`).

### Files to refactor

| Файл | Што мяняецца |
|---|---|
| `src/stores/calendar.js`, `src/utils/liturgicalMovableDates.js` | YearOptions = computed DTO; `getAvailableYears()` без Firestore |
| `src/utils/ordo/layers.js`, `yearPlan.js` | слаі будуюцца з calendar definitions (Firestore/cache/snapshot), date DSL |
| `src/utils/ordo/office.js` | memorial default = current day; `allowedChoices` з templates |
| `src/utils/ordoDayOptions.js`, `src/services/liturgical*Service.js` | sparse feast doc + templates → effective Office; `contentStatus` |
| `src/views/Ordo.vue`, `src/utils/ordoScreen.js` | месяц, multi-diocese filter, union/split |
| `src/components/ItemsList.vue` | кнопка ў Ordo, пераключальнік «З дня ↔ З агульнага» |
| `src/components/common/CustomDatePicker.vue` | літургічныя колеры, legal options пад сеткай |
| `patchs/generate-db-feasts.mjs` | новы sparse generator, templates, scaffolds, reports |
| `src/router/index.js`, `src/views/admin/` | `/admin/ordo/year-overrides` |

### New collections

| Калекцыя | Змест | Доступ |
|---|---|---|
| `liturgicalCelebrations/{celebrationId}` | пастаянныя universal / belarus празднаванні | public read, admin write |
| `liturgicalDioceseOverrides/{dioceseId--celebrationId}` | толькі адрозненні дыяцэзіі: `add` / `modify` / `suppress` | public read, admin write |
| `liturgicalOrdoNotes/{id}` | заўвагі Ordo з selector-амі; scope `universal` / `belarus` / `diocese` | public read, admin write |
| `liturgicalYearOverrides/{id}` | ручныя выключэнні на год | public read, admin write |
| `liturgicalCalendarMeta/current` | `{ schemaVersion, revision, publishedAt }` для cache invalidation | public read, admin write |
| `liturgicalTemplates/{templateId}` | Common texts + `sunday-week-1` | public read, admin write |

Firestore rules у рэпазіторыі няма (кіруюцца ў кансолі): для шасці калекцый трэба дадаць
`allow read: if true; allow write: if isAdmin();` — так, як ужо зроблена для `compendium`.

### Migration sequence

1. Release web з гэтым кодам. Ён працуе і без новых калекцый: bundled snapshot
   `src/data/ordo/calendar-definitions.json` + legacy `days` дакументы.
2. Firestore rules для новых калекцый.
3. `npm run ordo:import-calendar` — dry-run (план + diff + backup), потым `-- --apply`:
   celebrations, diocese overrides, notes, seed year overrides, meta.
4. `npm run generate:fixed-feasts` → `patchs/db-feasts` (sparse), `patchs/db-templates`, reports.
5. `npm run ordo:import-feasts` — dry-run; `-- --apply` стварае templates і sparse feast docs.
   Па змаўчанні нічога не выдаляецца: старыя `--pastors` / `--doctors-of-church` копіі
   пазначаюцца ў плане як `obsolete` і выдаляюцца толькі з `--prune --confirm`.
6. Праверка: `npm run ordo:validate`, readings audit, ручны прагляд 3–5 дзён.

### Risks

- **Старыя кліенты.** Sparse `days` дакумент старая версія PWA/Flutter пакажа з пустымі
  палямі. Таму sparse docs імпартуюцца толькі пасля выхаду новых версій; новы web умее
  чытаць абодва фарматы (`_schema: 2` — sparse).
- **Flutter** чытае тыя ж `days`: пакуль Flutter не ўмее збіраць Office з templates,
  шаг 5 (apply) рабіць нельга. Шагі 1–4 бяспечныя.
- **Firestore rules**: без read-правіла новыя калекцыі проста не прачытаюцца, runtime
  застанецца на bundled snapshot (не памылка, але admin-старонка не захавае override).
- **Два календары.** `src/constants/fixedCalendar.js` застаецца seed-крыніцай для
  snapshot; `npm run ordo:check` правярае, што snapshot адпавядае seed. Пасля імпарту
  крыніца праўды — Firestore, snapshot абнаўляецца `npm run ordo:export-calendar`.
- **Memorial default.** Раней успамін збіраўся «з агульнага», цяпер «з дня» — бачная
  змена тэкстаў; пераключальнік вяртае ранейшы выгляд.

## 2. YearOptions

`YearOptions` — вылічаны DTO (`toYearOptions(year)`), а не дакумент. Runtime не чытае
Firestore `yearOptions`; любы год 1970–2199 генеруецца offline.
`compareStoredYearOptions(year, stored)` пакінуты толькі для аўдыту legacy-дакументаў:
вяртае вылічаныя значэнні і спіс разыходжанняў, але ніколі не падмяняе разлік.

## 3. Calendar definitions

Алгарытмы (computus, precedence, season, transfers) — толькі код і тэсты. У базе —
дэкларатыўныя вызначэнні.

```ts
// liturgicalCelebrations/{id}
{
  id, title,
  dateRule:
    | { type: 'fixed', month, day }
    | { type: 'movable', anchor: 'easterSunday' | 'pentecost' | 'firstAdventSunday' | …, offsetDays }
    | { type: 'named', rule: 'ascension' | 'corpusChristi' | 'holyFamily' | 'baptismOfLord' }
    | { type: 'last-weekday-of-month', month, isoWeekday },
  rank, color, colorAlternatives?, category,
  scope: 'universal' | 'belarus',
  precedence?, properKind?, temporal?, feastCode?, rules?,
  templates: string[], defaultTemplate?,
  daysRef?, fallbackDaysRefs?, readingsRef?,
  contentStatus?: { hours, readings },
  enabled: true,
}

// liturgicalDioceseOverrides/{dioceseId--celebrationId}
{ dioceseId, celebrationId, action: 'add' | 'modify' | 'suppress', …толькі змененыя палі }
```

`dateRule` — абмежаваны DSL: anchor і rule правяраюцца па белым спісе
(`src/utils/ordo/definitions.js`), невядомае правіла адхіляецца, JS з базы не выконваецца.

Runtime: `Firestore → publicContentCache → setCalendarDefinitions() → engine`.
Без сеткі і без кэша — bundled snapshot. Snapshot і Firestore маюць `revision`;
ужываецца большы.

## 4. Year Overrides

Аўтаматычныя пераносы і калізіі лічыць engine і яны НЕ захоўваюцца. Ручны override —
`liturgicalYearOverrides/{id}`:

```ts
{ year, scope: 'belarus' | 'diocese', dioceseId?, targetCelebrationId, action:
  'move' | 'suppress' | 'add' | 'replace' | 'changeRank' | 'changeColor',
  from?, to?, rank?, color?, celebration?, reason, source?, enabled, createdAt, updatedAt }
```

Admin: `/admin/ordo/year-overrides` — год, аўтаматычныя пераносы, спіс overrides,
форма, preview «было па разліку → стане», блок «Патрабуе праверкі» для незакрытых
калізій (`src/data/ordo/ambiguities.js`, тэкст — `docs/ordo-engine-ambiguities.md`).

## 5. Hours content

```text
patchs/feasts + patchs/feasts/common-texts + calendar definitions
  → patchs/generate-db-feasts.mjs
  → patchs/db-feasts (sparse, адзін дакумент на празднаванне)
  + patchs/db-templates (liturgicalTemplates, у т.л. sunday-week-1)
  + reports/db-feasts-generation-report.{json,md}
  → Firestore import (dry-run па змаўчанні)
```

Sparse feast doc (`_schema: 2`): identity, `_templates`, `_defaultTemplate`, толькі
ўласныя палі і `_fieldRules` для структураваных указанняў:

```ts
_fieldRules: {
  vesperHymn: { ref: 'laudesHymn' },            // «Гімн з Ютрані»
  laudesPs1:  { source: 'sunday-week-1' },      // «з нядзелі І тыдня»
  sext1Ps1:   { source: 'current-day' },
  vesperPs1:  { source: 'template', template: 'blessed-virgin-mary' },
  vesper1Pr:  { omit: true },                   // поле спецыяльна пустое
}
```

Адсутнае поле = дазволены fallback па Office descriptor; радок `from-day` больш не
пішацца. Зборка (`src/utils/ordo/officeAssembly.js`):

- solemnity / feast: `Proper → выбраны Common → крыніца з рубрыкі` (current day,
  complementary, Sunday Week I);
- memorial: уласнае застаецца, астатняе з бягучага дня; для кампанентаў з
  `allowedChoices` — пераключальнік «З дня ↔ З агульнага» (або спіс templates).

## 6. Missing content

Кожнае празднаванне календара мае identity і `contentStatus`:
`hours: proper | common-only | day-fallback | missing`,
`readings: full | reference-only | missing`. Адсутнасць дакумента `days` не хавае
празднаванне ні ў Ordo, ні ў спісе варыянтаў дня.
