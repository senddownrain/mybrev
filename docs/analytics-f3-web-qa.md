# MyBrev Analytics — F3: WEB QA (локально, без Cloudflare и production)

Дата: **2026-11-01**. База: `origin/main` `5d5e10c3837bda823faaeb43f2506b904283ee4b`. Node v24.2.0. Не затронуты Cloudflare, Firebase/Firestore production, Sentry; реальный сбор у пользователей **OFF**; ничего не слито и не развёрнуто. Данные закрытых дней — **SYNTHETIC** (не поведение людей). Результаты локальной SQLite (SQLite-шим D1) и реального Cloudflare D1 не смешиваются: реальный D1 здесь **NOT TESTED**.

## ПРОВЕРКА ЗА 60 СЕКУНД
1. `git checkout claude/f3-web-qa && npm ci && npm run build` → `grep -rlE "v2/ingest|analytics_local_v1|analytics_staging|__analyticsLocal" dist` ничего не находит (`docs/audit-evidence/f3/off-bundle-check.txt`).
2. QA: `VITE_ANALYTICS_LOCAL=true VITE_ANALYTICS_STAGING=true VITE_ANALYTICS_STAGING_URL=http://127.0.0.1:8799 npx vite build --outDir /tmp/qa` (нужны `VITE_FIREBASE_*`, как в `ci.yml`); `INGEST_ENABLED=true ADMIN_TOKEN=… REPORT_TOKEN=… ALLOWED_ORIGINS=http://127.0.0.1:4173 node experiments/analytics-ingest/worker/local-server.mjs --port 8799 --db /tmp/qa.sqlite`; `npx vite preview --outDir /tmp/qa --port 4173`.
3. Положить день из `node docs/audit-evidence/f3/make-seed.mjs` в `localStorage.analytics_local_v1` **со страницы `/privacy.html`**, открыть `/`: через ~3 с в Network один `POST …/v2/ingest → 204`, `sum(n)` в SQLite = числу в пакете; в обычной сборке (порт без QA-флагов) `window.__analyticsLocal` не определён, сети нет.

## Итоги

| Проверка | Результат |
|---|---|
| (1) QA: один POST `/v2/ingest` → 204, без retry, перезагрузки не шлют повторно | **PASS** (локальная SQLite) |
| (1) QA: 503 kill switch (пауза 24 ч, день не копится), сбой сети (1 попытка, без retry), неверная схема (клиент не шлёт; сервер 426/400/413) | **PASS** |
| (1) Тема/шрифт → `feature_use` | **PASS** |
| (1) Часы → Ютрань, каталог Песен, Избранное, Библия — переходы и события экранов/каталога | **PASS** по маршрутам и каталожным событиям; **NOT TESTED** чтение текста Ютрани/песни (`fv/sd/er`): без production Firestore контент не загружается, эти ячейки были в синтетическом дне |
| (1) Штатное закрытие UTC-дня | **NOT TESTED** (день подсаживался синтетически) |
| (1) Реальный Cloudflare D1 / панель сопоставимых чисел | **NOT TESTED** (по заданию без Cloudflare) |
| (2) `npm run build` без QA-флагов: нет транспорта и URL в бандле; сеть пуста; `analytics_local_v1` не пишется | **PASS** (бандл и браузер) |
| (3) Hosting-деплой не получает QA-флаги | **PASS** (анализ workflow, ниже) |
| (4) `npm ci` | **PASS** exit 0 |
| (4) `npx eslint .` | **PASS** exit 0 |
| (4) `npm run test:analytics` | **PASS** exit 0: 70 tests, 69 pass, 0 fail, 1 skipped |
| (4) `npm run test:analytics-ingest` (Node 24) | **PASS** exit 0: 127 pass, 0 fail, 0 skipped |
| (4) `npm test` | **PASS** exit 0: 1065 tests, 1054 pass, 0 fail, 11 skipped |
| (4) `npm run build` (фейковые `VITE_FIREBASE_*` из `ci.yml`) | **PASS** exit 0 |
| (4) `npm run analytics:e2e` | **PASS** exit 0, `networkAttempts: []`, рабочее дерево не изменилось |
| (4) GitHub CI на этом PR | см. статус PR (в момент написания не запускался) |
| `npm run analytics:smoke` / `analytics:perf` | **NOT TESTED** (не запрашивались; ранее R03: Java ≥ 21 нужен для emulator) |

Регрессий в границах задачи не найдено, код приложения не менялся.

## (1) QA-сценарии
Построчный журнал: `docs/audit-evidence/f3/scenarios.md`, серверный журнал `server-log.txt`, скриншот настроек `qa-settings-theme-font.jpg`, генератор синтетического дня `make-seed.mjs`. Стенд: тот же код Worker (`worker/src/index.mjs`) за `local-server.mjs` + SQLite (в workerd не гонялся — отдельный `analytics:r02-probes-workerd` существует, здесь не запускался). Порт 8788 занят чужим процессом, использован 8799 (URL — compile-time `VITE_ANALYTICS_STAGING_URL`).

Находка для QA-процедуры (не баг): коллектор перезаписывает `analytics_local_v1` на `pagehide`, поэтому синтетический день нужно писать со страницы того же origin без коллектора (`/privacy.html`).

## (2) Обычная сборка
`docs/audit-evidence/f3/off-bundle-check.txt`: в `dist` 0 вхождений `v2/ingest`, `analytics_local_v1`, `analytics_staging`, `workers.dev`, адресов 127.0.0.1:879x, `__analyticsLocal`, `stagingTransport`; чанков `staging*`/`localAnalytics*` нет (в QA-сборке есть). В браузере (:4174): `__analyticsLocal`/`__analyticsFeature` не определены, ключей `analytics_*` в localStorage нет, запросов к `ingest|analytics` нет. Остаются только собственные запросы приложения к Firebase (в этой сборке — фейковый проект `demo-mybrev-ci`).

## (3) Firebase Hosting
- `.github/workflows/deploy-firebase-hosting.yml`: триггер **только `workflow_dispatch`**, `if: github.ref == 'refs/heads/main'`, environment `production`. Автодеплоя при merge нет (merge сам ничего не публикует).
- Шаг Build передаёт только `VITE_FIREBASE_*` и `VITE_SENTRY_DSN` из secrets; `VITE_ANALYTICS_LOCAL`, `VITE_ANALYTICS_STAGING`, `VITE_ANALYTICS_STAGING_URL` нигде в `.github/` не заданы (`grep -rn VITE_ANALYTICS .github` → пусто); в репозитории нет `.env*` файлов. `ci.yml` собирает без QA-флагов.
- **Не проверено (нет доступа):** значения GitHub Environment/Actions secrets и variables `production` — не заведены ли там `VITE_ANALYTICS_*` вручную, и нет ли отдельной Firebase-GitHub-интеграции вне репозитория. Владельцу проверить Settings → Environments → production. Защита от случайности: флаг должен быть строго `true` и для локали, и для staging, а URL допускается только https или loopback.

## Риски и остаток
Реальный HTTPS/Cloudflare D1 и панель не проверялись (отдельные этапы F1/F2); UTC-rollover и чтение контента — NOT TESTED (выше); при отсутствии production Firestore QA-стенд не показывает текст Ютрани/песен.
