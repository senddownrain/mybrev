# Обратная связь: эксплуатация

Ничего ниже не выполнялось против Cloudflare/Firebase production. Все `wrangler`/`firebase` команды с ресурсами выполняет владелец.

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
