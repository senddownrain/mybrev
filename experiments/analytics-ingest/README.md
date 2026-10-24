# analytics-ingest: OFFLINE PROTOTYPE ONLY / NETWORK NOT APPROVED

Локальный прототип приёма агрегатов аналитики `schema_version = 2` на синтетических данных. **Ничего не развёрнуто, нет сети, нет Cloudflare, нет Firestore, клиенты (веб и Flutter) его не используют и не импортируют.** Это не разрешение собирать данные (D-01…D-09 открыты).

```
npm run test:analytics-ingest      # Node 24: без node:sqlite SQLite-тесты ПАДАЮТ (явный пропуск: ANALYTICS_INGEST_ALLOW_SQLITE_SKIP=1); 51 тест
node --test experiments/analytics-ingest/test/p06-*.test.mjs   # только набор P06 (31 тест)
```

| Файл | Назначение |
|---|---|
| `src/core.mjs` | чистое ядро `gate → size → parse → validate → normalize → aggregate`, коды ответов, стоимость |
| `src/storage-memory.mjs` | хранилище в памяти (атомарная запись пакета, дневной бюджет записей) |
| `src/storage-sqlite.mjs` | локальный SQLite `:memory:` (`node:sqlite`) + миграция; файл или удалённая БД запрещены |
| `src/report.mjs` | k-подавление малых ячеек на стороне чтения отчётов (k = 5, проектное решение) |
| `migrations/0001_init.sql` | схема: `cell_counts(cell_key PK, n)`, `daily_budget`, без вторичных индексов |
| `test/p06-*.test.mjs` | P06: kill switch без чтения запроса, fuzz, параллельный бюджет, откат, overflow, retention/UTC, k-отчёт, отсутствие сети/логов |
| `test/*.test.mjs` | сценарии: kill switch, неизвестные поля/ID, `n`, даты, регион, дубликаты, параллельность, откат, бюджет, retention, логи, стоимость, изоляция |

Дизайн адаптера D1 и план интеграционных тестов (D1 SEMANTICS NOT VERIFIED): `docs/analytics-ingest-d1-adapter-design.md`. CI: `.github/workflows/analytics-ingest.yml` (Node 24, без секретов).

Не использовать `wrangler dev`/`wrangler deploy`, не создавать D1: см. `docs/analytics-backend-offline-spike.md` и `docs/analytics-ingest-release-gates.md`.

## P07: офлайн mock согласия и отправки (TEST ONLY / NO DATA SENT)

| Файл | Назначение |
|---|---|
| `src/mock-client.mjs` | `createMockClient` (замки build ∧ server ∧ consent, очередь ≤64 KiB/14 дней, мин. партия, at-most-once flush, revoke) и `createMockBackend` (транспорт `send(packet) → {status}` = вызов P06 `handleIngest` в памяти) |
| `test/p07-mock-client.test.mjs` | 21 тест: общие сценарии, матрица OFF/OFF, ON/OFF, OFF/ON, ON/ON, отсутствие сети (подмена fetch/сокетов/DNS), изоляция от `src/` |
| `demo/consent-demo.mjs`, `demo/build-demo.mjs` | закрытый экран-демо с баннером; `npm run analytics:consent-demo` собирает один html (без внешних ссылок, CSP `connect-src 'none'`) в `demo/out/` (не коммитится) |
| `../../tests/fixtures/analytics-consent-scenarios.json` | общие синтетические сценарии, те же файлом запускаются во Flutter |

Интерфейс для P08 (дашборд на синтетике): `createMockBackend(...).rows()` отдаёт строки `{cell_key, n}` для `buildReport` (k-подавление); сценарии из JSON дают воспроизводимые наборы. Дизайн и границы: `docs/analytics-consent-integration-proposal.md`.
