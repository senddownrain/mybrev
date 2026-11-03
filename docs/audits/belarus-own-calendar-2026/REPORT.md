# REPORT — собственный литургический календарь Беларуси

Дата аудита: **3 ноября 2026, Europe/Moscow**. Репозиторий: `senddownrain/mybrev`, версия приложения 4.5.2. Ветка: `audit/belarus-own-calendar-2026`. База: `8a7017412ee04ec43eaee7a9fe2dacd64999b54c` — актуальный `origin/main`, полученный `git fetch origin main`. Начальное рабочее дерево чистое. Аудиторский commit сообщён при сдаче; его можно найти через `git log -1 -- docs/audits/belarus-own-calendar-2026`.

## Результат и границы достоверности

Выполнена полная сверка **всех 13 страниц предоставленного PDF и всех bundled календарных определений HEAD**, а также прогон каждой даты 2025–2035 для четырёх диоцезий. **Production Firestore и пользовательский offline cache: UNVERIFIED**. Полнота этого отчёта относится к доступным первичному PDF, репозиторию и описанным источникам; совпадение актуального серверного календаря с bundled revision 3 не заявляется.

Эталон: **263 печатные записи/варианта**, **249 технических identity**, из них 28 явно диоцезальных строк (39 применений по диоцезиям). В REFERENCE сохранены все общие/европейские/белорусские строки и все отдельные диоцезальные варианты. Слой general — 221 строка, Europe — 5, Belarus — 8, diocese — 28, general+Belarus — 1. Ранги: optional 126, memoria 77, festum 41, solemnitas 18, All Souls special 1. Красная звёздочка сохранена у 36 строк.

**48 содержательных строк расхождений по области/наличию/рангу/дате:** Минск 1, Витебск 5, Пинск 14, Гродно 28. В это число входят две технические стороны одного нерешённого вопроса Braslau. Это не число незаконных празднований: 23 добавления требуют отдельного источника/решения комиссии; отсутствие в PDF установлено, отсутствие позднейшего права не доказано. Другие текстовые и content-вопросы посчитаны отдельно.

`DIFF.csv`: **1055 строк**, включая 1011 полных сравнений permanent identity×diocese, 29 content-метаданных, 4 годовых решения, 6 строк проверки runtime-правил, 4 строки титула Иренея и 1 воспроизведённый дефект runtime memo. Фильтр `row_kind=permanent` обязателен для следующей таблицы. Категории могут пересекаться; MATCH означает совпадение сравниваемых постоянных данных, а не юридическую экспертизу всех правил/текстов. Восемь легитимных универсальных добавлений вне PDF отмечены UNIVERSAL_UPDATE, не EXTRA.

| Категория постоянных определений | Минск | Витебск | Пинск | Гродно | Всего |
|---|---:|---:|---:|---:|---:|
| MATCH | 228 | 225 | 224 | 222 | 899 |
| EXTRA_NOT_IN_OWN_CALENDAR | 0 | 0 | 9 | 14 | 23 |
| MISSING | 1 | 2 | 1 | 1 | 5 |
| RANK | 0 | 1 | 4 | 12 | 17 |
| DATE | 0 | 0 | 0 | 3 | 3 |
| DIOCESE_SCOPE | 0 | 2 | 1 | 0 | 3 |
| TITLE | 14 | 16 | 14 | 15 | 59 |
| UNIVERSAL_UPDATE | 3 | 3 | 3 | 3 | 12 |
| POSSIBLE_LOCAL_ONLY | 0 | 0 | 9 | 14 | 23 |
| NEEDS_DECREE | 0 | 2 | 9 | 14 | 25 |
| PARSER_UNCERTAIN | 0 | 1 | 0 | 0 | 1 |


## Источники и метод

Предоставленный [PDF](input/SOURCE_Ulasny_kalyandar_dyiacezii_na_Belarusi.pdf) имеет 13 страниц, SHA-256 `681a59f92395a299510da4b4afc68d79cf0017518c0abb1351828560796017f3` — совпадает с пакетом. PDF metadata: создание/изменение 08.10.2026 09:39:39 +03:00. Это техническая дата файла, не дата вступления календаря в силу и не заверение комиссии. Протоколы `2366/96/L`, `2270/96/L`, `796/03/L`, `417/12/L`, `371/00/L`, `209/23` приняты как рабочая нормативная предпосылка из вводного текста; сами акты не получены и независимо не сверены.

Вложенные PROMPT_01 и PLAN использованы только как спецификация запрошенной фазы аудита. PROMPT_02, PROMPT_03 и инструкции о будущих исправлениях/публикации не исполнялись. Гипотезы AUDIT_SEED_CASES не принимались за норму: проверены все 30 строк, включая контроли; результат — [SEED_COVERAGE.csv](evidence/SEED_COVERAGE.csv).

PDF просмотрен визуально постранично после рендеринга, с дополнительной проверкой шрифтов, цвета и координат текстовых span. Парсер вспомогательного текста восстановил строки, а технические ID сопоставлены по дате и заголовку с последующим просмотром полного списка. Ранги не брались из кода. `У ... дыяцэзіі` — область следующего варианта, не изменение всех четырёх диоцезий; область сбрасывается на следующей дате. Отдельные записи одного дня не склеиваются. Generic вариант и диоцезальная модификация одной identity не становятся двумя независимыми опциями.

Отсутствие печатного ранга означает optional по с.1. Исключение технического представления: 2 ноября — именованный особый день All Souls, в PDF без подписи ранга; `printed_rank` пуст, `rank_basis=special-all-souls-unranked`. Он явно не преобразован в необязательное воспоминание. Шрифтовые/редакционные исключения записаны, а не скрыты. Звёздочка у Holy Name Jesus сохранена буквально, при этом identity относится также к Общему календарю; она не трактуется как исключительное белорусское право. High Priest, наоборот, национальный праздник без звёздочки в этой верстке.

Полнота эталона проверена: 262 строки прямо участвуют в DIFF; общий вариант Вастрабрамской PDF-228 явно заменён всеми четырьмя напечатанными диоцезальными вариантами PDF-231/232/233. Это отражено в [REFERENCE_COVERAGE.csv](evidence/REFERENCE_COVERAGE.csv), пропущенных эталонных строк нет.

| Страница PDF | Записей | Что визуально проверено |
|---|---:|---|
| 1 | 21 | Красная звёздочка; курсив; правило ранга по умолчанию; Матулевіч только Витебск memoria. |
| 2 | 16 | Многострочное «Гродзенскай і Віцебскай» для Сапоцькі. |
| 3 | 11 | Казімір и кафедральное посвящение Минска. |
| 4 | 15 | 23.04: два отдельных optional в одной строке, не составное празднование. |
| 5 | 23 | Баболя: Пинск solemnitas; Минск/Витебск memoria; Гродно optional. |
| 6 | 3 | Maці Касцёла memoria; Троица и Corpus Christi. |
| 7 | 22 | Пять пресвитеров Витебска 12.06, без ранга; движимые правила. |
| 8 | 25 | Тракельская 05.07: прямой шрифт, красное Успамін*; Будславская и Кармель. |
| 9 | 31 | Кангрэгацкая курсив без ранга; Кольбэ festum в Гродно; Чэнстахоўская только три диоцезии. |
| 10 | 25 | Две строки 08.09; многострочные общие и диоцезальные области; патронат Михаила. |
| 11 | 24 | Ньюман курсив 09.10; Цэліна только Гродно/Витебск. |
| 12 | 26 | Вастрабрамская: разные ранги, Витебск курсив без ранга; Язафат. |
| 13 | 21 | Гродно 04.12 festum; нет Барбары; опечатка Латэранскай 10.12; правило Святой Семьи. |


