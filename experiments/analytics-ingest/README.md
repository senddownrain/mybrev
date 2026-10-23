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
