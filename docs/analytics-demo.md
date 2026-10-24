# Демонстрация аналитики на синтетике (P09)

**SYNTHETIC DATA — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ · ОТКРЫТИЯ ≠ ЛЮДИ.** Это закрытая локальная демонстрация. Она не отправляет данные, не требует секретов и **не одобряет реальную отправку** (D-01…D-09 открыты).

Нужен Node 24 (проверено на 24.2.0). Эмулятор Firestore и браузер нужны только для `analytics:smoke`/`analytics:perf`.

## Сквозной сценарий (5 минут)

```bash
npm ci
npm run analytics:e2e
```

Что происходит: WEB-коллектор (реальный код) + агрегаты эмулятора Android и симулятора iOS (`docs/analytics-evidence/p09/device-aggregates/`, из QA P03) → mock-клиент (замки build ∧ server ∧ consent) → mock-транспорт → ядро приёма P06 → хранилище в памяти → rollup P08 с k = 5 → отчёт → HTML. Команда печатает JSON и пишет `docs/analytics-evidence/p09/e2e-out/`.

Ожидаемо (PASS): `storedEqualsExpected: true` в обоих прогонах; `networkAttempts: []`; `x1.report.publishedOpens = 0` (один QA-сеанс — всё ниже k); `x6.report.publishedOpens = 138`; в матрице `gates` у всех строк `sent: 0` и `transportCalls: 0`; `privacyScan: []`.

Просмотр панели (с диска, без сервера): открыть `docs/analytics-evidence/p09/e2e-out/dashboard-e2e.html`. Если нужен http для скриншотов — только loopback: `python3 -m http.server 8765 --bind 127.0.0.1 -d docs/analytics-evidence/p09/e2e-out`.

**Как читать прогоны.** ×1 — то, что реально произвёл один QA-сеанс: сумма почти пустая, потому что k-подавление скрывает ячейки меньше 5; это правильное поведение, а не ошибка. ×6 — те же пакеты, предложенные 6 раз, **только чтобы показать, как выглядит панель при ячейках ≥ k**; шесть копий — не шесть людей.

## Большая синтетика (P08)

```bash
npm run analytics:dashboard-demo     # 3 платформы × 21 день, 1 615 пакетов, 14 негативных сценариев; пишет в dashboard-demo/out/ (в .gitignore)
open experiments/analytics-ingest/dashboard-demo/out/dashboard.html
```

Золотые суммы seed 20261024: открытия 6 112, каталоги 1 256, `fv` 4 976, функции 1 559, ошибки 68 (все ≥ k, ≤ сырья). Подробности — `experiments/analytics-ingest/dashboard-demo/README.md`.

## Что показать владельцу

1. Баннер «SYNTHETIC DATA · ОТКРЫТИЯ ≠ ЛЮДИ»; нет счётчика людей.
2. Переключатель «Состояние приёма»: «Kill switch» → «данных нет», не нули как факт.
3. Фильтры платформа/раздел: суммы только по показанным ячейкам, всегда «не менее».
4. `e2e-result.json`: матрица замков (build OFF / kill switch OFF / consent OFF / revoke → ничего не отправлено, очередь стёрта).
5. Письменный список решений: `docs/analytics-open-decisions.md`.

## Что демонстрация НЕ доказывает

Реальное поведение пользователей (данные выдуманные или из двух QA-сеансов); физические устройства; D1; продакшн Sentry; юридическую допустимость.
