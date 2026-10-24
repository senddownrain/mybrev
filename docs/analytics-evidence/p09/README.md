# P09 evidence (2026-10-24)

Все логи получены на фиксированных SHA из `docs/analytics-two-week-handoff.md` §3; локальные пути заменены на `<worktree>`, `<chromium>`, `<scratch>`. Секретов и персональных данных нет (сборки — с фиктивными `VITE_FIREBASE_*` из CI).

| Файл | Что |
|---|---|
| `logs/web-*.log`, `web-*.json` | eslint, test:analytics (52), test:analytics-ingest (85 на дереве без P09; 90 с P09), npm test (summary: 1 red = marian-feast-references), build false/true, smoke (23 ok), perf (7 прогонов) |
| `logs/flutter-*.log` | analyze, test/analytics (+68 ~8; с флагом +75 ~1), хвост полного прогона (+1425 ~8 −1: lectionary_parity) |
| `e2e-out/` | `npm run analytics:e2e`: `e2e-result.json`, `report-x1.json`, `report-x6.json`, `dashboard-e2e.html` |
| `device-aggregates/` | Hive-дампы iOS Simulator и Android emulator из P03 + отчёт P03 (public ID, без устройств/URL/ID) |
| `screenshots/` | панель (desktop, 375 px), синтетика |

Не включено: полный `npm test` лог (>1 МБ, шум контента) — только сводка; полный `flutter test` лог — только хвост.
