# MyBrev Analytics — R05: приватный read-only API + панель

Статус: **`R05-LOCAL-PASS / CLOUDFLARE-NOT-TESTED`**. Код, тесты, workerd (локальная D1) и локальный HTTP работают. Реальный Cloudflare Access и реальная D1 **NOT TESTED**: R02 остаётся `R02-STAGING-BLOCKED-CREDENTIALS`, в Cloudflare ничего не создавалось. Реальный сбор OFF; юридических выводов здесь нет.

Продолжение: R02 (#169, контракт `docs/analytics-staging-contract.md`), R03 (#172), P08 (`experiments/analytics-ingest/dashboard-demo`, не тронут). База этого PR — ветка #169.

## 1. Что сделано

| Файл | Назначение |
|---|---|
| `worker/src/reports-worker.mjs` | **отдельный** Worker (свой `wrangler.reports.toml`, свои секреты, без cron и без ingest-маршрутов): `GET /reports` (страница), `/reports/api/summary` (JSON), `/reports/api/summary.csv` |
| `worker/src/reports-auth.mjs` | Cloudflare Access: Worker **сам** проверяет JWT `Cf-Access-Jwt-Assertion` (RS256, JWKS, `iss`, `aud`, `exp`, `nbf`, опц. список e-mail → 403) **или** bearer `DASHBOARD_TOKEN` (≥24 симв., constant-time). Ничего не настроено → 401 |
| `worker/src/reports-storage.mjs` | только `SELECT`, keyset-постраничное чтение, лимит 200 000 ячеек (`truncated`) |
| `src/reports-rollup.mjs` | чистый rollup → k-подавление → сводка; CSV |
| `dashboard/ui.mjs` | страница (внешний вид P08), строгий CSP с nonce, без внешних ресурсов и inline-style |
| `dashboard/build-titles.mjs`, `public-titles.json` | названия **только** для id из опубликованного inventory, из опубликованного бандла (647 из 750; у части молитв названия в бандле повреждены — показывается id) |
| `dashboard/seed-synthetic.mjs` | синтетика через ядро P06 и D1-адаптер |
| `worker/reports-local-server.mjs`, `run-reports-smoke.mjs`, `run-reports-wrangler.mjs` | локальный HTTP (+ **симулятор Access, не Cloudflare**), smoke, прогон в workerd |
| `test/r05-reports.test.mjs` | 22 теста |

`/v2/report` в ingest Worker (R02) не менялся; после включения этого API его разумно удалить (отдельный шаг R02).

## 2. Приватность

1. **Сначала rollup, потом k=5.** Базовые ячейки: открытия — день×платформа×раздел; каталоги, `fv/er/sd`, функции, ошибки — неделя×платформа×(раздел)×…; материалы — неделя×раздел×id (платформы вместе). Неделя = блок из 7 суток от сегодняшнего UTC-дня, поэтому виды 7 / 28 / всё хранение (91 день) строятся из одних и тех же ячеек.
2. **Secondary suppression «по построению»**: каждое число — сумма уцелевших базовых ячеек. В выдаче нет «итого», «прочее», долей, числа скрытых ячеек и сумм по сырой таблице, поэтому скрытую ячейку нельзя получить вычитанием или сменой фильтра. Тесты: добавление/изменение скрытых ячеек (n<5, в том числе двух строк одной ячейки) не меняет ни байта ни в одном из 156 видов; сумма платформ = «все».  Следствие: все суммы — **нижние границы** («≥»), и это написано.
3. «ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ» в баннере и подписи; в данных нет людей/устройств/сессий. app_version, region, id вне 4 публичных каталогов наружу не выходят. Поле `database_empty`-подобное: только `state` (`empty` = в выбранном окне строк нет).
4. Режимы: `qa` (по умолчанию, красный баннер «QA / SYNTHETIC»), `live` — только при `LIVE_RELEASE_CARD`, иначе 503 `mode_not_cleared`.
5. Остаточные риски: окна считаются от серверного «сегодня», сравнение отчётов, снятых в разные дни, может сузить малую ячейку; k=5 — порог показа, не анонимизация; IP виден инфраструктуре. Перекрёстное вычитание между разными семействами (например открытия по разделам и топ материалов) не даёт точного значения, но формально не доказано.
6. Срок хранения staging — 90 дней: cron `scheduled()` из R02 (в панели окно «всё хранение» = 91 день).

## 3. Автоматические проверки (Node 24.2.0, 2026-10-26)

| Команда | Результат |
|---|---|
| `npm run test:analytics-ingest` | PASS, 127/127 (из них R05: 22) |
| `node --test experiments/analytics-ingest/test/r05-reports.test.mjs` | PASS 22/22: 401/403 (нет/чужой/просроченный/не тот aud,iss/alg none/подделка/слабый токен), заголовки+CSP, независимый пересчёт из пакетов для периодов×платформ×разделов, золото seed 20261024, отсутствие raw/n<5/id в JSON и CSV, возмущения, пустая БД, kill switch через admin-маршрут ingest, 503 при сбое хранилища, read-only |
| `node experiments/analytics-ingest/worker/run-reports-smoke.mjs` | PASS 9/9 (настоящий HTTP на loopback) |
| `node experiments/analytics-ingest/worker/run-reports-wrangler.mjs` | PASS 12/12 в **workerd** + локальная D1 (JWT RS256 на WebCrypto) |
| `npx eslint experiments/analytics-ingest` | PASS |
| Производительность (SQLite-шим, 91 день синтетики = 93 119 ячеек) | чтение+сводка 0,45–0,76 с; месяц (26 595 ячеек) ≈ 0,2 с. Бюджет теста 2 с. **Реальная D1 не измерялась** (чтение всего окна = rows_read ≈ число ячеек за запрос) |

Золото seed 20261024 (31 день до 2026-11-06): открытия 7/28/91 дн = 3 213 / 11 770 / 12 795; каталоги 28 дн: hours_list 900, prayers_home 581, songs 506, prayers_all 399, bible_books 371, compendium_home 220. Они ниже сумм P08 для текстов/функций из-за недельных ячеек; суммы открытий и каталогов в P08 считались по дню (другое окно), поэтому не сравниваются.

## 4. Что нажать (владельцу, после развёртывания, §5)

1. Открыть `https://<staging-reports>.workers.dev/reports` → войти через Cloudflare Access.
2. Сверху красный баннер **QA / SYNTHETIC**; выбрать «7 дней» / «28 дней» / «всё хранение», платформу (web / android / ios), раздел.
3. «Выбор гадзіны» — блок «Каталоги и списки» (`hours_list`); «Избранное» — `favorites`; топ — блок «Топ публичных материалов».
4. Кнопка **CSV** — те же уже подавленные числа.
5. Инкогнито / `curl` без токена → 401 (проверено локально).
6. Сверка с D1: `wrangler d1 execute mybrev-analytics-staging --remote --command "SELECT ..."` (суммы будут ≥ показанных).

## 5. Развёртывание (НЕ выполнено; нужен аккаунт проекта, см. R02 §6)

1. Staging D1 и миграции — шаги R02.
2. `cd experiments/analytics-ingest && npx wrangler secret put DASHBOARD_TOKEN -c wrangler.reports.toml` (опционально, ≥24 символа).
3. Zero Trust → Access → self-hosted application на хост reports-Worker, политика — только владелец; в `wrangler.reports.toml` вписать `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (не секреты), по желанию `ACCESS_ALLOWED_EMAILS`.
4. `npx wrangler deploy -c wrangler.reports.toml`, затем `workers.dev` без Access-куки должен отвечать 401.

## 6. Статус по слоям

| Слой | Статус |
|---|---|
| API/rollup/k/CSV/страница, SQLite-шим, workerd локальная D1 | PASS |
| Cloudflare Access (реальный логин, JWKS команды), реальный D1, скорость и квоты Free, выбор «последние 7/30 дней» на настоящем staging | **NOT TESTED** |
| Live-режим | не включался; нужна release-card |

Скриншоты и вывод проверок: `docs/analytics-evidence/r05/` (обзор 28 дн., iOS/7 дн./«Часы», kill switch, пустое состояние, ошибка хранилища, `unauthenticated-401.txt`, `sample-summary-28d.csv`, `smoke-local-http.txt`).
