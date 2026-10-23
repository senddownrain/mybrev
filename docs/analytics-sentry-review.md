# Sentry (WEB): факты конфигурации, риски, варианты

Дата проверки: 2026-10-17, `origin/main` `e1bfa8a`. Это аудит фактов, **не изменение**: конфигурация Sentry не менялась и не должна меняться без решения владельца (D-08). Секреты и значение DSN не читались и не выводились.

## 1. Факты из кода (`src/plugins/sentry.js`, `@sentry/vue` 10.41.0)

| Параметр | Значение | Где |
|---|---|---|
| Когда включён | только `import.meta.env.PROD` **и** непустой `VITE_SENTRY_DSN` | `sentry.js:1-2` |
| Загрузка | лениво: `import('@sentry/vue')` через ≈ 2,5 с после `load` (в простое), если включён | `scheduleSentryInit` |
| Интеграции | `browserTracingIntegration({ router })`, `replayIntegration({ networkDetailDenyUrls: [firestore, identitytoolkit, securetoken] })` | `sentry.js` |
| Трассировка | `tracesSampleRate: 0.1` | |
| Replay | `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0` | |
| `beforeSend`, `beforeBreadcrumb`, `sendDefaultPii` | **не заданы** (значения по умолчанию SDK) | поиск по `src` пуст |
| Маскирование replay | явно не переопределено; в установленном SDK `maskAllText = true` по умолчанию (`node_modules/@sentry-internal/replay/build/npm/esm/index.js:9848`), поэтому текст DOM в записи маскируется | проверено по исходникам SDK |
| Ошибки | `logger.error` и `reportToSentry` отправляют исключения/сообщения | `sentry.js`, `src/utils/logger.js` |
| CI | `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}` передаётся в шаг сборки | `.github/workflows/ci.yml` |

## 2. Что подтверждено, а что нет

- **Подтверждено по коду:** при заданном DSN в production-сборке Sentry **будет** отправлять навигационные транзакции и до 10 % записей сессий (100 % сессий с ошибкой).
- **NOT CONFIRMED:** задан ли DSN в production-сборке. Наличие ссылки `secrets.VITE_SENTRY_DSN` в workflow **не доказывает** включение: секрет может быть пустым. Деплой на Hosting делается вручную (`npm run release:hosting`), значит production-сборка зависит от `.env` машины владельца, которого я не читал.
- **NOT CONFIRMED:** что фактически попадает в Sentry (проект, события, retention): нужен доступ к панели Sentry.

## 3. Как владельцу проверить вручную (без публикации секрета)

1. На Mac, с которого делается `release:hosting`: `grep -c VITE_SENTRY_DSN .env.production .env.local .env 2>/dev/null` (только число совпадений, значение не выводить).
2. В готовой сборке: `grep -l "ingest.sentry.io" dist/assets/*.js | head` (домен DSN попадает в бандл) и в `dist/assets/` наличие `vendor-sentry-*.js`.
3. Открыть сайт в браузере, DevTools → Network, фильтр `sentry`/`ingest`; перейти на 2–3 страницы. Запросы на `…ingest…sentry.io` означают, что Sentry включён.
4. В Sentry → Settings → Projects → Client Keys и Performance/Replays: есть ли записи за последние дни.

## 4. Сценарии

| Сценарий | Что сохраняется | Риск для религиозной практики | Как проверить |
|---|---|---|---|
| **A. Sentry OFF** (DSN пуст / не включён) | ничего не уходит в Sentry | отсутствует | шаг 3 §3: нет запросов `sentry` |
| **B. Только ошибки, пути параметризованы** (`traces=0`, `replay=0`, `beforeSend`/`beforeBreadcrumb` заменяют `/prayer/<id>` → `/prayer/:id`, URL без query/hash, без текста) | стек, версия, браузер, обезличённый маршрут | низкий: нет истории открытых молитв; IP виден транспорту | тест на фейковом событии в Sentry-SDK без сети |
| **C. Текущая конфигурация** (traces 10 %, replay 10 % / 100 % при ошибке, значения по умолчанию) | URL и имена транзакций с реальными путями (`/prayer/<id>`, `/song/…`, `/bible/…`), хронология навигации, записи DOM (текст маскируется по умолчанию, но структура и клики остаются), IP транспорта | **высокий относительно контракта аналитики**: это история религиозной практики с привязкой к сессии Sentry, чего контракт аналитики намеренно не делает | шаги §3 + просмотр Replays в Sentry |

Вывод: Sentry (при включении) собирает **больше и детальнее**, чем весь контракт аналитики v2, поэтому «аналитика без ID» теряет смысл, пока Sentry в режиме C. Это не блокирует локальную аналитику, но блокирует любые заявления «мы не собираем историю использования» и любой разговор об отправке.

## 5. Рекомендация (не применена)

Вариант B + `replaysSessionSampleRate = 0`, `replaysOnErrorSampleRate = 0` (или оставить replay только на ошибках с `maskAllText`, `blockAllMedia`, но без путей), `tracesSampleRate = 0`. Это отдельный PR, который меняет поведение production; **требует вашего «да»** и сопровождающей проверки на тестовой сборке, чтобы убедиться, что ошибки по-прежнему доходят. Изменений в `src/plugins/sentry.js` в этой ветке нет.

## 6. Что подтвердить Sentry-аккаунтом (юридически)

Где хранятся данные (регион проекта), DPA, retention, список sub-processors; относится ли Sentry к «трансграничной передаче» по ст. 9 закона 99-З и к международной передаче по GDPR. **NOT CONFIRMED**, нужен специалист (D-01).
