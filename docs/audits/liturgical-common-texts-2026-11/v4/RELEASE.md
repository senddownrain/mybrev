# PR245 — утверждённые решения и совместимая публикация

Все 10 редакционных исключений закрыты решением владельца: `owner-instructions.json`. В source дополнительно изменены 11 полей: 28 прежде удержанных ответов, две уже раскрытые пасхальные копии с латинской `c`, три исходные К. того же слова. Точные послойные диапазоны — `source-proofs.json.gz`. Проверка всех прежних 820 ответов: нет строчных начальных букв или начальной `Ў`; две смешанные графемы были только в PR245-490. Сохранены написание «Справялівы», указанные `У`/`С`, пасхальная звезда и `аллелюя`. Печатные транскрипции не изменены.

Web main efc7c0d объединён с веткой; сторонние исправления сохранены. Адвентский writer завершён по сообщению владельца в последнем комментарии. Приватный его write receipt в этом checkout отсутствует. Взамен фактически выполнены три разрешённых точечных REST-чтения: два документа и current manifest. Сервер подтверждает один updateTime двух документов: `2026-11-14T12:25:53.056153Z`. Сравнение существующего snapshot с ними даёт **14** реальных изменений (3 + 11), включая laudesAntBen, и ноль пересечений с 12 целевыми ready-полями #245. Manifest подтверждён как `days=6`, Proper в нём отсутствует. Raw-ответы сохранены в ignored `backups/pr245-after-advent/`; hashes/пути — `compatibility-review.json`. Это текущие server-read доказательства, не вымышленная копия приватного Advent write receipt.

## Конкретный состав

`publication-summary.json`: 8 197 содержательно готовых полей / 975 документов. Неподтверждённых старых вариантов осталось 843; одно старое held-поле уже исправлено Advent и исключено как superseded.

**Сейчас публикуется только 406 полей / 226 документов `liturgicalProperTexts`**, одним commit примерно 1.57 MB. Это существующая коллекция Firestore, отсутствующая в опубликованном manifest. Старым Flutter-клиентам новый слой не предлагается; Web читает собственные Proper. Schema/правила не меняются. Реальная проверка ограничивает пакет этой коллекцией, сравнивает свежие collections metadata manifest с захваченным SHA и проверяет отсутствие Proper. Никакой guard не обходится: `massRebuildReleaseGateReviewed` означает рассмотренный итог «published collections не писать», а не разрешение массовой manifest-доставки.

**7 791 подтверждённое поле days/templates удержано по release gate.** Запись этих значений без согласованного manifest изменила бы опубликованные document hashes, в том числе новый Advent days=6. Общая массовая доставка требует совместимого bundle/release; Flutter в этой задаче не выпускается. Manifest, его version 6, hashes и обе Advent записи этот writer вообще не изменяет. Также не вводится новая коллекция в manifest.

Полный актуальный план: `full-content-plan.json.gz` (только источниковая готовность). Единственный исполняемый subset: `publication-plan.json.gz`; точный SHA в `publication-summary.json`. Все прежние 8 153 ready-поля сохранены в полном составе. `held-fields.json.gz` различает содержательную неопределённость, release gate и superseded Advent.

## Исполнение

Новый workflow `.github/workflows/pr245-reviewed-content.yml` использует существующий protected Actions secret **только внутри Actions**, не экспортируя его в Codex. Запуск вручную на main после merge с exact planSHA. Он вызывает существующий `future-publish-editorial-v3.mjs --mode execute`: одна свежая manifest-проверка, один полный preflight ровно 226 документов, guarded atomic commit, один readback каждого успешного write. updateTime, beforeSHA, afterSHA, exact masks и server timestamps обязательны; конфликт останавливает до записи. Журнал/rollback inputs сохраняются как Actions artifact даже при ошибке. Никакой отдельный повторный preflight/full backup не запускается.

Ниже команда, которую исполняет агент после CI/merge (SHA брать из summary):

```bash
gh workflow run pr245-reviewed-content.yml --repo senddownrain/mybrev --ref main -f plan_sha256=<SHA>
```

Merge title содержит `[pr245-data-before-web]`: существующий Hosting push-job пропускает только этот release, чтобы новый Web cache revision не обслуживался до записи. После фактического write/readback success агент запускает существующий Hosting workflow вручную. Сам deploy workflow и его production credentials не заменяются. Revision включает Advent и изменится для пользователей после успешного Hosting deploy.

