# MyBrev Analytics — контракт staging (R02): Worker + D1

Статус: **`R02-STAGING-BLOCKED-CREDENTIALS`** — реальный Cloudflare staging не создан. Работают и проверены: (1) настоящий Worker в локальном **workerd** (`wrangler dev --local`, локальная D1), (2) тот же Worker за `node:http` на персистентном SQLite (fallback). Реальный сбор у пользователей **OFF**; production Firebase/Firestore/Cloudflare/Sentry и магазины не затрагивались. Юридических выводов здесь нет; это инженерный контракт.

Продолжение: R00 (#167), P06 (#138/#160). Ядро `experiments/analytics-ingest/src/core.mjs`, `report.mjs`, `migrations/0001_init.sql` **не изменены**.

## 1. Контракт для R03 (WEB), R04 (Flutter), R05 (панель)

Базовый URL staging: **TBD** — `https://mybrev-analytics-staging.<subdomain>.workers.dev` после создания Worker (§6). Для разработки: `http://127.0.0.1:8788` (SQLite fallback, §4) или `wrangler dev` (порт 8787).

| Маршрут | Доступ | Назначение |
|---|---|---|
| `POST /v2/ingest` | публичный, **только QA-сборки** с инженерным флагом | пакет контракта v2 (`docs/analytics-contract.md`) |
| `OPTIONS /v2/ingest` | публичный | CORS preflight, ответ 204; заголовки только для origin из `ALLOWED_ORIGINS` |
| `GET /v2/report` | `Authorization: Bearer REPORT_TOKEN` (+ Cloudflare Access спереди) | отчёт `buildReport`, k = 5, итоги — нижние границы |
| `POST /v2/admin/ingest` | `Authorization: Bearer ADMIN_TOKEN` | `{"enabled":false}` — выключатель без redeploy |
| остальное | — | `404`; неверный метод `405` (+`Allow`) |

Запрос ingest: `Content-Type: application/json` (или `text/plain` — без preflight из браузера), тело ≤ 16 KiB. Ответ при успехе — **`204` без тела**. Ответ с ошибкой — JSON `{"code": "<фиксированный код>"}`.

| Статус | `code` | Когда | Что делает клиент |
|---|---|---|---|
| 204 | — | принято; счётчики выросли ровно на `n` ячеек | сбросить отправленную дельту |
| 400 | `bad_json`, `invalid_packet`, `region_not_allowed`, `day_out_of_range` | не по контракту (неизвестное поле/ID, `region≠UNKNOWN`, день старше 2 суток или в будущем) | **не повторять**, пакет потерян |
| 405 | `method_not_allowed` / без тела | не POST | — |
| 413 | `payload_too_large` | тело > 16 KiB (проверяется по `Content-Length` и по потоку; больше лимита не буферизуется) | не повторять |
| 415 | — | не `application/json`/`text/plain` | исправить клиент |
| 426 | `unsupported_schema` | `schema_version ≠ 2` | обновить клиент |
| 503 | `ingest_disabled` | выключено (`INGEST_ENABLED≠"true"` или kill-switch) | не повторять, не копить очередь |
| 503 | `budget_exhausted` | дневной бюджет строк исчерпан | не повторять |
| 503 | `storage_unavailable` | сбой D1, транзакция откатилась | не повторять |

**At-most-once.** Любой исход кроме 204, включая timeout, считается потерей: дельту не возвращать и не повторять (`docs/analytics-ingest-d1-adapter-design.md` §5). Exactly-once без токена пакета невозможно; токен/ID пакета не вводится. Известный недосчёт.

Заголовки запроса сервер **не читает** (кроме `Content-Type`, `Content-Length`, `Origin` для CORS и `Authorization` на защищённых маршрутах). В D1 и логи не попадают тело, URL/query, IP, User-Agent, cookie, Origin. Логи — только `{code,status,cells,errors,rowsWritten,deleted}`. Origin — не защита: вне браузера он подделывается.

## 2. Что сделано

- `experiments/analytics-ingest/worker/src/index.mjs` — Worker (маршруты выше, fail-closed, bounded abuse: размер, allowlist ID, дневной бюджет строк, окно дней).
- `worker/src/d1-storage.mjs` — адаптер D1: **один `db.batch([...])` на пакет** (бюджет-upsert + upsert ячеек пачками по 40). Бюджет — не «прочитал → записал», а `CHECK budget_cap` в миграции `0002`: превышение роняет оператор, batch откатывается целиком. Переполнение счётчика (`n ≤ 2^53−1`) — тоже откат. Ручные `BEGIN/COMMIT` не используются.
- `migrations/0002_d1_budget_cap_and_control.sql` — `daily_budget(day, rows_written, cap)` + таблица `control` (kill switch). Для staging-таблица пересоздаётся (данные синтетические).
- Retention: cron `scheduled()` (03:17 UTC) вызывает `cleanup(...)` — удаляются дни старше **90** суток (`RETENTION_DAYS`) и строки `daily_budget`; TTL ≤ окна поздней доставки запрещён.
- k-suppression на чтении — `buildReport` (k = 5), строки `n < k` и зависящие от них итоги не выдаются.
- `worker/src/sqlite-d1-shim.mjs`, `worker/local-server.mjs` — fallback; `worker/probe.mjs`, `run-probes-local.mjs`, `run-probes-wrangler.mjs` — HTTP-пробы; `test/r02-worker.test.mjs` — 15 интеграционных тестов.

## 3. Выключатели (по убыванию скорости)

1. **Без redeploy, секунды:** `curl -X POST "$BASE/v2/admin/ingest" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"enabled":false}'` (или `npx wrangler d1 execute mybrev-analytics-staging --remote --command "INSERT INTO control(key,value) VALUES('ingest','off') ON CONFLICT(key) DO UPDATE SET value='off'"`). Включить обратно — `enabled:true`.
2. Переменная `INGEST_ENABLED` (главная, **по умолчанию `"false"`**, строго `"true"` для включения): `npx wrangler deploy --var INGEST_ENABLED:false` или в dashboard Worker → Settings → Variables.
3. Отзыв маршрута: `npx wrangler delete --name mybrev-analytics-staging`. Приложения при 503/сетевой ошибке ничего не повторяют.

Эффективное включение = `INGEST_ENABLED=="true"` **И** нет строки `control(ingest)=off`. Ошибка чтения `control` → 503 (fail closed). В OFF-режиме тело запроса не читается и не парсится, D1 не читается.

Rollback данных: `npx wrangler d1 execute mybrev-analytics-staging --remote --command "DELETE FROM cell_counts; DELETE FROM daily_budget"` (только staging, синтетика).

## 4. Как запустить локально (без аккаунта)

```bash
# все тесты (Node 24)
npm run test:analytics-ingest
# HTTP-пробы на SQLite fallback: сервер OFF → 503, затем ON → 204/4xx/401/параллельные/kill switch
node experiments/analytics-ingest/worker/run-probes-local.mjs
# те же пробы на настоящем workerd + локальной D1 (скачает wrangler@4.153.0 через npx; сеть к Cloudflare не используется)
node experiments/analytics-ingest/worker/run-probes-wrangler.mjs
# вручную: сервер на 127.0.0.1:8788 с файловой БД
INGEST_ENABLED=true REPORT_TOKEN=$(openssl rand -hex 24) ADMIN_TOKEN=$(openssl rand -hex 24) \
  node experiments/analytics-ingest/worker/local-server.mjs --db /tmp/mybrev-staging.sqlite
```
Токены генерируются на каждый запуск и не печатаются.

## 5. Результаты проверок (2026-10-26, Node 24.2.0, wrangler 4.153.0)

| Проверка | Результат |
|---|---|
| OFF → 503 (валидный и невалидный пакет; тело не читается) | PASS (тесты, SQLite-пробы, workerd-пробы) |
| ON → 204, счётчик вырос ровно на `n` | PASS (отчёт: +65 = 5 + 20×3 после 21 пакета) |
| невалидное: JSON/схема/ID/region/день/поле/размер/тип → 400/426/413/415 | PASS |
| 20 параллельных валидных → точная сумма | PASS |
| бюджет у границы (79 990 + 6): ровно 1 пакет принят, остальные 503, откат | PASS (одно соединение и **два соединения к одному файлу**) |
| переполнение счётчика → откат всего пакета | PASS |
| `/v2/report` без/с неверным/слабым/незаданным токеном → 401; report-токен ≠ admin | PASS |
| малые ячейки (n < 5) не в отчёте | PASS |
| retention 90 суток через `scheduled()` | PASS |
| IP/UA/cookie/Origin/query не в БД и не в логах (sentinel-тест) | PASS |
| токены не в логе wrangler, не в `wrangler.toml` | PASS |
| `rows_written` локального движка: пакет из 1 ячейки = 2 (ячейка + строка бюджета), совпадает с моделью `BUDGET_ROW_OVERHEAD` | **локально**, не биллинг D1 |
| реальный D1: batch-rollback, лимиты операторов/параметров, CPU Free, `rows_written` с биллингом, Free-квота, 20 параллельных у границы | **NOT TESTED** (нужен staging, §6) |

## 6. Блокер `R02-STAGING-BLOCKED-CREDENTIALS` и что нужно от разработчика

Сессия обнаружила одну OAuth-сессию wrangler (личный аккаунт, scope `user (read)`). Принадлежность аккаунта проекту не подтверждена и прав на создание ресурсов нет, поэтому **в Cloudflare ничего не создавалось**. Нужно:

1. Подтвердить аккаунт проекта: `npx wrangler login`, затем `npx wrangler whoami` (scopes должны включать `workers (write)` и `d1 (write)`).
2. `npx wrangler d1 create mybrev-analytics-staging` → вписать **только** выданный `database_id` в `experiments/analytics-ingest/wrangler.toml` (не секрет).
3. `cd experiments/analytics-ingest && npx wrangler d1 migrations apply mybrev-analytics-staging --remote` (0001 + 0002).
4. Секреты: `npx wrangler secret put REPORT_TOKEN` и `ADMIN_TOKEN` (≥ 16 символов, случайные, значения никуда не копировать).
5. `npx wrangler deploy` (ingest остаётся OFF). Имя Worker `mybrev-analytics-staging`, `workers_dev = true`, **без** custom routes на production-домены.
6. Cloudflare Access: Zero Trust → Access → Applications → self-hosted, путь `*/v2/report*` и `*/v2/admin/*` (политика — только разработчик). Bearer-токен остаётся вторым слоем.
7. Включить на время QA: `npx wrangler deploy --var INGEST_ENABLED:true`; прогнать `node experiments/analytics-ingest/worker/probe.mjs --base https://<staging> --expect on` (+ `--report-token/--admin-token` или env); затем `--expect off`; снять `rows_read/rows_written` в Dashboard → D1 → Metrics до/после и вписать в §5; проверить Free-лимиты в актуальной документации.
8. Отдельно (не Claude): вердикт по хранению и раскрытиям — release-card; реальный сбор остаётся OFF.

R03/R04/R05 могут работать против `127.0.0.1:8788` (§4): контракт идентичен.

## 7. Остаточные риски

- Публичный POST без аутентификации: накрутка поддельными пакетами возможна; ограничено размером, allowlist, окном дней и дневным бюджетом (достаточно, чтобы вывести ингест из строя до конца суток — осознанный компромисс, fail closed).
- k = 5 — порог показа, не анонимизация входящих данных; IP виден инфраструктуре Cloudflare.
- Поведение реального D1 (§5, последняя строка) не проверено; допущения о стоимости остаются допущениями до замеров.
- `GET /v2/report` читает до 20 000 ячеек за запрос (лимит чтения; при превышении отчёт — нижняя граница).
