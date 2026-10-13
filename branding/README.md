# Малітоўнік — согласованная Web/PWA иконка

Канонический `source/approved-icon.png` (1254×1254) сохранён без изменения:
SHA256 `fa8ac6990b67f4a48e5907d00c86aa7306fb44921f079dd5bc92c7bba682a294`.
Этот же исходник включён в Flutter main через PR #11, merge
`0a1457e52ed25bdaea070af86cd8932d731bb144`.

Генератор размещает выбранный рисунок в SVG-контейнере; resvg экспортирует
PNG, Pillow кодирует ICO и переводит непрозрачные изображения в RGB.
`source/monochrome.svg` — оптическая микроверсия для favicon 16/32.
`asset-manifest.json` содержит SHA256 всех 11 PNG и ICO.

```powershell
npm ci --prefix branding/toolchain --no-audit --no-fund
python -m pip install --target branding/toolchain/.venv -r branding/toolchain/requirements.txt
$env:PYTHONPATH = Join-Path (Get-Location) 'branding/toolchain/.venv'
python scripts/generate_brand_assets.py --target web
npm ci
npm run build
node --test tests/appearance.test.mjs tests/liturgical-theme.test.mjs
node scripts/smoke_brand_install.mjs
```

PWA any и maskable имеют размеры 192/512. Maskable сохраняет весь цветной
круг в центральном радиусе 40% и ровный фон `#F5F1E8` за его пределами.
Apple touch — RGB 180; master — RGB 1024; favicon — 16/32/48/96 и ICO;
меню использует прозрачный `app-brand-96.png`.

Имя `Каталіцкі малітоўнік`, короткое имя `Малітоўнік`, start_url, scope,
origin, способ вычисления PWA identity и палитра приложения сохранены.
Новый id не добавлен. Иконка постоянна и не зависит от литургического дня.
Изображения Марии на странице информации и старые ресурсы сохранены.

Smoke устанавливает приложение через Chrome DevTools в новом изолированном
профиле, запускает standalone, проверяет меню в light/dark и точные HTTP
байты иконок. Внешние запросы блокируются маршрутизацией Playwright и DNS
правилом Chrome, в том числе для service worker. Профили, снимки и временный
результат игнорируются Git. BENCHMARK_BROWSER_PATH позволяет выбрать Chrome.
Свежие результаты интеграции: `validation/integration-report.md`.

Android/iOS требуют проверки на устройствах. Иконки старых закреплённых
PWA могут обновляться с задержкой браузера/ОС.
