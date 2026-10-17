# Малітоўнік — Web/PWA иконка с литургической закладкой

Канонический `source/approved-icon.png` (1254×1254) сохранён без изменения:
SHA256 `fa8ac6990b67f4a48e5907d00c86aa7306fb44921f079dd5bc92c7bba682a294`.
Этот же исходник включён в Flutter main через PR #11, merge
`0a1457e52ed25bdaea070af86cd8932d731bb144`.

Генератор размещает выбранный рисунок в SVG-контейнере; resvg экспортирует
PNG, Pillow кодирует ICO и переводит непрозрачные изображения в RGB.
`source/pwa-bookmark.svg` — отдельный редактируемый слой только для Web/PWA:
одна матовая бордовая лента `#9B302A` у нижнего наружного края правой страницы.
Координаты заданы в системе 1024×1024 после просмотра исходника. Верх ленты
следует краю страницы, короткая тёмная складка обозначает выход из блока
страниц, хвост имеет V-образный срез. Слой накладывается до общего clipping
и масштабирования, поэтому все цветные Web-поверхности используют одну ленту.
Ветка генерации `--target native` не использует этот слой.
`source/monochrome.svg` — оптическая микроверсия для favicon 16/32.
`asset-manifest.json` содержит SHA256 оригинала, SVG-слоя, 11 PNG, ICO
и двух PNG визуальной приёмки.
Для SVG-слоя закреплён LF через `.gitattributes`, чтобы его SHA256 не зависел
от настройки Git `core.autocrlf`.

```powershell
npm ci --prefix branding/toolchain --no-audit --no-fund
python -m pip install --target branding/toolchain/.venv -r branding/toolchain/requirements.txt
$env:PYTHONPATH = Join-Path (Get-Location) 'branding/toolchain/.venv'
python scripts/generate_brand_assets.py --target web
python scripts/validate_brand_assets.py
npm ci
npm run build
node --test tests/appearance.test.mjs tests/liturgical-theme.test.mjs
node scripts/smoke_brand_install.mjs
```

PWA any и maskable имеют размеры 192/512. Maskable сохраняет весь цветной
круг в центральном радиусе 40% и ровный фон `#F5F1E8` за его пределами.
Apple touch — RGB 180; master — RGB 1024; favicon — 16/32/48/96 и ICO;
меню использует прозрачный `app-brand-96.png`.

Та же команда генерации создаёт `validation/pwa-bookmark-comparison.png`
(2200×1730): слева точный прежний Web-экспорт из утверждённого Flutter-исходника,
справа PWA; 1024/180/60/48/32 показаны в реальном количестве пикселей.
При просмотре листа следует открыть оригинал в масштабе 100%.
Внизу — maskable через круговую и скруглённую Android-маски на светлом/тёмном
фоне. Отдельный `validation/pwa-60.png` также генерируется напрямую resvg.
На 60/48 px бордовая отметка различима, но форма V-среза уже не читается
надёжно; на 16/32 сохранён прежний одноцветный favicon без красного шума.

`validate_brand_assets.py` проверяет неизменность исходника, контрольные суммы,
размеры, непрозрачность install-иконок, прозрачность меню, соответствие каждого
кадра ICO своему PNG, ровный ivory вне maskable safe zone радиуса 40%,
неизменность micro favicon и пикселей master вне области закладки.
Затем повторяет генерацию и требует побайтовой идентичности всех экспортов,
comparison sheet и manifest. Закладка меняет 2382 пикселя master (0,23%).

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
Результаты варианта с закладкой: `validation/pwa-bookmark-review.md`.

Android/iOS требуют проверки на устройствах. Иконки старых закреплённых
PWA могут обновляться с задержкой браузера/ОС.
