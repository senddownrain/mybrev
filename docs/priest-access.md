# Доступ для святароў — Firebase Spark

Реализация использует Firebase Anonymous Authentication, Firestore Security
Rules и Hosting. Cloud Functions, Cloud Run, внешний API, Blaze и платный
биллинг не нужны. Бесплатные квоты Auth/Firestore/Hosting продолжают действовать:
Spark не означает неограниченное количество чтений и регистраций.
Архив `functions/` не используется приложением или deployment.

## Авторизация и хранение

| Путь | Содержимое | Чтение |
| --- | --- | --- |
| `prayers/{id}` | Только публичные молитвы | Всем, включая старый Flutter |
| `prayerCategories/{id}` | Только публичные категории | Всем |
| `priestProtectedPrayers/{id}` | Закрытые молитвы, прежние ID | Администратор либо активный grant |
| `priestProtectedCategories/{id}` | Закрытые категории, прежние ID | Администратор либо активный grant |
| `priestAccess/settings` | `activeCodeProof`, `changedAt`, `helpText` | Только управляющий доступом |
| `priestAccessPublic/help` | Только `helpText` | Всем |
| `priestDeviceGrants/{uid}` | Разрешение установки | Свой документ либо управляющий; список только управляющему |
| `priestContentControl/state` | Версия, блокировка миграции, серверная дата | Администраторам |

Молитвы и категории сохраняют собственный `priestOnly` (по умолчанию `false`).
`effectivePriestOnly` — вычисленное ограничение для хранения и отображения.
Закрытый родитель закрывает потомков; связь молитвы хотя бы с одной закрытой
категорией через существующие теги, `categoryId` или `categoryIds` закрывает её
везде. Собственные флаги потомков не изменяются. Циклы и отсутствующие родители
закрываются безопасно до исправления. Пустые категории скрывает представление;
публичная категория с одной закрытой молитвой остаётся в публичных метаданных,
чтобы появиться в обычном дереве после активации.

Grant бессрочный: проверки не зависят от возраста активации или текущего кода.
Firebase SDK автоматически обновляет технические ID tokens. UID сам по себе не
секрет: Firestore проверяет подписанный Firebase token и `request.auth.uid`.
Для браузера установка соответствует профилю. IMEI и рекламных ID нет.

Основной Firebase App сохраняет Auth администратора. Именованный
`mybrev-priest` имеет независимый persistent Anonymous Auth и Firestore с
кешем **только в памяти**. `mybrev-priest-editor` копирует текущую Auth-сессию
администратора через SDK `updateCurrentUser`, только в память: защищённые
административные чтения и proof тоже не попадают в основной IndexedDB.
`signInAnonymously()` никогда не вызывается для основного Auth.

