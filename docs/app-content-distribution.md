# Контент приложения: бандл, патчи и манифест версий

Flutter-приложение (ibreviarybyapp) поставляется с полным каноническим
контентом и обновляет его небольшими патчами по манифесту версий. Архитектура
и замеры — `ibreviarybyapp/docs/data-loading-architecture.md`.

Коллекции: `days`, `readings`, `liturgicalTemplates`, `invitatoriums`,
`completoriums`, `prayers`, `prayerCategories`, `songs`, `compendium`,
`compendiumMeta` (Кампендый: разделы и `current` с meta и parts),
`novenaDefinitions` (трэкер навэнн, см. ниже), а также
календарь Ordo и канонические Proper: `liturgicalCalendarMeta`,
`liturgicalCelebrations`, `liturgicalDioceseOverrides`,
`liturgicalYearOverrides`, `liturgicalProperTexts`, `liturgicalOrdoNotes`
(`scripts/content/lib/app-content.mjs` → `APP_CONTENT_COLLECTIONS`;
во Flutter — `kContentCollections`, списки должны совпадать).
`yearOptions` в приложение не входит: годовые якоря вычисляются на устройстве.

## Новые коллекции: порядок выпуска (обязателен)

Старое приложение берёт из манифеста только коллекции своего списка и
неизвестные пропускает; новое приложение получает новые коллекции из своего
бандла. Поэтому новая коллекция попадает в манифест **только после** релиза,
который её содержит:

```text
1. snapshot (db:backup … liturgical*)            — локально
2. content:app-release → assets/content           — бандл с новыми коллекциями;
   сверка с манифестом: «NEW IN THIS RELEASE» — предупреждение, не ошибка
3. релиз Flutter (App Store / Google Play)        — новые коллекции едут в бандле
4. после выхода релиза:
   npm run content:manifest                       — вердикт NEW COLLECTIONS
   npm run content:manifest -- --apply --introduce-collections
5. дальше — обычные патчи (SAFE CONTENT PATCH)
```

Без `--introduce-collections` коллекции, которых нет в опубликованном
манифесте, остаются вне его («held back»): обычный патч остальных коллекций
публикуется как всегда, а вердикт NEW COLLECTIONS не появляется
(`--allow-large-patch` его не заменяет). Новые коллекции не считаются загрузкой
патча: у новых приложений digest совпадает с бандлом, старые их не читают.
Связанные литургические коллекции (определения, Proper, notes) одной
публикации приложение активирует одним поколением (`ContentStore.commit`).

## Два канала доставки

```text
SMALL CONTENT CHANGE                    → manifest patch (npm run content:manifest)
CANONICAL REBUILD / SCHEMA CHANGE       → new bundle + new app version
```

Манифест — это опубликованное состояние. Правка в Firestore (импорт, админка)
не доходит до приложений, пока манифест не опубликован явно, после проверки и
отчёта о различиях. Публикация не запускается автоматически.

## Обычная правка контента

```bash
# 1. изменить / импортировать контент в Firestore
npm run content:manifest              # 2–4: валидация, diff, отчёт, вердикт (dry-run)
npm run content:manifest -- --apply   # 5: публикация, только SAFE CONTENT PATCH
```

Отчёт (и `reports/content/manifest-diff.json`):

```text
CONTENT UPDATE DIFF

prayers:
  added:   100
  changed: 2 / 117
  bytes:   311 KB

TOTAL:
  102 documents
  311 KB

RESULT:
SAFE CONTENT PATCH
```

| Вердикт | `--apply` |
|---|---|
| SAFE CONTENT PATCH | публикует |
| MASS CONTENT REBUILD | **отказ** (exit 2); `--allow-large-patch` публикует с крупным предупреждением, отказ/override пишутся в отчёт миграций |
| NEW COLLECTIONS | **отказ**; `--introduce-collections` — только после релиза приложения, в бандле которого они есть |
| SCHEMA CHANGE | **отказ**; `--allow-large-patch` не помогает; `--schema-release` — только вместе с релизом приложения, которое читает новую схему |
| невалидные документы | **отказ всегда** |
| INITIAL MANIFEST | публикует (первая публикация) |

### Пороги (`PATCH_LIMITS`)

Корпус: days 735 (~70 КБ), readings 815 (~5 КБ), prayers 117 (~17 КБ),
songs 447 (~1 КБ). Обычный патч — до 1–2 МБ; пересборка одних `days` ~50 МБ.

| Критерий | Порог → MASS CONTENT REBUILD |
|---|---|
| загрузка (добавленные + изменённые, хранимые байты) | > 5 МБ |
| документов в патче | > 300 |
| изменённые + удалённые в одной коллекции | > 25 % коллекции **и** > 20 |

Добавления сами по себе — нормальный рост (+100 молитв = SAFE), их ограничивают
только объём и общее число. Приложение повторяет защиту мягче (> 12 МБ или
больше половины коллекции): такой diff оно не ставит как патч, а ждёт релиза.

### Валидация (`DOCUMENT_RULES`)

