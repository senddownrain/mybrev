# MyBrev Analytics — продолжение (R00): текущее состояние

Срез: **2026-10-26**. Это отправная точка продолжения P00–P09, а не новый план. Источник заданий: пакет «продолжение из P09» (R00–R06). Сбор реальных данных у пользователей остаётся **OFF**; production Firebase/Firestore/Cloudflare/Sentry и магазины не затрагивались. Юридических выводов здесь нет.

Статус результата: **DEMO_READY** (офлайн-демо). `STAGING_OPERATIONAL` и `LIVE_REPORTING` не достигнуты.

## 1. Точные SHA

| Репо | main | Примечание |
|---|---|---|
| WEB `senddownrain/mybrev` | `dc45801928a45edc49cf6da97d73c4407ca0ac97` | после D-1 #164/#165/#166, задеплоен |
| Flutter `senddownrain/ibreviarybyapp` | `bb3afd3745f539405a680002a12b7b3768238e92` | после #38 (docs) |

Окружение проверок: Node 24.2.0; Flutter 3.41.4 (`~/.cache/flutter-3.41.4`; системный 3.38.9 слишком стар — `pub get --enforce-lockfile` падает).

## 2. P00–P09: что реально в main

Важная деталь: **#160–#163 слиты не в `main`, а в базовые ветки стека** (`spike/analytics-v2-backend-offline` → `claude/p06…` → `p07…` → `p08…`). Их содержимое попало в `main` одним squash-коммитом **WEB #138** (`2949f66`). Поэтому отдельных коммитов `#160–#163` в `git log origin/main` нет, но файлы P06–P09 в main есть (`experiments/analytics-ingest/*`, `docs/analytics-evidence/p07–p09`, `docs/analytics-two-week-handoff.md`).

| Этап | PR | Состояние |
|---|---|---|
| P00 | WEB #157 (`a5bc269`), Flutter #31 (`409c998`) | merged |
| P01 | Flutter #33 (`9da3ccb`) | merged |
| P02 | Flutter #32 (`fe4be53`) | merged |
| P04 | WEB #159 (`329e67c`), Flutter #36 (`45f8a9c`) | merged |
| P05 | WEB #137 (`2528585`) | merged; **#158 Sentry B — открыт, Draft** (head `a82fe6d`, mergeable, CI success) |
| P06 | WEB #138 (`2949f66`) + #160 (в стеке) | merged |
| P07 | WEB #161 (в стеке), Flutter #37 (`9907479`) | merged |
| P08 | WEB #162 (в стеке) | merged |
| P09 | WEB #163 (в стеке) | merged |
| P03 | локальные worktree Flutter (`local/p03-combined`), evidence в `docs/analytics-evidence/p09/device-aggregates` | native QA только эмулятор/симулятор; физические устройства — NOT TESTED |

`docs/analytics-two-week-handoff.md` на main **устарел**: строки «НИЧЕГО не слито / все PR Draft / #137/#138/#21 не слиты» (строки 9, 14, 47, 196) неверны. Исправление — в R06 (в R00 не правится, чтобы не смешивать).

## 3. Открытые PR (на 2026-10-26)

WEB: #158 (Draft, Sentry B), #150 (Draft, docs source-only), #149 (Draft, diagnostics), #140 (docs prompt D-1).
Flutter: #21 (Draft, iOS Simulator QA, head `9aa4bd3`), #23 (Draft, Codex Cloud env), #28 (Draft, docs source-only).
Чужие PR не закрываются и не сливаются в рамках R00.

## 4. Сделано / в работе / отсутствует

- **Сделано (DEMO_READY):** контракт v2 + golden parity (750 публичных ID, Flutter 22/27 feature IDs), локальный collector WEB/Flutter, `sd=fit`, офлайн ingest core + SQLite-адаптер + k-report, mock consent/transport (не смонтирован в UI), синтетический dashboard, e2e `analytics:e2e`.
- **В работе:** WEB #158 (Sentry B, Draft), Flutter #21 (iOS QA docs, Draft).
- **Отсутствует (ни веток, ни PR не найдено — проверено `git branch -r` и `gh pr list`):** Cloudflare Worker, D1-адаптер вживую, runtime-мост WEB и Flutter к staging, авторизованный read API/dashboard над D1, kill switch на сервере, release-card. Ветки `feature/analytics-stage2` / `feature/analytics-local` — старые, до P00; продолжать нечего.

## 5. Результаты команд (воспроизводимо)

WEB, worktree от `dc45801`, Node 24.2.0:

| Команда | Результат |
|---|---|
| `npm ci` | exit 0 |
| `npm run test:analytics` | 52 tests, 51 pass, 0 fail (1 skip) |
| `npm run test:analytics-ingest` | 90 tests, 90 pass |
| `npm run analytics:e2e` | exit 0, `networkAttempts: []` |
| `npm run analytics:dashboard-demo` | exit 0 |
| `npx eslint .` | exit 0 |
| `npm run build` | **exit 1 без `VITE_FIREBASE_*`** (ожидаемо — валидатор конфигурации); с фейковыми значениями из `ci.yml` — exit 0 |
| `npm test` (полный) | **1041 tests, 1026 pass, 4 fail, 11 skip** |

