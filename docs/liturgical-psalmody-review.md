# Литургическая терминология и три режима псалмодии

Ветка: `codex/liturgical-terms-psalmody-modes`. Merge и Firebase deploy не выполнялись. Данные Firestore, тексты книг, собственные названия праздников и названия переводов Библии не изменялись.

## Найденные надписи и контекст

Перед изменениями выполнен поиск по `src`, затем по остальному репозиторию. Часть надписей формируется динамически: искомое «3 варыянты аднаго святкавання» не было строковым литералом.

| Старое | Новое | Реальные места использования |
| --- | --- | --- |
| Ранг | Літургічная ступень | `src/views/admin/DayEditor.vue`: поле `_rank`; `src/views/admin/YearOverrides.vue`: ступень добавляемой/заменяемой цэлебрацыі |
| Новы ранг | Новая літургічная ступень | `src/views/admin/YearOverrides.vue`: поле действия `changeRank` |
| Змяніць ранг; выберыце новы ранг | Змяніць літургічную ступень; выберыце новую літургічную ступень | Там же: список действий, выбранное действие и сообщение валидации |
| Назва, дата, ранг або дыяцэзія | Назва, дата, літургічная ступень або дыяцэзія | `src/components/liturgical/FeastsPicker.vue`: полная подсказка `title` и доступное имя поиска; короткий placeholder «Пошук свята» помещается в мобильном поле |
| ранг пацверджаны календаром / крыніцай | літургічная ступень пацверджана календаром / крыніцай | `src/utils/ordo/transferOverrides.js`: подпись подтверждения переноса; `src/data/ordo/ambiguities.js`: объяснение решения в Ordo |
| `{readingSets.length} {alternativeWord(...)} аднаго святкавання` | Магчымасці цэлебрацыі | `src/components/readings/ReadingsView.vue`: блок выбора нескольких наборов чтений одной цэлебрацыі |
| Памінальны афіцый | Афіцый за памерлых | `src/utils/ordoDayOptions.js`: подзаголовок варианта дня; `src/components/ItemsList.vue`: резервный подзаголовок карточки; `src/components/oraparts/DayTitle.vue`: надзаголовок подробного экрана |
| Астатнія тэксты | Тэксты Літургіі гадзінаў апрача ўласных | `src/components/OrasList.vue`: заголовок выбора текстов дня или общих текстов |

Полные названия сохранены. В узком блоке выбора общих текстов заголовок занимает две строки. Для полей ступени используется штатная плавающая подпись Vuetify, без уменьшения глобальных шрифтов. Длинное действие в диалоге Ordo и его пункт меню переносятся, без многоточия.

Внутренние `rank`, `_rank`, `changeRank`, маршруты и алгоритмы Ordo сохранены. Не менялись комментарии разработчиков, исходное свидетельство `src/data/ordo/evidence/pinsk.json` и самостоятельная фраза справки редактора «калі ў аднаго святкавання ёсць асобныя наборы чытанняў» — это объяснение, а не заменяемый заголовок. Надпись «N варыянты» в `fixedSubtitle()` относится к числу шаблонов дня и также не является искомым заголовком.

## Псалмодия и миграция

Единственное актуальное сохраняемое значение — `localStorage.psalmodyMode`. Компонент `PsalmodySettings` используется только на странице `Settings.vue`. В Web режим псалмодии выбирается исключительно в общих настройках. Верхняя панель чтения сохраняет прежние кнопки `−` и `+` для размера текста, без дополнительной кнопки Aa.

