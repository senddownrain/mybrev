# Аналитика: baseline производительности веба

Снято на текущем коде до подключения аналитики. Контракт (`src/utils/analytics/contract.js`) ничем
не импортируется, поэтому влияние на production bundle на этом этапе — **нулевое** (проверено
сравнением сборок, §3). Проценты замедления не выдуманы: сравнение «до/после» возможно только на
одинаковом стенде по методике §4.

## 1. Стенд

| Параметр | Значение |
|---|---|
| Дата | 2026-10-14 |
| Коммит baseline | `18ac50a` (main), ветка `feature/analytics-contract` |
| Узел | Node v24.2.0, macOS Darwin 25.4.0; модель машины не фиксировалась |
| Сборка | `npm run build` (`prebuild` = `icons:generate`), Vite 6, без `VITE_SENTRY_DSN` и Firebase-переменных (чанки Sentry всё равно собираются как lazy) |
| Время сборки | 16,4 с (wall, один прогон, прогрев кеша node_modules не контролировался) |
| Прекеш PWA | 147 записей, 6460,73 КиБ |

## 2. Размеры: initial bundle (из `dist/index.html`)

Initial = `<script type=module>` + `modulepreload` + `<link rel=stylesheet>` из `index.html`. Байты (сырые /
gzip / brotli), считаны скриптом по файлам `dist/assets/*`:

| Файл | raw | gzip | brotli |
|---|---:|---:|---:|
| index-65ih2a_n.js (app) | 546 226 | 136 249 | 110 596 |
| vendor-vue | 106 950 | 41 706 | 37 552 |
| vendor-vuetify (js) | 286 256 | 89 213 | 74 885 |
| vendor-firebase-core | 95 400 | 29 251 | 25 498 |
| vendor-firebase-firestore | 410 802 | 92 716 | 68 462 |
| vendor-markdown | 179 048 | 77 888 | 66 067 |
| vendor-moment | 60 802 | 19 581 | 17 768 |
| vendor-date-fns | 39 834 | 10 121 | 8 900 |
| vendor-vuetify (css) | 151 923 | 20 681 | 17 112 |
| index (css) | 307 200 | 40 664 | 21 171 |
| **Итого initial** | **2 184 441** | **558 070** | **448 011** |

Прочее: всего JS в `dist/assets` — 96 файлов, 6 531 688 байт raw; отложенный чанк
`vendor-sentry` — 435 608 raw / 143 931 gzip (грузится динамически через `scheduleSentryInit`
только при заданном DSN в production, не входит в initial).

## 3. Размер аналитического добавочного кода

| Показатель | Значение |
|---|---|
| `src/utils/analytics/contract.js` исходник | 9 689 байт |
| то же, минифицированное esbuild | 5 554 байт, gzip 2 512 байт |
| Вклад в initial bundle сейчас | **0**: модуль не импортируется; тест `tests/analytics-contract.test.mjs` («stage guard») падает, если любой файл в `src/` его импортирует |
| Проверка | `npm run build` после коммита контракта: индексный чанк и список initial-файлов совпадают с baseline по именам и размерам (см. отчёт, раздел проверок) |

Если ядро аналитики подключат в initial, потолок бюджета на ядро — предложение: ≤ 6 КиБ gzip
(контракт ≈ 2,5 КиБ gzip + сборщик). Это бюджет, а не измерение.

## 4. Методика cold/warm render (не выполнена в этом окружении — цифр нет)

Причина: стартовый экран и маршруты требуют данных Firestore. Production-квота исчерпана (до
~07:00 UTC 2026-10-14), живое чтение запрещено; для измерений нужны эмулятор Firestore/Auth и
посев из локального снимка (так проводился аудит `audit/responsive`, `RESPONSIVE_AUDIT.md` §0:
`connectFirestoreEmulator`/`connectAuthEmulator` за флагом `VITE_USE_EMULATOR`, временный
незакоммиченный хук в `src/plugins/firebase.js`). Хук в этой ветке **не добавлялся**.

Повторяемые параметры стенда (фиксировать при каждом прогоне): машина и ОС, версия Node, версия
Chromium (в кеше Playwright: `chromium-1228`, `chromium_headless_shell-1228`), CPU/network throttling
(рекомендуется: без throttling и отдельный прогон 4× CPU slowdown), число прогонов (≥ 5 на маршрут, как
требует скрипт), одинаковые данные эмулятора, `BENCHMARK_BASE_URL`, холодный кеш = новый контекст
браузера, тёплый = повторный переход в том же контексте/после Service Worker.

Команды:

```bash
# 1. сборка и статический сервер продакшн-бандла
npm run build
npm run preview -- --port 4173 --host 127.0.0.1 &

# 2. эмуляторы (локальный посев из backups/firestore-snapshot*; без live Firestore)
firebase emulators:start --only auth,firestore --project demo-responsive
#    засеять эмулятор локальным снимком скриптами проекта; подключить приложение к эмулятору
#    флагом VITE_USE_EMULATOR=1 при сборке (требует временного хука из RESPONSIVE_AUDIT.md)

# 3. измерение маршрутов (Playwright chromium, ≥5 прогонов на маршрут)
BENCHMARK_BASE_URL=http://127.0.0.1:4173 \
BENCHMARK_BROWSER_PATH="$HOME/Library/Caches/ms-playwright/chromium-1228/chrome-mac/Chromium.app/Contents/MacOS/Chromium" \
BENCHMARK_RUNS=7 npm run benchmark:routes
```

(путь к Chromium в macOS-кеше проверить перед запуском; `scripts/benchmark-routes.mjs` по умолчанию
указывает на Windows-путь Chrome). Сравнение «до/после»: те же команды на коммите до и после
подключения аналитики, те же данные эмулятора, один процесс машины; сравнивать медианы и
разброс, не единичные прогоны. Дополнительно после подключения: количество сетевых запросов на
маршруте при `analytics_network_enabled=false` должно быть равно baseline (ожидается 0
аналитических запросов), и ни один tap/scroll не должен порождать запрос.

## 5. Бюджет и критерии приёмки для будущей реализации (предложения)

1. Ноль сетевых запросов аналитики при выключенном шлюзе.
2. Ноль синхронных I/O на scroll/tap; запись в хранилище только при `hidden`/`pause`.
3. Прокрутка: один пассивный слушатель/`IntersectionObserver`, обновление максимума без `setState`/реактивного
   состояния Vue (обычная переменная вне реактивности).
4. Прирост initial gzip ≤ 6 КиБ; ядро аналитики загружать лениво после первого экрана
   (по образцу `scheduleSentryInit`).
5. Отчёт «до/после» обязателен по §4; без него пункт не считается выполненным.
