# Runbook оператора: офлайн-прототип аналитики (P09)

Область: **только** локальный прототип `experiments/analytics-ingest/` и тестовые сборки (`VITE_ANALYTICS_LOCAL`, `ANALYTICS_LOCAL`). Production-сбора нет. Ничего здесь не включает сеть.

## Start (демо)

```bash
node -v                                  # 24.x
npm ci
npm run analytics:e2e                    # сквозной прогон (docs/analytics-evidence/p09/e2e-out/)
npm run analytics:dashboard-demo         # большая синтетика P08
```

Тестовая локальная сборка WEB (для ручного просмотра счётчиков в браузере, **не публиковать**):

```bash
# значения VITE_FIREBASE_* — те же фиктивные, что в .github/workflows/ci.yml
VITE_ANALYTICS_LOCAL=true npm run build
```

Flutter (тестовая сборка, только локальный Hive):

```bash
flutter run --dart-define=ANALYTICS_LOCAL=true -d <simulator|emulator>
```

## Test

| Что | Команда | PASS |
|---|---|---|
| WEB аналитика | `npm run test:analytics` | 0 fail |
| Приём/mock/панель/P09 (Node 24) | `npm run test:analytics-ingest` | 0 fail, 0 skipped (SQLite не пропущен) |
| Реальные экраны (эмулятор) | `JAVA_HOME=<JDK 21+> npm run analytics:smoke` | все «ok» |
| Перф до/после | `npm run analytics:perf` | отчёт JSON |
| Flutter | `flutter test test/analytics`, `flutter test --dart-define=ANALYTICS_LOCAL=true test/analytics`, `flutter test` | analytics 0 fail; полный suite — см. известные красные контент-тесты в handoff §3.2 |
| Parity | `npm run analytics:parity` (после слияния #159) | 0 расхождений |

## Stop / выключить

- Тестовая сборка: пересобрать без флага (`VITE_ANALYTICS_LOCAL` не задан / `ANALYTICS_LOCAL` не задан) — код аналитики не попадает в бандл (WEB: 0 вхождений `analytics_local_v1`).
- Очистка локальных агрегатов: WEB — кнопка/вызов `clear()` в тестовой сборке или удаление ключа `localStorage.analytics_local_v1`; Flutter — удаление приложения/бокса `analytics_local_v1`; симулятор: `xcrun simctl uninstall <udid> by.mybrev.testflight2026`; эмулятор: `adb uninstall by.mybrev.playtest2026`.
- Kill switch и opt-out в клиентах — **mock** (P07), в реальных клиентах не реализованы (G12).

## Backup / rollback

- Серверной части нет: бэкапить нечего. Данные прототипа живут только в памяти процесса / SQLite `:memory:` (файловая или удалённая БД запрещена кодом).
- Артефакты (`e2e-out/`, `dashboard-demo/out/`) воспроизводимы по seed; удалять свободно.
- Откат разработки: закрыть Draft PR; ничего не слито и не развёрнуто. Удаление локальных worktree: `git worktree remove <path>`.
- **Нельзя:** `firebase deploy`, `wrangler deploy`, создание D1/Worker, публикация `dashboard*.html`, подмена данных реальными.

## Troubleshooting

| Симптом | Причина / действие |
|---|---|
| `test:analytics-ingest` падает на SQLite | Node < 24 (`node:sqlite`). Использовать Node 24; пропуск — только явно `ANALYTICS_INGEST_ALLOW_SQLITE_SKIP=1` и тогда это NOT TESTED |
| `analytics:smoke` → «firebase-tools no longer supports Java version before 21» | Java < 21. Задать `JAVA_HOME` на JDK 21+ только в этом shell |
| `npm run build` → «Missing Firebase web build configuration» | задать фиктивные `VITE_FIREBASE_*` как в CI; реальные ключи не нужны |
| `analytics:smoke`/`perf` не находят снапшот | передать `SMOKE_SNAPSHOT`/`SMOKE_STATIC_SNAPSHOT`/`PERF_*` (локальные снапшоты; живой Firestore не читать) |
| `npm run analytics:e2e` меняет `e2e-out/` | ожидаемо только при изменении кода/источников; тест `p09-e2e.test.mjs` сверяет закоммиченный JSON |
| ×1-отчёт пустой | не ошибка: ячейки < k=5 скрыты |
| Flutter `lectionary_parity_test` красный | известная контентная проблема (handoff T-01), не аналитика |
| WEB `marian-feast-references` красный | известная контентная проблема на main (T-02) |

## Запрещено оператору без отдельного решения владельца

Включать сеть, задавать endpoint/секреты, менять Sentry в production, менять App Privacy / Data safety, публиковать панель, использовать реальные данные. См. `docs/analytics-open-decisions.md`.