| `psalmVerseLayout` | `psalmMarkerBreakMode` | Новый режим | Основание |
| --- | --- | --- | --- |
| alignedLeft | inline | left-break | Сохраняется левый край; точного аналога без переносов среди трёх новых режимов нет, поэтому добавляются переносы без отступа |
| alignedLeft | breakAfterMarker | left-break-indent | Точное соответствие: левый край, переносы, привычный отступ продолжения 0.65em |
| alternatingIndent | inline | alternating-stanzas | Сохраняются чередование строф и отсутствие переносов после знаков |
| alternatingIndent | breakAfterMarker | alternating-stanzas | Точного соответствия нет: приоритет сохранению явно выбранного чередования строф, принудительные переносы убираются |
| отсутствует | inline или breakAfterMarker | alternating-stanzas | Применяется прежнее эффективное значение отсутствующего layout: alternatingIndent |
| alignedLeft | отсутствует | left-break | Прежнее эффективное значение отсутствующего marker mode: inline |
| alternatingIndent | отсутствует | alternating-stanzas | Прежнее эффективное значение marker mode: inline |
| оба отсутствуют | оба отсутствуют | left-break | Новый default; также относится к старой установке, где пользователь никогда не сохранял эти настройки — отличить её по этим ключам от новой невозможно |

Валидный `psalmodyMode` имеет приоритет над старыми ключами. Неизвестные старые значения нормализуются согласно прежним defaults; неизвестный новый ключ позволяет миграцию из старых. Результат миграции сохраняется сразу. Старые ключи оставлены для совместимости с ранее установленной версией, но больше не изменяются и не служат вторым источником настройки.

`PsalmText.vue` — фактический общий рендерер псалмов и кантиков. `formatPsalmHtml()` уже создаёт структурные `p[data-psalm-strophe]`; эта структура сохранена. Декоратор не определяет строфы по ширине экрана и не считает физические строки стихами. Заголовки, рубрики и антифоны исключены из чередования. Существующий `usePsalmody.js` продолжает управлять приглушением хоров и его сбросом при смене даты/варианта.

В первых двух режимах продолжения добавляются после отмеченных `*`/`†`, без отступа или с 0.65em. В третьем режиме внутренние `br` структурной строфы становятся пробелами, знаки и вложенное выделение сохраняются; каждая вторая строфа получает `min(1em, 8%)` слева. Отдельные строфы не склеиваются. Все режимы выровнены влево.

Три равные соединённые кнопки имеют SVG-пиктограммы, белорусские доступные имена и tooltip, `radiogroup`/`radio`, один активный вариант, roving tabindex, стрелки, Home/End, Enter/Space, видимый фокус и высоту 52 px. Размер и семейство шрифта сохраняют прежнее поведение. Псалмодия настраивается только на странице общих настроек; три кнопки доступны при ширине 320 px.

## Проверки

- `npm test`: 1077 тестов, **1067 pass, 10 skip, 0 fail**. Первый запуск внутри sandbox дал ошибки локальных портов/Chromium; полный повтор с доступом к ним прошёл.
- `npx eslint .`: без ошибок и предупреждений. Использован lint без `--fix`, чтобы не менять посторонние файлы.
- `npm run build`: production build и генерация PWA прошли.
- `node scripts/smoke-liturgy-reader.mjs`: четыре профиля, каждый проходит 3 режима × 4 часа × 4 ширины × 3 размера шрифта — **576 проверок компоновки**. Ютрань, Нешпары, Гадзіна чытанняў, Камплета; реальные псалмы из `patchs/json/ordinary-w5-d1-fixed-day.json`, встроенные Benedictus, Magnificat, Nunc dimittis. Обе темы; 320, 375, 390, 768 px; 100%, 150%, 180%. Проверены текст/знаки, отступы, отсутствие внутренних `br` в третьем режиме, горизонтального overflow, приглушение и клавиатура хоров, общая настройка, reload, переходы часов и wake lock.
- Дополнительный DOM-кейс: несколько стихов в одной структурной строфе, оба знака, вложенный `strong`, исключённые рубрики и антифона. Все слова и знаки сохраняются.
- `node scripts/smoke-devotional-office.mjs`: пять профилей дополнительного рендерера прошли, включая кантики и три режима. Скрипт проверки полных частных источников также обновлён для нового ключа; **`smoke-devotional-office-real.mjs` не запускался**, потому что его отдельные исходные файлы не предоставлены.
- `node scripts/smoke-liturgical-terminology.mjs`: карточка дня, выбор общих текстов и наборов чтений — 4 ширины × 2 темы; диалог Ordo на 4 ширинах; клавиатура radio, равная ширина и touch targets, четыре миграции через реальный store с reload, верхняя панель содержит только две кнопки изменения размера шрифта.

