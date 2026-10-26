# MyBrev Analytics — итоговая передача владельцу (P09)

**Срез:** 2026-10-24 06:06 UTC; **ответственный разработчик:** Gleb (исполнитель P09: Claude, сессия `p09`); **объект:** MyBrev Analytics WEB + Flutter + OFFLINE prototype.
**WEB `origin/main`:** `6e0b708`. **Flutter `origin/main`:** `57c78b7`. Все числа ниже получены **в этом срезе** на перечисленных SHA (лог рядом, `docs/analytics-evidence/p09/`); отчёты прежних этапов использовались как отправная точка, а не как доказательство.

```
TECHNICAL STATUS: TECHNICALLY DEMO READY / LIVE NETWORK BLOCKED   (с оговорками ниже: 1 WEB-тест и 1 Flutter-тест контента красные на main, физические устройства и D1 не проверялись)
LIVE ANALYTICS NETWORK: BLOCKED
MERGED: НИЧЕГО из P00–P09 не слито (все PR открыты как Draft)
READY FOR REVIEW: WEB #157 #158 #159 #137 + цепочка #138→#160→#161→#162; Flutter #33 #36 #37 #32; (#31 — только после правки триггера, см. §5; #21 — исторический)
NOT TESTED: физический iPhone/Android; release/profile-производительность на устройстве; Mass multi-part sd; background 9 s на мобильных; D1 (биллинг/семантика); production Sentry; обычная iOS/Android-сборка без флага на устройстве (только статика); GitHub CI на объединённой ветке
OWNER DECISIONS: D-01…D-09 OPEN, D-10 = B, G1…G13 — см. docs/analytics-open-decisions.md
RUN THIS DEMO: npm ci && npm run analytics:e2e && npm run analytics:dashboard-demo   (Node 24; без сети; см. docs/analytics-demo.md)
ROLLBACK: ничего не слито/не развёрнуто — достаточно закрыть Draft PR (см. §9)
```

## 1. Короткий итог

- **Техническая готовность: `TECHNICAL DEMO READY` для закрытой синтетической демонстрации.** Доказано артефактами: клиентский буфер → mock-отправка → валидатор/хранилище → агрегаты → приватный отчёт → HTML-панель проходит сквозной прогон на WEB-коллекторе и реальных агрегатах эмулятора/симулятора (P03), с нулём сетевых попыток (§3.4).
- **Реальный сбор пользователей: `NETWORK BLOCKED`.** Нет ни одного закрытого юридического/владельческого условия (G1…G13). Ни один клиент не содержит отправителя; серверная часть — прототип в памяти/`:memory:`.
- **Где демо:** локальные команды (§8), скриншоты `docs/analytics-evidence/p09/screenshots/`; публичной ссылки и реальных данных нет и быть не должно.
- **Что видно:** *открытия* экранов и агрегированные корзины (`fv`, `sd`, `er`). **Это не число уникальных людей** — в схеме нет никаких идентификаторов.

## 2. Таблица этапов (факт на 2026-10-24)

База = merge-base с целью PR. «Позади main» — коммитов main, которых нет в голове PR. CI = единственная автоматическая проверка в PR (в таблице — её итог на этом head).

