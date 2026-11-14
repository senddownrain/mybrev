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
