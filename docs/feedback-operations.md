# Обратная связь: эксплуатация

Ничего ниже не выполнялось против Cloudflare/Firebase production. Все `wrangler`/`firebase` команды с ресурсами выполняет владелец.

## Срочный security rollout (2026-11-22)

**Исходный код Worker на GitHub не равен развернутой версии.** Не
утверждать, что production защищён, пока не проверена версия в Cloudflare.

1. В Cloudflare найти именно production Worker
   `mybrev-feedback.slovo-app.workers.dev`, а не
   `mybrev-feedback-staging`. Снять приватный backup D1 и сверить
   фактические bindings, `FEEDBACK_ENABLED`, `RATE_PER_MINUTE`,
   `DAILY_BUDGET`, секрет `RATE_SALT` (проверить наличие, не публиковать).
2. В production `ALLOWED_ORIGINS` явно включить
   `https://malitounik.by,https://www.malitounik.by` и дополнительные
   действующие домены Web, если они используются. Защищённый список
   канонических доменов есть и в Worker, поэтому устаревшая переменная
   более не должна ломать главную Web-форму после деплоя.
3. Подключить production `FEEDBACK_EDGE_LIMITER` с собственным
   уникальным числовым `namespace_id` (не staging ID из шаблона),
   рекомендуемый порог **10 запросов / 10 секунд на IP**. Ранний
   edge-limit работает *до* обращения к D1. Текущие атомарные
   ограничения D1 (по умолчанию 5/мин на IP и 500/сутки на весь Worker)
   остаются и ограничивают принятые обращения. Cloudflare edge
   ограничение приблизительно и считается отдельно в каждом PoP.
4. Если есть возможность, добавить WAF/Rate Limiting Rule для
   `/api/feedback` до исполнения Worker, чтобы уменьшить расходы на
   сам Worker. Защита по IP может затронуть пользователей за общим NAT.
   Для более строгих глобальных лимитов потребуются Durable Objects
   или другой глобальный стор.
5. Прогнать локально `npm run test:feedback` и ручной smoke:
   браузерный `Origin: https://malitounik.by` / preflight проходят;
   посторонний Origin → 403; Android/iOS **без Origin** проходят;
   повтор с одинаковым requestId не создаёт вторую строку;
   POST ограничен rate limit; админское чтение требует JWT.
   На production отправить **один** контролируемый тест и удалить его
   через админку при необходимости, не устраивать нагрузочных проб.
6. После review и backup опубликовать актуальный Worker из production
   config. Никакого автоматического deploy из этого PR нет.
   Для аварийного отключения публичной записи поставить
   `FEEDBACK_ENABLED=false` и развернуть production; админка останется.

**Важно:** отсутствие `Origin` — нормальный сценарий для native Flutter,
поэтому его нельзя слепо запретить. Заголовок `Origin` можно подделать
в curl; CORS защищает доступ браузера, а не публичный endpoint от
автоматизации. Более строгую защиту нужно вводить отдельным
backward-compatible изменением (например, Web Turnstile с native
альтернативой, App Check и/или собственная проверка доказательств).
Нельзя встроить секрет в мобильное приложение и считать его защитой.

## Локальный запуск (без аккаунтов)

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH  # firebase-tools требует JDK 21+
npm run test:feedback        # юнит/контракт/безопасность (node:sqlite), 17 тестов
npm run test:feedback-e2e    # workerd + local D1 + Auth/Firestore emulators (порты 9411/8411) + Chrome
```

Web против локального Worker: `VITE_FEEDBACK_API_URL=http://127.0.0.1:8791`. Если переменная не задана, форма показывает «Адпраўка пакуль не падключана» и не имитирует успех.

## Cloudflare staging (создаёт владелец; рекомендуется отдельный от analytics Worker)

1. `cd workers/feedback && npx wrangler d1 create mybrev-feedback-staging` → вписать полученный `database_id` в `wrangler.toml` (не секрет).
2. В `wrangler.toml` `[vars]`: `FIREBASE_PROJECT_ID` (реальный ID проекта Firebase), `ALLOWED_ORIGINS` (https-origin Web).
3. `npx wrangler secret put RATE_SALT` (случайная строка ≥ 32 символов).
4. `npx wrangler d1 migrations apply DB --remote` (staging), затем `npx wrangler deploy`.
5. Web staging-сборка: `VITE_FEEDBACK_API_URL=https://<worker>.workers.dev`. Flutter: `--dart-define=FEEDBACK_API_URL=...`.
6. Смоук: форма Web → запись → `/admin/feedback` под обеими ролями (см. docs/feedback-qa.md).

Production — те же шаги с отдельными ресурсами `mybrev-feedback` (отдельная D1, свой `RATE_SALT`); перед миграцией `wrangler d1 export` как бэкап. Rollback: `wrangler rollback`; схема 0001 только добавляет таблицы.

## Роли (Firebase UID)

Нужен **проверенный Firebase UID** (Console → Authentication → Users). Роль задаётся документом `admins/{uid}`: `role: "admin"` (контентный админ) или `role: "superadmin"`. Запись — только Console/Admin SDK. GitHub-логин и email сами по себе доступа не дают. Перед отзывом роли убедитесь, что остаётся хотя бы один superadmin.

## Аварийные действия

* Выключить публичный приём: `FEEDBACK_ENABLED = "false"` и `wrangler deploy` (POST → 503, админка работает).
* Удалить обращение по просьбе пользователя: `npx wrangler d1 execute DB --remote --command "DELETE FROM feedback WHERE id = '<uuid>'"` (заметки и события удаляются каскадом).
* Бэкап: `npx wrangler d1 export DB --remote --output backup.sql` (содержит email — хранить приватно).

## Стоимость и квоты

Workers Free + D1 Free достаточны для MVP: на отправку ≈ 3 записи (счётчики + строка), на админ-запрос 1–3 чтения. Суточный бюджет `DAILY_BUDGET=500` ограничивает записи.

## Диагностика

401 — токен просрочен/не тот проект (`FIREBASE_PROJECT_ID` ≠ `aud`); 403 — нет записи в `admins` или неизвестная роль; 503 `role_check_unavailable` — Firestore REST недоступен или правила не разрешают чтение `admins/{uid}`; 429 — лимит; 403 `origin_not_allowed` — origin не в `ALLOWED_ORIGINS`.
