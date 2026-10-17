# Handoff для Flutter: аналитика по контракту v2

Адресат: репозиторий `ibreviarybyapp` (промпт 03/04). Этот документ — инструкция; Flutter-репозиторий
в рамках веб-этапа не изменялся. Источник правды: `docs/analytics-contract.md` и
`src/utils/analytics/contract.js` в WEB-репозитории (ветка `feature/analytics-contract`);
эталонные векторы: `tests/fixtures/analytics-contract-v2.json` (v1 заменён; Flutter уже на v2).

**Сетевая передача запрещена до закрытия решений D-01…D-09 (`docs/analytics-privacy.md`).**
На iOS даже после этого нужно явное согласие (Apple 5.1.1(ii)). Первая реализация — только
локальный счёт и mock transport.

## 0. Контракт v2: что изменилось для Flutter (обязательно, до остального)

Источник: `docs/analytics-contract.md` §16. Flutter на `feature/analytics-local` (PR #15, влит) реализует
**v1**; чтобы совпасть с вебом, нужно:

1. `schemaVersion = 2`; фикстура `analytics-contract-v2.json` (замена v1; SHA-256 сверять с веб-копией);
   `public-inventory.json` из веба (750 ID) и перегенерация `lib/analytics/public_inventory.dart`.
2. `readings` → `content_id = reading:day` (маска `^reading:day$`); `/readings`, `/readings/reading/:id`
   → `AnalyticsTarget('readings', 'reading:day')`; `screen_view`/`text_read` для чтений.
3. Событие `catalog_open` + `catalogIds` (`hours_list, prayers_home, prayers_all, favorites, songs,
   bible_books, compendium_home`); ключи ячейки `e, catalog_id, n`; визит ≥ 1 с; каталог и материал не
   считаются дважды (маппер возвращает либо материал, либо каталог). Соответствие Flutter-маршрутов:
   `/hours/hora/:date/:dayId` (список часов дня) → `hours_list`; `/hours` остаётся `today`; `/prayers` → `prayers_home`;
   `/prayers/all` → `prayers_all`; `/prayers/favorites` → `favorites`; `/prayers/songs` → `songs`;
   `/prayers/compendium` → `compendium_home`; `/bible` без книги → `bible_books`.
4. Компендиум: единица чтения — часть `comp:p1…p4` (`/prayers/compendium/part/:partId`), главы —
   якоря; не только `node/:nodeId`.
5. `feature_use`: тот же белый список (27); `reportTextLength` для `er`.
6. Тесты идентичности JS/Dart по v2-фикстуре (`validPacket` с 9 ячейками, 17 `invalidCells`).

## 1. Состояние Flutter на момент аудита (read-only)

- Версия `1.0.0+6`, Android `by.mybrev.playtest2026`, iOS `by.mybrev.testflight2026` (beta).
- Нет `firebase_analytics`, `firebase_crashlytics`, `sentry_flutter`, рекламных SDK, ATT.
  `IS_ANALYTICS_ENABLED=false` и `IS_ADS_ENABLED=false` в `GoogleService-Info.plist`;
  в `google-services.json` нет `analytics_service`; в `AndroidManifest.xml` только `INTERNET`
  (нет `AD_ID`); `PrivacyInfo.xcprivacy` без собираемых данных.
- Есть: `firebase_core`, `cloud_firestore`, `hive`/`hive_flutter`, `package_info_plus`,
  `connectivity_plus`, `go_router`, `flutter_riverpod`, `scrollable_positioned_list`.
- **Не добавлять** ни один из пакетов Firebase Analytics/GA, Crashlytics для аналитики, рекламные
  пакеты. Это нарушит контракт (installation ID, ad ID) и данные Play/App Store.

## 2. Что реализовать (по порядку; шаг 1–4 без сети)

1. Dart-порт контракта: константы (`sections`, `featureIds`, `errorIds`, `hours`, бакеты) и
   `validateCell/validatePacket`, поведение идентично JS. Файл-кандидат `lib/analytics/contract.dart`.
2. Тест идентичности: загрузить JSON из `tests/fixtures/analytics-contract-v2.json` (скопировать в
   `test/fixtures/` с проверкой совпадения SHA-256 с веб-версией), прогнать:
   `visibleSecondsBuckets`, `scrollBuckets`, `readingEstimates` (допуск 1e-9), `validPacket` — валиден,
   каждый `invalidCells[*].cell` — отклонён. Расхождение с веб-реализацией = блокирующая ошибка.
3. Локальный сборщик (`lib/analytics/`): in-memory счётчики; сброс в Hive (отдельный box, ≤ 64 КиБ,
   ≤ 14 суток, лимиты `LIMITS`) только на `AppLifecycleState.paused/inactive`/`detached`; нет таймеров
   и записи на scroll.
4. Mock transport (§5) вместо реального; реальный отправитель — только после решения владельца.
5. Подключение к экранам — отдельным шагом после ревью, без `setState`/ребилдов от измерений.

## 3. Жизненный цикл и измерение

- Визит: см. контракт §7. `WidgetsBindingObserver.didChangeAppLifecycleState`: `resumed` — идёт
  `fv`; `inactive`/`paused`/`hidden` — пауза `fv`; в фоне ≥ 5 минут — визит закрыт, возврат —
  новый визит. Время считать монотонными часами (`Stopwatch`), не `DateTime.now()` (иначе
  `clock_anomaly`).
- Конец визита — уход с экрана (`dispose`/смена маршрута `go_router`) или фон ≥ 5 мин. Возврат
  «назад» на материал — новый визит; смена `?lang` Імшы и якорей секций — не новый визит; визит < 1 с
  отбрасывается (в приложении есть редиректы), 1–5 с — короткое открытие (без `er`/`sd`).
- Глубина прокрутки: `ScrollController`/`ScrollNotification` (для `ScrollablePositionedList` —
  `itemPositionsListener`). Хранить в обычной переменной максимум `(pixels + viewport) / maxScrollExtent`;
  без `notifyListeners` и без записи. Если `maxScrollExtent ≈ 0` (текст помещается) — `fit`.
  Бакеты: `<0.25 p0_25`, `<0.5 p25_50`, `<0.75 p50_75`, `<0.98 p75_99`, `≥0.98 p100`.
- `totalChars` для `er`: длина отображаемого текста материала (после очистки разметки), посчитанная один
  раз при построении экрана; текст никуда не сохраняется.
- Максимум на визит 1800 с; формула и константы `er` — как в контракте (допущение 120 слов/мин ·
  6 символов/слово, не калибровка).

## 4. Стабильные идентификаторы (должны совпасть с вебом)

| section | content_id | Источник во Flutter | Замечание |
|---|---|---|---|
| `hours` | `hour:<invitatorium\|morning\|lectionis\|laudes\|terz\|sext\|non\|vesper\|completorium>` | `lib/constants/hora_items.dart`, поле `type` | **во Flutter `vespers` → в контракте `vesper`** |
| `prayers` | `prayer:<Firestore id>` | `Prayer.id` | только для молитв из публичного инвентаря; личные молитвы (`/my`, `prayer/add`, `prayer/:id/edit`) и закрытые **не измеряются** |
| `mass` | `mass:order` | `MASS_ORDER_PRAYER_ID`/`mass_ritual.dart`; все языковые варианты → один ID | язык — `feature_use mass_language_change` |
| `songs` | `song:<songs doc id>` | `Song.id` (`holysongs-…`) | |
| `compendium` | `comp:<doc id главы>` | `compendium.dart` | вопросы схлопываются к главе |
| `bible` | `bible:<bel\|ru>:<bookId>` | `bible_chapter_screen.dart` (`/bible/:version/:book/:chapter`) | сопоставить `version`→`bel\|ru`; список `bookId` — из промпта 02 (`НЕ ПОДТВЕРЖДЕНО`) |
| без ID | `today, readings, ordo, picker, settings` | маршруты `/hours`, `/readings*`, `/hours/ordo`, `/picker*`, `/settings` | `content_id` запрещён |

Готовый инвентарь лежит в вебе: `src/utils/analytics/public-inventory.json` (750 ID в v2, собран из этого же бандла `1791877294111`; Flutter сверяет свою сборку с ним тестом на совпадение множеств). Формат `prayer:` включает slug-ID (`import-*`, `mybrev-*`, `catholicby-yearcycle-*`). Инвентарь публичных ID Flutter берёт из своего бандла (`assets/content`, отфильтрованного по
публичной политике). **Если приложение содержит закрытую молитву в старом бандле, она не должна
попасть в инвентарь аналитики** (в старых бандлах закрытый материал мог быть опубликован,
`docs/priest-access.md`). Неизвестный `content_id` не измеряется (fail closed).

Параметры пакета во Flutter: `platform` = `android` | `ios` (`defaultTargetPlatform`; веб-сборка
Flutter, если будет, — `web`), `app_version` = `major.minor` из `package_info_plus` (версия
`1.0.0` → `1.0`; build number не отправлять), `region` = `UNKNOWN`, пока не принято `D-04`.
`day` — UTC дата визита.

## 5. Mock transport (спецификация)

Интерфейс, одинаковый для веба и Flutter:

```text
Transport.send(packet: JSON) -> Future<Response{status:int}>
```

Реализации: `NoopTransport` (по умолчанию в сборках; возвращает `204` без I/O) и
`RecordingTransport` (тесты: сохраняет принятые пакеты в память, возвращает программируемые статусы
`204`/`400`/`410`/`429`/`503`/таймаут). Реальной сетевой реализации в коде нет.

Тесты поведения (должны быть идентичны вебу):

1. При `analytics_network_enabled=false` вызовов `send` — 0 при любых действиях; нет таймеров.
2. Включение шлюза в тесте: ≤ 1 вызов за 6 часов (виртуальные часы); пакет проходит `validatePacket`.
3. `400` — пакет удалён, не повторяется; `410` — отправка остановлена до нового конфига; `429/503/timeout` —
   экспоненциальная пауза; пакет удаляется через 14 суток.
4. Переполнение очереди (>7 суток или >64 КиБ) — самое старое отбрасывается, `queue_overflow` +1.
5. Выключение шлюза очищает очередь и останавливает таймеры.
6. Закрытый/личный материал: попытка зафиксировать визит с `content_id` вне инвентаря — ячейка не создана.
7. Чтение работает при `Transport`, бросающем исключение или зависающем (fail-open).

## 6. Согласие и платформы

- iOS: до решения владельца — только локально. Любая отправка требует явного согласия внутри
  приложения (F1) и возможности отозвать; ATT не нужен для этой статистики, **не добавлять ATT и
  `NSUserTrackingUsageDescription`**. Обновить `PrivacyInfo.xcprivacy` и App Privacy только при
  включении сети (D-09).
- Android: Data safety обновляется только при включении сети; `AD_ID` не добавлять.
- Экран согласия в этом этапе **не проектируется и не внедряется** (D-03).

## 7. Доступ к backend

Пока отсутствует: endpoint не создан, ключей и URL нет. Планируемый формат — контракт §10
(`POST /v1/aggregates`, JSON, ответы `204/400/410/429/5xx`); конфиг шлюза — статический JSON на
Hosting (имя файла и URL будут заданы в промпте 02). До этого Flutter использует только
`NoopTransport`/`RecordingTransport`.

## 8. Чего Flutter не делает

Не создаёт ID (UUID, installation, Hive-идентификатор устройства); не пишет в Firestore; не
подключает Crashlytics/Analytics/ads; не отправляет поиск, личные молитвы, заметки, избранное как
список, закрытые материалы; не считает уникальных людей; не меняет контракт локально — любое
изменение только через WEB-репозиторий и новую версию контракта.