## Архитектура и инвентаризация

| Уровень | Что действительно является входом | Результат/потребитель |
|---|---|---|
| Editable seed | `src/constants/fixedCalendar.js` — 263 строки: 227 без place, 36 с place | `fixedCelebrations.js:205`, затем `seed.js:40`/`:112` |
| Дополнительные слои | `src/data/ordo/layers.js:25`: BY 7 modify; Grodno 14 add/13 modify; Pinsk 9 add/4 modify; Vitebsk 1 add; Minsk 0 | Не отдельный runtime calendar; объединяются и дедуплицируются с place-строками |
| Движимые определения | `src/utils/ordo/movableFeasts.js:162` — 14, BY правила computus | `seed.js:143` переводит anchors в безопасный declarative date DSL |
| Годовые решения | `src/data/ordo/year-overrides.js:12` — 4 manual confirmed | Одногодовые решения, не постоянные даты |
| Generated fallback | `src/data/ordo/calendar-definitions.json:1`, schema 1, revision **3** | 241 base: 233 universal (включая европейские контекстные ранги), 8 BY; **75** diocesan override; 4 yearly |
| Generated identity/content | `fixed-identities.js`, `feast-content-index.json`, `readings-status.json`; исходные proper — `patchs/feasts/` | Ссылки/статусы, не самостоятельный источник календарного права |
| Runtime | `definitions.js:167`, `layers.js:96`, `yearPlan.js:89`, `index.js:94` | Active definitions → year plan → candidates → display → Office/Readings |
| Публикационные инструменты | `scripts/ordo/build-calendar-definitions.mjs`, `import-calendar.mjs`, `materialize-transfer-overrides.mjs` | Не запускались в write/apply режиме |

Полная инвентаризация каждого документа: [DEFINITION_INVENTORY.csv](evidence/DEFINITION_INVENTORY.csv) — 320 строк (241+75+4), включая action, enabled, источник и связь с DIFF. Base fixed — 227, movable — 14. После применения слоёв: Минск 244 identity, Витебск 244, Пинск 253, Гродно 264 — всего 1005 эффективных записей до добавления отсутствующих эталонных identity в cross-diff.

| Диоцезия | Bundled add | Bundled modify | Итого bundled | Напечатанные scoped применения PDF (add/variant) |
|---|---:|---:|---:|---|
| Минск-Могилёв | 3 | 6 | 9 | 9: 3 добавления, 6 вариантов общих identity |
| Витебск | 3 | 5 | 8 | 10: 5 добавлений, 5 вариантов; Braslau пока отдельная печатная identity |
| Пинск | 12 | 9 | 21 | 8: 3 добавления, 5 вариантов |
| Гродно | 23 | 14 | 37 | 12: 9 добавлений, 3 варианта |

Действующих suppress-документов диоцезий нет, все 75 enabled. Источник истины запуска — active definitions, не прямой импорт fixedCalendar. Поэтому исправление только generated JSON будет перезаписано seed-генератором.

Полностью перечислены 1354 кандидата ежегодных Ordo в [ANNUAL_CELEBRATIONS.csv](evidence/ANNUAL_CELEBRATIONS.csv) и 1201 source rule в [ANNUAL_RULES.csv](evidence/ANNUAL_RULES.csv): Минск 279/38, Витебск 497/551, Пинск 294/221, Гродно 284/391. Все правила этих evidence — заметки/селекторы, они сами не добавляют календарные празднования. В runtime compiled notes — 1347; прямые effect rules add/modify/suppress в DIOCESAN_LAYERS.rules/BELARUS_LAYER.rules пусты. У двух movable definitions есть `concurrentObligatoryMemorials=legal-choice` (Maці Касцёла и Беззаганнае Сэрца). Их product-решение отделено от PDF.

Идентификация сырых ежегодных кандидатов: high 1271, medium 47, low 7, без identity 29. Это **не** автоматические calendar defects: там есть temporal/votive и строки, обработанные явными слоями. Все включённые в слой кандидаты всё равно попадают в полный effective cross-diff. 45 уникальных annual evidence, на которые реально ссылаются определения/годовые решения, приведены с цитатами и страницей/абзацем в [LINKED_ANNUAL_EVIDENCE.csv](evidence/LINKED_ANNUAL_EVIDENCE.csv). Исходные ежегодные PDF/DOCX в окружении отсутствуют; их generated evidence не выдаётся за повторную визуальную проверку оригиналов.

### Firestore и offline overrides

Сначала проверены `backups/firestore-snapshot/manifest.json`, затем `reports/ordo-firestore-cache/manifest.json`: оба отсутствуют. Имеющийся `scripts/ordo/data/firestore-days-index.json` — лишь 335 ID/date/place публичных документов из версии `20260929135119096`, не календарные definitions и не полный content snapshot. Он не заменяет недостающий backup.

Путь runtime: `ordoCalendarService.js:50` читает meta; только revision >3 и допустимая schema позволяют читать и заменить permanent collections. `ordoCalendarSource.js:11` выбирает cache/Firestore строго новее bundle. `ordoCalendarCache.js:14` **заменяет** base-коллекции выбранной публикацией, а не объединяет два календаря. При этом year overrides загружаются отдельно (`ordoCalendarService.js:81`) и могут заменить bundled 4 решения независимо от revision permanent calendar. `definitions.js:188` нормализует вход, увеличивает epoch; `yearPlan.js:77` включает epoch в свой cache key. Поэтому ни 75 overrides, ни список из 4 годов не утверждаются как актуальное содержимое сервера/устройства.

`AGENTS.md:3` требует snapshot-first; п.4 запрещает автоматически обновлять snapshot/запускать live audit без подтверждения квоты. Живых запросов Firestore, авторизации Firebase, refresh, import, manifest/publication не было. Ограничение не остановило аудит доступных материалов; все зависимые production-выводы помечены UNVERIFIED.

**Дополнительно воспроизведён технический дефект:** `resolveRuntimeDay` использует memo `date|diocese` (`runtime.js:22`) без definitions epoch. Компонент передаёт epoch (`OrdoDay.vue:373`), но функция его не учитывает. В отдельном Node-процессе после синтетической замены Pinsk Budslav override fresh engine возвращает feria + optional, а bridge продолжает возвращать старое memoria и тот же объект. [cache-probe.json](evidence/cache-probe.json), [воспроизведение](tools/cache-probe.mjs). Production не менялся. Будущий data patch без отдельного согласованного решения cache-проблемы может не сразу проявиться в уже открытом приложении.

## Все диоцезальные добавления вне рабочего собственного эталона

Ниже **все 23**, не только seed. Для каждого установлено отсутствие обще-диоцезального назначения в предоставленном PDF. Категория C/D означает: возможны позднейший акт либо храмовый/монастырский контекст; ежегодный Ordo не позволяет выбрать между ними. Это не основания автоматически удалять тексты или объявлять празднования незаконными. Для Пинска 4 сентября дополнительно установлена несовпадающая область: PDF называет только Гродно.

