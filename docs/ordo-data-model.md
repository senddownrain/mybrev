# Ordo: модель данных

Принцип: **постоянные правила + контекст года + епархия (+ local church) + редкие YearOverride
= Ordo на дату**. Ordo не хранит тексты часов и чтений — только идентичности, по которым
`days` / `readings` / `templates` отдают контент.

## 1. Постоянные правила (уже в MyBrev + что формализуем)

| Тип | Ключ | Источник правды |
| --- | --- | --- |
| Период | `advent/christmas/ordinary/lent/holyweek/easter` + week + dayOfWeek (1=Нд) | `computeLiturgicalContext` |
| Фаза периода | `advent:before-dec17 / dec17-24`, `christmas:octave / after-octave`, `lent:ash-wednesday-week`, `holyweek:holy-week / holy-thursday / triduum`, `easter:octave / after-octave / after-ascension`, `ordinary:before-lent / after-pentecost` | `scripts/ordo/lib/calendar.mjs` (перенести в runtime на этапе 3) |
| Сезонная дата | `advent-DD-12`, `christmas-DD-MM` | `getSeasonalDateExceptionId` (хранение по датам сохраняется) |
| Fixed | `celebrationId` (slug из `patchs/db-feasts._id`) + `MM-DD` + `rank` + `place` | `fixedCalendar.js` + `days` |
| Movable | `celebrationId` = код `FEAST_NAME_MAP` без `feast-` (+ `divinemercy`) | правило в `liturgicalMovableDates.js` |

`buildYearOptions(year)` даёт тот же объект, что Firestore `yearOptions`, из постоянных правил.

## 2. Слои (scope)

```text
universal  → общий римский календарь (fixedCalendar без _place)
belarus    → общее для всех епархий Беларуси (напр. Будслаўская, Вастрабрамская)
diocese    → только add / modify / rules / notes своей епархии (fixed-варианты с _place)
local      → LocalChurchContext { titleCelebrationId?, dedicationDate?, patronCelebrationId? }
year       → YearOverride (global, затем diocesan)
```

Епархия не копирует universal: `modify` меняет ранг/дату идентичности, `add` добавляет
собственную идентичность (дедикацыя катэдры, патроны).

## 3. OrdoEntry (`src/data/ordo/notes.json`)

```ts
type OrdoEntry = {
  id: string;                                   // ordo-note-0001
  scope: { level: 'universal'|'belarus'|'diocese'|'local'; dioceseId?: string; dioceseIds?: string[] };
  selector: Selector;
  category: 'liturgical-rule'|'mass'|'office'|'devotion'|'blessing'|'procession'|'indulgence'
          | 'special-prayer-day'|'pastoral-note'|'announcement'|'local-church'|'other';
  tags: string[];                               // novena, first-friday, penance, suppressed, …
  text: string; variants?: { diocese: string; text: string }[];
  effect?: StructuredLiturgicalEffect;          // см. ниже; null → displayOnly
  displayOnly: boolean;
  basis: string;                                // как выбран селектор (novena, period-weekday, …)
  yearMarkers?: string[];                       // year:2025, jubilee, clock-time, transfer-instance…
  classification: Classification;
  confidence: 'confirmed-across-sources'|'repeated-in-source'|'single-occurrence'|'year-instance';
  occurrences: number;
  observed: { diocese; dates[]; itemIds[]; evidence: SourceEvidence }[];
};

type Selector =
  | { type: 'fixed-date'; month: number; day: number }
  | { type: 'celebration'; celebrationId: string }
  | { type: 'period'; period: Period; dayOfWeek?: 1..7 }            // dayOfWeek: «каждую нядзелю Посту»
  | { type: 'period-phase'; period: Period; phase: string }
  | { type: 'period-day'; period: Period; week: number; dayOfWeek: 1..7 }
  | { type: 'relative'; celebrationId: string; offsetDays: number; throughOffsetDays?: number }
  | { type: 'nth-weekday-of-month'; isoWeekday: 1..7; nth: number }  // ISO: 4 = чацвер
  | { type: 'day-of-month'; day: number; months?: number[] }
  | { type: 'exact-date'; date: 'YYYY-MM-DD' };                      // только YEAR_INSTANCE_ONLY

type StructuredLiturgicalEffect =
  | { type: 'holy-day-of-obligation'; value: boolean }
  | { type: 'penance-day' } | { type: 'abstinence-dispensation' }
  | { type: 'suppressed-celebration'; celebrationTitle?: string; explainedBy: 'precedence' }
  | { type: 'transfer' } | { type: 'local-titular' };
// этап 3 добавит: rankOverride, firstVespers, commemoratioOnly, weekdayNotAnOption, …
```

