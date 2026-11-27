# Firebase App Check для «Малітоўніка»

Проект Firebase `ibreviaryby` (`344097781816`), Blaze. На 27 ноября 2026 г.
Cloud Billing активен, Firestore App Check в режиме `UNENFORCED`. Web App
зарегистрирован с reCAPTCHA Enterprise и TTL 1 час, в GitHub есть переменная
`VITE_FIREBASE_APP_CHECK_SITE_KEY`. При выпуске проверьте, что production Web
получает токен. Состояние регистрации само по себе этого не подтверждает.
Цель первого релиза — выпуск клиентов и наблюдение за успешностью аттестации.
Параллельные изменения приложения описаны в [инструкции Flutter][flutter].

## Точки доступа

| Клиент | Использование |
| --- | --- |
| Web `[DEFAULT]` | Firestore с публичным кэшем для Библии, молитв, Песенника, Кампендыя, календаря, Часов и чтений. Firebase Auth и Firestore для роли, черновиков и редакторов. |
| Web `mybrev-priest` | Отдельный анонимный Auth. Firestore Lite для активации, обычный Firestore с памятью для грантов и защищённых текстов. |
| Web `mybrev-priest-editor` | Отдельный Auth с копией пользователя-администратора только в памяти. Firestore и Lite для защищённых редакторских операций. |
| Flutter `[DEFAULT]`, `mybrev-priest` | Обновления контента, вход администратора для Песенника, отдельная анонимная сессия и Firestore для священников. Активация App Check для обоих экземпляров подготовлена в [Flutter PR #146][flutter-pr]. На 27 ноября PR открыт. |
| Worker обратной связи | Для каждой админской операции проверяет ID-токен и читает `admins/{uid}` через Firestore REST с этим токеном. Web передаёт App Check, Worker пересылает его в Firestore. Публичная отправка использует D1. |
| Firebase Admin SDK | Скрипты экспорта/публикации и серверный `priestApi` используют сервисные аккаунты и IAM. Для HTTP-функций и других внешних API защита App Check настраивается отдельно. |

Отдельные Web-экземпляры наследуют Firebase App ID, но устанавливают
App Check каждый на своём экземпляре до создания Firestore и Auth.
Клиенты священника и редактора создаются при первом использовании, чтобы
публичный запуск не инициировал три аттестации. При блокировке скрипта
reCAPTCHA ожидание токена ограничено. Локальная сборка с пустым ключом
подходит для emulators. Debug provider в приложении не настраивается.
Авторизацию и роли по-прежнему проверяют Auth, Firestore Rules и Worker.

### Статус `contentManifest`

[Web PR #310][pr310] вошёл в `origin/main` как `c1359b02`.
В [запуске Hosting после merge][hosting310] шаг Deploy Firestore rules
пропущен. Проверка через Firebase Rules API после слияния показала, что
release `cloud.firestore` на 23 ноября, 18:03 МСК, совпадал
с `firestore.rules` из этого коммита и разрешал публичное чтение
`contentManifest`. Для этого изменения повторная публикация
правил не нужна. Доступ к документам и обновление на устройстве проверяются
отдельно в smoke. Доступность манифеста зависит и от App Check после
возможного включения Enforcement.

## Действия владельца перед релизами

1. Откройте [Firebase → Project settings][settings] и выпишите активные
   Firebase App ID и используемые домены. В [App Check → Apps][console]
   сопоставьте регистрацию с каждым App ID, который реально обращается к
   Firestore. Актуальные идентификаторы Android/iOS и Flutter Web
   приведены в [инструкции Flutter][flutter]. Названные экземпляры Firebase
   с одинаковым App ID используют одну регистрацию.
   В проекте также числятся два прежних активных App ID с идентификатором
   пакета/bundle `com.example.ibrevapp` (Android и iOS). Сверьте их
   реальное использование с историей выпусков и метриками перед
   любым решением об Enforcement.
2. В [Google Cloud → reCAPTCHA][captcha] выберите `ibreviaryby`,
   включите API по запросу и создайте **Website / Score based** key с
   проверкой доменов. Добавьте `malitounik.by`, `www.malitounik.by` и
   фактически используемые Firebase Hosting или другие имена хостов.
   Для тестового проекта и preview-доменов используйте отдельный ключ.
   В [App Check → Apps][console] выберите каждое соответствующее Web App,
   затем **Register → reCAPTCHA Enterprise**, укажите публичный site key,
   сохраните. Начальная точка — стандартные TTL 1 час и порог 0,5.
   Сверьте объём assessments и стоимость в Cloud Billing после запуска.
   При отдельном согласовании TTL 6 часов автоматическое обновление для
   длительной сессии происходит примерно раз в 3 часа вместо 30 минут.
   Первая аттестация в сессии остаётся, а срок действия перехваченного
   токена увеличивается до 6 часов. Сравните объём assessments и ошибки
   аттестации при сопоставимом трафике. Для отката верните TTL 1 час.
   [Настройка Web App Check][web-provider]
3. В GitHub Web-репозитория откройте **Settings → Secrets and variables
   → Actions → Variables → New repository variable**, задайте
   `VITE_FIREBASE_APP_CHECK_SITE_KEY`. Для локальной Web-сборки укажите
   переменную в `.env.local`. Для самостоятельной сборки Flutter Web
   передайте соответствующий ключ через
   `--dart-define=FIREBASE_APP_CHECK_SITE_KEY=<публичный-site-key>`.
4. В Play Console для `by.mybrev.playtest2026` откройте **App integrity →
   Play Integrity API → Link Cloud project**, выберите `ibreviaryby`.
   Из **App signing** возьмите SHA-256 Play App Signing, а SHA-256
   прямого APK проверьте через `apksigner verify --print-certs <file.apk>`.
   Сверьте их в Firebase **Project settings → General → Your apps →
   Android → Add fingerprint**. В **App Check → Apps → Android** зарегистрируйте
   Play Integrity. Для смешанной дистрибуции начните с рекомендации Firebase:
   `PLAY_RECOGNIZED` требуется, `LICENSED` не требуется, дополнительный
   уровень device integrity явно не задан. Отдельно подтвердите, что
   подписанный прямой APK получает `PLAY_RECOGNIZED`. Один только SHA-256
   в Console не гарантирует этот вердикт. [Play Integrity][play-provider]
5. В Apple Developer в **Certificates, Identifiers & Profiles → Identifiers**
   проверьте App ID `by.mybrev.testflight2026`, команду и App Attest
   capability в Xcode. Обновите профиль для TestFlight/App Store и
   проверьте production-entitlement подписанной сборки. В Firebase
   **Project settings → General → Your apps → iOS** проверьте Apple Team ID,
   затем зарегистрируйте App Attest в **App Check → Apps → iOS**.
   Для DeviceCheck в **Apple Developer → Keys** подготовьте ключ с
   разрешением DeviceCheck, затем зарегистрируйте DeviceCheck для этого
   же Firebase App с `.p8`, Key ID и Team ID. Передавайте `.p8` только
   владельцу через разрешённый канал и загружайте только в Firebase Console.
   [App Attest][attest] · [DeviceCheck][devicecheck]
6. Во вкладке **App Check → APIs → Cloud Firestore** оставьте
   `UNENFORCED` на весь этап регистрации и выпуска.

## Порядок выпуска и проверки

1. Соберите и проверьте staging на отдельном Firebase-проекте с теми же
   провайдерами и тестовыми данными. Проверьте первоначальный токен,
   повторный запрос после обновления токена, блокировку reCAPTCHA и
   восстановление связи. Используйте Network и график App Check.
   Не сохраняйте значения токенов в логах и скриншотах.
2. После отдельного разрешения на production сначала обновите Worker
   обратной связи по [его runbook](feedback-operations.md) с сохранением
   существующих D1 bindings и секретов. Проверьте preflight для
   `authorization, x-firebase-appcheck`, `/api/admin/me`, список, детали
   и экспорт под обеими ролями. Старый Worker не разрешает новый
   заголовок CORS. До подтверждения Worker оставьте Web site key пустым.
3. После отдельного разрешения запустите Hosting с проверенным SHA
   и Web site key. Передайте `published_catalog_sha256` с проверенным
   SHA-256 файла `public-prayers-v1.json`, если выпуск повторно
   использует каталог с Hosting. При несовпадении контрольной суммы
   публикация остановится. Такой выпуск не читает коллекции Firestore.
   Порядок и выбор цели описаны в [runbook](firebase-production-release.md).
   Убедитесь, что новый бандл загружен в чистом и обновлённом PWA.
4. В согласованных Android/iOS релизах проверьте свежую установку и
   обновление: Google Play, прямой APK, TestFlight/App Store, Flutter Web
   при наличии поддерживаемого развёртывания. Порядок и отличия подписей
   описаны в [инструкции Flutter][flutter].
5. Для каждого канала проверьте публичный контент с чистого кэша,
   админский вход и роли, доступ священника по новому коду и по
   сохранённому гранту, сброс/повторное открытие и офлайн-режим.
   Во Flutter проверьте реальное чтение `contentManifest/current` и
   манифеста коллекции и загрузку патча на staging. На production при
   разрешении ограничьтесь одиночными контролируемыми smoke-запросами.

## Решение об Enforcement

- Наблюдайте **Cloud Firestore** во вкладке **App Check → APIs**
  минимум 14 дней после доступности новых версий во всех поддерживаемых
  каналах. Сопоставляйте verified/unverified, причины, ошибки приложений,
  метрики обновления в магазинах и результаты по прямому APK. График
  запросов не определяет версию каждого клиента или канал установки.
  [Метрики App Check][metrics]
- Предлагаемый порог для согласования — не менее 99,5% verified среди
  распознаваемого штатного трафика за этот период и успешный smoke всех
  поддерживаемых каналов. Разберите легитимные unverified-запросы
  отдельно. Если старые клиенты на поддерживаемой версии, прямые APK,
  администраторы или священники ещё теряют доступ, оставьте
  `UNENFORCED` до исправления или согласованного перехода. Flutter с
  бандлом продолжит офлайн-чтение, но Firestore-патчи и серверные
  сценарии требуют действительного токена после Enforcement.
- Испытайте Enforcement в staging, подтвердите совместно время окна,
  ответственного и rollback. Только после отдельного согласия владельца
  откройте **App Check → APIs → Cloud Firestore → Enforce**. Это изменение
  на уровне продукта для проекта. Authentication и другие продукты
  рассматривайте отдельно. [Включение Enforcement][enforcement]
- Сразу повторите канальный smoke, отслеживайте `PERMISSION_DENIED`,
  сбои обновления контента и `role_check_unavailable`. При отказе штатного
  сценария верните **Cloud Firestore → Unenforce** и подтвердите
  восстановление. Firebase предупреждает, что включение может
  распространяться до 15 минут.

[flutter]: https://github.com/senddownrain/ibreviarybyapp/blob/79461e93d02503a1f1f85ed2e5dc4d0e08ab2e40/docs/firebase-app-check.md
[flutter-pr]: https://github.com/senddownrain/ibreviarybyapp/pull/146
[pr310]: https://github.com/senddownrain/mybrev/pull/310
[hosting310]: https://github.com/senddownrain/mybrev/actions/runs/45200273970
[settings]: https://console.firebase.google.com/project/ibreviaryby/settings/general
[console]: https://console.firebase.google.com/project/ibreviaryby/appcheck
[captcha]: https://console.cloud.google.com/security/recaptcha?project=ibreviaryby
[web-provider]: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
[play-provider]: https://firebase.google.com/docs/app-check/android/play-integrity-provider
[attest]: https://firebase.google.com/docs/app-check/ios/app-attest-provider
[devicecheck]: https://firebase.google.com/docs/app-check/ios/devicecheck-provider
[metrics]: https://firebase.google.com/docs/app-check/monitor-metrics
[enforcement]: https://firebase.google.com/docs/app-check/enable-enforcement
