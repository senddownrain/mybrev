# Единая обратная связь MyBrev: архитектура

Статус: реализовано локально (workerd + local D1 + Firebase emulators). Cloudflare/production не затрагивались.

## Схема

```
Web (Vue) ─┐                              ┌─ Firestore admins/{uid}  (роль: admin | superadmin)
Flutter ───┼─ POST /api/feedback ─►  Worker ◄─ REST, токен самого пользователя (rules: own(uid))
Admin UI ──┘  Bearer Firebase ID token   │
   (только Web /admin/feedback)          └─► D1 «feedback» (отдельная от аналитики)
```

* Worker: `workers/feedback/` (отдельный от analytics; свои wrangler.toml, D1, миграции). Аналитика не затронута.
* **Роли — единый источник `admins/{uid}`** (решение владельца, как в PR #193; отдельного реестра в D1 нет). Worker проверяет ID-токен (RS256 по JWKS Google, `iss`, `aud`, `exp`, `iat`, `sub`), затем читает `admins/{uid}` через Firestore REST **токеном самого пользователя** — правила `match /admins/{uid} { allow read: if own(uid) }` отдают только собственную запись. Секретов и сервисных ключей нет. Резолвер роли — тот же `src/utils/adminAccess.js` (legacy UID = admin, никогда не superadmin; неизвестная роль = нет доступа).
* Роль читается **на каждый админ-запрос**; смена/отзыв в Firestore действует сразу. Ошибка чтения роли → 503 (fail closed). Ограничение: уже выданный ID-токен (до 1 ч) проходит подпись у отключённого в Auth пользователя, но роль по-прежнему берётся из Firestore, поэтому без записи в `admins` доступа нет.
* Управление правами: только в Firestore `admins/{uid}` (Console/Admin SDK; клиентские записи запрещены правилами). Эндпоинта `/api/admin/staff` и таблицы `feedback_staff` намеренно нет. Защиты «последнего superadmin» на стороне Worker нет — он не пишет роли; при ручном изменении в Console проверяйте это самому (см. operations).

## API

| Метод и путь | Доступ | Результат |
|---|---|---|
| `POST /api/feedback` | публично | `201 {id}`; 400 валидация; 413 > 16 КБ; 429; 503 (выключено/лимит/D1); 403 чужой `Origin` |
| `GET /api/admin/me` | admin, superadmin | `{role, categories, canSeeContacts}` |
| `GET /api/admin/feedback?status=&category=&platform=&q=&cursor=&limit=` | admin, superadmin | `{items, nextCursor, newCount}`; курсор `(created_at,id)`; limit ≤ 50 |
| `GET /api/admin/feedback/:id` | admin (только контентные), superadmin | карточка + заметки + история; вне ACL — `404` |
| `PATCH /api/admin/feedback/:id` `{version, status?, category?}` | status: оба; category: только superadmin (admin → 403) | `409` при устаревшей `version` |
| `POST /api/admin/feedback/:id/notes` `{body, scope}` | shared: оба; `superadmin_private`: superadmin | `201` |

Прочее → 404. Публичного чтения/поиска нет. Экспорта/CSV нет (не реализован намеренно).

## Схема D1 (`migrations/0001_init.sql`)

`feedback` (id UUID, created_at, updated_at, source_app, platform, app_version, category, body, context_json, status, contact_email, closed_at, version, dedup_key UNIQUE), `feedback_notes`, `feedback_events`, `rate_limit`. Индексы: `(category,status,created_at,id)`, `(status,created_at,id)`, `(created_at,id)`. CHECK-ограничения на category/status/platform/scope. События не хранят текст и email.

## ACL

| | admin | superadmin |
|---|---|---|
| `text_error`, `content_suggestion` | список, карточка, статус, общие заметки | всё |
| `technical_bug`, `feature_suggestion`, `other` | **нет** (404 в карточке/патче/заметках, отсутствуют в списке, поиске, счётчике) | всё |
| email, версия приложения, технический контекст, приватные заметки, UID авторов | нет | да |
| смена категории | нет (403) | да; ACL меняется мгновенно (фильтр категории — в каждом SQL и внутри `UPDATE`) |

## Угрозы и меры

* Подделка/просрочка/чужой `aud`/`iss`/алгоритм `none`: 401 (тесты). `alg:none` принимается только при `ALLOW_EMULATOR_TOKENS=true` и проекте `demo-*`.
* `visibility`, `status`, `id`, `role` из публичного тела игнорируются; context — строгий белый список (путь без query/hash/origin).
* SQL: только `bind`; LIKE с экранированием. XSS: JSON + `nosniff`, UI рендерит текст интерполяцией (не HTML).
* CORS: только `ALLOWED_ORIGINS`; запрос браузера с чужим Origin → 403; нативные клиенты без Origin работают. Cookie не используются (Bearer) → CSRF неприменим.
* Злоупотребление: лимит в минуту на клиента (HMAC IP с суточной солью, сырой IP не хранится), суточный бюджет, рубильник `FEEDBACK_ENABLED=false`, дедуп по `requestId` (двойное нажатие = одна запись).
* Логи Worker не содержат тела/email (проверяется e2e). Turnstile не используется.
* Конкуренция: `version` + атомарный `UPDATE … WHERE version=? AND category IN (scope)`; события вставляются условно.

## Retention

Cron раз в сутки удаляет закрытые обращения старше 180 дней (`RETENTION_DAYS`) и просроченные `rate_limit`. Ручное удаление по просьбе пользователя — команда в operations.

## Экспорт для анализа (без личных данных)

`GET /api/admin/export?format=json|csv&status=&category=&platform=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=` (по умолчанию 500, максимум 1000). Тот же токен и та же ролевая область, что у списка: админ получает только `text_error` и `content_suggestion`, суперадмин — все; фильтр категории из URL не расширяет область.

В экспорт **не** входят: email, заметки (общие и приватные), id авторов действий, время точнее суток (только `date`), IP (он нигде не хранится). Текст и заголовок контекста очищаются: адреса почты → `[email]`, ссылки → `[link]`, телефоны → `[phone]`. У суперадмина добавляется `app_version`. CSV защищён от formula injection (ячейки, начинающиеся с `= + - @`, префиксуются `'`). Ответ `cache-control: no-store`, `content-disposition: attachment`.

Идемпотентность: один `requestId` = одно сообщение. Повтор **идентичного** сообщения возвращает тот же `id` (201, `duplicate: true`); тот же `requestId` с другим текстом/категорией — `409 request_id_reused` (клиент выдаёт новый `requestId` после правки текста и один раз повторяет сам).
