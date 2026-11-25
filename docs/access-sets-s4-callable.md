# Callable S4 и управляемый релиз

`canonicalCatalog` — одна Firebase Callable Function v2 под Node.js 22 в
отдельном codebase `s4-catalog`. Вход использует существующий
`createCanonicalCatalogWriter`. Планирование, парность, typed hash и граница
транзакции остаются внутри writer. Runtime публикует `preview`, `save` и
`verify`. Доверенный `restore` остаётся инструментом оператора.

## Контракт подключения S3

Формы S3 могут лениво импортировать `connectCanonicalPrayerSaveApi(region)`
из `src/services/canonicalPrayerCallable.js`. Клиент использует основной
Firebase app администратора с App Check. Регион должен совпадать с
`S4_CATALOG_REGION`, по умолчанию `europe-west1`.

| Вызов | Данные и результат |
| --- | --- |
| `preview(edits)` | Массив `{ kind, id, action, patch }`. Возвращает `version`, `planDigest`, `afterDigest`, `writes`, `creates`, `deletes`, `parity` и `committedVersion: null`. |
| `save(edits, preview)` | Передаёт те же правки, `expectedVersion` и `planDigest` из preview. Одна транзакция возвращает подтверждённый `committedVersion`. При отсутствии изменений версия сохраняется. |
| `verify(preview)` | При потерянном ответе отправляет ожидаемую итоговую версию и `afterDigest`. Успех возвращает `{ version, parity: 'verified' }`. |

`kind` принимает `prayers` или `categories`. `action` правки принимает
`create`, `update` или `delete`. S3 подтверждает предпросмотр по явному
действию. Код `functions/aborted` с `content-snapshot-drift` требует
свежего preview. После сетевой неопределённости сначала выполняется verify.
Если он не подтвердил состояние, результат остаётся неопределённым до
свежего чтения и сверки. Ошибки Auth, роли, квоты и блокировки каталога
передаются UI как закрытый результат операции. В логи UI идут коды и
счётчики, без содержимого правки и токенов.

S3 включает сохранение после готовности endpoint, переключения
проверенного каталога в `canonical` и совместной проверки ролей. Старые формы
остаются на своём пути в legacy. Для публикации черновика требуется
отдельное подключение S3 с обновлением версии черновика и записью аудита
в той же транзакции.

## Авторизация и расходы

