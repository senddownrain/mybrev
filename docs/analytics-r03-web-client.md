# MyBrev Analytics — R03: WEB-клиент → staging (только QA)

Продолжение R00 (#167) и R02 (#169, `docs/analytics-staging-contract.md`, ветка `claude/r02-worker-d1`). Этот PR строится **поверх** #169 и не дублирует backend. Реальный сбор у пользователей **OFF**; production Firebase/Firestore/Cloudflare/Sentry не затрагивались; юридических выводов нет.

## Что сделано
- `src/utils/analytics/stagingTransport.js` — транспорт QA: закрытые за UTC-день агрегаты → по одному пакету v2 (≤16 KiB) в `POST {URL}/v2/ingest`, `text/plain` (без preflight), `credentials: omit`, `referrerPolicy: no-referrer`, `redirect: error`, таймаут 5 с.
- Строго compile-time: `VITE_ANALYTICS_LOCAL=true` **и** `VITE_ANALYTICS_STAGING=true` (+ `VITE_ANALYTICS_STAGING_URL`, по умолчанию `http://127.0.0.1:8788`). Без флагов модуль и URL не попадают в бандл (`docs/analytics-evidence/r03/bundle-checks.txt`). Допустимы только `https://` или `http://127.0.0.1|localhost`.
- At-most-once, без ретраев: день **удаляется** из коллектора и сохранённого буфера и записывается в журнал `analytics_staging_sent_v1` (только `день|платформа|версия`) **до** запроса; не удалось сохранить — не отправляем. Любой исход кроме 204 (таймаут, 4xx/5xx, сеть) = потеря дня (известный недосчёт). Другая вкладка не может повторно отправить или вернуть этот день.
- Kill switch: сервер отвечает `503 ingest_disabled`/`budget_exhausted` → пауза 24 ч (`analytics_staging_pause_v1`), ничего не копится; `window.__analyticsLocal.pauseStaging()` — локально. Офлайн: ничего не берётся и не теряется, повтор при следующем триггере.
- Триггеры: через ~3 с после старта и при возврате в foreground (не чаще 1 раза/10 мин), не на scroll/tap и не из `pagehide`. Cross-tab single flight — Web Locks.
- Отправляются только дни не старше окна сервера (today−2), дни с < 3 ячеек не отправляются (удаляются), повторная `validatePacket` (whitelist + публичный инвентарь) прямо перед отправкой. Нет user/device/session/packet ID, путей, query, referrer, текстов, закрытых/священнических материалов.
- UI согласия/галочки нет; P07 mock consent не смонтирован. `collector.takeDays()` — единственное изменение ядра коллектора.

## Проверки (Node 24.2.0)
| Команда | Результат |
|---|---|
| `npm run test:analytics` | PASS, 69 pass / 0 fail / 1 skip (skip — старый «inventory in sync with bundle», вне R03) |
| `node --test tests/analytics-staging-transport.test.mjs` (13 юнит-тестов) | PASS |
| `node --test tests/analytics-staging-integration.test.mjs` (5, реальный HTTP → Worker R02 → SQLite; сумма `n` сервера = клиента) | PASS (на Node без `node:sqlite` — skip) |
| `npm run lint` | мои файлы чисты; остаются ошибки `no-undef` (`Request`, `Response`…) в файлах R02 `experiments/analytics-ingest/**` — их чинит сессия R02 (#169) |
| `npm run build` OFF / ON-QA (фейковые `VITE_FIREBASE_*` из `ci.yml`) | PASS / PASS; OFF — 0 вхождений URL/`/v2/ingest` |
| Браузер 127.0.0.1 (Network + localStorage + SQLite) | PASS, см. `docs/analytics-evidence/r03/browser-run.md` |
| `npm run analytics:smoke` | **NOT TESTED**: firebase-tools требует Java ≥ 21, локально 17 |
| Реальный Cloudflare D1/HTTPS staging | **NOT TESTED** (R02-STAGING-BLOCKED-CREDENTIALS) |

## 3 ручных действия
1. `INGEST_ENABLED=true REPORT_TOKEN=$(openssl rand -hex 24) ADMIN_TOKEN=$(openssl rand -hex 24) ALLOWED_ORIGINS=http://127.0.0.1:4173 node experiments/analytics-ingest/worker/local-server.mjs --db /tmp/r03.sqlite`
2. `VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true npx vite build --outDir /tmp/r03-qa && npx vite preview --outDir /tmp/r03-qa --host 127.0.0.1 --port 4173`; открыть страницу, походить «Сёння → Ютрань → чтения → песня → каталог».
3. Закрытый день (вчера) уйдёт при следующем запуске страницы; в DevTools → Network виден один `POST …/v2/ingest → 204`; `sum(n)` в SQLite совпадает. Для немедленной проверки вчерашний пакет можно положить в `localStorage.analytics_local_v1`.

## Rollback
Выключатель на сервере (`POST /v2/admin/ingest {"enabled":false}` или `INGEST_ENABLED=false`) — клиент встанет на паузу 24 ч. Полностью: собрать без `VITE_ANALYTICS_STAGING`. Сам PR ничего не включает.

## Риски
Недосчёт (at-most-once), день вне окна 2 суток теряется, ≥3 ячеек для отправки; поведение реального D1 не проверено; публичный POST без аутентификации (см. R02 §7). Для реального выпуска нужна отдельная release-card.
