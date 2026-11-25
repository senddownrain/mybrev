# Access Sets V2 · архитектурный контракт S1

Версия протокола — 2. Контракт общий для Web, Flutter, Firestore Rules и будущего writer. Локальная реализация S1 проверяется с Auth + Firestore Emulator и синтетическими данными в проекте `demo-rules`. Рабочим клиентам V2 предоставляет одно существующее Firebase-окружение.

## Пути и документы

| Путь | Поля и доступ |
| --- | --- |
| `accessSetsV2/{setId}` | `name: string`, `status: "active"`, `updatedAt: timestamp`. Управляющий может читать и сохранять. ID соответствует `[a-z][a-z0-9-]{0,63}`. Первые зарезервированные ID — `priest` и `marian`. Архивация с проверкой зависимостей относится к S3/S4. |
| `accessProfilesV2/{profileId}` | `name`, `status: "active" \| "disabled" \| "revoked"`, `allowedSets: string[]`, `revision: int`, `updatedAt: timestamp`. Только управляющий читает и сохраняет. Профиль создаётся active с ревизией 1. Каждое изменение увеличивает ревизию на 1. ID имеет тот же формат, что `setId`. |
| `accessProfilesV2/{profileId}/client/entitlements` | Только `allowedSets` и `revision`. Записывается атомарно с профилем. Владелец действующего grant с кодом того же активного профиля может выполнить get. |
| `accessCodesV2/{codeId}` | `profileId`, `codeProof`, `status: "active" \| "disabled"`, `issuedAt: timestamp`, `disabledAt: timestamp \| null`, `label`. Read/write только управляющему. После выдачи изменяются только статус и дата отключения. Смена кода не меняет профиль уже выданного grant. |
| `accessCodesV2/{codeId}/client/profile` | Только `profileId`. Создаётся с кодом. Разрешён get владельцу active grant с этим `codeId`. Immutable. Связь для авторизации определяется по самому закрытому коду. |
| `accessDeviceGrantsV2/{uid}` | `uid`, `codeId`, `status: "active" \| "revoked"`, `deviceName`, `client: "Web" \| "Flutter"`, `platform`, `label`, `activatedAt`, `lastActiveAt`, `revokedAt: timestamp \| null`. Владелец читает свой документ. Управляющий читает реестр. Клиентский grant не содержит `profileId`, `allowedSets` или proof. |
| `accessActivationClaimsV2/{uid}` | `uid`, `codeId`, `activationProof` в lowercase hex, `createdAt: timestamp`. Только create в batch активации. Клиентский get/list/update/delete закрыты для всех ролей. |
| `protectedPrayers/{id}`, `protectedCategories/{id}` | Канонический payload в прежнем формате renderer. При импорте S4/S5 добавляются `accessSchemaVersion: 2`, `accessSets: string[]`, `effectiveAccessSets: string[]`, `contentHash: string`. Админ читает корпус. В режиме canonical установка может сделать get с разрешённым набором из `effectiveAccessSets`. |
| `accessSetsV2/{setId}/prayers/{id}`, `accessSetsV2/{setId}/categories/{id}` | Индекс по набору. Документ пустой (`{}`), ID указывает на канонический объект. Get/list разрешены только для набора, который доступен установке. List требует `limit` до 100. |
| `priestContentControl/accessSetsV2` | `{ mode: "legacy" \| "canonical" \| "suspended" }`. Запись только через доверенный релизный инструмент. Любая авторизованная установка может сделать get. Отсутствие документа означает legacy. В canonical действуют V2 активация и каноническое чтение. В suspended каноническое чтение и V2 активация закрыты. |
| `prayers`, `prayerCategories`, `priestProtectedPrayers`, `priestProtectedCategories` | Старые пути и поля. `accessSchemaVersion`, `accessSets`, `effectiveAccessSets` запрещены при клиентских записях в эти коллекции. Rules и writer legacy-доступа остаются совместимы с прежним форматом. |

Имена и метки ограничены 120 символами, даты записи подтверждаются Firestore. `allowedSets` — список уникальных ID без фиксированного продуктового числа элементов. Пределы документа, индекса и транзакции Firestore по-прежнему действуют. Административный gateway проверяет существование всех наборов. Rules не обходят произвольный список документов и допускают редактирование профиля только доверенным управляющим. Каноническая выдача дополнительно зависит от реального `effectiveAccessSets`, записанного доверенным writer. Права V2-управления получают `superadmin` и администраторы с `admins/{uid}.accessSetsV2 == true`. Старый флаг `priestAccess` сам по себе не даёт V2-управление. Вложенные служебные пути защищены от общих wildcard-совпадений.

Канонический корпус, индексы и режим rollout в S1 закрыты для записи всеми SDK-клиентами, включая администраторов. Emulator использует Admin SDK для синтетических fixtures. Будущая запись и переход режима требуют проверенного writer S4 и runbook S5.

## Код и активация