| Диоцезия | Дата | Празднование / текущий ранг | PDF | Код | Статус |
|---|---|---|---|---|---|
| Пинск | 07-20 | Бл. Чэслава, прэзбітэра · `memoria-ad-libitum` | с.8; нет в области | `src/data/ordo/calendar-definitions.json:271;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 10-13 | Бл. Ганарата Казмінскага, прэзбітэра · `memoria-ad-libitum` | с.11; нет в области | `src/data/ordo/calendar-definitions.json:275;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 09-04 | Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц · `memoria-ad-libitum` | с.10; нет в области | `src/data/ordo/calendar-definitions.json:274;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 08-22 | Найсв. Панны Марыі Лагішынскай, апякункі Пінскай дыяцэзіі · `solemnitas` | с.9; нет в области | `src/data/ordo/calendar-definitions.json:273;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 06-27 | Маці Божай Нястомнай Дапамогі · `memoria-ad-libitum` | с.7; нет в области | `src/data/ordo/calendar-definitions.json:270;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 12-04 | Св. Барбары, панны і мучаніцы · `memoria-ad-libitum` | с.13; нет в области | `src/data/ordo/calendar-definitions.json:276;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 03-26 | Св. Дызмы, Добрага Злачынцы · `memoria-ad-libitum` | с.3; нет в области | `src/data/ordo/calendar-definitions.json:268;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 05-04 | Св. Фларыяна, мучаніка · `memoria-ad-libitum` | с.5; нет в области | `src/data/ordo/calendar-definitions.json:269;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Пинск | 08-17 | Св. Яцэка, прэзбітэра · `memoria-ad-libitum` | с.9; нет в области | `src/data/ordo/calendar-definitions.json:272;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 09-01 | Бл. Браніславы, панны · `memoria-ad-libitum` | с.10; нет в области | `src/data/ordo/calendar-definitions.json:301;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 10-13 | Бл. Ганарата Казмінскага, прэзбітэра · `memoria-ad-libitum` | с.11; нет в области | `src/data/ordo/calendar-definitions.json:303;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 11-18 | Бл. Караліны Кузкі, панны і мучаніцы · `memoria-ad-libitum` | с.12; нет в области | `src/data/ordo/calendar-definitions.json:305;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 09-25 | Бл. Уладзіслава з Гельнёва, прэзбітэра · `memoria-ad-libitum` | с.10; нет в области | `src/data/ordo/calendar-definitions.json:302;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 11-25 | Бл. Марыі ад Езуса Добрага Пастыра, панны · `memoria-ad-libitum` | с.12; нет в области | `src/data/ordo/calendar-definitions.json:307;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 11-19 | Бл. Саламеі, панны · `memoria-ad-libitum` | с.12; нет в области | `src/data/ordo/calendar-definitions.json:306;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 08-18 | Бл. Санцыі Шымкавяк, панны · `memoria-ad-libitum` | с.9; нет в области | `src/data/ordo/calendar-definitions.json:300;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 01-23 | Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна · `memoria-ad-libitum` | с.1; нет в области | `src/data/ordo/calendar-definitions.json:295;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 11-13 | Свв. Бэнэдыкта, Яна, Мацвея, Ісаака і Крыстына, мучанікаў · `memoria-ad-libitum` | с.12; нет в области | `src/data/ordo/calendar-definitions.json:304;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 05-24 | Найсв. Панны Марыі, Успамогі Вернікаў · `memoria` | с.5; нет в области | `src/data/ordo/calendar-definitions.json:296;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 08-02 | Найсв. Панны Марыі Анёльскай · `memoria-ad-libitum` | с.9; нет в области | `src/data/ordo/calendar-definitions.json:299;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 06-17 | Св. Брата Альберта Хмялёўскага, законніка · `memoria` | с.7; нет в области | `src/data/ordo/calendar-definitions.json:298;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 12-04 | Св. Барбары, панны і мучаніцы · `memoria-ad-libitum` | с.13; нет в области | `src/data/ordo/calendar-definitions.json:308;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |
| Гродно | 06-08 | Св. Ядвігі, каралевы · `memoria` | с.7; нет в области | `src/data/ordo/calendar-definitions.json:297;src/data/ordo/calendar-definitions.json` | C/D; отдельный акт не предоставлен |

Два иных отсутствующих в PDF добавления — св. Хуан Диего 9.12 и Гваделупская 12.12 — **не включены** в эту таблицу: их универсальное право подтверждено, см. ниже.

## Полный перечень конфликтов ранга и постоянной даты

17 конфликтов ранга и 3 даты, причём две даты одновременно имеют конфликт ранга. Всего здесь 18 строк identity×diocese. Это доказанные расхождения с рабочим PDF (A), а не отрицание любого возможного более позднего акта.

| Диоцезия | ID | Сейчас | PDF | Страница | Код |
|---|---|---|---|---|---|
| Витебск | `our-lady-mother-mercy` | 11-16 · `memoria` | 11-16 · `memoria-ad-libitum` | 12 | `src/data/ordo/calendar-definitions.json:200` |
| Пинск | `mary-mother-church` | pentecost+1 · `festum` | pentecost+1 · `memoria` | 6 | `src/data/ordo/calendar-definitions.json:284;src/data/ordo/calendar-definitions.json:237` |
| Пинск | `our-lady-budslav` | 07-02 · `memoria` | 07-02 · `memoria-ad-libitum` | 8 | `src/data/ordo/calendar-definitions.json:285;src/data/ordo/calendar-definitions.json:100` |
| Пинск | `our-lady-of-lourdes` | 02-11 · `memoria` | 02-11 · `memoria-ad-libitum` | 2 | `src/data/ordo/calendar-definitions.json:282;src/data/ordo/calendar-definitions.json:32` |
| Пинск | `sv-john-paul-ii` | 10-22 · `memoria` | 10-22 · `memoria-ad-libitum` | 11 | `src/data/ordo/calendar-definitions.json:283;src/data/ordo/calendar-definitions.json:187` |
| Гродно | `bl-boleslawa-lament` | 01-29 · `memoria` | 01-29 · `memoria-ad-libitum` | 1 | `src/data/ordo/calendar-definitions.json:313;src/data/ordo/calendar-definitions.json:22` |
| Гродно | `bl-jurgis-matulaitis` | 01-27 · `memoria` | 01-27 · `memoria-ad-libitum` | 1 | `src/data/ordo/calendar-definitions.json:312;src/data/ordo/calendar-definitions.json:20` |
| Гродно | `mary-mother-church` | pentecost+1 · `festum` | pentecost+1 · `memoria` | 6 | `src/data/ordo/calendar-definitions.json:317;src/data/ordo/calendar-definitions.json:237` |
| Гродно | `our-lady-congregational` | 08-05 · `memoria` | 08-05 · `memoria-ad-libitum` | 9 | `src/data/ordo/calendar-definitions.json:289;src/data/ordo/calendar-definitions.json` |
| Гродно | `our-lady-loreto` | 12-10 · `memoria` | 12-10 · `memoria-ad-libitum` | 13 | `src/data/ordo/calendar-definitions.json:320;src/data/ordo/calendar-definitions.json:219` |
| Гродно | `our-lady-mount-carmel` | 07-16 · `memoria` | 07-16 · `memoria-ad-libitum` | 8 | `src/data/ordo/calendar-definitions.json:318;src/data/ordo/calendar-definitions.json:110` |
| Гродно | `our-lady-trakai` | 07-10 · `festum` | 07-05 · `memoria` | 8 | `src/data/ordo/calendar-definitions.json:288;src/data/ordo/calendar-definitions.json` |
| Гродно | `sv-adalbert-wojciech-bishop-martyr` | 04-24 · `memoria` | 04-23 · `memoria-ad-libitum` | 4 | `src/data/ordo/calendar-definitions.json:321;src/data/ordo/calendar-definitions.json:56` |
| Гродно | `sv-faustina-kowalska` | 10-05 · `memoria` | 10-05 · `memoria-ad-libitum` | 11 | `src/data/ordo/calendar-definitions.json:319;src/data/ordo/calendar-definitions.json:173` |
| Гродно | `sv-george-martyr` | 04-23 · `memoria` | 04-23 · `memoria-ad-libitum` | 4 | `src/data/ordo/calendar-definitions.json:314;src/data/ordo/calendar-definitions.json:55` |
| Гродно | `sv-raphael-kalinowski` | 11-20 · `memoria` | 11-20 · `memoria-ad-libitum` | 12 | `src/data/ordo/calendar-definitions.json:316;src/data/ordo/calendar-definitions.json:205` |
| Гродно | `sv-stanislaus-bishop-martyr` | 05-08 · `memoria` | 04-11 · `memoria` | 4 | `src/data/ordo/calendar-definitions.json:322;src/data/ordo/calendar-definitions.json:52` |
| Гродно | `sv-wenceslaus` | 09-28 · `memoria` | 09-28 · `memoria-ad-libitum` | 10 | `src/data/ordo/calendar-definitions.json:315;src/data/ordo/calendar-definitions.json:166` |