Приватного snapshot нет. Браузерные проверки используют локальные тексты и cache fixtures, внешние запросы заблокированы. Live Firestore reads/writes не выполнялись. Проверки screen reader ограничены семантикой DOM и доступными именами Playwright; ручная сессия VoiceOver/TalkBack не проводилась.

## Визуальный отчёт

| Элемент | Наблюдение | Снимки |
| --- | --- | --- |
| left-break | Все строфы слева; после знака новая строка без отступа | [Снимок](liturgical-psalmody-evidence/left-break.png) |
| left-break-indent | Все строфы слева; продолжения с небольшим отступом | [Снимок](liturgical-psalmody-evidence/left-break-indent.png) |
| alternating-stanzas | Отступ у каждой второй строфы; естественный перенос внутри блока | [Снимок](liturgical-psalmody-evidence/alternating-stanzas.png) |
| Переключатель | Три соединённые равные кнопки, активный вариант выделен | [Светлая](liturgical-psalmody-evidence/controls-light.png), [тёмная](liturgical-psalmody-evidence/controls-dark.png) |
| Общие тексты, 320 px | Полный заголовок читается в две строки | [Светлая](liturgical-psalmody-evidence/common-texts-light-320.png), [тёмная](liturgical-psalmody-evidence/common-texts-dark-320.png) |
| Наборы чтений, 320 px | «Магчымасці цэлебрацыі» читается целиком | [Снимок](liturgical-psalmody-evidence/celebration-light-320.png) |
| Карточка, 320 px | «Афіцый за памерлых» без обрезания | [Снимок](liturgical-psalmody-evidence/day-card-light-320.png) |
| Диалог Ordo, 320 px | Действие переносится; полная плавающая подпись ступени | [Снимок](liturgical-psalmody-evidence/ordo-rank-320.png) |

Снимки псалмов показывают сам компонент: плавающая панель навигации скрыта только при захвате, чтобы она не закрывала текст. Остальные снимки показывают действующие элементы интерфейса. Карточки и наборы чтений собраны в локальном тестовом cache; даты/число вариантов — тестовый контекст.

## Изменённые файлы

- `docs/liturgical-psalmody-evidence/alternating-stanzas.png`
- `docs/liturgical-psalmody-evidence/celebration-light-320.png`
- `docs/liturgical-psalmody-evidence/common-texts-dark-320.png`
- `docs/liturgical-psalmody-evidence/common-texts-light-320.png`
- `docs/liturgical-psalmody-evidence/controls-dark.png`
- `docs/liturgical-psalmody-evidence/controls-light.png`
- `docs/liturgical-psalmody-evidence/day-card-light-320.png`
- `docs/liturgical-psalmody-evidence/left-break-indent.png`
- `docs/liturgical-psalmody-evidence/left-break.png`
- `docs/liturgical-psalmody-evidence/ordo-rank-320.png`
- `docs/liturgical-psalmody-review.md`
- `scripts/smoke-devotional-office-real.mjs`
- `scripts/smoke-devotional-office.mjs`
- `scripts/smoke-liturgical-terminology.mjs`
- `scripts/smoke-liturgy-reader.mjs`
- `src/components/ItemsList.vue`
- `src/components/OrasList.vue`
- `src/components/PsalmodySettings.vue`
- `src/components/liturgical/FeastsPicker.vue`
- `src/components/oraparts/DayTitle.vue`
- `src/components/oraparts/PsalmText.vue`
- `src/components/readings/ReadingsView.vue`
- `src/data/ordo/ambiguities.js`
- `src/stores/settings.js`
- `src/styles/main.scss`
- `src/utils/ordo/transferOverrides.js`
- `src/utils/ordoDayOptions.js`
- `src/utils/psalmodyDisplay.js`
- `src/views/admin/DayEditor.vue`
- `src/views/admin/YearOverrides.vue`
- `tests/psalmody-preferences.test.mjs`
