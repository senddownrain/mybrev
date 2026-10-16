# Отчёт: веб-аналитика, этап 2 (2026-10-16)

Ветка `feature/analytics-stage2` (от `feature/analytics-contract`, PR mybrev#128 открыт и не слит).
Статус: локальный счёт только в тестовой сборке (`VITE_ANALYTICS_LOCAL=true`), сети нет, админки нет.

## 1. Что изменено

| Файл | Изменение |
|---|---|
| `src/utils/analytics/contract.js` | **v2**: `reading:day`, событие `catalog_open`, `CATALOG_IDS`, `schema_version = 2` |
| `src/utils/analytics/collector.js` | визиты каталогов, `importPackets` |
| `src/utils/analytics/routeMapper.js` | чтения → `reading:day`; каталоги → `catalogId`; часть компендиума → `comp:pN` |
| `src/utils/analytics/localAnalytics.js` | буфер `localStorage` (только тест), хук функций, каталоги |
| `src/utils/trackFeature.js` | пустая функция в обычной сборке; в тестовой передаёт только id функции |
| `src/stores/settings.js`, `ui.js`, `BackToTop.vue`, `PrayerView.vue`, `Bible.vue`, `Song.vue`, `Default.vue`, `CustomDatePicker.vue` | вызовы `trackFeature('…')` на успешных действиях |
| `scripts/analytics/build-public-inventory.mjs`, `public-inventory.json` | 750 ID (+`reading:day`, +4 части компендиума) |
| `tests/…`, `tests/fixtures/analytics-contract-v2.json` | тесты и эталон v2 |
| `docs/analytics-contract.md` (§16), `-handoff-flutter.md` (§0), `-privacy.md` (§6.2) | v2, миграция, хранение |

## 2. Актуальная схема событий (v2)

`screen_view{section, content_id?, n}` · `text_read{section, content_id, metric fv|er|sd, bucket, n}` ·
`feature_use{feature_id, section, n}` · `catalog_open{catalog_id, n}` · `measurement_error{error_id, n}`.
Пакет: `schema_version=2, day (UTC), platform, app_version (major.minor), region=UNKNOWN, cells[]`.
Без user/device/session ID, URL, меток отдельных действий, истории переходов. «Число открытий» ≠
«число людей»; `estimated_reading_time` — условная модель (120 слов/мин, 6 символов/слово), не
подтверждение чтения или молитвы.

## 3. Ответы по пунктам задания

1. **Чтения:** `reading:day`, `fv/sd/er`; без даты и текста; загрузка/ошибка (< 200 символов) не считаются. Различение Евангелия **не реализовано** (предложено в контракте §16, нужно решение).
2. **Каталоги:** `catalog_open` отдельным событием; двойного счёта нет (маппер возвращает материал либо каталог).
3. **Функции:** подключено 21 из 27 (список и непокрытые — контракт §16.1). Поиск не подключён: в UI нет отдельного действия «отправить поиск» без запроса.
4. **Инвентарь:** сверен с бандлом приложения (bundle `1791877294111`); отличия от production НЕ ПРОВЕРЕНЫ (живых чтений не делалось). Найдено: читаемая единица компендиума — часть `p1–p4`, не глава; исправлено.
5. **Время/прокрутка:** монотонная логика коллектора (фон, 5 мин, двойной триггер, возврат); прокрутка по таймеру 200 мс, без записи на scroll. Вложенный скролл, смена размера окна, крупный шрифт на реальных экранах — НЕ ПРОВЕРЕНЫ.
6. **Хранение:** противоречие снято (§16.2 контракта): буфер `localStorage` только в тестовой сборке, ≤ 64 КиБ, 14 суток, запись на `pagehide`/скрытие.
7. **Sentry:** см. §5.

## 4. Проверки

| Проверка | Результат |
|---|---|
| Тесты | аналитики 39/39; весь `npm test` 845: 838 пройдено, 0 упало, 7 пропущено (не разбирались); eslint чисто; `npm run build` проходит; в сборке без флага 0 совпадений `__analyticsLocal`, `__analyticsFeature`, `screen_view`, `catalog_open` |
| Размер initial (gzip, 10 файлов, сборка без флага) | базовая версия до аналитики `18ac50a`: 554 948 Б; ветка без флага: 555 028 Б (**+80 Б**); с флагом: 555 301 Б (+353 Б). Ленивый чанк `localAnalytics` только в тестовой сборке: 36 441 Б raw / 14 095 Б gzip. Бюджет ≤ 6 КиБ initial: выполнен |
| Горячие пути коллектора (Node 24, не браузер) | `reportScroll` ≈ 12 нс; цикл «вход–прокрутка–закрытие» визита ≈ 2,9 мкс; `snapshot` ≈ 0,3 мс на 16 ячеек |
| Браузер (тестовая сборка, без Firestore): каталог песен → песня → размер текста → избранное → About/Settings | получены `catalog_open songs`, `screen_view`+`fv`+`sd=fit`+`er` песни, `text_scale_change`×2, `favorite_add/remove`, `screen_view` about/settings; буфер `localStorage` 935 Б; после перезагрузки восстановлено 10 ячеек; `clear()` стирает; запросов аналитики нет |

**НЕ ПРОВЕРЕНО (`NOT TESTED`):** реальные чтения, молитва, час, Месса, книги обеих Библий, компендиум на живых данных (нужны чтения Firestore: нужно новое разрешение владельца); замеры в браузере «до/после» (≥ 5 прогонов на маршрут: время открытия, переходы, отзывчивость скролла, память) — без данных не выполнены; вложенная прокрутка на реальных экранах; ru-Библия.

Пример итоговых агрегатов (из проверки, без персональных данных): `catalog_open|songs|1`, `feature_use|text_scale_change|songs|2`, `text_read|songs|song:holysongs-…|sd|fit|1`.

## 5. Sentry (только анализ, конфигурация не менялась)

Факты по коду `src/plugins/sentry.js`: включается только в production при заданном `VITE_SENTRY_DSN`;
`tracesSampleRate 0.1`; `replaysSessionSampleRate 0.1`, `replaysOnErrorSampleRate 1.0`;
`browserTracingIntegration({ router })`; для replay закрыты тела запросов Firestore/Identity. DSN в
локальном `.env.local` не задан; в CI сборка получает `secrets.VITE_SENTRY_DSN` — **задан ли он в production, не проверялось** (секрет не читался).
Риски (вывод по настройкам, фактический объём данных НЕ ПОДТВЕРЖДЁН): трассировка и replay записывают
навигацию по реальным путям, включая `/prayer/<id>`, `/songs/…`, `/bible/…` — это история религиозной
активности с IP транспортного запроса; replay пишет DOM (по умолчанию текст маскируется). Варианты
минимизации (решение владельца): (a) выключить replay и трассировку (`0`); (b) оставить ошибки,
добавить `beforeBreadcrumb`/`beforeSend`, заменяющие пути параметризованными (`/prayer/:id`);
(c) отключить Sentry. Рекомендация: (b) плюс replay = 0.

## 6. Дальше

Flutter: `docs/analytics-handoff-flutter.md` §0 (v2). PR без merge/deploy.
