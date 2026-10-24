# P08 evidence: офлайн-демопанель на синтетике

SYNTHETIC DATA — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ · ОТКРЫТИЯ ≠ ЛЮДИ. Реальных данных, сети, endpoint и секретов нет.

| Файл | Что это |
|---|---|
| `report.json` | sanitised synthetic report: `npm run analytics:dashboard-demo -- docs/analytics-evidence/p08` (файл `dashboard.html` из этого каталога не коммитится, он пересобирается) |
| `report.csv` | те же опубликованные ячейки плоским списком |
| `screenshots/01…06` | Chromium-панель Claude, `http://127.0.0.1` (loopback): обзор, разделы/fv/er/sd, sd+функции+топ материалов, ошибки+негативные сценарии, kill switch off, мобильный 375 px с фильтром ios |

Сверка UI с `report.json` (скрипт в браузере): KPI «открытий» при фильтре платформы all/web/android/ios = 6 112 / 3 177 / 1 772 / 1 163 = сумма ячеек отчёта; по разделам songs 726, hours 1 329 — совпало; столбики функций совпали с отчётом. Сеть: DevTools/`read_network_requests` показали только сам `dashboard.html`, `performance` resource entries = 0.

Тест `evidence` в `test/p08-dashboard.test.mjs` падает, если эти файлы устарели относительно генератора.
