# Доступ «Толькі для святароў»

## Архитектура и данные

Каноническими остаются `prayers` и `prayerCategories`. Отсутствующий `priestOnly` означает `false`. Категории сохраняют существующие `tags`; необязательный `parentId` добавляет иерархию. Ограничение категории распространяется на всех потомков и молитвы с любым её тегом. Если один тег входит в публичную и закрытую категории, молитва закрыта везде, включая поиск. Также поддерживаются явные ссылки молитв `categoryId` / `categoryIds`. Собственные флаги потомков при редактировании родителя не переписываются. Циклы и отсутствующие родители закрываются по принципу fail closed.

Firebase HTTP Function `priestApi` выдаёт разрешённый набор из тех же коллекций. Firestore Rules запрещают читателям прямые чтения молитв и категорий, поскольку ограничение может наследоваться через теги. Существующая админка сохраняет прямое редактирование. Любой редактор материалов может читать/редактировать молитвы, а управление кодом/устройствами разрешено только bootstrap UID из `src/constants/admin.js` либо администратору с `admins/{uid}.priestAccess = true`. Сервер проверяет Firebase ID token с проверкой отзыва и актуальное право в `admins`; клиентское право используется только для меню и маршрута.

Серверные коллекции недоступны через клиентский Firestore SDK даже администраторам:

| Путь | Назначение |
| --- | --- |
| `priestAccess/settings` | Argon2id-хеш общего кода, дата/автор изменения, `helpText`, версия схемы |
| `priestDeviceGrants/{uuid}` | Хеш индивидуального 256-битного секрета, идентификатор установки, информационные поля устройства, статус, даты |
| `priestInstallations/{uuid}` | Привязка установки к разрешению для защиты от параллельной регистрации |
| `priestActivationAttempts/{hash}` | Общие для экземпляров сервера счётчики попыток с `expiresAt` |

Исходный код показывается только в ответе успешной замены и в текущем диалоге. На сервере он не хранится и не логируется. Argon2id: 64 MiB, 3 прохода, parallelism 1. Индивидуальный секрет имеет 256 случайных битов; для него достаточно SHA-256. Идентификатор установки не является секретом.

Grant не имеет `expiresAt`, не зависит от текущего кода и не истекает через 30 дней. Flutter хранит индивидуальный credential в Keychain/Keystore. Веб получает `__session` с `HttpOnly; Secure; SameSite=Strict`, без секретов в localStorage. Имя cookie учитывает правила проксирования Firebase Hosting. На `/status` срок хранения cookie продлевается; grant остаётся бессрочным. Максимальный срок браузерной cookie — 400 дней с продлением, а браузер может удалить её раньше. После длительного отсутствия, очистки профиля или переустановки может потребоваться новая активация.

Активация проверяет код до транзакции, затем в транзакции повторно сверяет его хеш и привязку установки. Поэтому код, заменённый во время проверки, не регистрирует новое устройство. Проверка grant и чтение контента выполняются одной Firestore-транзакцией; отзыв и выдача сериализуются. Выданный до отзыва ответ нельзя забрать обратно. Активность обновляется не чаще раза в пять минут. Лимит активации: 8 попыток за 15 минут на IP и установку, плюс общий предел 1200. Счётчики распределённые; IP хранится только внутри хеша ключа временного окна. В Firestore включите TTL для `priestActivationAttempts.expiresAt` — это очистка счётчиков, не ротация кода.

## API для Flutter

Базовый URL: `https://<hosting-domain>/api/priest`. Native запросы передают `X-Priest-Client: Flutter`. JSON-запросы имеют `Content-Type: application/json`. После активации передавайте `Authorization: Bearer <credential>`; cookie для Flutter не требуется. Credential нельзя помещать в URL, логи, аналитику или обычные preferences.

### Активация

```http
POST /api/priest/activate
Content-Type: application/json
X-Priest-Client: Flutter

{
  "code": "<код, полученный у администратора>",
  "installationId": "<случайный UUID этой установки>",
  "client": "Flutter",
  "deviceName": "Samsung Galaxy S23",
  "platform": "Android",
  "label": "а. Яўгеній"
}
```

