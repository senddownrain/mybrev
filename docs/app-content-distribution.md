# Контент приложения: бандл, патчи и манифест версий

Flutter-приложение (ibreviarybyapp) поставляется с полным каноническим
контентом и обновляет его небольшими патчами по манифесту версий. Архитектура
и замеры — `ibreviarybyapp/docs/data-loading-architecture.md`.

Коллекции: `days`, `readings`, `liturgicalTemplates`, `invitatoriums`,
`completoriums`, `prayers`, `prayerCategories`, `songs`, `compendium`,
`compendiumMeta` (Кампендый: разделы и `current` с meta и parts)
(`scripts/content/lib/app-content.mjs` → `APP_CONTENT_COLLECTIONS`).

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
| readings | хотя бы одно чтение (`reading1`, `psalm`, `reading2`, `gospel`) |
| liturgicalTemplates | `_kind`, `title` |
| invitatoriums / completoriums | псалом (и период для камплеты) |
| prayers | название и текст (или их версии) |
| prayerCategories | `name` |
| songs | `title`, `text` |
| compendium | `title`, `questions` |
| compendiumMeta | `unitIds`, `parts`, целый `contentVersion` |

## Релиз приложения

```bash
npm run db:backup -- --output backups/firestore-snapshot --collection days --collection readings \
  --collection liturgicalTemplates --collection invitatoriums --collection completoriums
npm run db:backup -- --output backups/firestore-snapshot-static --collection prayers \
  --collection prayerCategories --collection songs --collection compendium --collection compendiumMeta
npm run content:app-release -- --snapshot backups/firestore-snapshot \
  --snapshot backups/firestore-snapshot-static --out ../ibreviarybyapp/assets/content
```

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