| Этап | PR | base → head | позади main | CI (head) | Реализовано / ограничения | Rollback |
|---|---|---|---|---|---|---|
| P00 baseline | WEB [#157](https://github.com/senddownrain/mybrev/pull/157) | `5b88950` → `f09c377` | 2 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/39997733698/job/120565533832)) | только `docs/analytics-two-week-baseline.md` | закрыть PR |
| P00 baseline | Flutter [#31](https://github.com/senddownrain/ibreviarybyapp/pull/31) | `86390f5` → `70ce5e5` | 1 | Analytics tests **pass**, analyze pass, **Full flutter test FAIL** ([run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/39994362499/job/120553916274)) | CI-job аналитики + ручной `flutter-full-suite.yml`. **Временный триггер `pull_request` надо убрать до merge.** Красный full — это реальные падения контента на тот момент (см. P02) | закрыть PR |
| P01 `fit` | Flutter [#33](https://github.com/senddownrain/ibreviarybyapp/pull/33) | `57c78b7` → `af9080d` | 0 | pass ([run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/40003647195/job/120585922784)) | `sd=fit` учитывает нижний резерв ридера; тесты `fit_detection_test.dart`; до/после в `audit-evidence/p01/` | закрыть PR |
| P02 full suite | Flutter [#32](https://github.com/senddownrain/ibreviarybyapp/pull/32) | `57c78b7` → `73bc40e` | 0 | pass ([run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/40002550270/job/120582108123)) | 2 из 3 падений — устаревшие ожидания тестов (исправлены); 3-е `lectionary_parity_test` — реальная регрессия route-day-id (Grodno/Trakai), **не исправлена**, нужен владелец контента | закрыть PR |
| P03 mobile QA | — (PR нет) | локальная `local/p03-combined` = main + #33 + #36 | — | — | iOS Simulator и Android emulator, debug; отчёт скопирован в `docs/analytics-evidence/p09/device-aggregates/P03_REPORT.md`. Физические устройства, performance, Mass multi-part, bg 9 s: NOT TESTED | — |
| P04 parity | WEB [#159](https://github.com/senddownrain/mybrev/pull/159) | `6e0b708` → `2fc624f` | 0 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/40024327160/job/120656557559)) | golden-фикстура + `analytics:parity` | закрыть PR |
| P04 parity | Flutter [#36](https://github.com/senddownrain/ibreviarybyapp/pull/36) | `57c78b7` → `a02b570` | 0 | pass ([run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/40024356441/job/120656658872)) | +8 `feature_use` hooks, parity-тесты (та же golden-фикстура побайтно) | закрыть PR |
| P05 privacy | WEB [#158](https://github.com/senddownrain/mybrev/pull/158) | `6e0b708` → `a82fe6d` | 0 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/40022073127/job/120648861837)) | Sentry вариант B (только ошибки, без traces/replay, скраб маршрутов). **NOT DEPLOYED**; слияние = изменение production-поведения → решение D-08 | закрыть PR |
| P05 docs | WEB [#137](https://github.com/senddownrain/mybrev/pull/137) | `6e0b708` → `7f2b3ac` | 0 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/40022110770/job/120648990352)) | owner-decisions, privacy matrix, Sentry review, policy draft (5 файлов docs) | закрыть PR |
| ingest spike | WEB [#138](https://github.com/senddownrain/mybrev/pull/138) | `e1bfa8a` → `bf18780` | **18** | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/39058115865/job/117470203263)) | офлайн-ядро приёма v2 (память) | закрыть PR |
| P06 ingest | WEB [#160](https://github.com/senddownrain/mybrev/pull/160) | `bf18780` → `72b828f` | 18 | pass, Node 24, SQLite не пропущен ([run](https://github.com/senddownrain/mybrev/actions/runs/40026302022/job/120663252095)) | атомарный бюджет, overflow, retention, k-отчёт, дизайн D1. D1 не проверялся | закрыть PR |
| P07 mock | WEB [#161](https://github.com/senddownrain/mybrev/pull/161) | `72b828f` → `1b35318` | 18 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/40066785382/job/120791617448)) | mock согласия/очереди/транспорта; замки build ∧ server ∧ consent | закрыть PR |
| P07 mock | Flutter [#37](https://github.com/senddownrain/ibreviarybyapp/pull/37) | `57c78b7` → `6db083d` | 0 | pass ([run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/40066790801/job/120791633407)) | `consent_mock.dart` + общие сценарии; **не подключён к приложению** | закрыть PR |
| P08 dashboard | WEB [#162](https://github.com/senddownrain/mybrev/pull/162) | `1b35318` → `8481d2f` | 18 | pass ([run](https://github.com/senddownrain/mybrev/actions/runs/40067523462/job/120793779131)) | офлайн-панель на синтетике, k=5 «сначала агрегация, потом подавление» | закрыть PR |
| P09 final | WEB (этот PR, стек на #162) | `8481d2f` → см. PR | — | см. PR | этот документ, e2e-скрипт и тест, runbook/demo/decisions, evidence | закрыть PR |
| старый | Flutter [#21](https://github.com/senddownrain/ibreviarybyapp/pull/21) | `014b14a` → `9aa4bd3` | 19 | нет проверок | исторический iOS QA (31 падение); **не слит**, перепроверен — см. §4 | закрыть PR |

**Старые PR #137/#138/#21 не слиты** (state=OPEN, Draft — проверено `gh pr view` 2026-10-24).

**Стек WEB:** #138 → #160 → #161 → #162 (каждый PR нацелен на ветку предыдущего; при слиянии — строго снизу вверх и с перенацеливанием на main). **Все четыре на 18 коммитов позади main.**

### Совместимость с параллельными PR (проверено слиянием, не слитым в ветку)

Интеграционная проверка выполнена в отдельных локальных worktree (`claude/p09-web-integration`, `claude/p09-flutter-integration`; не опубликованы): `origin/main` + все перечисленные PR.

| Сочетание | Результат |
|---|---|
| WEB: main + #162-цепочка + #159 + #158 + #157 + #137 | **один конфликт — `package.json` (соседние строки скриптов #159 `analytics:parity` и цепочки)**, разрешён сохранением обоих; всё остальное автослияние. Это единственная правка, которая понадобится при слиянии |
| WEB: пересечение файлов с #150, #149, #140 | нет |
| Flutter: main + #33 + #32 + #36 + #37 + #31 | чисто |
| Flutter #35 (devotional offices) vs #31 | **КОНФЛИКТ** в `.github/workflows/flutter-pr-ci.yml` (обе меняют CI). `lib/screens/prayer_detail_screen.dart` (его меняют и #35, и #36) слился автоматически, но **семантику хуков аналитики после слияния нужно перепроверить глазами** |
| Flutter #28, #23 | пересечений нет |

Литургические тексты, Bible, PWA и контент не затронуты ни одним PR цепочки: в интеграционном дереве WEB `src/` отличается от main только файлами `src/plugins/sentry.js`, `src/plugins/sentryPrivacy.js` (#158) (проверено `git diff origin/main --stat -- src public`).

## 3. Проверки на актуальных SHA

Среда: macOS 25.4 arm64; Node 24.2.0 / npm 11.3.0; Java 21 (openjdk@21 через `JAVA_HOME`, только для Firestore-эмулятора); Chrome for Testing 1228 (Playwright); Flutter 3.41.4 (framework `ff37bef603`). Дерево WEB = `origin/main 6e0b708` + `#162 8481d2f` + `#159 2fc624f` + `#158 a82fe6d` + `#157 f09c377` + `#137 7f2b3ac` (+ P09-коммит для `test:analytics-ingest`). Дерево Flutter = `origin/main 57c78b7` + `#33 af9080d` + `#32 73bc40e` + `#36 a02b570` + `#37 6db083d` + `#31 70ce5e5`.

### 3.1 WEB

| Команда | Результат | Лог |
|---|---|---|
| `npm ci` | PASS (802 пакета) | — |
| `npx eslint .` | **PASS** (exit 0) | `logs/web-eslint.log` |
| `npm run test:analytics` | **PASS**: 52 теста, 51 pass, 0 fail, 1 skipped | `logs/web-test-analytics.log` |
| `npm run test:analytics-ingest` (Node 24) | **PASS**: 90 pass, 0 fail, 0 skipped (в т.ч. SQLite и 5 тестов P09); на дереве без P09: 85/85 | `logs/web-ingest-handoff.log`, `logs/web-test-ingest.log` |
| `npm test` | **FAIL, 1 из 1036**: `tests/marian-feast-references.test.mjs` («Marian feast references are structured rules resolved from the Common»); 1024 pass, 11 skipped. Содержательное дерево (`src/`, `data`, этот тест) идентично `main`, кроме Sentry-файлов #158 → падение **контентное, не аналитическое, присутствует на main** (отдельный прогон на чистом main не выполнялся) | `logs/web-npm-test-summary.log` |
| `npm run build`, `VITE_ANALYTICS_LOCAL=false` | PASS; в `dist` **0 вхождений** `analytics_local_v1` и `schema_version` | `logs/web-build-false.log` |
| `npm run build`, `VITE_ANALYTICS_LOCAL=true` | PASS; ключ буфера присутствует; `sendBeacon` в бандле аналитики: 0 | `logs/web-build-true.log` |
| `npm run analytics:smoke` (Firestore Emulator, Chromium) | **PASS**: 23 экранных сценария «ok», 0 FAIL (короткая молитва/песня → `sd=fit`, bg 9 s не засчитан, Back не удваивает) | `logs/web-smoke.log`, `logs/web-smoke.json` |
| `npm run analytics:perf` (7 прогонов, без троттлинга CPU) | PASS (скрипт завершился): flag off/on — frame p95 17.5 / 17.6 мс, spa_nav 18.7 / 18.6 мс, js heap 16.25 / 16.35 МБ, dist +40 261 байт (9 719 066 → 9 759 327), 0 кадров >33 мс; **настольный Chromium на эмуляторе, не телефон** | `logs/web-perf.json` |

Сборка использует те же заведомо фиктивные `VITE_FIREBASE_*` значения, что и GitHub CI; секретов не применялось. Эмулятор читал **локальный** снапшот `backups/…` (живой Firestore не затрагивался).

### 3.2 Flutter

| Команда | Результат | Лог |
|---|---|---|
| `flutter pub get --enforce-lockfile` | PASS | — |
| `flutter analyze --no-fatal-infos` | **PASS**, 0 errors, 9 info | `logs/flutter-analyze.log` |
| `flutter test test/analytics` | **PASS**: +68, ~8 skipped | `logs/flutter-test-analytics.log` |
| `flutter test --dart-define=ANALYTICS_LOCAL=true test/analytics` | **PASS**: +75, ~1 skipped | `logs/flutter-test-analytics-flag.log` |
| `flutter test` (полный, 13 мин) | **FAIL: +1425, ~8 skipped, −1**: единственное падение — `test/lectionary_parity_test.dart` «Flutter Readings screen equals the web screen for every legal option» (контент/выбор документа Grodno, см. P02) | `logs/flutter-full-tail.log` |

- **Прежние 31 падение (iOS QA, #21):** файлы `readings_stage4`, `mass_reading_sets_widget`, `android_layout_lab`, `liturgical_screen_smoke`, `lectionary_model` **проходят** в полном прогоне на этом дереве (`NOT REPRODUCED`). Из трёх падений main два исправлены в #32 (тестовые ожидания), остаётся `lectionary_parity_test`.
- **`sd=fit` до/после:** `audit-evidence/p01/before.log` (тест «короткий текст = fit» красный) → после #33 зелёный; `fit_detection_test.dart` входит в 68/75 выше (портрет 393×852, 320×720, крупный шрифт переводит fit в прокрутку, переполнение ≠ fit, длинный текст до конца → `p100`). На устройствах (P03): короткая песня `sd=fit` на iOS Sim и Android emu; Laudes после прокрутки `sd=p100`; в старом отчёте было `p75_99`.
- **Обычная сборка не отправляет и Hive не создаёт — СТАТИЧЕСКИЙ proof:** `kAnalyticsLocal = bool.fromEnvironment('ANALYTICS_LOCAL')` (`lib/analytics/local_analytics.dart:21`, compile-time); единственный вызов `LocalAnalytics.start` — под `if (kAnalyticsLocal)` (`lib/main.dart:73`); единственный `openBox` аналитики — в `local_analytics.dart`; `lib/analytics/*` не импортирует `dart:io`, `http`, `dio` (только `dart:convert`, hive, flutter, go_router, package_info_plus); `transport.dart` — абстрактный интерфейс без реализации; тест `consent_mock_test.dart:195` — «build flag OFF must not touch storage». **Runtime-проверка обычной сборки на устройстве (отсутствие файла `analytics_local_v1.hive`, сетевой перехват): NOT TESTED.**
- **iOS/Android smoke:** **не перезапускался в P09** — использованы данные P03 (§6, `device-aggregates/P03_REPORT.md`).

### 3.3 Cross-platform

| Проверка | Результат |
|---|---|
| SHA-256 `analytics-contract-v2.json` WEB ↔ Flutter | **идентичны** `af2d0176…` |
| SHA-256 `public-inventory.json` WEB ↔ Flutter | **идентичны** `b2330a7f…` |
| SHA-256 `analytics-consent-scenarios.json` WEB ↔ Flutter | **идентичны** `6a1eea4e…` |
| SHA-256 `analytics-parity-v2.json` (#159 ↔ #36) | **идентичны** `fe3e26ed…` |
| Формы пакетов | WEB-пакет, пакеты Android и iOS проходят один и тот же WEB-валидатор (`validatePacket`): `schema_version=2`, `region=UNKNOWN`, платформы `web/android/ios` |

### 3.4 Сквозной E2E (воспроизводим: `npm run analytics:e2e`)

Источники: **WEB** — реальный `createCollector` на скрипте визитов (без браузера); **Android** — Hive-дамп эмулятора P03 (1 пакет, 32 события); **iOS** — Hive-дамп симулятора P03 (2 пакета, 41 событие). Путь: mock-клиент (замки build ∧ server ∧ consent, очередь at-most-once) → mock-транспорт → ядро приёма P06 → хранилище в памяти → rollup P08 (сначала агрегация, потом k=5) → `report.json` → `dashboard-e2e.html`.

| Прогон | Результат |
|---|---|
| ×1 (один QA-сеанс как есть) | 4 пакета, 4×204, 0 потерь; хранилище = независимая сумма источников (`screen_view` 23, `fv` 18, `feature_use` 9, `catalog_open` 10); **опубликовано открытий: 0** — почти всё ниже k=5 (опубликована 1 ячейка) |
| ×6 (каждый пакет предложен 6 раз — **фикстура для показа k, не 6 независимых людей**) | хранилище = ожидаемому; опубликовано открытий **138 = 23×6**; минимальная опубликованная ячейка 6 ≥ k |
| Матрица замков | build OFF → 0 записей в kv, 0 вызовов транспорта; kill switch OFF → 0 отправлено, очередь не создана; consent OFF → 0; revoke → очередь стёрта, дальнейшие `offer` отклонены; kill switch переключён до flush → 0 отправлено, очередь стёрта |
| Сеть | перехват `fetch`/sockets/DNS/`http(s).request`: **0 попыток** |
| Приватность | в обоих отчётах нет `http`, IP, uuid, `user/device/install/session/cookie/token/priest`, query |

Артефакты: `docs/analytics-evidence/p09/e2e-out/{e2e-result.json,report-x1.json,report-x6.json,dashboard-e2e.html}`, скриншоты `screenshots/01-e2e-desktop.jpg`, `02-e2e-mobile-375.jpg` (страница не сделала ни одного сетевого запроса — проверено перехватом Playwright). Тест `experiments/analytics-ingest/test/p09-e2e.test.mjs` фиксирует эти числа и сверяет закоммиченный `e2e-result.json` со свежим прогоном.

### 3.5 Негативные и стоимостные проверки (источник — `npm run test:analytics-ingest`, 90/90)

| Класс | Что доказано | Граница доказательства |
|---|---|---|
| malformed / oversized | 4xx/413 без записи; лимит 16 KiB считается в байтах; враждебные формы JSON (`__proto__`, глубокая вложенность) не бросают исключение | память + SQLite `:memory:` |
| fuzz | 1500 seed-мутаций: исключений нет, 204 только для валидного пакета | то же |
| privacy-поля | неизвестное поле/ID, закрытый (priest-only) ID, поисковая строка → отказ; в хранилище и логах только белый список | то же |
| secret / private ID | неизвестный ID отклоняется; в отчёте только публичные ID из перечня (750) | перечень публичных ID |
| бюджет | точная граница 80 000/80 001; параллельные пакеты не перерасходуют; флуд исчерпывает день и дальше пишет 0 (**известный лимит: отказ в обслуживании на день**) | SQLite-модель, **не D1** |
| параллельность | инкременты одной ячейки суммируются без потерь; старый read-then-write теряет обновление — новый single-statement нет | SQLite |
| retention | граница UTC, високосный год/смена года, чистка и `daily_budget` | SQLite |
| dedup | **exactly-once НЕ заявляется**; повтор POST удваивает; на клиенте at-most-once (потеря допустима, дубль нет) | дизайн: нужен токен пакета (решение G11) |
| k-утечка | k<2 отказ; перестановка/удаление любой скрытой ячейки не меняет ни байта; суммы только по показанным; при одной скрытой «материал»-ячейке прячется ещё одна | проектное решение, **не юридическая анонимизация** |
| kill switch | 503 до чтения тела; по умолчанию закрыт | ядро + клиент |

Явно **НЕ доказано:** `D1 billing NOT VERIFIED` (учёт записей и семантика транзакций D1 не проверялись на реальном аккаунте); Sentry production — состояние неизвестно (`UNKNOWN`), #158 не развёрнут; физический iPhone/Android — не тестировались; нагрузка/латентность сервера — не измерялись.

## 4. Что исправлено / что осталось (технические вопросы)

| ID | Severity | Кто | Что требуется | Почему не завершено | Безопасная временная альтернатива |
|---|---|---|---|---|---|
| T-01 | medium | владелец контента | `lectionary_parity_test`: два sparse-документа Grodno / Our Lady of Trakai (`…-grodno` и `…-memoria-ad-libitum`) — пометить дубль `_obsolete` или детерминированный tie-break в `_selectFixedDocuments` | литургический выбор вне scope | тест красный и честно виден; аналитику не затрагивает |
| T-02 | medium | владелец контента | WEB `marian-feast-references.test.mjs` (структурированные правила Common) | контент, не аналитика; красный на main | не сливать за счёт этого теста; не править литургический текст |
| T-03 | low | разработчик | Flutter `ordo_day_flow_test` — **в #32 уже исправлен** как устаревшее ожидание (`_mainSection`); если #32 не слит, на main он красный | не слито | см. #32 |
| T-04 | medium | разработчик | убрать временный триггер `pull_request` из `flutter-full-suite.yml` (#31) перед merge; разрешить конфликт #31 ↔ #35 в `flutter-pr-ci.yml` | два PR меняют один workflow | слить по очереди |
| T-05 | medium | разработчик | поднять стек #138→#162 на актуальный main и перенацелить PR; единственный известный конфликт — `package.json` с #159 | 18 коммитов позади | интеграционная проверка выше показала чистое слияние кроме этого |
| T-06 | medium | разработчик | контролируемый повтор на **физических** iPhone/Android: Mass multi-part `sd` (в P03 `p100` после 1 свайпа + поворота — не подтверждено), bg 9 s, release/profile-производительность A/B | нет устройства | синтетический/симуляторный QA в P03 |
| T-07 | medium | разработчик | runtime-proof «обычная сборка не создаёт Hive и не шлёт аналитику» на устройстве/симуляторе (файл `analytics_local_v1.hive` отсутствует + сетевой перехват) | в P09 только статика | §3.2 статический proof |
| T-08 | low | разработчик | GitHub CI на объединённой ветке: CI запускается per-PR; объединённое дерево проверено только локально | объединённая ветка не опубликована | локальные логи в evidence |
| T-09 | high (для сети) | разработчик | реальное D1: учёт записей, транзакции/batch, параллельный бюджет (план D1-01…D1-08 в `analytics-ingest-d1-adapter-design.md`) | нет аккаунта/разрешения | SQLite-модель |
| T-10 | high (для сети) | разработчик | дедуп-токен или принятие at-most-once (G11); авторизованный read-контур (G13); kill switch и opt-out в реальных клиентах (G12) | требуют решений владельца (§5) | mock в P07 |

## 5. Решения владельца (полный текст — `docs/analytics-open-decisions.md`)

D-01 (юрзаключение), D-02 (регистрация оператора), D-03 (форма согласия), D-05 (инфраструктура, DPA, логи), D-06 (срок), D-07 (политика), D-08 (Sentry), D-09 (Data safety / App Privacy) — **OPEN**; D-04 = `UNKNOWN` решено только для локального режима; D-10 = B (локальный режим только в тестовых сборках). Каждое решение: факт / риск / предложенный вариант / что выбрано / дата / кем подтверждено. **Недостающая подпись = `OPEN`.** Отдельно три контентных красных теста (T-01, T-02, и ординарный `ordo_day_flow` при неслитом #32) — «не аналитика, нужна классификация владельцем контента».

## 6. Платформы

| Проверка | WEB | Android | iOS |
|---|---|---|---|
| local build-flag off | PASS (build без `analytics_local_v1` в `dist`) | статика PASS; runtime NOT TESTED | статика PASS; runtime NOT TESTED |
| local aggregation flag on | PASS (smoke 23/23; build true) | PASS emulator (P03) | PASS simulator (P03) |
| screen / feature / fit correctness | PASS (smoke: `sd=fit` короткая молитва и песня) | PASS emulator: `sd=fit` песня, `p100` Laudes | PASS simulator: то же |
| privacy / no analytic traffic | PASS (`request_hosts` без аналитики; e2e trap 0) | PASS по дампу (нет ID/URL); сетевой перехват на устройстве NOT TESTED | то же |
| simulator / emulator | Chromium + Firestore Emulator | Pixel 7 API 36 (P03, debug) | iPhone 16 iOS 18.6 (P03, debug) |
| physical device | NOT APPLICABLE (браузер) | **NOT TESTED** | **NOT TESTED** |
| perf baseline & delta | PASS: ~нулевая дельта (§3.1), десктоп | **NOT MEASURED** | **NOT MEASURED** |

## 7. Четыре доказательные ссылки

1. WEB CI: ссылки по PR в §2 (+ `logs/web-*`).
2. Flutter CI/full suite: [#31 full-suite run](https://github.com/senddownrain/ibreviarybyapp/actions/runs/39994362499/job/120553916274) (на main-базе, красный) + `logs/flutter-*` (объединённое дерево, 1 красный контент-тест).
3. Демо/e2e: `docs/analytics-evidence/p09/e2e-out/`, `npm run analytics:e2e`.
4. Скриншоты и device QA: `docs/analytics-evidence/p09/screenshots/`, `device-aggregates/` (P03).

## 8. Демонстрация за 5 минут

См. `docs/analytics-demo.md`. Коротко (Node 24, без сети):

```bash
npm ci
npm run analytics:e2e                    # сквозной прогон, печатает JSON, пишет docs/analytics-evidence/p09/e2e-out/
npm run analytics:dashboard-demo         # большая синтетика P08 → experiments/analytics-ingest/dashboard-demo/out/dashboard.html
open docs/analytics-evidence/p09/e2e-out/dashboard-e2e.html
```

Показать: баннер «SYNTHETIC DATA · ОТКРЫТИЯ ≠ ЛЮДИ»; фильтр «Состояние приёма» (kill switch → «данных нет»); в `report-x1.json` почти пусто (k=5), в `report-x6.json` — суммы; матрицу замков в `e2e-result.json`.

**Финальная демонстрация не означает одобрение реальной отправки.**

## 9. Откат

Ничего не слито, не развёрнуто, ни один endpoint/секрет/Worker/D1 не создавался. Откат = закрыть Draft PR (и, при желании, удалить ветки `claude/p0*`). Локальные тестовые приложения и эмулятор P03 удалены (см. P03_REPORT). Следы только в локальных worktree разработчика.