```json
{
  "active": true,
  "credential": "<grant UUID>.<индивидуальный секрет>",
  "device": {
    "id": "<grant UUID>",
    "deviceName": "Samsung Galaxy S23",
    "label": "а. Яўгеній",
    "client": "Flutter",
    "platform": "Android",
    "activatedAt": 1791583200000,
    "lastActiveAt": 1791583200000,
    "status": "active",
    "revokedAt": null
  }
}
```

Даты — epoch milliseconds UTC. Веб посылает `client: Web`, получает тот же ответ без `credential` и HttpOnly-cookie. Подпись необязательна, длина до 120 символов, не является подтверждением личности. Не передавайте аппаратные или рекламные идентификаторы.

### Продолжение авторизации, чтение и отключение

| Метод/путь | Ответ |
| --- | --- |
| `GET /status` | `{ "active": true, "device": {...} }`; без credential — `{ "active": false }` |
| `GET /help` | `{ "helpText": "..." }`; пустой текст не показывать |
| `GET /content` | `{ "categories": [...], "prayers": [...] }`, только разрешённые документы |
| `GET /content?public=1` | Только публичные документы, даже с действующим credential; единственный набор для публичного офлайн-кеша |
| `GET /categories` | `{ "categories": [...] }`, без пустых после фильтрации категорий |
| `GET /prayers?q=...` | `{ "prayers": [...] }`, поиск в разрешённых документах |
| `GET /prayers?ids=id1,id2` | Разрешённые молитвы избранного/истории; закрытые ID исключены |
| `GET /prayers/{id}` | `{ "prayer": {...} }`; закрытая/отсутствующая молитва без прав — одинаковый 404 |
| `POST /disable` с `{}` | `{ "active": false }`, отзыв текущего grant; операция идемпотентна |

Документы сохраняют существующую структуру (`title`, `text`, `titleVersions`, `textVersions`, `tags`, формат Markdown и прочие поля). Добавлено вычисляемое `effectivePriestOnly`. Для прямой ссылки, поиска, экспорта или истории используйте этот API; не читайте канонические коллекции напрямую и не ищите скрытые тексты в локальных пользовательских данных. Сохраняйте в избранном только ID. Допустим экспорт только уже разрешённого ответа; публичные bundle/manifest используют ту же политику.

При запуске приложения восстановите credential из secure storage и вызовите `/status`, затем `/content`. Повторный код не нужен. Credential не имеет технического срока действия; отдельный refresh token не требуется. На `401 ACCESS_REQUIRED` удалите credential и защищённые данные из памяти. На сетевую ошибку сохраните credential для следующей попытки, но закрытые материалы не выдавайте из публичного кеша. Для офлайн-отключения сохраните локальный non-secret pending intent, удалите защищённые данные, выполните `/disable` при восстановлении соединения до любого защищённого чтения, затем удалите credential. Для native отложенного отзыва credential необходимо временно оставить только в secure storage до доставки `/disable`; его нельзя использовать для чтения после локального отключения.

### Администратор

Передавайте `Authorization: Bearer <Firebase ID token администратора>` вместо device credential.

| Метод/путь | Тело / результат |
| --- | --- |
| `GET /admin/settings` | `codeCreated`, `changedAt`, `helpText`; без хеша и кода |
| `POST /admin/code` | `{ "generate": true }` или `{ "code": "..." }`; ответ: новый `code` и metadata, код показывается один раз |
| `PATCH /admin/help` | `{ "helpText": "..." }`, до 1000 символов |
| `GET /admin/devices?after=<uuid>&status=active` | `{ "devices": [...], "next": "<uuid или null>" }`, страницы по 100; `status` необязателен |
| `PATCH /admin/devices/{uuid}` | `{ "label": "..." }` или `{ "revoke": true }`; `{ "ok": true }` |