1. Код имеет вид `PREFIX-YYYYMMDD-CODEID-SECRET`. PREFIX — 3–10 ASCII букв. Дата — реальная дата UTC из восьми цифр, год 0001–9999. CODEID — 16 случайных символов. SECRET — 24 случайных символа, сплошной строкой или шестью группами по четыре. Для ID и секрета используется алфавит `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Генератор использует независимые криптографически случайные выборки, 80 бит ID и 120 бит секрета.
2. Парсер допускает только ASCII, внешний ASCII whitespace, ASCII uppercase и одиночные разделители. Каноническая форма объединяет поля дефисами и убирает разделители внутри секрета. Proof — lowercase SHA‑256 от UTF-8 байтов ASCII строки `mybrev/access-code/v2`, одного LF и канонической формы. Дата и префикс привязаны к proof для целостности строки. Право определяет запись кода и профиль. Старый код идёт в неизменённый legacy parser и proof. [Общие синтетические векторы для JS и Dart](../tests/fixtures/access-sets-v2-code-vectors.json).
3. V2 использует существующий именованный Anonymous Auth `mybrev-priest`. Подписанный UID одинаков в claim и grant. Клиент направляет code ID и proof в claim и только code ID в grant. Группового идентификатора в самом коде и grant нет. Rules сами связывают код с закрытым профилем и через `getAfter` проверяют обе записи, серверные timestamps и отсутствие предыдущей регистрации. Проверка одного batch требует не более 5 обращений Rules на операцию, 10 на batch до учёта кеширования.
4. Только подтверждённый сервером собственный active grant с ожидаемым code ID завершает регистрацию. При неопределённом результате клиент проверяет собственный grant. Подтверждённый claim не повторяется. Секрет, proof и закрытый контент не сохраняются в storage. Firebase Lite на Web не имеет offline queue, а его логирование отключено до запросов, чтобы SDK не вывел payload ошибочной записи.
5. Управляющий получает исходный код один раз после commit. Случайный ID создаётся с проверкой отсутствия коллизии. Ротация создаёт новый код и его проекцию и отключает старый код одной транзакцией. Выданные grants сохраняются. Запрещены запись исходного кода в документ, сериализация в аналитике и публикация в любых ресурсах клиента.

## Выдача, отзыв и совместимость

- Считать серверный режим. В canonical загрузить свой `accessDeviceGrantsV2/{uid}`, затем по `codeId` получить `client/profile` и по `profileId` — `client/entitlements`. Эти проекции помогают выбрать запросы. Rules независимо вычисляют право по grant, неизменяемой связи code→profile и актуальному профилю.
- Действующий legacy grant даёт `priest`. У существующего UID legacy-доступ сохраняется без нового кода. V2 grant добавляет свой набор прав. Новое устройство с marian-only профилем читает только marian. V2 priest без legacy grant читает canonical priest и не использует старое зеркало. Пользователь не переключает профиль через повторную активацию того же UID.
- Для списка выполнить отдельный paged запрос к индексу каждого доступного набора: сортировка по document ID, `limit`, затем `startAfter(lastId)`. Объединить по `(тип, ID)`, затем читать canonical server get с отдельной Rules-проверкой. Прямой get для deep link использует ту же проверку. Канонический list и `array-contains` не входят в пользовательский API S1. Один payload хранится независимо от числа наборов. Отдельная проба в эмуляторе с динамическим пересечением наборов позволила прямой get, но отклонила отфильтрованный list с `permission-denied`. Индекс даёт доказуемую проверку по пути. Он добавляет чтения, поэтому S4/S7 должны измерить стоимость страниц, ограничить параллелизм и повторно использовать результаты только в памяти текущей сессии. [Семантика Firestore Rules для запросов](https://firebase.google.com/docs/firestore/security/rules-query).
- Отзыв устройства переводит V2 grant в терминальный `revoked`, без удаления. Владелец и управляющий могут отозвать запись, а только владелец может обновлять `lastActiveAt` с интервалом в час. `disabled` профиля временно закрывает новые активации и чтение всех его grants. `revoked` профиля блокирует их постоянно. Изменение состава набора применяется на следующей серверной проверке. Отзыв одной ветки оставляет право, подтверждённое другой.
- Следующие клиенты должны отслеживать grant и ревизию entitlements, а также проверять сервер на reconnect/foreground. При потере подтверждения хранить публичную выдачу и очистить приватный reader, поиск и память. Запоздавший ответ отбрасывать по поколению. «Выключить доступ» отзывает обе активные ветки, повторяет неподтверждённые записи с тем же UID и завершает сессию после подтверждения. Работа с выключением в UI относится к S2/S7.
- Режим legacy позволяет новому клиенту взять старое зеркало только после проверки legacy grant и его целостности. Режим suspended запрещает каноническую пользовательскую выдачу. Отдельный backout в legacy допустим после проверки зеркала. Старые клиенты продолжают читать прежний путь с действующим legacy grant в обоих режимах. [Матрица и откат](access-sets-compatibility.md).

## Хранение и переход

Политика writer S4 наследует ограничения через родительские категории, теги, `prayerIds`, `categoryId` и `categoryIds`. Собственное поле `accessSets` задаёт альтернативные наборы одного ограничения. Между защищёнными ограничениями берётся пересечение. Публичная связь не расширяет выдачу. Пустое пересечение, цикл, неизвестный набор или оборванная ссылка блокируют публикацию. Rules не выводят наследование обходом графа.

S5 копирует существующие priest документы с исходным ID и содержимым. При начальном переключении набор `effectiveAccessSets` для копий — ровно `['priest']`. Для новых смешанных или чисто marian записей зеркала нет. После cutover один канонический writer атомарно обновляет пару для `['priest']`, производные ID и `priestContentControl/state`. Сверяется SHA‑256 общего payload, исключая новые поля V2 и сохраняя типы Firestore. При неполной копии выдача canonical остаётся закрытой. S4 обязан доказать парность и ограничить размер записи в пределах Rules 10/20 и Firestore. У текущего legacy writer лимит 400 операций. Предел V2 измеряется отдельно. [Лимиты Rules](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits).

Хранилища публичного контента принимают только публичные записи. Индекс, закрытые payload, title, preview и proof не входят в bundle, CDN, content manifest, service worker, IndexedDB/Hive или APK/IPA. Защищённый клиентский кэш допустим только в памяти текущей подтверждённой сессии. Reader и exporter изменения появятся в S4/S7.

## Интерфейсы и ошибки

| Web S1 API | Контракт для Flutter и следующих PR |
| --- | --- |
| `parseAccessSetsV2Code(input) → {codeId, canonical} \| null`, `accessSetsV2CodeProof(canonical)` | Один parser и proof на платформу с одинаковыми векторами. Canonical используется только для доказательства кода. |
| `createAccessSetsV2Gateway(db)` | Firestore Lite от именованной device Auth. Flutter запрашивает `Source.server`, хранение Firestore отключено. |
| `readMode()`, `readGrant(uid)`, `readEntitlements(uid)` | Server-only. Возвращают режим, grant или null, `{profileId, allowedSets, revision}` или null. Ошибка не даёт новое право и инвалидирует требующий проверки контент. |
| `activate(uid, code, {deviceName, client, platform})` | После readback возвращает `{codeId}`. Состояние профиля и наборы проверяются отдельно. |
| `listIds(kind, setId, {pageSize, after})`, `readContent(kind, id)` | Возвращают `{ids, cursor}` и канонический документ или null. kind — prayers/categories. Отсутствующий канонический объект может вызвать access-denied, поскольку Rules не подтверждают его видимость. |
| `revokeOwn(uid)` | Идемпотентно отзывает свой V2 grant, когда он активен. Вызов legacy revoke и сохранение ожидающей доставки — ответственность общего провайдера. |
| `createAccessSetsV2Admin(db)` | Изолированный админский SDK. `saveSet`, `saveProfile(..., expectedRevision)`, `issueCode({profileId,prefix,label,replacesCodeId})`, `disableCode`, `revokeDevice`. Group revoke — `saveProfile` с `status: "revoked"`. |

`invalid-code` — синтаксис. `activation-denied` — единый ответ для неверного, отключённого, заменённого кода, закрытого профиля и режима. `grant-exists` и `grant-revoked` относятся к своей установке. `registration-unconfirmed` требует перепроверки сервера. Для доступа сопоставлять permission-denied → access-denied, unauthenticated → authentication-required, resource-exhausted → quota-exhausted, unavailable/deadline-exceeded → server-unavailable, остальные → access-failed. Никаких секретных строк и ответов Firebase SDK в пользовательских ошибках, логах или telemetry.

## Границы параллельных PR

| Поток | Владеет файлами и компонентами |
| --- | --- |
| Web activation S2 | `src/components/prayers/PriestAccessSettings.vue`, `src/services/priestAccessService.js`, `src/plugins/priestFirebase.js`, интеграция в `src/views/Settings.vue` и тесты жизненного цикла. Использует S1 gateway. |
| Web admin S3 | Новый раздел администрирования, route, `src/utils/adminAccess.js`, админские тесты и формы. CRUD видимости подключается к writer после S4. |
| Web catalog & writer S4 | `src/services/prayerContentService.js`, prayer/category stores и reader, `src/services/prayerStorageService.js`, `src/utils/prayerStoragePlan.mjs`, drafts writer, публичные export/manifest и изменения Rules по парности. Один автор производственного writer и Rules. |
| Flutter S7 | Flutter репозиторий. `lib/services/` для transport, parser и storage, `lib/providers/priest_access_provider.dart`, существующие экраны и reader, Dart тесты с копией общих векторов. |
| Марианский корпус S6 | Независимая редакционная проверка и синтетические тесты валидатора. Проверенный корпус остаётся в частном хранилище. Импорт следует после S4/S5. |

Правки общей схемы, Rules и JS/Dart векторов согласуются в одном контрактном PR. Ветка production release gate рассматривается отдельно и должна быть принята перед merge изменений V2.