| Коллекция | Требуется |
|---|---|
| days | селектор (`_periodType`, `_feast`, `_date`, `_schema`) или `office-for-dead` |
| readings | хотя бы одно чтение (`reading1`, `psalm`, `reading2`, `gospel`) или `massReadings`; `massReadings` проходит `validateMassReadings` (наборы Імшы, `docs/readings-mass-sets.md`) |
| liturgicalTemplates | `_kind`, `title` |
| invitatoriums / completoriums | псалом (и период для камплеты) |
| prayers | название и текст (или их версии) |
| prayerCategories | `name` |
| novenaDefinitions | поля и блоки по контракту (`validateShape`); в экспорт попадают только published + trackerEnabled, собирающиеся из публичных молитв |
| songs | `title`, `text` |
| compendium | `title`, `questions` |
| compendiumMeta | `unitIds`, `parts`, целый `contentVersion` |
| liturgicalCalendarMeta | целые `schemaVersion`, `revision` |
| liturgicalCelebrations | `validateCelebrationDefinition` (Ordo engine) |
| liturgicalDioceseOverrides | `validateDioceseOverride` |
| liturgicalYearOverrides | `validateYearOverride` |
| liturgicalProperTexts | `_schema: 2`, `_celebrationId`, `_date` |
| liturgicalOrdoNotes | `selector.type`, `scope.level`, `text` или `title` |

## Релиз приложения

```bash
npm run db:backup -- --output backups/firestore-snapshot --collection days --collection readings \
  --collection liturgicalTemplates --collection invitatoriums --collection completoriums \
  --collection liturgicalCalendarMeta --collection liturgicalCelebrations --collection liturgicalDioceseOverrides \
  --collection liturgicalYearOverrides --collection liturgicalProperTexts --collection liturgicalOrdoNotes
npm run db:backup -- --output backups/firestore-snapshot-static --collection prayers \
  --collection prayerCategories --collection songs --collection compendium --collection compendiumMeta \
  --collection novenaDefinitions
npm run content:app-release -- --snapshot backups/firestore-snapshot \
  --snapshot backups/firestore-snapshot-static --out ../ibreviarybyapp/assets/content
```

Каждая коллекция bundle несёт свою версию — время snapshot, из которого она
взята (`manifest.json` → `collections.<name>.contentVersion` и поле в файле
коллекции); верхний `contentVersion` — самая новая из них. Приложение сверяет
свои обновления с версией именно этой коллекции.

В приложении «нужна новая версия» (`appReleaseRequired`) — это и пересборка
(MASS CONTENT REBUILD, опубликованная через override), и новая схема; статус
сохраняется и снимается первой совместимой проверкой.

`content:app-release` валидирует, собирает `assets/content`, затем сверяет
бандл с `contentManifest/current` (одно чтение). Если отличается (устаревший
snapshot или неопубликованная правка) — exit 3: не выпускать такой бандл.
Новый бандл в приложении сам поглощает патчи, которые он уже содержит.

Изменение схемы: поднять `CONTENT_SCHEMA_VERSION` (Node) и
`kContentSchemaVersion` (Dart) вместе, собрать бандл, выпустить приложение,
затем `content:manifest -- --apply --schema-release`. Старые приложения
манифест новой схемы игнорируют.

## Хеш документа

sha256 (16 hex) канонического JSON (ключи отсортированы) хранимой формы
документа (Timestamp → мс), без `updatedAt`, `importedAt`, `parsedAt`,
`miniSavedAt`. Тот же алгоритм в Dart (`documentHash`), сверено на всех
документах. Не менять одну сторону без другой.

## Паритет Ordo web ↔ Flutter

`npm run ordo:flutter-fixture -- --snapshot backups/firestore-snapshot --out
../ibreviarybyapp/test/fixtures/ordo_parity.json.gz` — read-only: web-движок
и web-сборка Гадзін на локальном snapshot (те же документы, что в бандле
приложения), 2025–2032 × 4 дыяцэзіі. Flutter-тест `test/ordo_parity_test.dart`
сверяет с ним Dart-порт (точное совпадение). Fixture — тестовый артефакт, не
контент приложения.

## Трэкер навэнн (`novenaDefinitions`, `novenaDrafts`)

Дополнительный слой над обычными молитвами: тексты не копируются и не
меняются. `src/utils/novena/` — общий генератор, сборка дня (Flutter повторяет
`resolveDay`) и фильтр экспорта. Черновики видит только администратор;
опубликованный документ содержит ровно поля контракта. Админка: «Навэнны».
Снапшот без `novenaDefinitions` даёт пустую коллекцию.

```bash
npm run novena:import -- --prayers ../ibreviarybyapp/assets/content   # dry-run, без Firestore
npm run novena:bundle -- --prayers ../ibreviarybyapp/assets/content --out <dir> [--dev]
npm run test:novena && npm run test:novena:rules && npm run test:novena:ui   # эмуляторы: JDK 21
```

Выпуск (каждый шаг — отдельное разрешение владельца):

1. Firestore Rules (`deploy-firebase-hosting`, target `firestore-rules`), затем Web (target `hosting`).
2. Черновики: `novena:import … --apply --service-account <file> --project <id>`. Читает только
   целевые документы `novenaDrafts`, пишет create/update, прежние версии — в `reports/novena/`.
   Правленные вручную черновики не трогаются.
3. Проверка и публикация навэнн в админке.
4. Релиз Flutter, в бандле которого есть `novenaDefinitions`.
5. `content:manifest -- --apply --introduce-collections`.

Откат: «Зняць з публікацыі» (или выключить трэкер и опубликовать), затем
`content:manifest -- --apply`; приложение удалит определение. Начатые сеансы
хранят свой снимок текста. Черновики восстанавливаются из
`reports/novena/rollback-*.json`. Правила — повторный выпуск предыдущей ревизии.