Веб-реестр загружает страницы и фильтрует название, подпись, клиента, платформу и статус. Массового отзыва и автоматической ротации нет. Генерация: 12 криптографически случайных символов из `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, отображение `XXXX-XXXX-XXXX`. Ручной код: 12–64 букв A–Z/цифр 2–9 без пробелов (дефисы разделяют группы), не менее 6 разных символов, буквы и цифры обязательны, повторяющиеся/простые последовательности запрещены; регистр незначим.

### Ошибки

```json
{ "error": { "code": "INVALID_CODE" } }
```

| HTTP | Код | Действие |
| --- | --- | --- |
| 400 | `INVALID_CODE` | Неверный, отсутствующий либо заменённый код; одинаковая ошибка |
| 400 | `WEAK_CODE`, `INVALID_DEVICE`, `INVALID_HELP`, `INVALID_REQUEST` | Исправить ввод |
| 401 | `ACCESS_REQUIRED` | Credential недействителен или устройство отозвано |
| 401/403 | `ADMIN_REQUIRED` | Требуется актуальное право администратора |
| 403 | `ORIGIN_DENIED` | Запрещённый Origin/CSRF-запрос |
| 404 | `NOT_FOUND` | Отсутствующая или недоступная молитва/маршрут |
| 409 | `INSTALLATION_REGISTERED` | Установка уже активна; восстанавливать имеющийся credential; утрата секрета требует новой установки/активации |
| 429 | `TOO_MANY_ATTEMPTS` | Подождать; `Retry-After: 900` |
| 503 | `SERVICE_UNAVAILABLE` | Повторить при восстановлении сервиса, не удалять credential |

Ответы API: `private, no-store`; CORS разрешает только заданные Origin. Веб-записи требуют разрешённый Origin и JSON; native-запросы без Origin используют отдельный заголовок. Административные операции требуют Firebase bearer. Не добавляйте wildcard CORS. Если frontend и API разделены доменами, cookie-режим нужно отдельно согласовать; штатная конфигурация использует same-origin Hosting rewrite.

## Миграция и развёртывание

1. `npm ci` в корне, затем `npm ci --prefix functions`. Сервер: Node 22, Firebase Functions v2, регион `europe-west1`; для развёртывания Functions требуется соответствующий Firebase billing plan.
2. В `functions/.env.<project-id>` задайте `PRIEST_ALLOWED_ORIGINS` со всеми реальными HTTPS-доменами приложения, через запятую. Без настройки разрешены только стандартные `<project>.web.app` и `<project>.firebaseapp.com`. Не коммитьте локальные env. На emulator допускаются localhost/127.0.0.1:5173 и cookie без Secure. Для Vite proxy можно задать `PRIEST_API_PROXY` на адрес локального `priestApi`; production использует Hosting rewrite.
3. Проверьте локальные snapshots. Dry-run: `node scripts/migrate-priest-access.mjs --snapshot backups/firestore-snapshot --snapshot backups/firestore-snapshot-prayers --snapshot <snapshot категорий>`. Отчёт: `reports/priest-access/migration.json`. Нет текста молитв или секретов. Отсутствие коллекции не считается пустой коллекцией. Доступные здесь snapshots дают 85 молитв без флага и **не покрывают prayerCategories**; `--apply` с такими источниками запрещён. Snapshot не обновляется автоматически.
4. После подготовки полного локального источника примените тот же запуск с `--apply` и при необходимости `--service-account <path>`. Транзакции добавляют только отсутствующий `priestOnly: false`, не перезаписывают флаги, удалённые записи, код или grants. Создаётся отсутствующий settings с пустой инструкцией; реестр появляется при первой активации, данные устройств не пересоздаются.
5. После записи контента обязательно `npm run content:manifest` для проверки diff, затем `-- --apply` только при SAFE CONTENT PATCH. Массовое добавление флагов может быть MASS CONTENT REBUILD — использовать `npm run content:app-release` и выпуск нового bundle/app, без override. Bundle и manifest исключают закрытые элементы и требуют категории для вычисления наследования.
6. Выпустите обновлённый Flutter-клиент с данным API до включения запрета прямых Firestore-чтений. Старые Flutter-клиенты сохраняют уже встроенные публичные офлайн-тексты, но **их прямые сетевые чтения prayers/prayerCategories после новых Rules перестанут работать**. Без обновления клиента совместимость сетевого чтения и безопасное наследование через произвольные теги одновременно обеспечить нельзя. Нельзя заранее публиковать закрытые тексты в старые bundle.
7. Установите право `priestAccess: true` нужным администраторам через действующий механизм Firebase console/service account; клиентское изменение `admins` запрещено. Bootstrap-администраторы уже имеют право. Включите TTL счётчиков.
8. Соберите веб `npm run build`, разверните согласованно `firebase deploy --only functions:priestApi,firestore:rules,hosting`. Сначала доступность API, затем Rules и веб; не помечайте материалы закрытыми, пока новые Rules не установлены. Эти команды не запускались автоматически против production.

## Инструкция администратору

Откройте «Адміністраванне → Доступ для святароў». Сгенерируйте код либо задайте собственный, подтвердите пояснение и сохраните показанный код; после закрытия экрана восстановить его нельзя. Укажите реальный контакт/инструкцию при необходимости. В редакторе категории/молитвы включите «Толькі для святароў». У категории можно выбрать родителя; ключ и фильтр отображают также наследуемый доступ. Подтвердите результат публикацией контента по правилам выше. Для смены кода используйте обычную замену — существующие устройства останутся активными. Для блокировки конкретного устройства найдите его в реестре и подтвердите «Адклікаць доступ». Подпись можно отредактировать отдельно; это информационное поле.

## Офлайн и ограничения

Публичный контент сохраняется в существующем IndexedDB-кеше, в отдельной записи `prayer-content,2`, и работает без сети. При первом офлайн-запуске обновлённой версии прежний публичный кеш используется, если сохранены и молитвы, и категории: перед выдачей проверяются собственные и наследуемые ограничения. Защищённый набор не записывается в публичный кеш; service worker использует NetworkOnly для `/api/priest/`. При потере сети закрытый набор убирается из store. После отзыва сервер немедленно отклоняет следующие защищённые чтения; открытый веб дополнительно проверяет статус при фокусе, восстановлении сети и раз в минуту. Тексты, уже выданные до отзыва или прежде общедоступные, невозможно удалить с чужого устройства задним числом. Для действительно секретного материала сначала назначайте закрытый статус, затем вводите текст.

При отключении офлайн HttpOnly-cookie нельзя удалить JavaScript-кодом. Веб сохраняет только намерение отключения, очищает отображаемый защищённый набор и выполняет серверный отзыв/очистку cookie при следующем соединении до восстановления доступа. Если до этого удалить данные браузера, локальное намерение и cookie исчезнут, а старую запись реестра администратор должен отозвать вручную. Новая регистрация того же физического компьютера в другом профиле — отдельное устройство. Название платформы/браузера приблизительное, без IMEI/серийных/advertising IDs.

В админском Firebase SDK сохраняется существующее поведение кеширования; администратор имеет право читать весь контент. Читатель больше не использует Firestore-кеш молитв. Устаревшие версии приложения и ранее полученные публичные копии не способны автоматически забыть текст при изменении статуса.

## Проверки

`npm run test:priest` проверяет модель доступа, сохранение grant через перезапуск и 366 дней, замену кода (включая замену во время регистрации), индивидуальный отзыв, отключение, параллельную регистрацию, rate limiting, дерево, поиск/избранное/прямые URL, cookie/native bearer, CSRF и публичный экспорт. `npm run test:priest:rules` запускает 22 проверки Rules и реальный транзакционный тест на Firestore emulator; без emulator `tests/priest-firestore.test.mjs` помечен skipped. Полный набор: `npm test`. Линт без изменения посторонних файлов: `node node_modules/eslint/bin/eslint.js .`. `npm run smoke:priest` проверяет реальные Vue-компоненты в Chrome на локальном сервере с синтетическими данными и тестовой авторизацией; реальные Firestore-данные не читаются. Для другого пути Chrome задайте `BENCHMARK_BROWSER_PATH`. Скриншоты и диагностические отчёты сохраняются только в игнорируемой папке `reports/priest-access/`.

Результаты локальных проверок 10.10.2026:

- `npm run test:priest`: 16 passed, 0 failed; тест Firestore без переменной emulator пропущен и отдельно выполнен успешно на emulator.
- Firestore emulator: 22 проверки Rules и 1 тест настоящих транзакций прошли. Использован локальный emulator 1.19.8 с Java 17; установленный Firebase CLI требует Java 21, поэтому проверки выполнены напрямую с изолированным `FIRESTORE_EMULATOR_HOST` и demo-project, без обращения к production.
- Полный прогон существующего набора до добавления шести заключительных проверок: 673 теста, 669 passed, 3 failed, 1 skipped. Все шесть добавленных проверок прошли в итоговом `test:priest`. Три сбоя воспроизведены на исходных файлах из HEAD: `ordo-definitions.test.mjs` сравнивает CRLF и LF; два `ordo-screen.test.mjs` зависят от разделителей путей Windows. Посторонние исходники и тесты не исправлялись ради зелёного отчёта.
- ESLint всего проекта без `--fix`: успешно; `git diff --check`: без ошибок whitespace.
- Chrome: desktop/mobile админка, подтверждение замены кода, сохранение существующего grant, подпись, отзыв, собственные/наследуемые ключи, редактирование флагов категории/молитвы, активация, перезагрузка, отключение и HttpOnly-cookie — успешно. Скриншоты осмотрены.
- Production Vite/PWA: сборка успешно завершена, service worker с 141 precache entry. Сохраняется предупреждение о существующем крупном chunk `notes` (около 1.44 MB); оно не препятствует сборке.

## Изменённые файлы

Сервер и конфигурация:

- `functions/index.mjs`, `functions/lib/priest-crypto.mjs`, `functions/lib/priest-http.mjs`, `functions/lib/priest-policy.mjs`, `functions/lib/priest-service.mjs`.
- `functions/package.json`, `functions/package-lock.json`, `firebase.json`, `firestore.rules`.
- `vite.config.js`, `eslint.config.js`, `package.json`, `.gitignore`.

Веб и админка:

- `src/services/priestAccessService.js`, `src/services/prayerContentService.js`, `src/services/prayerService.js`, `src/services/prayerCategoryService.js`.
- `src/stores/auth.js`, `src/stores/prayers.js`, `src/stores/prayerCategories.js`.
- `src/views/admin/PriestAccess.vue`, `src/views/admin/PrayerCategories.vue`, `src/views/Admin.vue`, `src/views/Settings.vue`, `src/router/index.js`.
- `src/components/prayers/PriestAccessSettings.vue`, `src/components/prayers/PrayerForm.vue`, `src/components/prayers/PrayersList.vue`, `src/layouts/default/NavigationDrawer.vue`.
- `src/utils/contentCache.js`, `src/utils/prayerCategoryMenu.js`, `src/utils/primeContentCache.js`, `src/utils/refreshSavedContent.js`, `src/plugins/sentry.js`.
- `src/styles/mdi-subset.css`, `src/assets/materialdesignicons-subset.woff2` — существующий генератор добавил используемые иконки.

Миграции, доставка контента, документация и проверки:

- `scripts/migrate-priest-access.mjs` — флаги категорий/молитв и settings; коллекции grants, installations и attempts создаются по мере использования. Данные устройств и подписи входят в схему grant и не требуют пересоздания существующего контента.
- `scripts/content/lib/app-content.mjs`, `scripts/content/build-app-bundle.mjs`, `scripts/content/publish-manifest.mjs` — фильтрация защищённых документов из публичных пакетов.
- `scripts/test-priest-emulator.mjs`, `scripts/smoke-priest-ui.mjs`.
- `tests/priest-access.test.mjs`, `tests/priest-client-cache.test.mjs`, `tests/priest-category-defaults.test.mjs`, `tests/priest-firestore.test.mjs`, `tests/helpers/priest-db.mjs`, `tests/firestore-rules/rules-emulator.mjs`.
- `tests/app-content.test.mjs`, `tests/content-cache.test.mjs`, `tests/prayer-copy.test.mjs`, `tests/ui/priest-fixtures.mjs`, `tests/ui/priest-harness.mjs`.
- `docs/priest-access.md`.

Имеющиеся до работы изменения `src/components/oraparts/PsalmText.vue` не относятся к этой реализации.