### Существенные случаи сверх исходных гипотез

- **Тракельская:** PDF с.8 буквально `Найсв. Панны Марыі Тракельскай — Успамін*` под 5 июля. Шрифт прямой, rank красный. Следовательно, `07-05 / memoria`. Seed и раздел F PLAN ошибочно предполагали optional; это не спорный ранг PDF. Код добавляет `07-10 / festum`, а не solemnitas. 5.07.2027 после data-проекции становится primary memoria; 10.07.2027 остаётся субботний weekday с допустимой субботней памятью Марии.
- **Сапоцька, Витебск:** PDF с.2 перечисляет Гродно и Витебск, rank отсутствует. В HEAD add только для Grodno (`calendar-definitions.json:286`). Это отдельный пропуск, который seed не перечислял. В 2026 дата приходится на воскресенье и не должна становиться option; в 2027 — постная commemoratio; в 2028 — обычная alternative.
- **Витебск, Вастрабрамская:** BY слой без оснований для этого варианта устанавливает memoria в `layers.js:33`; Vitebsk override не снимает это повышение. PDF с.12 имеет явный отдельный витебский optional. Минск/Пинск memoria и Гродно solemnitas должны сохраниться.
- **Витебск, 8 сентября:** PDF с.10 печатает Nativity festum и Braslau festum. Код `fixedCelebrations.js:81` сливает их через DIOCESAN_REPLACES в `nativity-blessed-virgin-mary`. Это подтверждённая техническая связь и нерешённый литургический вопрос, а не два гарантированно допустимых выбора. В отдельной альтернативной модели двух identity алгоритм выбирает Nativity (row 7), подавляя Braslau (row 8). Такой результат не является решением комиссии. Основная проекция сохраняет alias условно.
- **Витебск, 12 июня:** PDF называет Ляшчэвіча, Кашыру, Багаткевіча, Мацковяка, Пыртэка, затем паплечнікаў. Код называет двух и паплечнікаў. Optional rank соответствует PDF; в 2026 старшее Sacred Heart подавляет optional, поэтому это не пропуск UI alternative в этот год.
- **Гродно:** дополнительно к seed проверены все повышения/смены даты: Войцех 23→24.04 и optional→memoria; Станислав 11.04→8.05; Юрий и Вацлав optional→memoria; Кармель и Loreto optional→memoria. Ежегодная дата не даёт постоянного правила.
- **4 декабря:** Пинск 2026 — Advent weekday + John Damascene; Барбара сейчас дополнительная alternative. Гродно 2026 — cathedral dedication festum, Барбара уже suppressed; её календарное назначение всё равно отдельно не подтверждено. В 2027 посвящение перемещено ручным годовым решением 04→06.12, поэтому Барбара снова видна на 04.12; это показывает, почему проверки одного года недостаточно.

## Официальные общие источники, редакционные исключения PDF

По состоянию на 03.11.2026 проверены официальный индекс Дикастерии и следующие первичные акты. Дата PDF не установлена как дата нормативной редакции; не выдумывались изменения «после PDF». Проверенные ниже акты все старше технической даты файла, а Newman уже напечатан в нём.