Результат записи **не следует** из этого подготовленного файла. Фактические счётчики и server receipts — в artifact run `Publish PR245 compatible Proper fields`; финальный PR description и ответ владельцу должны указывать его фактический результат. При ошибке записи Web deploy не запускать.

Проверены только затронутые регрессии: 20/20 (`liturgical-owner-v4` + обратимые v3-проверки), ESLint. Прежние полные аудиты, 74/1 260 проверки и 16k-date sweep повторно не запускались. Обычный обязательный CI выполняется штатно для merge.

## Локальная подготовка оставшихся days/templates

`prepare-days-templates.mjs` выделяет ровно 7 791 подтверждённое поле / 749 документов из сохранённого полного плана, исключая опубликованные Proper и все 843 неподтверждённых поля. Исходные тексты, hashes и masks не меняются. Проверены локальные beforeSHA/updateTime, согласованность шаблонов с генератором, утверждённые сезонные ответы и отсутствие пересечений с 14 Advent-правками. Единственное отличие от generated — завершающий перевод строки в `church-dedication._seasonalVariants.easter.vesper1Ps3`; слова/HTML совпадают, ранее проверенное значение сохранено.

```bash
node scripts/liturgy/prepare-days-templates.mjs --snapshot backups/firestore-snapshot-public --advent-baseline backups/pr245-after-advent --out backups/pr245-days-templates-prepared.json.gz
node --test tests/days-templates-preparation.test.mjs
```

Локальный пакет создан в ignored `backups/`; SHA256 `df938a10e8180b39fe3549b1998a6e8d34b483d76af8ac83570a5295d5af61f7`. Четыре целевые проверки и ESLint проходят. Firebase reads/writes = 0; deploy отсутствует, Flutter/bundle не менялись. Пакет содержит блокирующую compatibility policy, которую текущий publisher отклоняет. Это готовность содержания по сохранённым данным, а не свежая сверка production. До окончательной публикации нужны совместимый bundle/release, согласованная доставка manifest и отдельно разрешённый свежий preflight, затем masks/updateTime + receipts/readback. Proper повторно не публикуется, 843 поля не включаются.

## Проверка разрешённой владельцем Web-first публикации (2026-11-15)

Владелец разрешил production-запись при прохождении совместимости, без выпуска Flutter. Это разрешение не снимает технический барьер. На main `9a8089f90feeb341e84d173511a7c435072ec719` Web и Flutter используют общие `days`/`liturgicalTemplates`; опубликованный manifest не предоставляет неизменяемую копию документов предыдущей версии. Пакет меняет 734 документа days и 15 шаблонов. Сохранение прежнего manifest после записи нарушит соответствие его hashes документам. Разбиение записи на 30 партий по 25 не делает совокупное изменение безопасным патчем для клиента.

Read-only проверен [content_updater.dart во Flutter main 84d1d6d](https://github.com/senddownrain/ibreviarybyapp/blob/84d1d6dd61f8cb78aa33fb1b6538996f9156fc20/lib/content/content_updater.dart): `check()` возвращает `appReleaseRequired(rebuild)` до скачивания при объёме >12 MiB или замене >50% существующей коллекции (при >50 документах). Это подтверждает поведение данного исходного кода, но не установленных приложений. В доступных GitHub releases/tags нет привязки выпущенного клиента к этому коду; совместимость всех используемых версий не установлена. Штатный Web publisher отказывает в `MASS CONTENT REBUILD`; `--allow-large-patch` был бы override, а не устранение причины. Ни override, ни фиктивное повышение schemaVersion не применялись.

Итог: **0 новых production-полей, 0 Firebase reads/writes, Web deploy не запускался**. Ранее опубликованные 406 Proper-полей, Advent и manifest не изменялись. Повторная локальная сборка дала тот же SHA пакета; 19/19 целевых тестов (`days-templates-preparation` + `app-content`) прошли без повторного аудита. PR остаётся Draft. Для продолжения в существующем канале необходимы доказательства безопасного поведения реально выпущенных Flutter-клиентов и поддерживаемый режим согласованной manifest-публикации либо совместимый bundle/release. Альтернатива без Flutter-релиза — отдельный версионированный канал Web с сохранением старых документов для Flutter; такого канала сейчас нет, это отдельное изменение архитектуры, а не переключатель имеющегося writer. Свежий production preflight/updateTime и readback нужны только после разрешения этого барьера; разрешение владельца на условную публикацию уже получено.
