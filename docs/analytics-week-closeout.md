# MyBrev Analytics — финальная передача владельцу недели R00–R06 (`analytics-week-closeout.md`)

Шаблон: `06_OWNER_HANDOFF.md` пакета «продолжение из P09». Это **R06** (сквозная приёмка), продолжение R00 (#167, `docs/analytics-continuation/STATUS.md`), R01 (#168/#170/#171/#158), R02 (#169), R03 (#172), R04 (Flutter #40), R05 (#173). Реальный сбор у пользователей **OFF**; production Firebase/Firestore/Cloudflare/Sentry/магазины не затрагивались; юридических выводов здесь нет.

```
STATUS:        STAGING_BLOCKED_BY_ACCESS  (рабочий локальный HTTP fallback, сквозной прогон PASS)
NOT DECLARED:  STAGING_OPERATIONAL (нет Cloudflare-аккаунта проекта), LIVE_REPORTING
LIVE NETWORK:  OFF  (обычные сборки WEB и Flutter не содержат адреса и не шлют ничего — доказано, §7)
MERGED:        ничего из R00–R06 не слито, ничего не развёрнуто, в Cloudflare ничего не создавалось
NOT TESTED:    Cloudflare D1/Workers/Access, Android (эмулятора на машине нет), физические устройства, производительность на устройстве
```

## 1. Дата, SHA, PR, кто проверял

Дата: **2026-10-27**. Проверял: Claude (сессия R06, по заданию разработчика); результаты воспроизводимы командами §7. Разработчик должен повторить «10 минут» (§12).

| Репозиторий | `main` | Интеграционное дерево R06 (локальное, **не опубликовано**) |
|---|---|---|
| WEB `senddownrain/mybrev` | `dc45801928a45edc49cf6da97d73c4407ca0ac97` | `83e0f5c` = `main` + #167 + #168 + #170 + #171 + #158 + #169 + #172 + #173 |
| Flutter `senddownrain/ibreviarybyapp` | `bb3afd3745f539405a680002a12b7b3768238e92` | `01cf3a6` = `main` + #40 (main уже внутри) |

| PR | Что | head | base | CI на head |
|---|---|---|---|---|
| WEB [#167](https://github.com/senddownrain/mybrev/pull/167) | R00 STATUS | `ffa0e73` | main | Lint & Build ✅ |
| WEB [#168](https://github.com/senddownrain/mybrev/pull/168) | тест reading-choices по D-1 (#165) | `20cd4c9` | main | ✅ |
| WEB [#170](https://github.com/senddownrain/mybrev/pull/170) | тест marian-feast-references (#141) | `46090f2` | main | ✅ |
| WEB [#171](https://github.com/senddownrain/mybrev/pull/171) | CI Lint & Build на Node 22 | `189f1d5` | main | ✅ |
| WEB [#158](https://github.com/senddownrain/mybrev/pull/158) | Sentry B (только ошибки) | `b819200` | main | ✅ |
| WEB [#169](https://github.com/senddownrain/mybrev/pull/169) | R02 Worker + D1-адаптер + контракт | `9012cfd` | main | Ingest (Node 24) ✅, Lint & Build ✅ |
| WEB [#172](https://github.com/senddownrain/mybrev/pull/172) | R03 WEB-клиент (QA-only) | `023bbf5` | ветка #169 | Ingest ✅ (Lint & Build не запускается для не-main base) |
| WEB [#173](https://github.com/senddownrain/mybrev/pull/173) | R05 read-API + панель | `9b8ee53` | ветка #169 | Ingest ✅ (то же) |
| Flutter [#40](https://github.com/senddownrain/ibreviarybyapp/pull/40) | R04 QA-транспорт | `01cf3a6` | main | analyze ✅, Analytics tests ✅ |

Все — Draft. Ни один не слит. CI-статусы сняты `gh pr view` 2026-10-27; **GitHub CI на объединённом дереве не запускался** (дерево локальное) — вместо него локальные прогоны §7.

## 2. Статус и почему

**`STAGING_BLOCKED_BY_ACCESS` + рабочий локальный HTTP fallback.** Причина: нет Cloudflare-аккаунта проекта (R02: `R02-STAGING-BLOCKED-CREDENTIALS`; единственная wrangler-сессия — личный аккаунт без прав создания). Поэтому **не** доказано: реальный D1 (семантика batch, `rows_written` в биллинге, лимиты Free), реальный Cloudflare Access, реальный HTTPS-хост. Доказано: тот же код Worker (`worker/src/index.mjs`, `reports-worker.mjs`) на настоящем сетевом HTTP (loopback), хранилище SQLite-шим с интерфейсом D1 и тот же Worker в workerd с локальной D1 (R02/R05, §7). Не подменяется «офлайн-моком»: каждое число ниже прошло через TCP-запрос → Worker → SQL → чтение API панели.

## 3. Что было до этой недели (не засчитывается в R00–R06)

P00–P09 слиты в `main` (см. `docs/analytics-continuation/STATUS.md` §2): контракт v2 и golden parity, локальные коллекторы WEB/Flutter, `sd=fit`, офлайн-ядро приёма и k-отчёт (P06), mock consent/transport (P07, не смонтирован в UI), синтетическая панель (P08), e2e `analytics:e2e` (P09).

## 4. Чем реально отвечает система (сквозной прогон R06, **synthetic**)

Сценарий (2026-10-27, всё на loopback; скриншоты `docs/analytics-evidence/r06/screenshots/`):

1. WEB QA-сборка (`VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true`, браузерная панель) отправила **один** закрытый день `2026-10-26`: `POST :8788/v2/ingest → 204`. Пакет — вручную заданные счётчики (коллектор дедуплицирует повторы, поэтому n≥5 набрать «кликами» нельзя; числа — **не поведение людей**): `screen_view prayers`=7, `catalog_open songs`=6, `text_read fv/sd/er`=6/6/6, `feature_use theme_change`=5, сумма n = 36.
2. Сервер записал 6 строк, `sum(n)=36` — совпало с клиентом.
3. Flutter iOS Simulator (iPhone 16, QA-сборка с `ANALYTICS_STAGING_URL=http://127.0.0.1:8788`): реальные запуски приложения и открытие «Ютрань» → при уходе в фон пакеты `platform=ios` (`app_version=1.0`) пришли на сервер (204). Пять запусков → `screen_view today`=5 (запуск ≠ человек).
4. Панель (отдельный reports-Worker, вход через **локальный симулятор Access, не Cloudflare**) показала:

| Фильтр | Результат на панели | Ожидание |
|---|---|---|
| все платформы, 7 дней | «≥ 12 открытий экранов»: молитвы ≥7 (web), сегодня ≥5 (ios); каталог «Песни» ≥6; `theme_change` ≥5; топ — публичная молитва `prayer:0AAlyUXOjOtzbPdt3Gql` ×7 | 7 + 5 = 12 ✅ |
| ios, 7 дней | «≥ 5», раздел «Сегодня» ≥5; остальное скрыто (n<5) | 5 ✅ |
| web, 7 дней (API JSON) | prayers 7, songs 6, fv/er/sd 6, theme_change 5 | ✅ точно по отправленному |

k-подавление на практике: остальные iOS-ячейки (песня, «Ютрань», `fv/er/sd`, n=1) на панели **не видны**, хотя в базе есть (`d1-compatible-cell_counts.csv`). Платформа различается только меткой `platform`, не идентификатором. Один побочный эффект, уже описанный в R05: рейтинг материалов объединяет платформы (фильтр `ios` показывает ту же публичную молитву из web) — так задумано.

**Что это даёт для решений**: только демонстрация, что панель отвечает на вопросы «какие разделы открывают», «какие каталоги/функции используют», «какие публичные материалы в топе». Выводов о пользователях из этих чисел делать **нельзя** — они сделаны руками/запусками разработчика.

## 5. Чего система НЕ умеет (и не должна)

Считать уникальных людей; ретенцию людей; религиозные интересы или убеждения; закрытый/личный/священнический контент; тексты молитв, запросы поиска, URL; точный факт прочтения (`sd`/`fv` — приблизительные нижние границы); связывать web и мобильные устройства; догонять потерянные пакеты (at-most-once).

## 6. Инфраструктура

| Пункт | Состояние |
|---|---|
| Staging Worker URL | **нет** (blocked). Fallback: `http://127.0.0.1:8788` (ingest), `:8790/:8791` (reports; `:8791` = симулятор Access) |
| D1 database ID | **нет** (не создан) |
| Access/auth | реализовано в коде (R05: JWT `Cf-Access-Jwt-Assertion` или bearer ≥24 символа; ничего не настроено → 401). Реальный Access — NOT TESTED |
| TTL | 90 суток (cron `scheduled()` 03:17 UTC), проектное значение staging |
| Free billing / usage | NOT TESTED (нет аккаунта) |
| Кто имеет доступ | пока только разработчик (локально) |
| Красные флаги | публичный POST без аутентификации (R02 §7); реальный D1 не проверен; `rows_read` панели ≈ числу ячеек окна — на Free проверить |
| Зелёные флаги | `INGEST_ENABLED` по умолчанию false; kill switch без redeploy; панель read-only; секреты вне репозитория |

## 7. Тесты (команды → exit code → SHA)

WEB — дерево `83e0f5c`, Node 24.2.0 (Node 20/22 локально **не** гонялись):

| Команда | Результат |
|---|---|
| `npm run test:analytics-ingest` | exit 0 — **127/127** |
| `npm run test:analytics` | exit 0 — 70 тестов, 69 pass, 0 fail, 1 skip («inventory in sync with bundle», вне R03) |
| `npm run analytics:e2e` | exit 0, `networkAttempts: []`, `privacyScan: []` |
| `npx eslint .` | exit 0 |
| `npm test` (полный) | exit 0 — **1068 тестов, 1057 pass, 0 fail, 11 skip** (с #168/#170) |
| `npm run build` (фейковые `VITE_FIREBASE_*` из `ci.yml`), без флагов | exit 0; **0 вхождений** `127.0.0.1:8788`, `/v2/ingest`, `analytics_staging`, `ANALYTICS_STAGING`, `__analyticsLocal`, `analytics_local_v1` в `dist/` |
| та же сборка с `VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true` | exit 0; `/v2/ingest` только в чанке `stagingTransport` |
| R06-пробы `docs/analytics-evidence/r06/r06-probes.mjs` | **ALL PASS** (43 проверки, `probes-output.txt`) |

Flutter — дерево `01cf3a6`, Flutter 3.41.4:

| Команда | Результат |
|---|---|
| `flutter analyze --no-fatal-infos` | exit 0; 9 info (не новые, `flutter-analyze.txt`) |
| `flutter test test/analytics` | exit 0 — 84 теста |
| `flutter test --dart-define=ANALYTICS_LOCAL=true test/analytics` | exit 0 — 91 тест |
| `flutter test` (полный) | **exit 1: 1460 pass, 9 skip, 1 FAIL** — известный `lectionary_parity_test` (Гродно/Тракай, 2025-07-10, `route-day-id`), блокер владельца контента, **не аналитика** |
| `flutter build ios --simulator --debug` с/без флагов | PASS; без флагов адрес `127.0.0.1:8788` в бинарнике отсутствует (он приходит только из `--dart-define`) |
| `flutter build ios --release --no-codesign` без флагов (AOT, 177 MB) | PASS; в `App.framework/App` по `strings` **0** вхождений `/v2/ingest`, `127.0.0.1`, `HttpStagingTransport`, `StagingSender`, `staging_http`, `ANALYTICS_STAGING`, `analytics_local` (контроль: `mybrev_flutter` — 185, `hive` — 51). В **debug**-сборке без флагов код отправителя и литерал `/v2/ingest` присутствуют (JIT-kernel без tree-shaking), но недостижимы, адреса нет — для «обычной сборки» значим release. Release на устройстве не запускался; подписанный IPA не собирался |

Ручная приёмка:

| Проверка | Результат |
|---|---|
| WEB QA → ingest → SQLite → панель, числа | **PASS** (§4) |
| iOS Simulator QA → ingest → SQLite → панель | **PASS** (§4) |
| Android emulator | **NOT TESTED** — `adb`/эмулятора нет на машине. Команда для разработчика: `adb reverse tcp:8788 tcp:8788 && flutter run --dart-define=ANALYTICS_LOCAL=true --dart-define=ANALYTICS_STAGING=true --dart-define=ANALYTICS_STAGING_URL=http://127.0.0.1:8788`, затем уйти в фон и посмотреть `cell_counts` (`platform=android`) |
| Физические устройства, performance, release на устройстве | **NOT TESTED** |
| WEB OFF-сборка в браузере (порт 4174, 8 с) | `window.__analyticsLocal` undefined, ключей `analytics*` в localStorage нет, ни одного запроса на `:8788`/`ingest` |
| Flutter OFF-сборка на симуляторе (запуск + фон) | журнал ingest не вырос (32 строки до и после), `cell_counts` 16/60 не изменился |
| Регрессия функций | WEB: 1068 тестов (чтения, часы, молитвы) без падений. Flutter: 1460 тестов, единственное падение — Trakai. Экран Литургии часов и «Ютрань» в iOS открылись без ошибок (`screenshots/ios-1-qa-build-matins.png`). Визуальное сравнение «Home/UI с аналитикой и без» — **не делалось** (кроме отсутствия UI: согласия/галочки нет, `consent_mock.dart` не смонтирован — тест-страж) |

Негативные пробы (`probes-output.txt`, все PASS): некорректный JSON, лишние поля `user_id`/`session_id`/`device`, `region≠UNKNOWN`, `content_id`-URL, id вне публичного inventory, свободный текст в корзине, поисковый запрос как `feature_id`, отрицательное/дробное `n`, день старше окна и из будущего, `schema_version 1` → 426, неизвестная платформа, тело 20 КиБ → 413, неверный content-type → 415, GET на ingest → 405; invalid-пробы **не изменили ни одной строки**. Авторизация: report/admin без токена, с неверным токеном, токеном другой роли → 401; панель (страница, API, CSV) без токена/с подделанным `Cf-Access-Jwt-Assertion`/с токеном ingest → 401; неизвестный фильтр → 400; POST на панель → 405. Privacy-скан хранилища: в схеме нет столбцов ip/ua/url/user/device/session/cookie/origin; 16 ключей без URL/IP/UA/e-mail/запросов; `platform ∈ {web, android, ios}`. Логи сервера (`ingest-server-log.txt`) содержат только `code/status/cells`.

Граничные случаи, проверенные **автотестами** R02/R05 (а не R06-ручным прогоном): дедуп-компромисс (повтор = потеря, не двойной счёт); окно 2 суток (`day_out_of_range`, проба R06 — день −10); переполнение счётчика (откат пакета); дневной бюджет D1 у границы (79 990 + 6 → принят ровно один пакет); retention 90 суток; 20 параллельных пакетов — точная сумма; сбой хранилища → 503 в панели. Реальный D1 — NOT TESTED.

**Kill switch ON→OFF** (проверено на сервере и обоих клиентах):

| Шаг | Факт |
|---|---|
| ON | пакет → 204, `cell_counts` +5 |
| `POST /v2/admin/ingest {"enabled":false}` | 200; первый пакет после этого → **503 `ingest_disabled` через 2 мс** (лимит задания — 1 минута); битое тело не разбирается (тоже 503); данные не изменились (16/55 → 16/55) |
| Панель при OFF | читается (200), `intake=switched_off` |
| WEB QA-клиент при OFF | `POST → 503`; `stagingStats: lost=1, paused=1`; ключ паузы 24 ч; день удалён из буфера (**осознанная потеря**, at-most-once), строк в D1 нет |
| Flutter iOS QA при OFF | при уходе в фон `503 ingest_disabled` в журнале, `cell_counts` не изменился; клиент останавливается до конца процесса |
| ON обратно | пакет → 204 |

Клиент «перестаёт отправлять после обновления управляющего флага» — только через ответ сервера 503 (пауза 24 ч / до перезапуска приложения) или сборку без флагов; отдельного удалённого конфига клиента **нет** (в QA-сборках; для live — вопрос release-card).

## 8. Открытые P1/P2

| ID | Sev | Предмет | Reproducer | Действие |
|---|---|---|---|---|
| O-1 | P1 (блокер staging) | Нет Cloudflare-аккаунта проекта | R02 §6 | разработчик, §11 |
| O-2 | P1 (контент, не аналитика) | Flutter `lectionary_parity_test` — Гродно/Тракай 2025-07-10: документы `05-07-our-lady-trakai-grodno` и `…-memoria-ad-libitum` идентичны, WEB-фикстуры Readings и Hours ссылаются на разные | `flutter test test/lectionary_parity_test.dart` | владелец контента: объявить один устаревшим и перегенерировать фикстуры; тай-брейк на Flutter сломает `hours_parity` (отчёт R01) |
| O-3 | P2 | WEB `marian-feast-references`, `reading-choices` падали на main | `npm test` на main | исправлены тестами #170 и #168 (на дереве R06 — 0 fail) |
| O-4 | P2 | `/v2/report` в ingest Worker дублирует панель R05 | — | удалить отдельным шагом R02 после включения панели |
| O-5 | P2 | #172/#173 проходят только Ingest-CI (нет Lint & Build для не-main base) | — | перенацелить на main после #169; eslint/сборка на объединённом дереве пройдены локально |
| O-6 | P2 | Node 20/22 локально для ingest не гонялись (`node:sqlite` — Node ≥22.5; CI ingest = Node 24) | — | при смене CI на 22 проверить |
| O-7 | P2 | `analytics:smoke` (Firestore-эмулятор) требует Java ≥21; здесь 17 | — | NOT TESTED на этом дереве |
| O-8 | P3 | Мобильные клиенты: нет удалённого флага отключения (только ответ сервера) | — | решить в release-card |
| O-9 | P3 | Flutter bundle id QA-сборки совпадает с TestFlight (`by.mybrev.testflight2026`) — на Симуляторе безвредно | — | не ставить QA-сборку на устройство с реальным приложением |

## 9. Security / privacy

- **Data-flow (QA-fallback)**: клиент → `POST /v2/ingest` (JSON v2, ≤16 КиБ, только whitelist: день, платформа, версия `x.y`, `region=UNKNOWN`, ячейки событий) → Worker (проверка схемы, публичного inventory, окна дней, бюджета) → `cell_counts(cell_key, n)` + `daily_budget` + `control`. IP/UA/Origin/query не читаются и не хранятся; IP виден инфраструктуре (в Cloudflare — выпуску нужно решение). Панель читает только `SELECT`, сначала rollup, потом k=5.
- Идентификаторов пользователя/устройства/сессии/пакета нет; cookies и `credentials` не используются; нет рекламных SDK.
- Политика: текущая — `docs/analytics-policy-draft.md` (черновик, не опубликована). Не обещать «ничего не передаётся», когда backend работает.
- Sentry #158: Draft, CI ✅, **NOT DEPLOYED**; слияние меняет production-поведение (решение D-08). R01 закрыл найденную утечку props компонентов (`contexts.vue.propsData`); остаточные риски — в отчёте R01 и `docs/analytics-sentry-review.md`.
- **LIVE NETWORK: OFF.** Нужны решения владельца и release-card (`docs/analytics-release-card-template.md`) — Claude юридических выводов не делает.

## 10. Включение и отключение

| Что | Команда / действие | Ответственный | Время |
|---|---|---|---|
| Аварийное выключение (без redeploy) | `curl -X POST "$BASE/v2/admin/ingest" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"enabled":false}'` | разработчик | секунды (измерено: 2 мс на локальном Worker; на Cloudflare — NOT TESTED, цель ≤1 мин) |
| Серверная переменная | `npx wrangler deploy --var INGEST_ENABLED:false` | разработчик | минуты |
| Удалить Worker | `npx wrangler delete --name mybrev-analytics-staging` | разработчик | минуты |
| Клиенты | не собирать с `ANALYTICS_STAGING`/`VITE_ANALYTICS_STAGING`; ответ 503/426 останавливает отправку | разработчик | следующая сборка |
| Откат данных staging | `wrangler d1 execute … --command "DELETE FROM cell_counts; DELETE FROM daily_budget"` | разработчик | — |
| Откат этой недели | закрыть Draft PR; слитые PR откатываются `git revert` по одному (порядок обратный §11) | разработчик | — |

Расходы: сейчас 0 (ничего не развёрнуто). План на Free: Workers + D1 Free; квоты и `rows_read` панели проверить после §11-1.

## 11. Порядок слияния и что нужно от разработчика

**Порядок слияния (когда решите, строго после ревью; сейчас всё Draft):**

1. WEB: [#167](https://github.com/senddownrain/mybrev/pull/167) (docs) → [#168](https://github.com/senddownrain/mybrev/pull/168), [#170](https://github.com/senddownrain/mybrev/pull/170) (тесты, независимы) → [#171](https://github.com/senddownrain/mybrev/pull/171) (CI Node 22; убедитесь, что деплой тоже на 22).
2. WEB: [#169](https://github.com/senddownrain/mybrev/pull/169) (R02; в `main` попадает код Worker и `wrangler.toml` с OFF, **без** деплоя) → затем [#172](https://github.com/senddownrain/mybrev/pull/172) и [#173](https://github.com/senddownrain/mybrev/pull/173): перенацелить на `main` (или слить в ветку #169 до её слияния); они не конфликтуют между собой (проверено слиянием).
3. WEB: [#158](https://github.com/senddownrain/mybrev/pull/158) — **отдельно и последним**, только после решения D-08 (меняет production Sentry).
4. Flutter: [#40](https://github.com/senddownrain/ibreviarybyapp/pull/40) в любой момент после ревью — на обычные сборки не влияет (константа false; см. §7 про release-доказательство). В `main` Flutter полный `flutter test` останется красным из-за O-2 до решения владельца контента.
5. Этот PR (docs R06) — после #167 (дополняет STATUS).
6. Каждое слияние в WEB `main` запускает production-деплой сайта: бандл без флагов не содержит аналитики (§7), но **проверьте diff `dist` или CI-сборку перед #172**.

**Что нужно от разработчика (минимально):**

1. **Cloudflare-аккаунт проекта** (Free) с правами Workers (write) и D1 (write); шаги — `docs/analytics-staging-contract.md` §6 и `docs/analytics-dashboard-r05.md` §5: `wrangler login` → `d1 create` → миграции `0001+0002` → `secret put REPORT_TOKEN/ADMIN_TOKEN` → `deploy` (ingest OFF) → второй Worker `wrangler.reports.toml` + Zero Trust Access (только владелец) → `probe.mjs --expect on/off`. После этого повторить §7 «ручную приёмку» на `workers.dev` и только тогда менять статус на `STAGING_OPERATIONAL`.
2. Android emulator или устройство — повторить §7 (команда выше).
3. Владелец контента: O-2 (Тракай/Гродно).
4. Решения D-01…D-09 из `docs/analytics-open-decisions.md` и заполненная release-card — для любого реального сбора.

## 12. Проверка за 10 минут (разработчику)

1. Терминал 1: `INGEST_ENABLED=true REPORT_TOKEN=$(openssl rand -hex 24) ADMIN_TOKEN=$(openssl rand -hex 24) DASHBOARD_TOKEN=$(openssl rand -hex 24) …` (две команды: `worker/local-server.mjs --db /tmp/r.sqlite` и `worker/reports-local-server.mjs --db /tmp/r.sqlite`, оба на Node 24, дерево R05+R03).
2. Собрать WEB QA, открыть, подождать 3 с → `sqlite3 /tmp/r.sqlite "select count(*),sum(n) from cell_counts"`.
3. Открыть `http://127.0.0.1:8791/reports` → красный баннер QA/SYNTHETIC, числа совпадают с SQLite (≥ из-за k=5).
4. (б) iOS Simulator QA-сборка → «Ютрань» → HOME → новые строки `platform=ios`.
5. (в) `curl -X POST …/v2/admin/ingest -d '{"enabled":false}'` → новый пакет → 503, строк не прибавилось.
6. (г) `http://127.0.0.1:8790/reports` (без Access) → `{"code":"unauthorized"}` / 401.
7. (д) Обычная сборка WEB/Flutter без флагов → 0 запросов к `:8788`.

## 13. Продуктовые рекомендации (на синтетике — только возможности)

Данные этой недели синтетические, **выводов о пользователях нет**. Когда (и если) появится разрешённый реальный сбор, панель сможет помогать с вопросами (и всегда с оговорками):

1. Какие публичные разделы чаще открывают? — открытия ≠ люди.
2. Какие функции почти не используют? — низкое использование ≠ ненужность; сравнить с видимостью экрана.
3. Какие каталоги («Выбор гадзіны», «Избранное») стоит вынести в навигацию? — по `catalog_open`, неделя × платформа.
4. Читают ли текст до конца? — `sd`/`fv`/`er` — нижние границы, не факт прочтения.
5. Не мешает ли интерфейс (после смены UI)? — сравнение периодов; корреляция ≠ причинность.

Надёжность: сейчас — «только пример возможностей»; для реальных цифр нужны k≥5 ячейки, недели накопления и понимание недосчёта (at-most-once).

## 14. Где всё лежит

| Что | Где |
|---|---|
| Этот документ, шаблон release-card | `docs/analytics-week-closeout.md`, `docs/analytics-release-card-template.md` |
| Evidence R06 | `docs/analytics-evidence/r06/` (`probes-output.txt`, `r06-probes.mjs`, `screenshots/`, `summary-*.json`, `d1-compatible-cell_counts.csv`, `ingest-server-log.txt`, `synthetic-web-packet.json`) |
| Статус на старте недели | `docs/analytics-continuation/STATUS.md` (#167) |
| Контракт и backend | `docs/analytics-staging-contract.md` (#169) |
| WEB / Flutter клиент | `docs/analytics-r03-web-client.md` (#172) / `docs/analytics-staging-flutter.md` (Flutter #40) |
| Панель | `docs/analytics-dashboard-r05.md` (#173); evidence `docs/analytics-evidence/r05/` |
| Прежняя передача (P09) | `docs/analytics-two-week-handoff.md` (в этом PR устаревшие строки исправлены) |
| Видео 5 минут | **не записывалось** (вместо него скриншоты); NOT PROVIDED |

**Короткий итог владельцу.** Реально работает: сквозной путь WEB и iOS Simulator → HTTP Worker → D1-совместимая база → защищённая панель с проверкой чисел, kill switch за миллисекунды, обычные сборки молчат. Не работает/не проверено: реальный Cloudflare (нет аккаунта), Android, физические устройства, красный полный Flutter-тест из-за контента. Ссылка: этот PR и перечисленные Draft. Для реального staging нужен Cloudflare-аккаунт проекта (§11-1); для live — ещё решения владельца и release-card.