Callable требует валидный Firebase Auth и App Check. Runtime отклоняет
анонимный Auth и проверяет `admins/{uid}` до сканирования. Право получает
`superadmin` или `admin` с `accessSetsV2: true`. Токен перепроверяется
через `verifyIdToken(token, true)` с учётом отзыва и отключения пользователя.
Writer повторяет проверку роли в своей транзакции и отклоняет режимы
`legacy`, `suspended` и состояние с блокировкой. Настройки runtime
`minInstances: 0`, `maxInstances: 2`, `concurrency: 1` и
`timeoutSeconds: 60`. CORS ограничен доменами проекта.
[Callable Auth и App Check](https://firebase.google.com/docs/functions/callable) ·
[Проверка отзыва Auth](https://firebase.google.com/docs/auth/admin/manage-sessions)

`mybrev-catalog-writer@ibreviaryby.iam.gserviceaccount.com` указан
явно в конфигурации endpoint. Перед отдельным разрешённым релизом оператор
создаёт или сверяет этот аккаунт, включает ADC через привязку runtime
и предоставляет два custom IAM-биндинга.

- `functions-catalog/iam-firestore-role.yaml` ограничивается через IAM
  Condition `resource.name == "projects/ibreviaryby/databases/(default)"`.
  Роль даёт необходимые чтение, список, CRUD и begin/rollback транзакции.
  Firestore IAM ограничивает базу. Пути каталога ограничивает код writer.
- `functions-catalog/iam-auth-role.yaml` даёт на уровне проекта только
  `firebaseauth.users.get` для проверки сессии. Оператор релиза отдельно
  получает необходимое право `actAs` на этот аккаунт.

Ключи runtime в пакет не включаются. Расходы на запись включают одно
дополнительное чтение роли перед транзакцией и Auth-проверку. Preview,
save и verify каждый сканирует каталог, поэтому preview запускается
по явному действию, а verify нужен прежде всего при неопределённом ответе.
[Разрешения Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam#permissions) ·
[Условие на базу](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure_per-database_access_permissions) ·
[Разрешение Identity Platform](https://docs.cloud.google.com/identity-platform/docs/access-control) ·
[Служебный аккаунт Functions](https://firebase.google.com/docs/functions/manage-functions#set_a_service_account)

## Локальная проверка

Команды выполняются из worktree S4 с Node.js 22 и Java, поддерживаемой
установленной Firebase CLI.

```powershell
node scripts/stage-canonical-catalog-function.mjs
npm ci --prefix reports/access-sets-v2-s4/callable-source --no-audit --no-fund
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
firebase emulators:exec --config firebase.s4-catalog.json --only auth,firestore,functions --project demo-s4-catalog 'node scripts/benchmark-access-sets-catalog.mjs && node --test tests/access-sets-v2-callable-emulator.test.mjs'
node scripts/smoke-access-sets-v2-catalog.mjs
```

Тест вызывает Callable по HTTP с токенами Auth Emulator. Он проверяет
отказы при отсутствующем и непригодном App Check, недостаточной роли
и отзыве Auth, а также preview, атомарный save, verify и конфликт версий.
Для положительных сценариев Functions Emulator декодирует синтетический
токен App Check. Реальную подпись App Check и IAM runtime оператор
проверяет в разрешённом окружении перед включением S3.
[Границы Emulator Suite](https://firebase.google.com/docs/emulator-suite/connect_functions#cloud_iam)

## Ленивое чтение и повторный замер

Общее меню и Settings запрашивают публичный каталог. Список, избранное
и редакторы открывают защищённую выдачу явно. Прямая ссылка выполняет
целевой get, при необходимости запрашивая защищённого предка.
Для холодных legacy-ссылок провайдер S2 передаёт `readLegacyPrayer(id)`
в дополнение к `readLegacy`. Метод возвращает только разрешённый документ
или `null`. Встроенный legacy-провайдер уже реализует этот путь.
Новый поиск остаётся поиском по выдаче открытого каталога.

Браузерный тест подтвердил 0 запросов защищённого каталога на старте,
в общем меню, на публичной ссылке и при возвращении домой после
background. Холодная ссылка без закрытого предка дала 1 get и 0 списков.
Переходы в пределах подтверждённого поколения повторно используют память.
На отзыв, offline и background приватные результаты удаляются, а
запоздавший ответ отбрасывается.

| Фикстура | Страницы / чтения индекса / get | Явный холодный каталог с оценкой Rules | Холодная ссылка с одним закрытым предком |
| --- | ---: | ---: | ---: |
| 21 молитва, 1 категория, legacy grant | 2 / 22 / 22 | 114 | 8 |
| 56 молитв, 11 категорий, Marian | 4 / 67 / 67 | 485 | 12 |
| 160 молитв, 24 категории, 2 набора | 12 / 232 / 184 | 1 505 | 14 |
| 400 молитв, 60 категорий, 4 набора | 52 / 1 148 / 460 | 4 415 | 12 |

Запросы измеряются в Emulator. Оценка учитывает зависимые чтения Rules
и цену пустых страниц. Подтверждение сессии S2 считается отдельно.
Тёплые каталог и ссылка дают 0 дополнительных чтений. Оптимизация
убирает фоновые проходы, сохраняя стоимость явно открытого поиска.
[Тарификация Firestore](https://firebase.google.com/docs/firestore/pricing#cloud-firestore-security-rules)

## Процедура будущего релиза

1. Сверить целевой SHA, регион Firestore и Functions, происхождение
   служебного аккаунта, два IAM-биндинга, App Check основного Web app
   и бюджет. Утвердить разрешённые origin. Перед cutover синхронизировать
   S5 [#324](https://github.com/senddownrain/mybrev/pull/324) с итоговым
   SHA S4 и повторить обе локальные проверки парности и dry-run.
2. В чистом worktree подготовить пакет allowlist-скриптом. Вышеописанный
   локальный прогон должен подтвердить одну функцию и её настройки.
   После отдельного утверждения релиза выполнить только этот селектор.

   ```powershell
   firebase deploy --config firebase.s4-catalog.json --project ibreviaryby --only functions:s4-catalog:canonicalCatalog
   ```

3. До включения сохранения в S3 сверить ревизию, служебный аккаунт и
   аттестацию. На этапе legacy endpoint должен отказывать в записи.
   Переключение выполняется отдельным решением S8 после S5 parity.
   При остановке канала отключить сохранение в S3 и закрыть вызовы
   endpoint, сохранив согласованные данные. Публикация изменений
   публичных коллекций идёт по отдельному регламенту.

Селектор охватывает только `canonicalCatalog`. Конфигурация основного
Hosting и Rules в этом изменении сохранена. Это инструкция на будущую
операцию после утверждения, а не выполненный релиз.