Порядок выбора селектора для заметки дня (`daySelector`): первый чацвер/пятніца/субота →
`nth-weekday-of-month`; «N дзень навэнны да X» → `relative` к X; маркеры года → `exact-date`;
обычаи движимых праздников (зёлкі — чацвер пасля Божага Цела, стравы — Вялікая Субота) →
`relative`; день движимого праздника → `celebration`; Вялікі тыдзень/Велікодная актава/дні
пасля Папяльца → `relative` к Вялікадню; fixed-праздник дня → `celebration`; 17–24.12 /
актава → `fixed-date`; иначе `period-day`. Затем повторы в одном источнике сворачиваются:
одинаковый день месяца → `day-of-month`; n-й день недели в разных месяцах →
`nth-weekday-of-month`; одинаковый день недели в периоде → `period`+`dayOfWeek`; одна фаза →
`period-phase`; дни новенны → один `relative` с диапазоном. Потом слияние епархий
(тот же селектор + категория + похожий текст) → `scope.level = 'belarus'`.

## 4. YearOverride

```ts
type YearOverride = {
  year: number;
  scope: 'universal'|'belarus'|'diocese'; dioceseId?: string;
  targetCelebrationId?: string;
  action: 'move'|'suppress'|'add'|'replace'|'changeRank'|'changeRule';
  from?: string; to?: string;                   // MM-DD или YYYY-MM-DD
  rank?: Rank; rule?: object;
  reason?: string; source?: SourceEvidence;
};
```

Порядок: universal permanent → belarus proper → diocesan proper → local church → global
override → diocesan override. **Если перенос вычислим правилом — не override.** В извлечённых
данных все переносы (Звеставанне 2027 → 05.04, подавления на нядзелі) объяснимы таблицей
первенства и помечены `YEAR_SPECIFIC` / `YEAR_INSTANCE_ONLY`, а не как override.

## 5. SourceEvidence и классификация

```ts
type SourceEvidence = { file: string; page?: number; paragraph?: number; bbox?: [x0, top, x1, bottom];
                        rawText: string; continuedBy?: object[]; redacted?: string[] };
```

| Класс | Когда |
| --- | --- |
| `CONFIRMED_PERMANENT_RULE` | общие нормы источника (таблица першынства, парадак ЛГ, дні пакаяння, таблицы Імшаў); праздник совпал с идентичностью MyBrev и её рангом; правило найдено в ≥2 епархиях |
| `LIKELY_PERMANENT_RULE` | обобщено на не-точный селектор, без маркеров года, но видено в одном источнике (в т.ч. «звычаі», period-указания) |
| `DIOCESAN_PROPER` | собственный календарь епархии, fixed-вариант с `_place`, патрон, дедикацыя |
| `YEAR_INSTANCE_ONLY` | дескрипторы Імшы/Афіцыя конкретного дня (оракул), подавления/переносы этого года, тексты с маркерами года, объявления |
| `DISPLAY_NOTE` | набажэнствы, благаслаўленні, працэсіі, адпусты, дні малітвы, навэнны, тытулы парафій |
| `NEEDS_REVIEW` | идентичность не найдена, ранг расходится с MyBrev без объяснения, повторяющийся шаблон не подтвердился |

Одно наблюдение **никогда** не становится `CONFIRMED` (проверяется тестом).

## 6. Файлы

- `src/data/ordo/evidence/<diocese>.json` — `source`, `stats`, `days[]` (liturgical alignment,
  celebrations + identity, readings, mass[], office{lines, flags}, notes[]), `rules[]`,
  `announcements[]`, `excluded[]` (только местоположение).
- `src/data/ordo/notes.json` — OrdoEntry.
- `src/data/ordo/diocesan-differences.json` — выравнивание по идентичности + `missingInMyBrev`.
- `src/data/ordo/unresolved.json` — фрагменты парсера, неразмеченные празднования, review.