Rules в `firestore.rules` — источник решения. Все приватные пространства,
включая вложенные документы и старые `priestInstallations`/
`priestActivationAttempts`, исключены из общего `match`. Пересекающиеся
разрешения Rules складываются через OR, поэтому одного закрытого `match`
недостаточно: [официальная семантика](https://firebase.google.com/docs/firestore/security/rules-structure).

## Код и разрешение

Web Crypto генерирует 24 символа из `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
(32 знака, около 120 случайных бит), шесть групп `XXXX`. Ручной код —
24–64 символа этого алфавита, минимум 10 разных, буквы и цифры, без повторяемых
шаблонов/очевидных слабых последовательностей. Случайный код предпочтительнее.

SHA-256 — **bearer proof длинного случайного кода**, а не замена Argon2 для
паролей. Обладающий proof может зарегистрировать новую установку. Поэтому
proof защищён так же, как код: только приватные settings/grant, HTTPS SDK,
никаких логов, аналитики, URL, публичных экспортов или дискового кеша.
Собственный grant владелец может читать, включая proof; это явно разрешённая
модель, не средство подтверждения личности.

Rules разрешают создание grant только с действующим proof, для собственного
UID, со строго заданными полями и серверными временными метками. Неверная
попытка не создаёт документ. Клиент не читает settings и не сравнивает код с
правильным значением. В Spark Rules нет серверного лимита попыток по IP;
не заявляем такой защиты. Высокая энтропия и ограничения Firebase Auth снижают
возможность подбора, но злоупотребление может расходовать бесплатную квоту.

Пример приватного grant (proof намеренно опущен из примера):

```text
priestDeviceGrants/<anonymousUid>
uid: <тот же anonymousUid>
status: active | revoked
deviceName: Chrome · Windows
client: Web | Flutter
platform: Windows
label: а. Яўгеній
activatedAt: server timestamp
lastActiveAt: server timestamp
revokedAt: null | server timestamp
activationProof: 64 lowercase hexadecimal characters
```

Управляющий — bootstrap UID из `src/constants/admin.js` либо существующий
администратор с `admins/{uid}.priestAccess == true`. Редактор молитв без этого
права не управляет кодом и реестром. Подпись информационная.
Последняя активность записывается не чаще одного раза в час (Rules проверяют
интервал), без таймера истечения grant. Пользователь может только экономно
обновлять активность либо отзывать свой grant. Администратор редактирует
подпись и отзывает. Ни пользователь, ни администратор этим API не переводят
`revoked` обратно в `active` и не удаляют записи.

Замена кода записывает settings и не меняет grants. Отозванный UID не может
повторно активироваться обновлением. Владелец действующего общего кода может
создать новый Anonymous UID: индивидуальный отзыв установки не является баном
человека или аппаратного устройства.

## Контракт Flutter (Firebase SDK, без HTTP API)

Библиотеки: `firebase_core`, `firebase_auth`, `cloud_firestore`, `crypto`.
Если приложение уже имеет основной Auth, используйте **именованный** App
с теми же FirebaseOptions; для Web тоже отдельная persistence Auth.

1. Инициализировать Firebase и восстановить Auth; не создавать Anonymous UID
   для каждого обычного читателя. При вводе кода использовать текущего
   анонимного пользователя или `signInAnonymously()` именованного Auth.
2. Вычислить proof по общему контракту ниже. `set()` нового
   `priestDeviceGrants/{uid}` с полями выше; `activatedAt`, `lastActiveAt` —
   `FieldValue.serverTimestamp()`, `revokedAt: null`. Укажите `client: Flutter`.
3. Прочитать свой grant с `Source.server`. При `status == active` получить
   обе защищённые коллекции с `Source.server`, объединить с публичными по ID,
   применять общий алгоритм тегов/родителей и фильтрации пустых категорий.
4. При запуске восстановить того же Auth-пользователя и читать grant с сервера;
   подписка на свой grant немедленно обновляет UI при отзыве. Tokens обновляет
   SDK, код повторно не нужен. При необходимости `getIdToken(true)` обновляет
   token, не grant. Не хранить собственные токены в URL/preferences.
5. Последнюю активность обновлять только если прошло >= 1 часа, с server
   timestamp; отказ при гонке нескольких клиентов допустимо игнорировать.
6. Отключение: немедленно очистить защищённые тексты/состояние UI, обновить свой
   grant `{status: revoked, revokedAt: serverTimestamp()}`, затем `signOut()`
   только именованного Auth. Без сети сохранить намерение отключения (UID,
   не proof/код), повторить отзыв **до** следующих защищённых чтений. Для
   доставки отзыва до подключения остаётся SDK Auth credential; доступ в UI
   выключен. Если credential утрачен, администратор отзывает старую запись.

```dart
final app = await Firebase.initializeApp(
  name: 'mybrev-priest', options: DefaultFirebaseOptions.currentPlatform);
final auth = FirebaseAuth.instanceFor(app: app);
final privateDb = FirebaseFirestore.instanceFor(app: app);
// Установить до любого чтения. Никаких защищённых файлов/offline bundle.
privateDb.settings = const Settings(persistenceEnabled: false);
final user = auth.currentUser ?? (await auth.signInAnonymously()).user!;
final grant = privateDb.collection('priestDeviceGrants').doc(user.uid);
await grant.set({
  'uid': user.uid, 'status': 'active', 'deviceName': 'Flutter',
  'client': 'Flutter', 'platform': platformName, 'label': label,
  'activatedAt': FieldValue.serverTimestamp(),
  'lastActiveAt': FieldValue.serverTimestamp(), 'revokedAt': null,
  'activationProof': priestCodeProof(inputCode),
});
final status = await grant.get(const GetOptions(source: Source.server));
if (status.data()?['status'] == 'active') {
  final texts = await privateDb.collection('priestProtectedPrayers')
    .get(const GetOptions(source: Source.server));
  // Объединить тексты с публичным набором в памяти; не сохранять на диск.
}
```

Не повторять `set()` уже существующего grant: сначала получить статус; Rules
не разрешают перезапись защищённых полей. Не использовать offline `get()` по
умолчанию для статуса или защищённых текстов.

Общая нормализация версии 3, реализована в `src/utils/priestCode.mjs`:

- До преобразования регистра разрешены только ASCII `A–Z`, `a–z`, `2–9`,
  дефис `-`, пробел, табуляция, CR, LF.
- Удалить ASCII пробел/табуляцию/CR/LF **только с краёв**.
- Преобразовать ASCII буквы в верхний регистр.
- Проверить безопасный алфавит и дефис. Начальный, конечный или двойной дефис
  недопустим. Внутренние пробелы недопустимы.
- Удалить дефисы, проверить длину 24–64, SHA-256 UTF-8/ASCII байтов;
  результат — 64 символа hex в нижнем регистре.

```dart
String? normalizePriestCode(String value) {
  if (!RegExp(r'^[A-Za-z2-9\- \t\r\n]*$').hasMatch(value)) return null;
  final code = value.replaceAll(RegExp(r'^[ \t\r\n]+|[ \t\r\n]+$'), '')
    .toUpperCase();
  if (!RegExp(r'^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9-]+$').hasMatch(code)
      || code.startsWith('-') || code.endsWith('-') || code.contains('--')) {
    return null;
  }
  final normalized = code.replaceAll('-', '');
  return normalized.length >= 24 && normalized.length <= 64 ? normalized : null;
}
String priestCodeProof(String input) {
  final code = normalizePriestCode(input);
  if (code == null) throw const FormatException('INVALID_CODE');
  return sha256.convert(utf8.encode(code)).toString();
}
```

Общие синтетические векторы: `shared/priest-code-vectors.json`. Это тестовые
значения, не production код. Вектор `A2B3-C4D5-E6F7-G8H9-J2K3-L4M5` даёт
`167b5694448f5252986a273bbd698017c713fef7a1ed7244b09294d4181c7a13`.

Ошибки SDK: `permission-denied` при неверном/заменённом proof, чужом UID,
отозванном grant, неподдерживаемом изменении; `unavailable` без сети;
`auth/operation-not-allowed` если Anonymous выключен;
`auth/too-many-requests` при ограничении Auth. Не сообщать пользователю
приватные поля. Потерю сети трактовать как отсутствие онлайн-доступа, не как
доказательство административного отзыва.

Административный SDK-контракт: settings get/set только управляющему; создание
нового proof + `changedAt: serverTimestamp()`; помощь сохраняется атомарно в
settings и публичную проекцию; реестр — query по ID, страницы 100 записей;
редактирование label <=120; отзыв — update status/revokedAt. Клиентская UI
проекция реестра никогда не содержит proof.

## Атомарное редактирование и миграция

`prayerStoragePlan.mjs` вычисляет один набор документов на основе существующих
коллекций и связей. Админка читает все четыре коллекции из memory Firestore,
проверяет общую версию до/после и выполняет transaction с проверкой версии.
Перемещения set/delete и увеличение `priestContentControl/state.version`
коммитятся вместе. Rules требуют обновления версии для каждого content-write
и запрещают прямую запись закрытых флагов в публичные коллекции.
Предел интерфейса — 400 документных операций, 7 MB сериализованных UTF-8
данных; контрольная запись дополнительная. 400 операций проверены в Emulator.
Большие изменения отклоняются с инструкцией выполнить проверенную миграцию.
Чтение полного набора при редактировании расходует квоту; пользовательский
публичный кеш остаётся прежним по принципу работы.

Другие Admin SDK скрипты/Console обходят Rules. При работе с молитвами они
должны использовать этот же план/версию и уважать блокировку. Старые импорты,
которые напрямую пишут `priestOnly: true` в `prayers`, применять нельзя.

`npm run db:migrate-priest-access -- --snapshot <dir>` — только локальный
dry-run. Повторите `--snapshot`, если коллекции в разных снимках одного
проекта. Приватные данные не копируются в public/. Отчёт
`reports/priest-access/migration.json` содержит ID/количество/отпечаток,
без текстов и proof. Нужен явный снимок **каждой из четырёх коллекций**,
включая реально пустые защищённые коллекции. Отсутствующая коллекция не
считается пустой. Несовпадающие снимки/повторяющиеся ID отклоняются.

Применение (только после отдельного согласия владельца):

```text
npm run db:migrate-priest-access -- --snapshot backups/priest-current --apply --approve-digest <digest из отчёта> --protected-rules-confirmed
```

Apply проверяет project ID и совпадение живых данных со снимком, создаёт
приватную резервную копию исходных коллекций/settings/grants в `backups/`,
повторно проверяет состояние в transaction и устанавливает migration lock.
ID, тексты, неизвестные поля, собственные флаги и временные метки сохраняются;
settings и grant не переписываются. Малый перенос атомарен.

Для большой миграции нужен дополнительный `--allow-maintenance`. Сначала
удаляются исходные документы из публичных коллекций (временно пустой онлайн
каталог), затем записываются защищённые цели, затем только разрешённые
публичные документы. Кеш публичных офлайн-данных пользователей не удаляется.
Пакеты <=200 операций/7 MB; каждый пакет атомарно сохраняет серверный прогресс.
При сбое lock остаётся: не разблокировать и не публиковать final Rules вслепую.

```text
npm run db:migrate-priest-access -- --apply --protected-rules-confirmed --resume backups/priest-access/<nonce>.json
```

Resume проверяет project/lock/progress и ожидаемое содержимое коллекций по
резервной копии. Неожиданное стороннее изменение останавливает процесс для
ручного восстановления. После полной проверки разделения lock снимается.
Резервная копия содержит приватные тексты/секреты: хранить защищённо, не
коммитить, не передавать в публичные отчёты или экспорт.

Политика переноса может задаваться локальным JSON через `--policy <file>`:

```json
{
  "categoryFlags": [{ "id": "category-id", "priestOnly": true }],
  "mustRemainPublic": ["mass-prayer-id"]
}
```

Политика меняет только явно указанные собственные флаги категорий; остальные
собственные признаки сохраняются. Если обязательная публичная молитва исчезнет
или попадёт под ограничение, dry-run отклоняется. Digest для подтверждения
связывает исходный снимок и политику; `sourceDigest` отдельно проверяет, что
живые данные не изменились. Перед apply нужен новый отчёт с той же политикой.

Проверку манифеста можно ограничить затронутыми публичными коллекциями:
`npm run content:manifest -- --collection prayers --collection prayerCategories`.
Читаются только выбранные коллекции и их опубликованные hashes, остальные
коллекции/версии манифеста сохраняются. Начальная публикация частичного
манифеста запрещена. Ограничения SAFE/MASS/SCHEMA действуют без изменений;
этот режим не разрешает обходить отказ публикации.

## Порядок публикации

1. С отдельного согласия подтвердить свободную квоту и получить фактические
   Rules и свежие приватные снимки четырёх content-коллекций, settings/реестра.
   Не запускать live audit/refresh автоматически. Проверить уже выпущенные
   Flutter bundles и состояние ранее использованного backend.
2. **Сначала защита новых private namespaces.** Подготовить промежуточные
   Rules, сохраняя фактические текущие разрешения публичного чтения. Все новые
   private match исключить из любых catch-all. Если текущие Rules уже позволяют
   public read, не добавлять блокировку публичных коллекций.
   Если прежние Rules из 7c40779 уже закрыли эти коллекции, не открывать их,
   пока закрытые тексты физически не перенесены.
   `node scripts/prepare-priest-rules.mjs --source <reviewed-current.rules>
   --out reports/priest-access/staged.rules` помогает для явных простых
   read-policies; для иных политик останавливается и требует ручного merge.
   Проверить **весь diff**, другие административные права и старый Flutter.
   Нельзя просто развернуть финальный `firestore.rules` поверх неперенесённых
   закрытых документов: `allow read: true` откроет их.
3. Проверить dry-run, подтвердить перенос, выполнить apply с приватной копией.
   Все поддерживаемые web writers заблокированы на время миграции; Console и
   сторонние Admin SDK writers необходимо остановить на время обслуживания.
4. Проверить четыре коллекции: ни одного эффективного закрытого текста в
   публичных; каждый исходный ID существует ровно в одном правильном месте,
   тексты/собственные признаки сохранены. Протестировать старый Flutter
   прямыми анонимными queries, включая доступ к публичным данным.
5. Только теперь согласовать публикацию final Rules с публичным read,
   включить Anonymous Auth, опубликовать Hosting. Нет Functions deployment.
   Утверждённые команды владельца: `firebase deploy --only firestore:rules`
   и `firebase deploy --only hosting`. История фактических публикаций ниже.
6. После content writes обязательна `npm run content:manifest` (diff/валидация).
   Только SAFE CONTENT PATCH разрешает `-- --apply`; массовое перемещение/
   schema change — `npm run content:app-release`, новый bundle и выпуск Flutter
   по `docs/app-content-distribution.md`, без обхода защит публикации.

Argon2 codeHash старой версии нельзя преобразовать в SHA-256 proof без исходного
кода; старый код 12 символов не подходит. Создать новый 24-символьный код в
админке. Старые UUID/secretHash grants не доказывают владение новым Firebase UID:
автоматическая конвертация небезопасна. Они сохраняются (включая backup и
реестр), но если старый backend уже использовался, установкам нужна однократная
новая активация Spark. Не выдавать старую запись за действующий новый grant.
При обычных последующих заменах Spark кода повторная активация не нужна.

## Действия владельца в Firebase Console

1. Оставить проект на **Spark**: не включать Blaze и не добавлять карту.
2. Authentication → Sign-in method → Add new provider → **Anonymous** →
   Enable → Save. В Settings → Authorized domains проверить реальные домены
   Hosting/приложения. В рабочем браузере нужны HTTPS/localhost и Web Crypto.
3. Если используется Authentication with Identity Platform, оставить
   **automatic cleanup of anonymous accounts OFF**: функция удаляет аккаунты
   старше 30 дней. Уже назначенное удаление может не отмениться при выключении,
   проверить существующую настройку до активаций.
   [Официальная инструкция](https://firebase.google.com/docs/auth/web/anonymous-auth).
4. Firestore → `admins` → документ нужного существующего admin UID → поле
   boolean `priestAccess: true`. Не предоставлять это право Anonymous UID.
   Bootstrap администраторы уже имеют доступ.
5. Firestore → Rules: согласованный staged/final порядок выше. Не включать TTL
   для grants, плановую ротацию или платные функции.
6. В админке «Доступ для святароў»: сгенерировать код, подтвердить, скопировать
   из разового показа; заполнить «Дзе атрымаць код?» при необходимости.
   Для конкретной установки выбрать «Адклікаць доступ» с подтверждением.

## Кеши, старый Flutter и пределы гарантий

Публичный контент сохраняется в прежнем explicit IndexedDB кеше, новая запись
`prayer-content,3`; старый офлайн-кеш используется с фильтрацией ограничений.
Основной публичный Firestore cache сохранён. Защищённые SDK-инстансы memory-only,
все protected queries server-only. PWA Firestore/Auth/securetoken — NetworkOnly;
activate очищает старые `firestore-api`/`firebase-auth` runtime caches.
Sentry network details Firestore/Auth запрещены, чувствительные UI blocks
закрыты от replay. Публичные bundle/manifest используют allowlist коллекций и
общую policy, без settings/grants/защищённых текстов.

Без сети закрытые тексты убираются из состояния приложения. При потере Auth
после очистки браузера/переустановки нужна новая установка; старый grant остаётся
в реестре для ручного отзыва. Доступ не обещается независимо от этих событий.
Уже прочитанное до отзыва нельзя стереть с чужого устройства. Материалы,
ранее выпущенные публично в Flutter bundle/старые дисковые кеши, тоже нельзя
гарантированно отозвать. Для нового секретного материала сначала включить
закрытый статус и сохранить, затем вводить текст.

## Проверки и файлы

Живая проверка 12.10.2026: Anonymous включён, automatic cleanup выключен.
Прежние Rules от 01.10.2026 открывали все коллекции кроме admins, поэтому
сначала опубликованы и проверены защищающие Rules. С разрешения владельца
категория «Для святара» (`gMzVAGRUogiZa2MAxpr4`) переведена в закрытую:
20 молитв и категория перенесены 42 атомарными операциями. Всего сейчас
85 публичных и 21 защищённая молитва, 4 публичных и 1 защищённая категория.
Все 106 ID, тексты, остальные поля и собственные флаги молитв сверены с
резервной копией и сохранены. Три варианта Імшы остались публичными.

На production через реальный Auth и Firestore client SDK проверены создание
кода, неверный код, Anonymous регистрация, получение защищённых текстов,
восстановление credentials/обновление token, смена кода без отзыва, отклонение
старого кода, Web/Flutter payload, реестр/подпись/индивидуальный отзыв и
отключение пользователем. Node SDK проверялся через HTTPS Firestore Lite:
gRPC на этой машине вернул ошибку transport framing. Это не тест нативного
Flutter приложения и не live-тест realtime listener; UI/realtime проверялись
отдельно в эмуляторе. На опубликованном сайте без доступа прямая закрытая
ссылка показывает отсутствие молитвы, публичная Імша открывается.

Тестовые Auth accounts/временный admin role удалены; четыре собственных
отозванных test grants удалены после приватного backup. Контакт/helpText и
реальные устройства не изменены. Проверочные коды не предназначены для
распространения: рабочий код нужно сгенерировать и скопировать в админке.
Активный code proof закрыт Rules. В SDK отключён вывод диагностических payload:
при отказах REST SDK способен выводить поля запроса, включая proof.

Манифест проверен только для prayers/prayerCategories: `MASS CONTENT REBUILD`
(85 changed + 21 removed prayers, 4 changed + 1 removed categories, 1.6 MB).
Публикация патча не выполнена и guard не обходился. Требуется новый Flutter
bundle/app release; старые офлайн-установки могут содержать ранее публичные
тексты. Server/web доступ уже защищён. После отдельного согласия владельца
12.10.2026 опубликован Hosting из коммита `be44868`:
`https://ibreviaryby.web.app`, entry `/assets/index-C2tOKbR9.js`.
Проверены HTTP 200 для HTML, JavaScript и service worker; на новой сборке
в браузере проверены настройки активации, отказ по закрытой прямой ссылке
и общедоступная Імша. При обновлении PWA браузер сначала использовал прежнюю
сборку; после повторного открытия страниц загрузилась новая версия.
Артефакты: `backups/priest-live-20261012`,
`backups/priest-access/d89eb999-5749-4b81-a217-fad0ef133350.json`,
`reports/priest-access/live/functional-results.json`,
`reports/priest-access/live/hosting-deployment.json`,
`reports/content/manifest-diff.json`. Все приватные backups/reports игнорируются
Git; реальные proof/credentials не включаются в этот документ.

Повторная проверка 12.10.2026: priest tests — 18 passed, 2 emulator-only
skipped вне эмулятора; Rules/миграция в эмуляторе — 17/17, UI — PASS
(разделение Auth, сохранение доступа, активация/отключение, смена кода,
реестр/подписи/отзыв, перенос категории, desktop и 320/390 px).
App-content/scoped manifest tests — 17/17. Линтинг и production/PWA build
успешны; прежние предупреждения о крупных chunks остаются.

Проверка этой реализации (Windows, 11.10.2026): Rules regression — 22/22,
интеграция Rules/миграции — 16/16; реальный UI прошёл Auth separation/reload,
активацию/отключение, отзыв/подписи, одновременную смену кода и инструкции,
перенос категории, desktop и 320/390 px. Отдельный набор priest — 15 passed,
2 emulator-only skipped вне эмулятора. Полный набор — 679 tests:
674 passed, 2 skipped, 3 прежних Windows-сбоя Ordo (`ordo-definitions` —
CRLF/LF в проверке generated snapshot; две проверки `ordo-screen` —
Windows separators). Линтинг без исправлений и production/PWA build успешны;
сборка предупреждает о прежних крупных chunks.

Исторический локальный dry-run 11.10.2026: 85 молитв; категория и обе
защищённые коллекции не покрыты. Отчёт —
`reports/priest-access/local-snapshot-dry-run.json`. Он неполный и **не является
разрешением на apply**; на этом этапе свежие live reads, production миграция,
manifest publication, Console changes и deploy не выполнялись. Последующий
согласованный production перенос и Hosting deploy описаны выше.

`npm run test:priest` — policy/план/кеш/нормализация/миграция (emulator тесты
вне emulator пропускаются). `npm run test:priest:rules` — Auth+Firestore Emulator,
Rules, 400-operation commit, 550-document migration с прерыванием/resume,
реальные Vue/Auth SDK UI desktop/320/390. Нужны Firebase CLI, Java 21+, Chrome
или `BENCHMARK_BROWSER_PATH`. Все integration checks используют `demo-rules`
и localhost; live Firestore в них запрещён. `npm run smoke:priest` используется
внутри этих emulators. `node node_modules/eslint/bin/eslint.js .` проверяет без
автоисправления; `npm run build` собирает production.

Основные изменённые файлы:

- `firebase.json`, `firestore.rules`, `package.json`, `.gitignore`, `vite.config.js`.
- `src/plugins/priestFirebase.js`, `src/plugins/sentry.js`.
- `src/utils/priestCode.mjs`, `priestPolicy.mjs`, `prayerStoragePlan.mjs`,
  `primeContentCache.js`; `shared/priest-code-vectors.json`.
- `src/services/priestAccessService.js`, `prayerContentService.js`,
  `prayerStorageService.js`, `prayerService.js`, `prayerCategoryService.js`.
- `src/stores/prayers.js`, `src/layouts/admin/Admin.vue`,
  `src/views/admin/PriestAccess.vue`, `PrayerCategories.vue`,
  `src/components/prayers/PrayersList.vue`.
- `public/priest-cache-cleanup.js`, `scripts/content/lib/app-content.mjs`,
  `scripts/migrate-priest-access.mjs`, `scripts/prepare-priest-rules.mjs`,
  `scripts/test-priest-emulator.mjs`, `scripts/smoke-priest-ui.mjs`.
- `tests/priest-*.test.mjs`, `tests/firestore-rules/rules-emulator.mjs`,
  `tests/prayer-copy.test.mjs`, `tests/ui/priest-harness.mjs`,
  `functions/README.md`, этот документ.
