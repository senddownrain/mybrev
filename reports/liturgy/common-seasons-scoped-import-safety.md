# Scoped-импорт сезонных Commons: чтения, запись и отказ при live-only полях

Ветка `feature/common-seasons-finish` (PR #132). База правок — `882bd24`; коммит этой правки идёт следом. Дата 2026-10-17.
**Production Firestore не читался, `--apply` не выполнялся, версия контента и manifest не менялись.** Все проверки — на mock Firestore (в тестах) и офлайн.

## 1. Что исправлено

`scripts/ordo/import-feasts.mjs`, только режим `--only templates --ids …`:

| Операция чтения | Было (с `--ids`) | Стало (с `--ids`) | Без `--ids` |
|---|---|---|---|
| `liturgicalTemplates` | скан всей коллекции `.get()` (в репозитории 16 шаблонов, live может быть больше), затем фильтр | **один `getAll` по 13 документам allowlist** | без изменений: скан коллекции |
| `liturgicalProperTexts` | `getAll` по 291 целевому документу (`targets.feasts`), хотя `--only templates` | **0** | без изменений |
| `days` | 0 (читаются только при `--target days`) | 0 | без изменений |
| `liturgicalCalendarMeta/current` | 1 | **1** (нужен для `templatesRevision`) | 1 |
| **Запрошено документов** | 16 + 291 + 1 = **308** (при 16 живых шаблонах) | **14** (13 + 1) | как раньше |

«Запрошено» — число документов, которые скрипт запрашивает (поле `scope.documentsRequested` в отчёте; тест это проверяет по логу mock). **Сколько Firestore спишет (billed reads), без консоли Firebase неизвестно:** несуществующий документ в `getAll` тоже может считаться чтением, поэтому верхняя оценка стоимости scoped dry-run — 14 чтений. Реального счётчика Firestore у меня нет (mock считает запросы, не биллинг).

## 2. Контракт безопасности записи (`batch.set` не заменён на merge)

- В отчёте dry-run `scope.liveDiff` для каждого из 13 id: `status` (`create` / `update` / `unchanged`), `created` (пути, которых нет в live), `changed`, **`liveOnly`** (поля, которые есть в live, но отсутствуют в генерируемом документе, включая вложенные, пути через точку; `importedAt` игнорируется).
- Полная запись `set` удалила бы `liveOnly`-поля. Поэтому `--apply` в scoped-режиме **отказывается до первой записи** (`assertScopedApplySafe`), если у любого документа `liveOnly` не пуст. Флага обхода нет. Отчёт перечисляет `scope.applyBlockedBy`.
- Перед записью проверяется, что набор записей ⊆ allowlist и не содержит `office-for-dead`, `sunday-week-1`, `complementary-psalmody`.
- Запись: 13 документов + `liturgicalCalendarMeta/current` (merge ревизии `templatesRevision` +1) — **один batch** (≤ 14 операций), частичной записи быть не может; при ошибке чтения (в т. ч. quota) запись не начинается.
- Резервная копия до записи: `backups/ordo-feasts/<время>.json` с `projectId`, временем, `scope` (13 id), **полными живыми документами** allowlist и meta. Откат — вернуть эти документы из файла.
- Сравнение «live» помечается `VERIFIED LIVE` только после реального чтения: оно появится в отчёте с `projectId` и временем только при запуске с сервисным ключом; без ключа — офлайн, `projectId: null`.

## 3. Три разных сравнения (не смешивать)

| Сравнение | Источник | Статус |
|---|---|---|
| с `main` | git, `common-seasons-import-allowlist.json` → `changedVsMain` | 13 шаблонов — PASS |
| со старым локальным snapshot | `backups/firestore-snapshot`, `changedVsSnapshot` | 13 + `office-for-dead` (снимок старый) — только факт о файлах |
| с live production | `scope.liveDiff` при read-only запуске | **NOT VERIFIED LIVE** |

## 4. 13 разрешённых id

apostles, blessed-virgin-mary, church-dedication, doctors-of-church, educators, holy-men, holy-women, martyr-one, martyrs-many, pastors, religious, virgins, works-of-mercy. Защищены (никогда не читаются и не пишутся в scoped-режиме): office-for-dead, sunday-week-1, complementary-psalmody. Источник истины: I том — Адвент/Рождество, II — Пост/Пасха, III — обычное время; IV не используется.

## 5. Тесты

`tests/common-seasons-import-scope.test.mjs`: 12 тестов, mock Firestore без сети (`deps.connect`, `deps.recordRoot` во временную папку, журнал миграций не затрагивается):
`--ids` без `--only templates` отвергается; пустой/неизвестный/защищённый id — до любых чтений; dry-run читает ровно 13 шаблонов + meta, **0** сканов коллекций, 0 ProperTexts/days, 0 записей; backup содержит полные живые документы; идентичный live = 13 unchanged; live без `_seasonalVariants` = 13 update с `created`; отсутствующий документ = create; **вложенное live-only поле запрещает `--apply` до первой записи**, `importedAt` игнорируется; чистый apply пишет только allowlist + meta одним batch; отказ чтения (quota) = ни одной записи; без `--ids` прежний путь (скан коллекции) сохранён.
Результаты (локально): `npm run test:common-seasons` 111/111; `npm test` 913 тестов, 905 PASS, 8 skipped, 0 FAIL; eslint чисто; `npm run build` PASS; офлайн `--only templates --ids <13> --offline`: «Dry run only». Firebase emulator для интеграционных тестов не использовался: **NOT TESTED** на эмуляторе; mock повторяет только используемые методы SDK (`getAll`, `doc().get()`, `collection().get()`, `batch`).

## 6. Вердикты

| | |
|---|---|
| CODE READY | **YES** (локально; CI на GitHub для текущего HEAD — см. PR) |
| SCOPED DRY-RUN READY | **YES** (mock + офлайн); live dry-run ещё не выполнялся |
| LIVE FIRESTORE VERIFIED | **NO** (NOT VERIFIED LIVE) |
| SAFE TO REQUEST PUBLICATION APPROVAL | **NOT YET**: нужен read-only dry-run на live (≤ 14 чтений) без `liveOnly` |
| DEPLOYED | **NO** |

## 7. Команды (не выполнялись)

Будущий read-only live dry-run (нужен сервисный ключ `patchs/serviceAccountKey.json` проекта владельца и отдельное разрешение; предел чтений — 14):
```
npm run ordo:import-feasts -- --only templates --ids apostles,blessed-virgin-mary,church-dedication,doctors-of-church,educators,holy-men,holy-women,martyr-one,martyrs-many,pastors,religious,virgins,works-of-mercy
```
Он читает 13 + 1 документов, пишет резервную копию и `reports/ordo-feasts-import-plan.json` (смотреть `scope.liveDiff`, `scope.applyBlockedBy`) и **ничего не записывает**.
Пример предполагаемого импорта — НЕ ВЫПОЛНЯТЬ без отдельного разрешения: та же команда с `--apply`; при непустом `liveOnly` скрипт откажется.
Блокирующие условия: `applyBlockedBy` не пуст; различия в schema `_schema`; ошибка чтения; расхождение числа целей с allowlist.
Для прежних проверок: `npm run liturgy:common-seasons:scope`.