| Предмет | Проверенный первичный источник | Вывод для аудита |
|---|---|---|
| Newman, 9.10 optional | [Декрет 09.11.2025](https://www.vatican.va/content/romancuria/en/dicasteri/dicastero-culto-divino-e-disciplina-sacramenti/documenti/20251109-decreto-iscrizione-newman.html), [публикация 03.02.2026](https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2026/02/03/260203a.html) | PDF с.11 содержит; HEAD отсутствует во всех 4. 9.10.2025 не объявляется универсальной памятью задним числом. |
| Teresa Calcutta, 5.09 optional | [Декрет 24.12.2024, опубликован 11.02.2025](https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2025/02/11/250211b.html) | Есть в PDF и HEAD; сохранить. Не локальное необоснованное добавление. |
| Juan Diego, 9.12 optional | [Notitiae 40 (2004), печатная с.196, PDF page 118](https://www.cultodivino.va/content/dam/cultodivino/rivista-notitiae/2000/notitiae-40-%282004%29/Notitiae-451-452-2004.pdf#page=118), акт 28.09.2002 | В PDF Беларуси нет; в приложении сохранить как General. |
| Guadalupe, 12.12 optional | [Там же, печатная с.197, PDF page 119](https://www.cultodivino.va/content/dam/cultodivino/rivista-notitiae/2000/notitiae-40-%282004%29/Notitiae-451-452-2004.pdf#page=119), акт 28.09.2002 | Аналогично; не путать с ограниченным Америкой праздником 1999. |
| Loreto, 10.12 optional | [Декрет 07.10.2019, Prot.404/19](https://www.vatican.va/content/dam/wss/roman_curia/congregations/ccdds/documents/rc_con_ccdds_doc_20191007_decreto-celebrazione-verginediloreto_en.html) | PDF с.13 печатает `Латэранскай`; код `Ларэтанскай` соответствует предмету акта. Категория E, не исправлять код на опечатку. Гродненское повышение до memoria — отдельный вопрос A/C. |
| Paul VI, 29.05 optional | [Декрет 25.01.2019, опубликован 06.02.2019](https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2019/02/06/190206b.html) | Курсив/no rank PDF с.5 и rank кода корректны; не поднимать до обязательного. |
| Irenaeus | [Акт 21.01.2022](https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2022/01/21/220121b.html) | Титул Doctor Unitatis подтверждён; PDF/код титул не включают. Editorial TITLE/UNIVERSAL_UPDATE; ранг memoria не меняется, белорусский утверждённый текст не придуман. |
| Коллизия Mother Church | [Уведомление 24.03.2018, опубликовано 27.03](https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2018/03/27/180327b.html) | Марийное воспоминание имеет преимущество перед совпавшим воспоминанием святого/блаженного. Код оставляет saint alternative, см. следующий раздел. |

`UNIVERSAL_UPDATE` — категория происхождения/актуализации, а не утверждение, что каждый акт новее PDF. Декреты переводов вроде `04/P/20` не использованы как право св. Варвары или иных местных назначений. Старый сайт lh.catholic.by не заменял приложенный PDF; переводческий акт не решает вопрос о собственном календаре.

## Прогон всех дат 2025–2035, ограничения дней и правила

**44 полных civil-year contexts, 16 068 дат**, включая 2028/2032 по 366 дней. Дни до/после календарной границы также использовались движком при расчёте Vespers. Baseline: primary 16 068, alternative 4649, suppressed 7296, commemoratio 564; ещё 8 Office-only Sunday источников при All Souls (2.11.2025/2031 ×4), которые нельзя ошибочно посчитать потерянным кандидатом. Все роли каждого кандидата записаны в [candidate-roles.csv.gz](evidence/candidate-roles.csv.gz); полные day summaries, I/II Vespers, evening/Compline и appliedRules — [daily-current.csv.gz](evidence/daily-current.csv.gz).

Проверены раздельность ролей, наличие primary, отсутствие optional как primary, отсутствие weekday alternative при обязательном, commemoratio вместо alternative на привилегированном буднем дне, отсутствие commemoratio в воскресенье, допустимая форма I Vespers. После учёта явно Office-only Sunday исключения **0 структурных нарушений**. Это тесты контракта текущего алгоритма, не доказательство его нормативности.

Отдельный независимый `python-dateutil.easter` + `datetime` расчёт проверил **572 anchor значения** (13 ×11×4): Easter, Pentecost, baptism, Mother Church, High Priest, Trinity, Corpus Christi, Sacred/Immaculate Heart, Christ King, Holy Family, First Advent, Ascension. Все совпали. Named Corpus Christi при BY=Thursday эквивалентен `pentecost+11`, поэтому различие DSL не посчитано ошибкой даты. [anchor-checks.json](evidence/anchor-checks.json).

Зафиксированы 38 вычисленных событий переноса; их правила появляются в resolved days 76 раз, на исходной и целевой дате. Привилегированные будни дали 564 commemoratio, Lord feasts заменили воскресенье 116 раз, impeded feast был исключён 210 раз; 866 раз доступна субботняя память Марии. Полные счётчики по году/диоцезии — [sweep-summary.json](evidence/sweep-summary.json). Полный baseline был прочитан одним и тем же engine с bundled input; Firestore и UI браузера сюда не подмешаны.

### Подтверждённая проблема правила коллизии

5.06.2028 Минск/Витебск: Maці Касцёла primary memoria, Бонифаций alternative memoria. Источник 24.03.2018 предписывает преимущество марийной памяти; общая `legal-choice` product-логика (`display.js:71`, `movableFeasts.js:190`) сохраняет недопустимый по этому источнику второй выбор. В Пинске/Гродно текущий завышенный festum скрывает этот сценарий; после одной только правки permanent rank проблема появляется и там. При data-only проекции воспроизведены **4** таких случая. Отдельный алгоритмический fix не выполнялся.

Для Беззаганнага Сэрца найдено ещё 21 occurrence product-выбора (23 общих выбора минус 2 Mother Church). Подходящая специальная рубрика независимо не установлена; статус NEEDS_DECREE/RULE_REVIEW. Прямой вывод уведомления о Mother Church не перенесён автоматически на Immaculate Heart. Provisional правило High Priest + другой feast в `display.js:135` отмечено как непроверенное основание; в интервале 2025–2035 именно эта ветка не сработала. Общие I/II Vespers и split All Souls проверены на согласованность, не объявлены отдельной проверкой всех литургических рубрик.

### Четыре годовых override

| Диоцезия/год | Identity | Move | Доказательство HEAD | Оценка |
|---|---|---|---|---|
| Минск 2026 | Stanislaus bishop | 11→16.04 | `year-overrides.js:20`; `minsk-mohilev:2026-04-16:c0` | Практика annual Ordo; memoria из Easter octave не выводится автоматическим general переносом. Отдельное основание не проверено. |
| Гродно 2027 | Peter Damian | 21→20.02 | `grodno:2027-02-20:c0` | С воскресенья поста; точный год, не постоянная дата. |
| Гродно 2027 | Holy Name Mary | 12→11.09 | `grodno:2027-09-11:c0` | С воскресенья; точный год. |
| Гродно 2027 | Cathedral dedication | 04→06.12 | `grodno:2027-12-06:c0` | Ручной move, а не вывод из таблицы рангов: 04.12.2027 суббота Адвента до 17-го. |

Каждое решение прогнано на обеих датах с ним и без него; результаты `yearOverrideCases` в sweep-summary. `status=confirmed` внутри приложения не равен независимо проверенному римскому акту. Постоянный эталон из одного annual примера не изменён.

## До/после: только изолированная проекция, без исправления приложения

В отдельном Node-процессе сконструирована проекция постоянных данных PDF, включая восстановление inherited layer при снятии лишнего диоцезального повышения. Работающий код, tracked definitions, Firestore и тексты не изменялись. Оставлены текущие 4 годовых решения, текущие product rules и условный alias Braslau. Два подтверждённых универсальных добавления вне PDF и 5 основных temporal definitions сохранены. Newman добавляется только с 2026; историческое право 2025 не реконструируется по PDF 2026.

В этой **условной data-only модели** меняются 516 day summaries: Минск 10, Витебск 30, Пинск 160, Гродно 316. Это число не является обещанием точного production diff: модель условно исключает неподтверждённые additions, не решает Braslau и не исправляет special rules/контент. [Полный diff 516 дат](evidence/daily-projection-diff.csv.gz), [все acceptance cases](evidence/cases.json). 12 жёстко заданных expectations из PDF +3 проверки ранга прошли.

| Диоцезия, дата | Bundled до | Проекция данных PDF после | Ограничение |
|---|---|---|---|
| Пинск, 2026-12-04 | `temporal:advent-w1-d6` · feria; alternative: sv-barbara, sv-john-damascene | `temporal:advent-w1-d6` · feria; alternative: sv-john-damascene |  |
| Гродно, 2026-12-04 | `grodno-cathedral-dedication` · festum | `grodno-cathedral-dedication` · festum |  |
| Пинск, 2026-07-02 | `our-lady-budslav` · memoria | `temporal:ordinary-w13-d5` · feria; alternative: our-lady-budslav |  |
| Минск-Могилёв, 2026-07-02 | `our-lady-budslav` · solemnitas | `our-lady-budslav` · solemnitas |  |
| Витебск, 2026-07-02 | `our-lady-budslav` · festum | `our-lady-budslav` · festum |  |
| Гродно, 2027-07-05 | `temporal:ordinary-w14-d2` · feria; alternative: sv-anthony-mary-zaccaria | `our-lady-trakai` · memoria |  |
| Гродно, 2027-07-10 | `our-lady-trakai` · festum | `temporal:ordinary-w14-d7` · feria; alternative: saturday-blessed-virgin-mary |  |
| Пинск, 2026-08-22 | `our-lady-lahishyn` · solemnitas | `our-lady-queen` · memoria |  |
| Пинск, 2026-05-25 | `mary-mother-church` · festum | `mary-mother-church` · memoria |  |
| Гродно, 2026-05-25 | `mary-mother-church` · festum | `mary-mother-church` · memoria |  |
| Витебск, 2026-11-16 | `our-lady-mother-mercy` · memoria | `temporal:ordinary-w33-d2` · feria; alternative: our-lady-mother-mercy, sv-margaret-scotland, sv-gertrude |  |
| Витебск, 2026-09-08 | `nativity-blessed-virgin-mary` · festum | `nativity-blessed-virgin-mary` · festum | Alias Braslau сохранён условно; два варианта не утверждены. |
| Витебск, 2026-06-12 | `sacred-heart` · solemnitas | `sacred-heart` · solemnitas | Sacred Heart подавляет локальное optional; заголовок отдельно. |
| Витебск, 2026-11-12 | `sv-josaphat` · solemnitas | `sv-josaphat` · solemnitas |  |
| Минск-Могилёв, 2026-11-12 | `sv-josaphat` · festum | `sv-josaphat` · festum |  |
| Пинск, 2026-11-12 | `sv-josaphat` · festum | `sv-josaphat` · festum |  |
| Гродно, 2026-11-12 | `sv-josaphat` · memoria | `sv-josaphat` · memoria |  |
| Витебск, 2026-02-15 | `temporal:ordinary-w6-d1` · dominica | `temporal:ordinary-w6-d1` · dominica |  |
| Витебск, 2027-02-15 | `temporal:lent-w1-d2` · feria | `temporal:lent-w1-d2` · feria; commemoratio: bl-michal-sopocko | Новое optional Сапоцькі проявляется как commemoratio в candidates, не alternative. |
| Минск-Могилёв, 2026-10-09 | `temporal:ordinary-w27-d6` · feria; alternative: sv-denis-companions, sv-john-leonardi | `temporal:ordinary-w27-d6` · feria; alternative: sv-denis-companions, sv-john-leonardi, sv-john-henry-newman |  |
| Гродно, 2027-12-04 | `temporal:advent-w1-d7` · feria; alternative: sv-barbara, sv-john-damascene | `temporal:advent-w1-d7` · feria; alternative: sv-john-damascene | Годовой move 04→06.12 сохранён как отдельное решение. |
| Гродно, 2027-12-06 | `grodno-cathedral-dedication` · festum | `grodno-cathedral-dedication` · festum | Годовой move 04→06.12 сохранён как отдельное решение. |


## Proper и текстовые отличия отдельно от календарного права

[CONTENT_INVENTORY.csv](evidence/CONTENT_INVENTORY.csv) содержит все 1005 effective identity×diocese с hours/readings/template/day references. 29 строк DIFF типа content имеют `day-fallback`, `readings=missing` или `reference-only`; это честное описание generated metadata, не свидетельство проверки реальных документов Firestore. `common-only` само по себе не объявлено нарушением. Для Пинской Лагішынскай есть явный `readings=missing`, для Гродненской Тракельскай — тоже; это не решает их календарное право. Nativity Lord `day-fallback` может обслуживаться dynamic content: статус требует проверки разрешения, а не автоматического вывода «нет Рождества».

Для Newman поиск по tracked `src/`, `patchs/`, `scripts/` не нашёл `newman`/`Ньюман`; локальное proper не обнаружено, серверное содержимое UNVERIFIED. Для Сапоцькі имеется `patchs/feasts/15-02-bl-michal-sopocko-grodno.json`; нельзя удалять этот текст и нельзя автоматически объявлять Витебск обеспеченным без проверки области/fallback.

Следующая таблица включает **все 59 нормализованных отличий заголовка** в permanent cross-diff, в том числе склонения, сокращения, орфографию и опечатку самого PDF. Это editorial review, а не 59 обязательных изменений. Существенные для проверки: пять имён Витебска, Цэліна/Бажэнцкая, patronate Михаила и identity Braslau. Дополнительно отдельно учтены 4 применения подтверждённого титула Иренея.

| Диоцезия | ID | Код | PDF | Страница |
|---|---|---|---|---|
| Минск-Могилёв | `archangels-michael-gabriel-raphael` | Св. Міхала Архангёла, Св. Габрыэля і Рафаіла, архангёлаў | СВ. МІХАЛА АРХАНЁЛА (АПЕКУНА МІНСКА-МАГІЛЁЎСКАЙ ПРАВІНЦЫІ КАСЦЁЛА), СВ. ГАБРЫЭЛЯ І РАФАЛА, АРХАНЁЛАЎ | 10 |
| Минск-Могилёв | `christ-king` | Езус Хрыстус, Валадар Сусвету | ПАНА НАШАГА ЕЗУСА ХРЫСТА, ВАЛАДАРА СУСВЕТУ | 13 |
| Минск-Могилёв | `christ-the-high-priest` | Езус Хрыстус, Найвышэйшы і Вечны Святар | ПАНА НАШАГА ЕЗУСА ХРЫСТА, НАЙВЫШЭЙШАГА І ВЕЧНАГА СВЯТАРА | 7 |
| Минск-Могилёв | `corpus-christi` | Найсвяцейшае Цела і Кроў Хрыста | НАЙСВЯЦЕЙШАГА ЦЕЛА I КРЫВІ ХРЫСТА | 6 |
| Минск-Могилёв | `holy-family` | Святая Сям’я: Езус, Марыя і Юзаф | СВЯТОЙ СЯМ’І: ЕЗУСА, МАРЫІ І ЮЗАФА | 13 |
| Минск-Могилёв | `immaculate-heart` | Беззаганнае Сэрца Найсв. Панны Марыі | Беззаганнага Сэрца Найсв. Панны Марыі | 7 |
| Минск-Могилёв | `our-lady-loreto` | Найсв. Панны Марыі Ларэтанскай | Найсв. Панны Марыі Латэранскай | 13 |
| Минск-Могилёв | `sacred-heart` | Найсвяцейшае Сэрца Пана Езуса | НАЙСВЯЦЕЙШАГА СЭРЦА ЕЗУСА | 7 |
| Минск-Могилёв | `sv-augustine-of-canterbury` | Св. Аўгустына Кэнтэрберыйскага, біскупа | Св. Аўгустына Кентэрберыйскага, біскупа | 5 |
| Минск-Могилёв | `sv-cyril-methodius` | Св. Кірыла, манаха, і Мятода, біскупа, апекуноў Еўропы | СВ. КІРЫЛА, МНІХА, І МЯТОДА, БІСКУПА, АПЕКУНОЎ ЕЎРОПЫ | 2 |
| Минск-Могилёв | `sv-faustina-kowalska` | Св. Фаўстыны Кавальскай, панны | Св. Фаўстыны Кавальскай | 11 |
| Минск-Могилёв | `sv-jane-frances-de-chantal` | Св. Жаны Франсуазы дэ Шанталь, законніцы | Св. Жанны Франсуазы дэ Шанталь, законніцы | 9 |
| Минск-Могилёв | `sv-john-xxiii` | Св. Яна XXIII, папы | Св. Яна XXIII | 11 |
| Минск-Могилёв | `trinity` | Найсвяцейшая Тройца | НАЙСВЯЦЕЙШАЙ ТРОЙЦЫ | 6 |
| Витебск | `archangels-michael-gabriel-raphael` | Св. Міхала Архангёла, Св. Габрыэля і Рафаіла, архангёлаў | СВ. МІХАЛА АРХАНЁЛА (АПЕКУНА МІНСКА-МАГІЛЁЎСКАЙ ПРАВІНЦЫІ КАСЦЁЛА), СВ. ГАБРЫЭЛЯ І РАФАЛА, АРХАНЁЛАЎ | 10 |
| Витебск | `bl-antoni-leszczewicz-jerzy-kaszyra` | Бл. Антонія Ляшчэвіча і Юрыя Кашыры, прэзбітэраў, і паплечнікаў, мучанікаў | Бл. Антонія Ляшчэвіча, Юрыя Кашыры, Мечыслава Багаткевіча, Уладыслава Мацковяка, Станіслава Пыртэка, прэзбітэраў, і паплечнікаў, мучанікаў | 7 |
| Витебск | `christ-king` | Езус Хрыстус, Валадар Сусвету | ПАНА НАШАГА ЕЗУСА ХРЫСТА, ВАЛАДАРА СУСВЕТУ | 13 |
| Витебск | `christ-the-high-priest` | Езус Хрыстус, Найвышэйшы і Вечны Святар | ПАНА НАШАГА ЕЗУСА ХРЫСТА, НАЙВЫШЭЙШАГА І ВЕЧНАГА СВЯТАРА | 7 |
| Витебск | `corpus-christi` | Найсвяцейшае Цела і Кроў Хрыста | НАЙСВЯЦЕЙШАГА ЦЕЛА I КРЫВІ ХРЫСТА | 6 |
| Витебск | `holy-family` | Святая Сям’я: Езус, Марыя і Юзаф | СВЯТОЙ СЯМ’І: ЕЗУСА, МАРЫІ І ЮЗАФА | 13 |
| Витебск | `immaculate-heart` | Беззаганнае Сэрца Найсв. Панны Марыі | Беззаганнага Сэрца Найсв. Панны Марыі | 7 |
| Витебск | `nativity-blessed-virgin-mary` | Найсв. Панны Марыі Браслаўскай | НАРАДЖЭННЕ НАЙСВ. ПАННЫ МАРЫІ | 10 |
| Витебск | `our-lady-loreto` | Найсв. Панны Марыі Ларэтанскай | Найсв. Панны Марыі Латэранскай | 13 |
| Витебск | `sacred-heart` | Найсвяцейшае Сэрца Пана Езуса | НАЙСВЯЦЕЙШАГА СЭРЦА ЕЗУСА | 7 |
| Витебск | `sv-augustine-of-canterbury` | Св. Аўгустына Кэнтэрберыйскага, біскупа | Св. Аўгустына Кентэрберыйскага, біскупа | 5 |
| Витебск | `sv-cyril-methodius` | Св. Кірыла, манаха, і Мятода, біскупа, апекуноў Еўропы | СВ. КІРЫЛА, МНІХА, І МЯТОДА, БІСКУПА, АПЕКУНОЎ ЕЎРОПЫ | 2 |
| Витебск | `sv-faustina-kowalska` | Св. Фаўстыны Кавальскай, панны | Св. Фаўстыны Кавальскай | 11 |
| Витебск | `sv-jane-frances-de-chantal` | Св. Жаны Франсуазы дэ Шанталь, законніцы | Св. Жанны Франсуазы дэ Шанталь, законніцы | 9 |
| Витебск | `sv-john-xxiii` | Св. Яна XXIII, папы | Св. Яна XXIII | 11 |
| Витебск | `trinity` | Найсвяцейшая Тройца | НАЙСВЯЦЕЙШАЙ ТРОЙЦЫ | 6 |
| Пинск | `archangels-michael-gabriel-raphael` | Св. Міхала Архангёла, Св. Габрыэля і Рафаіла, архангёлаў | СВ. МІХАЛА АРХАНЁЛА (АПЕКУНА МІНСКА-МАГІЛЁЎСКАЙ ПРАВІНЦЫІ КАСЦЁЛА), СВ. ГАБРЫЭЛЯ І РАФАЛА, АРХАНЁЛАЎ | 10 |
| Пинск | `christ-king` | Езус Хрыстус, Валадар Сусвету | ПАНА НАШАГА ЕЗУСА ХРЫСТА, ВАЛАДАРА СУСВЕТУ | 13 |
| Пинск | `christ-the-high-priest` | Езус Хрыстус, Найвышэйшы і Вечны Святар | ПАНА НАШАГА ЕЗУСА ХРЫСТА, НАЙВЫШЭЙШАГА І ВЕЧНАГА СВЯТАРА | 7 |
| Пинск | `corpus-christi` | Найсвяцейшае Цела і Кроў Хрыста | НАЙСВЯЦЕЙШАГА ЦЕЛА I КРЫВІ ХРЫСТА | 6 |
| Пинск | `holy-family` | Святая Сям’я: Езус, Марыя і Юзаф | СВЯТОЙ СЯМ’І: ЕЗУСА, МАРЫІ І ЮЗАФА | 13 |
| Пинск | `immaculate-heart` | Беззаганнае Сэрца Найсв. Панны Марыі | Беззаганнага Сэрца Найсв. Панны Марыі | 7 |
| Пинск | `our-lady-loreto` | Найсв. Панны Марыі Ларэтанскай | Найсв. Панны Марыі Латэранскай | 13 |
| Пинск | `sacred-heart` | Найсвяцейшае Сэрца Пана Езуса | НАЙСВЯЦЕЙШАГА СЭРЦА ЕЗУСА | 7 |
| Пинск | `sv-augustine-of-canterbury` | Св. Аўгустына Кэнтэрберыйскага, біскупа | Св. Аўгустына Кентэрберыйскага, біскупа | 5 |
| Пинск | `sv-cyril-methodius` | Св. Кірыла, манаха, і Мятода, біскупа, апекуноў Еўропы | СВ. КІРЫЛА, МНІХА, І МЯТОДА, БІСКУПА, АПЕКУНОЎ ЕЎРОПЫ | 2 |
| Пинск | `sv-faustina-kowalska` | Св. Фаўстыны Кавальскай, панны | Св. Фаўстыны Кавальскай | 11 |
| Пинск | `sv-jane-frances-de-chantal` | Св. Жаны Франсуазы дэ Шанталь, законніцы | Св. Жанны Франсуазы дэ Шанталь, законніцы | 9 |
| Пинск | `sv-john-xxiii` | Св. Яна XXIII, папы | Св. Яна XXIII | 11 |
| Пинск | `trinity` | Найсвяцейшая Тройца | НАЙСВЯЦЕЙШАЙ ТРОЙЦЫ | 6 |
| Гродно | `archangels-michael-gabriel-raphael` | Св. Міхала Архангёла, Св. Габрыэля і Рафаіла, архангёлаў | СВ. МІХАЛА АРХАНЁЛА (АПЕКУНА МІНСКА-МАГІЛЁЎСКАЙ ПРАВІНЦЫІ КАСЦЁЛА), СВ. ГАБРЫЭЛЯ І РАФАЛА, АРХАНЁЛАЎ | 10 |
| Гродно | `bl-celina-borzecka` | Бл. Цэліны Бажэцкай | Бл. Цэліны Бажэнцкай, законніцы | 11 |
| Гродно | `christ-king` | Езус Хрыстус, Валадар Сусвету | ПАНА НАШАГА ЕЗУСА ХРЫСТА, ВАЛАДАРА СУСВЕТУ | 13 |
| Гродно | `christ-the-high-priest` | Езус Хрыстус, Найвышэйшы і Вечны Святар | ПАНА НАШАГА ЕЗУСА ХРЫСТА, НАЙВЫШЭЙШАГА І ВЕЧНАГА СВЯТАРА | 7 |
| Гродно | `corpus-christi` | Найсвяцейшае Цела і Кроў Хрыста | НАЙСВЯЦЕЙШАГА ЦЕЛА I КРЫВІ ХРЫСТА | 6 |
| Гродно | `holy-family` | Святая Сям’я: Езус, Марыя і Юзаф | СВЯТОЙ СЯМ’І: ЕЗУСА, МАРЫІ І ЮЗАФА | 13 |
| Гродно | `immaculate-heart` | Беззаганнае Сэрца Найсв. Панны Марыі | Беззаганнага Сэрца Найсв. Панны Марыі | 7 |
| Гродно | `our-lady-loreto` | Найсв. Панны Марыі Ларэтанскай | Найсв. Панны Марыі Латэранскай | 13 |
| Гродно | `sacred-heart` | Найсвяцейшае Сэрца Пана Езуса | НАЙСВЯЦЕЙШАГА СЭРЦА ЕЗУСА | 7 |
| Гродно | `sv-augustine-of-canterbury` | Св. Аўгустына Кэнтэрберыйскага, біскупа | Св. Аўгустына Кентэрберыйскага, біскупа | 5 |
| Гродно | `sv-cyril-methodius` | Св. Кірыла, манаха, і Мятода, біскупа, апекуноў Еўропы | СВ. КІРЫЛА, МНІХА, І МЯТОДА, БІСКУПА, АПЕКУНОЎ ЕЎРОПЫ | 2 |
| Гродно | `sv-faustina-kowalska` | Св. Фаўстыны Кавальскай, панны | Св. Фаўстыны Кавальскай | 11 |
| Гродно | `sv-jane-frances-de-chantal` | Св. Жаны Франсуазы дэ Шанталь, законніцы | Св. Жанны Франсуазы дэ Шанталь, законніцы | 9 |
| Гродно | `sv-john-xxiii` | Св. Яна XXIII, папы | Св. Яна XXIII | 11 |
| Гродно | `trinity` | Найсвяцейшая Тройца | НАЙСВЯЦЕЙШАЙ ТРОЙЦЫ | 6 |

## Приоритеты следующей задачи — после приёмки этого отчёта

1. Зафиксировать решение по Тракельской: рабочий эталон 05.07 memoria; документировать любой позднейший акт, прежде чем сохранять 10.07 festum. Исправление должно идти из editable источника, с проверкой proper и обеих дат 2027.
2. Решить обще-диоцезальное право Лагішынскай, Пинск 22.08: нынешняя solemnitas подавляет Queenship и имеет I Vespers. Отсутствие в PDF не даёт разрешения удалять тексты.
3. Согласовать 23 extra assignments по полной таблице, включая обе Барбары и ошибочную Пинскую область Марыі Стэлы. После решения отключать назначения, не литургические документы.
4. Восстановить Будславскую Пинск как optional; сохранить Минск solemnitas, Витебск festum и Гродно optional.
5. Восстановить Вастрабрамскую Витебск optional и убрать безусловное национальное повышение, сохранив остальные диоцезальные ранги.
6. Добавить Сапоцьку Витебску 15.02 optional с проверкой inherited/common proper, Sunday suppression и Lenten commemoratio.
7. Добавить Newman 09.10 optional по общему акту с утверждённым белорусским proper и датой применения; не задним числом для 09.10.2025.
8. Снять неподтверждённые повышения Maці Касцёла в Пинске/Гродно и остальные ранги/две даты Гродно из полной таблицы; отдельно согласовать коллизию 05.06.2028 по римскому уведомлению.
9. Получить решение о связи Braslau/Nativity; проверить отображение двух строк, не слепо добавлять или удалять одну из identity.
10. В отдельном Web fix/test устранить доказанную stale memo проблему при смене definitions; затем сверить content metadata/proper и содержательные заголовки. В текущей фазе runtime не редактировать.

Порядок Web → Flutter: утвердить строки DIFF/неопределённости → получить доступный локальный snapshot с revision/meta/year overrides и сравнить его с bundle → узкий Web seed patch и read-only generation diff → проверки PDF и 2025–2035 → отдельный review публикационного плана, без автоматического apply → только после Web приёмки отдельная задача `ibreviarybyapp` с утверждённым snapshot/bundle, проверкой overlays/parity/offline. Flutter, active source calendar и content publication этой задачей не затронуты. Ссылки на тексты/сами тексты не удаляются.

## Выполненные проверки и ограничения

| Проверка | Результат | Доказательство/граница |
|---|---|---|
| PDF SHA256, 13 страниц и визуальная проверка | PASS | REFERENCE, source-manifest, таблица страниц выше |
| Reference coverage, все 30 seed | PASS | REFERENCE_COVERAGE, SEED_COVERAGE |
| 241+75+4 definitions, все 1005 effective | PASS | DEFINITION_INVENTORY, CONTENT_INVENTORY |
| Все даты 2025–2035 ×4 и structural invariants | PASS | 16 068 baseline, 16 068 projection, 0 structural failures |
| Независимые anchors | PASS | 572 проверок; не parity Web/Flutter |
| Фиксированные PDF cases / source selection contract | PASS | 12+3 acceptance; 4 synthetic cache-source cases |
| Runtime memo | DEFECT REPRODUCED | Один isolated publication witness; не изменение сервера |
| Римская коллизия Mother Church | 2 baseline несоответствия; 4 после data-only | Нормативный источник указан; green tests это не отменяют |
| `npm run test:ordo` | 205 PASS, 0 FAIL | evidence/test-ordo.log |
| `npm run ordo:check` | PASS | evidence/ordo-check.log; raw-source rebuild determinism SKIPPED: `.ordo-sources` нет |
| `npm test` на изолированном локальном Git-клоне того же BASE | 1065 тестов: 1055 PASS, 10 SKIP, 0 FAIL | evidence/test-all.log; emulator и необязательные corpus-source проверки пропущены |
| Read-only targeted ESLint | PASS | `npx eslint src/utils/ordo/*.js src/utils/ordoCalendarSource.js src/utils/ordoCalendarCache.js`; evidence/lint.log |
| Vite build | PASS | прямой Vite в `work/`, без npm prebuild генератора; evidence/build.log. Предупреждение о размере chunks, без ошибок |
| Live Firestore / cache браузера / Flutter | UNVERIFIED / не выполнялись | Нет snapshot; запрет refresh без квоты. Flutter вне scope |

Полный suite сначала пробовался из scratch cwd и archive-копии: возникли ошибки путей fixtures/отсутствия `.git`. Они исправлены **настройкой изолированного Git-клона**, не кодом приложения; финальный полный запуск green. В исходном checkout не создавались тестовые данные. `npm run lint` с `--fix`, генераторы без `--check`, deploy/migration/import/publish не запускались. Build output, raw page PNG и промежуточные расчёты находятся в work, не в active source.

Отчётные утилиты в `tools/` имеют только локальные входы и выходы, не импортируют Firebase client/admin и не публикуют данные. Инструкции воспроизведения — [tools/README.md](tools/README.md). Все контрольные хеши/версии и пределы независимой проверки — [source-manifest.json](source-manifest.json). Состояние active tracked файлов проверяется через `git diff BASE --name-only`: изменения разрешены только в этой папке отчёта.