Flutter, worktree от `bb3afd3`, Flutter 3.41.4:

| Команда | Результат |
|---|---|
| `flutter pub get --enforce-lockfile` | exit 0 |
| `flutter analyze --no-fatal-infos` | exit 0 |
| `flutter test test/analytics` | 68 pass, 8 skip, 0 fail |
| `LECTIONARY_FROM=2026 LECTIONARY_TO=2026 flutter test test/lectionary_parity_test.dart` | **FAIL** (1 mismatch) |
| `flutter test` (полный) | 1444 pass, 8 skip, **1 fail** |

## 6. Воспроизводимые падения (контентные, не аналитика)

1. **WEB `tests/marian-feast-references.test.mjs:20`** — `vesper1Ps1` для праздника Марии возвращает `undefined` (ожидается Пс 113 + антифон). Известный контентный блокер (раньше падал так же).
2. **WEB `tests/reading-choices.test.mjs:47, 55, 77` (3 теста)** — *новые относительно P09*: после #165 (holy-women reference = набор законных чтений, включая holy-men; решение владельца D-1) тесты #164 ожидают прежнее число вариантов (получают 5 вместо 2, 3 вместо 1, лишние «Гамілія…», «Казанне…»). Тесты устарели относительно #165 либо данные расходятся с намерением. Файл воспроизводится изолированно: `node --test tests/reading-choices.test.mjs`. Литургические данные не правились.
3. **Flutter `test/lectionary_parity_test.dart:414`** — 1 несовпадение `route-day-id` (Гродно, 2026-07-10, `our-lady-trakai`): web `05-07-our-lady-trakai-grodno`, app `…-memoria-ad-libitum`. Воспроизводится и в диапазоне 2026, и в полном прогоне.
4. `test/common_office_test.dart` в этом полном прогоне **прошёл**; нестабильность по порядку запуска не воспроизвелась (в одном запуске не доказательство отсутствия).

Следствие: `npm test` на WEB main красный, поэтому CI WEB (`ci.yml`, Node 20, выбирает набор тестов поимённо) этого не показывает. Контентные падения следует отдать владельцу контента (R01: диагностика без правки текстов).

## 7. Замечания по CI

- `analytics-ingest.yml` — Node 24; `ci.yml` — Node 20; deploy — Node 22. Расхождение Node между workflow зафиксировать в R01/R06.
- Полный `npm test` в CI не запускается; полный Flutter suite — только ручной workflow (`Flutter full suite`, последний запуск на ветке PR #31 был failure).

## 8. Назначение R01–R06 и параллелизация

| Этап | Репо | Ветка (префикс) | Зависит от |
|---|---|---|---|
| R01 качество + Sentry B | WEB (+Flutter при необходимости) | `claude/r01-…` | R00 |
| R02 Worker + D1 staging | WEB `experiments/analytics-ingest` | `claude/r02-…` | R00 |
| R03 WEB-клиент → staging | WEB | `claude/r03-…` | **контракт R02** (URL, схема, статусы 204/503/4xx) |
| R04 Flutter-клиент → staging | Flutter | `claude/r04-…` | тот же контракт R02 |
| R05 dashboard над D1 | WEB | `claude/r05-…` | R02 (read-API) |
| R06 e2e/handoff | оба | `claude/r06-…` | R01–R05 |

**R01 ∥ R02 безопасно параллельны:** разные файлы (R01: `src/**` Sentry-конфиг, тесты контента/диагностика; R02: только `experiments/analytics-ingest/**`, `wrangler.toml`, `migrations`). Единственное общее — `package.json` scripts и `docs/` — вести в отдельных строках/файлах и ребейзить на main перед PR. Контентные падения R01 не блокируют R02. Cloudflare-доступ: проверить `wrangler whoami` в начале R02; нет — `R02-STAGING-BLOCKED-CREDENTIALS` и локальный HTTP+SQLite fallback. R03 и R04 можно параллелить между собой, только после фиксации контракта R02 (отдельным коротким doc-коммитом).

## 9. Что проверить разработчику

1. Открыть этот файл и убедиться по ссылкам PR, что #137/#138/#157/#159/#160–#163 и Flutter #31/#32/#33/#36/#37 — `MERGED`, #158 и Flutter #21 — открыты.
2. Воспроизвести падения из §6 командами из §5.
3. Принять решение по §6.2 (устаревшие тесты `reading-choices` после #165) — это контентное решение владельца.

Ничего не слито и не развёрнуто в рамках R00. Откат: закрыть PR с этим файлом.
