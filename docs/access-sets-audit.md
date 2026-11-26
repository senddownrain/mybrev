# Access Sets V2 · S0-аудит Web и Flutter

Дата проверки — 24–25 ноября 2026 года, Москва. Объём работ — исследование исходников, локальных снимков, сведений о релизах и текущих правил, плюс проверка существующих тестов на изолированных данных. [Контракт V2](access-sets-contract.md), [матрица совместимости и откат](access-sets-compatibility.md), [план PR](access-sets-pr-plan.md).

Пересмотренный план от 24 ноября задаёт одно Firebase-окружение, локальный Auth + Firestore Emulator, отдельные ручные разрешения на публикацию и сохранение старых клиентов. Архив дополняет его схемой V2, примерами и требованиями к проверкам. Вложенные промпты S1–S8, команды для публикации и параллельной работы служили справкой. Текущий этап ограничен S0.

## База аудита

| Поверхность | Доказательство и статус |
| --- | --- |
| Web `senddownrain/mybrev` | `git ls-remote` подтвердил `main` `c1359b0289db070521e646c844157464802b5073`. HEAD текущего worktree совпал, локальная ветка `main` отставала. [Исходники на проверенном SHA](https://github.com/senddownrain/mybrev/tree/c1359b0289db070521e646c844157464802b5073). |
| Flutter `senddownrain/ibreviarybyapp` | `git ls-remote` подтвердил `main` `a17be901c9a1cd23355c60180efd0b3d7bf40963`. Просмотр по Git ref, рабочая Flutter-ветка `4829499cec3a46c656417c8a82bdf52ca0094482` оставалась на месте. [Исходники на проверенном SHA](https://github.com/senddownrain/ibreviarybyapp/tree/a17be901c9a1cd23355c60180efd0b3d7bf40963). |
| Web Hosting | Actions показывает успешный запуск для текущего Web SHA. Активный release ID Hosting и содержимое, получаемое конкретным пользователем со старым service worker, в S0 напрямую не проверены. [Actions 45200273970](https://github.com/senddownrain/mybrev/actions/runs/45200273970). |
| Firestore Rules | Активные правила Firebase-проекта `ibreviaryby` для базы по умолчанию совпадают с `firestore.rules` Web `main`. Хеш и способ сверки приведены ниже. |
| Android | Версия в `pubspec.yaml` — `1.0.0+6`. Actions 19 ноября подтверждает загрузку AAB `1.0.0 (26)` в закрытый `alpha` со статусом `draft`, package `by.mybrev.playtest2026`. Прямые APK `1.0.0 (26)` с `main` и `1.0.0 (27)` с `8401fe8d152389bd13fc558aa4ed45fc6bd2dd48` сохранены Actions 20 и 21 ноября соответственно. Для APK 27 прошла установка и запуск на Android Emulator. Фактическая доступность в Play и число установок не подтверждены. [Alpha](https://github.com/senddownrain/ibreviarybyapp/actions/runs/44581798577), [APK 26](https://github.com/senddownrain/ibreviarybyapp/actions/runs/44814422830), [APK 27](https://github.com/senddownrain/ibreviarybyapp/actions/runs/44831320131). |
| iOS | Bundle ID `by.mybrev.testflight2026`. Документация фиксирует исторические загрузки TestFlight 8 и 9. Текущие TestFlight/App Store build, доступность и установленные версии не подтверждены. [RELEASE_BETA.md](https://github.com/senddownrain/ibreviarybyapp/blob/a17be901c9a1cd23355c60180efd0b3d7bf40963/docs/RELEASE_BETA.md). |

## Текущий контракт и точки изменения

| Слой | Что подтверждает код `main` |
| --- | --- |
| Legacy Auth и активация | Web использует именованный app `mybrev-priest` с постоянной Firebase Auth отдельно от админской сессии. Flutter использует то же имя внутри своего приложения. Алгоритм в `src/utils/priestCode.mjs` и `lib/services/priest_code.dart` — ограниченная ASCII-нормализация, uppercase, удаление дефисов, SHA-256 в lowercase hex. Оба клиента записывают связанный claim и grant одним batch, затем проверяют grant с сервера. `priestAccess/settings` хранит текущий proof, `priestAccessPublic/help` — публичную справку. |
| Право и отзыв | `firestore.rules` (`hasGrant`, `registerGrant`, `registerClaim`, `priestDeviceGrants`, `priestActivationClaims`) связывает подписанный UID с active grant. Возраст и смена кода grant не меняют. Claim закрыт для SDK-чтения даже администратору. Право на owner-get grant требует отсутствия `activationProof`. Профиль, Auth UID и серверная запись grant — разные сущности. |
| Web reader и каталог | `src/services/prayerContentService.js`, `src/stores/prayers.js`, `src/stores/prayerCategories.js`, `src/views/FavoritePrayers.vue`. Публичный каталог имеет отдельный offline cache и Hosting JSON. Закрытые коллекции читаются с сервера через память именованного Firebase app, результаты объединяются по ID. При изменении ревизии обновляются consumer stores. Избранное хранит ID и отображает доступные записи каталога. |
| Админка Web и писатели | `src/views/admin/PriestAccess.vue`, `src/utils/adminAccess.js`, `src/services/priestAccessService.js`, `src/services/prayerStorageService.js`, `src/services/prayerDraftService.js`, редакторы молитв и категорий. Обычный админ редактирует контент. Legacy-кодами и реестром управляет действующий специальный админ (`managesPriests`). Текущий `prayerStoragePlan` разделяет public и priest по `priestOnly`/`effectivePriestOnly`; writer использует `priestContentControl/state`. Публикация черновика — отдельный путь записи. |
| Flutter reader, каталог и жизненный цикл | `lib/services/firebase_priest_access.dart`, `lib/providers/priest_access_provider.dart`, `lib/services/priest_access_policy.dart`, `lib/services/priest_access_storage.dart`, `lib/widgets/priest_access_lifecycle.dart`, `lib/screens/prayer_detail_screen.dart`. `Source.server` для grant и закрытого контента, отдельная Firestore с выключенным persistence, очистка при suspend/offline/revoke, generation guard для поздних ответов, прямой server read по ID. Secure storage хранит состояние установки и отложенного отзыва. Публичный bundle и Hive обслуживаются отдельно. |
| Legacy схема выдачи | `prayers`, `prayerCategories` публично читаются целиком. `priestProtectedPrayers`, `priestProtectedCategories` читаются legacy grant или админом. Связи из `parentId`, тегов, `prayerIds`, `categoryId`, `categoryIds` влияют на хранилище. Собственный признак доступа сохраняется отдельно от вычисленного. |
| Публичная дистрибуция | Hosting exporter и валидатор `public-prayers-v1.json`, service worker и `scripts/content/lib/app-content.mjs` знают legacy-модель. Flutter-канал использует `assets/content/manifest.json`, `lib/content/content_updater.dart` и публичный `contentManifest`. Его опубликованное состояние и текущий набор данных в S0 не запрашивались. [Регламент публикации](app-content-distribution.md). |

## Инвентаризация по локальным снимкам

В данном worktree основной снимок отсутствовал. В основном локальном checkout `mybrev` найден `backups/firestore-snapshot/manifest.json` от 27 августа. В нём нет нужных путей. Данные ниже из отдельных частных снимков того же checkout, открытых через `openFirestoreSnapshot` с проверкой формата и checksum. Значения относятся к разным моментам 12 октября по московскому времени.

| Снимок | Подтверждённые агрегаты |
| --- | --- |
| `priest-live-20261012` · 13:28 | 105 публичных молитв и 5 категорий, 1 legacy-закрытая молитва и 0 закрытых категорий, 0 grants на момент этого снимка. Совпадающих ID между публичной и закрытой коллекцией соответствующего типа — 0. Из auth-служебных путей представлены settings (1), help (0), control state (1). Claims в охват не вошли. |
| `priest-security-20261012-claims-fix` · 15:09 | 3 active grants с UID, совпадающим с ID записи. Все 3 исторически с полем proof. В охвате 1 settings и 0 claims. |
| `yearcycle-publication-20261012` · 16:22 | 85 публичных молитв и 4 категории, 21 legacy-закрытая молитва и 1 закрытая категория. У всех 21 закрытых молитв итоговый флаг установлен, собственный флаг установлен у 1. Совпадающих ID по типам — 0. Grants и claims вне охвата. |
| `priest-security-4966383-rollout` · 21:22 | 4 active grants с UID, совпадающим с ID записи, 0 revoked. Все 4 исторически с полем proof. В охвате 1 settings и 0 claims. |

Отчёт релиза от 12 октября фиксирует последующее удаление proof из четырёх исторических grants с сохранением UID, статусов и дат. Текущие числа active/revoked, отсутствие proof в актуальных grants, число закрытых документов, целостность cross-collection ID, наличие данных V2 и число зависимых установок остаются **не проверены**. Снимки с разным временем и составом нельзя склеивать в миграционную базу. Число active grants характеризует Firestore-документы. Для подтверждения действующей Auth-учётной записи или установки требуется отдельная проверка. Свежий снимок не запрашивался. [Исторический отчёт Web](priest-access.md).

## Риски и ограничения

| Приоритет | Наблюдение и требование к следующему этапу |
| --- | --- |
| Блокирует безопасный merge | Workflow `deploy-firebase-hosting.yml` срабатывает на push в `main` для `firestore.rules` и части Web/content файлов. Он генерирует публичный каталог из production и публикует Hosting. Rules публикуются при ручном dispatch этого workflow или при соответствующей метке в commit message. Изолировать PR и перед первым затрагивающим merge проверить или изменить release gate отдельным PR. |
| Блокирует S5 | Исторические proof-bearing grants несовместимы с owner-get современных клиентов. Само правило `hasGrant` для защищённого документа отдельно проверяет `uid` и `status`. До копирования подтвердить актуальные агрегаты и при необходимости вынести поддержку исторических данных в отдельное владельческое решение. Legacy grants исключены из S5. |
| Высокий | Wildcard Rules открывают будущие непрописанные коллекции для общего `isAdmin()`, даже если отдельный `match` строже. В S1 добавить корни V2 и `protected*` в `explicitlyRuled`, проверить вложенные пути, отличать обычного редактора от управляющего и сделать неизвестные V2 пути закрытыми. |
| Высокий | Публичные коллекции доступны по всему документу. Rules public write проверяют два legacy-флага, а наследование вычисляют writer/export. V2 требует общего валидатора хранения и дистрибуции и аудита всех писателей, включая drafts, Admin SDK-скрипты, импорт и манифест. |
| Высокий | `hasGrant` и текущие legacy readers не знают о V2. Заменить зеркало каноническими коллекциями на дату релиза нельзя. Старые build, PWA/service worker и прямые APK должны остаться в матрице. |
| Релизный | Прямой APK подписывается upload key, у Play App Signing может быть другой signing certificate. Совпадение package ID и version code не доказывает, что APK обновит Play-установку с тем же UID. Проверить сертификаты и обновление по каждому каналу, запретить подмену in-place теста переустановкой. |

## Опубликованные Rules и результаты проверок

Активный release `cloud.firestore` и связанный ruleset получены двумя read-only операциями Firebase Rules API. Сравнение с `firestore.rules` на `c1359b02` после нормализации CRLF в LF дало одинаковый SHA‑256 `96efe260296dc9650085d9a37a9343b342f3edcabaf08dbd464fa42b767e4205`. Время обновления release — 23 ноября 2026 года, 18:03 MSK. Правила включают публичное чтение `contentManifest`. Запросов к production Firestore-документам, production Auth или изменений production в S0 не было.

| Проверка на зафиксированном SHA | Результат |
| --- | --- |
| Web unit, 6 файлов | **29 PASS, 6 FAIL.** Все 6 отказов в `tests/priest-client-cache.test.mjs`: harness выполняет исходник через `new Function` после того, как `readPublic` стал использовать `import.meta.env.DEV`. Ошибка синтаксиса возникает до проверок кеша. Web runtime по этому набору не подтверждён. |
| Legacy Rules, `demo-rules` | **18 PASS, 0 FAIL, 0 SKIP.** Существующий `tests/priest-firestore.test.mjs` запущен в локальном Auth + Firestore Emulator, Java 21. Проверки включают legacy batch и ротацию, отзыв, публичный unfiltered list, deny для защищённых get/list, старые форматы grant и атомарное наследование. Тесты используют mock Auth токены эмулятора. |
| Базовый Firestore Rules smoke, `demo-rules` | **PASS.** Проверены allowlist для публичных коллекций, публичное чтение `contentManifest`, запрет прямого и списочного чтения приватных документов, роли обычного администратора и управляющего доступом. |
| Flutter unit/widget, 3 файла | **19 PASS.** `priest_access_test.dart`, `priest_access_settings_test.dart`, `priest_public_cache_test.dart`. Векторы legacy-кода, сохранение UID в модели, offline/revoke, изоляция памяти и тест содержимого публичных assets. Запуск с `flutter pub get --offline` в отдельном временном архиве точного Flutter SHA. |

<details>
<summary>Команды целевых тестов</summary>

```sh
node --test --test-reporter=spec tests/priest-access.test.mjs tests/priest-registration.test.mjs tests/priest-category-defaults.test.mjs tests/admin-access.test.mjs tests/public-prayer-catalog.test.mjs tests/priest-client-cache.test.mjs
firebase emulators:exec --only auth,firestore --project demo-rules "node --test --test-reporter=spec tests/priest-firestore.test.mjs"
firebase emulators:exec --only firestore --project demo-rules "node tests/firestore-rules/rules-emulator.mjs"
flutter test --no-pub --reporter expanded test/priest_access_test.dart test/priest_access_settings_test.dart test/priest_public_cache_test.dart
```

</details>

Проверка уже активированного физического устройства, фактических настроек магазинов, установленной доли старых версий и полного восстановления резервной копии — отдельные ворота перед S5/S8. Тестов V2 в S0 нет, потому что реализация V2 ещё не начата.
