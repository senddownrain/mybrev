> 2026-11-17 FINAL EXECUTION: the owner explicitly permits the exact PR255/261
> publication before the next **test** Flutter release. The existing coordinated
> writer now supports the narrow test-app policy in `final-execution/authorization.json`.
> Original PR113 provenance remains immutable; reconciled target descriptors are
> separately bound to its 344-field supplement. Source review covers all updater
> revisions; 101 executed tests cover main, pre-PR113 and earliest updater, including
> exact mass success/download interruption/Hive restart and user data preservation.
> No released build, installed-client inventory or native smoke is claimed. Generic
> MASS publication remains refused. See `final-execution/test-app-evidence.json`.
> Current manifest was read once to bind authorization. Execution/readback results
> must be recorded separately; this note does not claim a production write.

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

## Web-only слой PR255 (2026-11-16)

По следующему решению владельца реализован отдельный статический слой **7 791 исправлений / 749 исходных документов**, версия `2026-11-16-pr255-web-only-v1`. Предыдущая блокировка относится к записи общих Firestore-документов; этот способ их не меняет. `node scripts/liturgy/build-web-corrections.mjs` воспроизводит семь lazy JS-файлов из того же проверенного плана (source SHA256 `adb05cfee3a90528a0588a3ff3a3f85dd9db4ef712469e0e3e738340fccabbf1`). В файлах только пути, SHA исходного поля и точные строковые замены; полные snapshot-документы и их служебные данные туда не экспортируются. Редакционные алгоритмы заново не запускаются. Полное совпадение всех 7 791 результирующих строк с утверждённым after проверяется тестом.

Замены применяются к копиям days перед наследованием/сборкой Часов, включая резервный псалтырь, фиксированные/динамические даты и заупокойный день; шаблоны обрабатываются также после восстановления сырого collection cache. Несовпадение полного SHA поля означает сохранение текущего значения, а не его перезапись. Уже исправленный текст повторно не раскрывается. Редактор и выбор исходного дня/шаблона получают исходные данные. Proper, 14 Advent-правок и 843 неподтверждённых поля не входят в слой.

Используются прежний publicContentCache/IndexedDB и существующий precache PWA; каждый файл меньше 1 MB. Слой не обращается к Firebase. Web CONTENT_REVISION обновлён, чтобы онлайн-посетитель не получил прежний собранный результат как свежий. При недоступной сети сохраняется прежнее штатное поведение: последняя полная копия остаётся читаемой. После успешной сборки сохранённый результат уже содержит исправления, что проверяется перезагрузкой настоящего экрана Ютрані. Локальный browser smoke использует реальные загрузчики/сборку/экран/IndexedDB с подменой границы SDK; все реальные Firebase-запросы блокируются. Проверяет также шаблон, сохранение Advent и исходных значений редактора. Команды: `node --test tests/web-liturgical-corrections.test.mjs tests/days-templates-preparation.test.mjs tests/content-cache.test.mjs`, затем `node scripts/smoke-web-corrections.mjs` при работающем Vite с demo config и прежними локальными backups.

Публикация этого слоя — только Hosting deploy после merge/CI. Она **не является публикацией 7 791 полей в Firestore**. Общие документы, manifest и его days=6 не требуют записи. Для будущего Flutter остаются согласованная миграция тех же полей в общей базе с новым preflight/updateTime/readback, совместимые bundle и manifest; Web SHA-guard автоматически пропустит поля, уже получившие утверждённый after. После завершения общей миграции слой можно удалить отдельным PR с обновлением CONTENT_REVISION.

Простой откат: revert merge PR255 через PR и штатный Hosting deploy. Возврат прежнего CONTENT_REVISION делает собранные результаты этой версии устаревшими при следующем онлайн-чтении; они пересобираются из неизменённой базы. Отдельного rollback Firestore/manifest нет. Офлайн-клиент получает откат после выхода в сеть и обновления Web/PWA, как и обычное обновление сайта.

## Техническая подготовка coordinated release после Flutter PR113 (2026-11-17)

**Только подготовка: production Firebase reads/writes = 0; workflows не запускались, deploy/merge не выполнялись.** Web-only слой PR255 сохранён. В `flutter-pr113/` побайтные копии handoff/report/requirements и трёх manifest candidates из точного Flutter merge `bb145d8e366236af930b7d1086c24b3d1c52256a`; `provenance.json` фиксирует SHA256/bytes. Оригинальные candidate versions — ожидания, не runtime-версии.

Существующий `future-publish-editorial-v3.mjs` расширен флагами `--coordinated-release <verified-release-evidence.json> --baseline-catalog <catalog.gz>`. Обычный proper-only режим и обычный отказ `content:manifest` при MASS CONTENT REBUILD сохранены. Coordinated mode требует **до чтения credentials/SDK/network** конкретное разрешение, SHA пакета/релизных доказательств/каталога, точный bundle-report и manifest asset, фактические released builds (новый buildNumber >6, source SHA с доказательством включения PR113 и неизменным bundle), native cold-start/Hours/upgrade-user-data/older-overlay/interrupted-update, Android/iOS distribution inventory и проверки установленных бинарников без downloads/потери данных. Исторический source-level smoke PR113 не заменяет эти native доказательства. Отдельный MASS review обязан быть связан с этими же report/evidence SHA; Proper introduction разрешается явно. Фиктивная schemaVersion или одно `massRebuildReleaseGateReviewed=true` не открывают этот режим.

Существующий ручной workflow `pr245-reviewed-content.yml` использует тот же protected secret, production environment и `firebase-firestore-production` concurrency. Новый выбор `release_scope=coordinated-pr255`: только execute, batch=25, git-tracked JSON `release_authorization_path` и `flutter_release_evidence_path`. Их проверка выполняется **до загрузки секрета**. Authorization не генерируется автоматически из старых разрешений Proper. При resume SHA предыдущего защищённого receipt должен быть отдельно указан в authorization. Никакого запуска этого workflow сейчас нет; автоматического production/deploy trigger не добавлено.

### Квота и точные данные

- Immutable selection прежний: **7 791 fields / 749 docs**, без Proper и без 843 неподтверждённых изменений. Контент готов; разрешение production и совместимость ещё не установлены.
- Binary SHA256 `full-content-plan.json.gz`: `afd2ce11bd20e70ee934f8a7e726d11064a0097e6638b0b846b9849a7e29ac1e`.
- Binary SHA256 подготовленного subset gzip: `3f395bd371666099a92158c183349fa0984e01e61b672735c559d76e2ed809d8`. Исторический `editorialHash(Buffer)` этого же файла — `df938a10e8180b39fe3549b1998a6e8d34b483d76af8ac83570a5295d5af61f7`; он **не binary SHA** и не подменяет его в coordinated authorization. Различие фиксируется явно. При другом codec/zlib binary pin проверяется до credentials, не подменяется автоматически.
- `coordinated-baseline.json.gz` — функциональный каталог **только hashes/sizes/updateTimes 1 043 публичных документов**, не копия содержимого snapshot. Он воспроизводится из имеющегося checksum-verified snapshot и подтверждённых masked Proper receipts, не требует повторной публикации Proper. SHA256 `c11ee7fb60c4c5ab5806f8e04fee589575c4e7d364b37675ecad690e3fdc5be9`, 25 388 bytes. Унаследованные hashes используются только при точном совпадении live updateTime.
- В execute — одна fresh проверка оставшихся целевых документов. Новое updateTime допускается **только** при совпадении каждого beforeSHA или already-afterSHA; неизвестное значение останавливает весь preflight до записи. Already-after поля пропускаются в masks, но проверяются readback; полностью готовые документы не переписываются. Пакеты до 25, exact masks, nanosecond CAS, прежние bounded retry/readback/resume. При quota exhaustion/неизвестном 429 нет бесполезных повторов. Журнал обновляется атомарной заменой с fsync, ACK request numbers не переиспользуются после resume, pending readback обязан совпасть с server updateTime.
- Из того же fresh preflight без дополнительных чтений вычисляется результат **после masks**. Если сохранение остальных полей не даёт точный released bundle hash/size — остановка **до data writes**. Это не право заменить документ целым bundle.
- Финальная digest-проверка повторно использует полные данные target preflight/readbacks и каталог. В одной транзакции читается проекция **только ID/updateTime** трёх коллекций; изменённое/неизвестное содержимое дочитывается лишь точечно в пределах отдельно рассмотренного бюджета `maxUncachedDocumentReads` (0–50). Добавления/удаления IDs, превышение бюджета или несовпадение digest/count/bytes/hash/size останавливают manifest. Остальные коллекции не читаются.
- Штатный `planManifest(...,{partial:true})` вычисляет версии из актуального current: например, days=11 становится 12, а не слепо 7; unchanged digest сохраняет версию. Schema остаётся 1, contentVersion — реальное время публикации >= bundle time. Все другие root fields/collection entries сохраняются. Три collection manifests ставятся в очередь первыми, `current` последним, **одним атомарным commit транзакции**, с CAS всех захваченных manifest records, `maxAttempts=1` и полным readback четырёх документов. Неизменённые manifest payloads не переписываются. Потерянный ACK manifest восстанавливается точным readback payloads без повторной записи.

Локальное воспроизведение пакета и каталога, без Firebase:

```sh
node scripts/liturgy/prepare-days-templates.mjs --snapshot backups/firestore-snapshot-public \
  --advent-baseline backups/pr245-after-advent --out backups/pr245-days-templates-prepared.json.gz \
  --coordinated-catalog backups/pr255-coordinated-baseline.json.gz
node --test tests/coordinated-release.test.mjs tests/flutter-baseline-reconciliation.test.mjs \
  tests/firestore-release-recovery.test.mjs tests/days-templates-preparation.test.mjs tests/app-content.test.mjs
```

Будущая authorization должна содержать `project=ibreviaryby`, `policy=pr255-coordinated-bundle-release`, `action=execute`, конкретные `ownerApproved/reason`, `planBinarySha256`, `baselineCatalogSha256`, `releaseEvidenceSha256`, `manifestBaselineSha256` (canonical JSON SHA256 актуального current из server receipt; первый GET обязан подтвердить его), `introduceCollections=["liturgicalProperTexts"]`, `maxUncachedDocumentReads` и `massManifestReview={approved,reviewer,url,releaseEvidenceSha256,bundleReportSha256}`. При resume — также binary `resumeReceiptSha256`. Release evidence: schema=1, project, flutterMergeSha, bundleReportSha256, bundleManifestSha256; `release={confirmed,releasedAt,builds}`; каждый build содержит platform/version/buildNumber/sourceSha/bundleSourceMergeSha/bundleManifestSha256, artifact и ancestry `{url,sha256}`, distributionUrl. Все пять nativeSmoke entries имеют status=passed, `{url,sha256,artifactSha256}`. Inventory задаёт complete, proof, Android/iOS active/not-distributed с proof и полный installedBuilds; checks связываются platform/buildNumber/artifactSha256, kind=installed-binary, result=current/appReleaseRequired, downloads=0, dataPreserved=true и proof. **Эти документы с настоящими release/native сведениями пока не созданы и не утверждены; этот текст не разрешение записи.** При отсутствии актуального manifest receipt в будущей разрешённой задаче достаточно точечного чтения current; целевой preflight 749 документов не повторять ради составления authorization.

### Дополнительные отличия и их исправление по уточнению владельца

Сравнение **сохранённого snapshot**, после моделирования исходных 7 791 masks и сохранения ранее опубликованных Advent/Proper, с точными asset gzip PR113 (проверены binary SHA) выявило 37 отличий вне masks:

| Документ | Поля | Решение в подготовленном Flutter supplement |
| --- | --- | --- |
| days/feast-christthehighpriest | 12 `sext[123].Hymn/Ps[123]` | Точный `from-day` вместо null. Это существующая политика `high-priest-targeted-plan.mjs`; не новые сочинённые гимны/псалмы. |
| days/ordinary-w11-d1 | 11 `vesper1*` | Побайтные значения утверждённого `xi-sunday-first-vespers-by.json`, совпадающие с сохранённым Web. |
| days/ordinary-w30-d6 | 10 `vesper*`, кроме уже учтённого vesperR | Точные значения `ordinary-w2-d6`, ранее опубликованное исправление Friday/All Saints. |
| days/28-10-sv-simon-jude-apostles | vesper1Inter, vesperInter, checked, allowedAlleluia | Сохранить существующий Web legacy-вариант и значения метаданных. Не переносить их на Common/Proper и не удалять другие печатные варианты. Источник разграничен в `docs/investigations/2026-10-28-vesperInter.md`. |

Никакой новой реконструкции ответов нет. Единственное пересечение supplement с историческим held — `days/ordinary-w11-d1.vesper1R`: это **синхронизация старого bundle с уже существующим утверждённым Web baseline**, не раскрытие его сокращённых ответов. Он копируется побайтно из XI source, сохраняет исходные сокращения и остаётся в held-очереди. В Web/Firestore ни одно из 843 удержанных значений не меняется; этот путь не разрешает их публикацию/раскрытие.

Ещё 307 различий — отсутствующее в candidate `importedAt`: 16 templates + 291 Proper. Значения из существующего snapshot, только для сохранения raw storage shape/размеров; canonical hashes уже совпадают. Каждое добавление даёт +27 bytes. Удалять эти метки из Firestore ради candidate запрещено; Proper повторно не публикуется.

`flutter-baseline-reconciliation.json.gz` — подготовленный **Flutter-bundle-only** supplement: 37 baseline fields + 307 metadata fields = 344, с typed before/after SHA, источниками и expected before/after collection descriptors. SHA256 `e08c154ff6d7d5d1443a4f89b297c0c9de2da2d6195a3527ee33a9d0718a2692`, 60 677 bytes. Это не Firestore plan: штатный validator его отвергает; writer его не импортирует, source masks остаются 7 791. `applyFlutterBaselineReconciliation` применён **в памяти** к точным трём decoded PR113 assets, с проверкой исходного bundle/report; ни Flutter checkout, ни его bundle не редактировались. Все остальные данные сохранены. Для повторения generator принимает существующие локальные файлы:

```sh
node scripts/liturgy/prepare-flutter-baseline-reconciliation.mjs \
  --snapshot backups/firestore-snapshot-public --flutter-bundle backups/flutter-pr113 \
  --out backups/flutter-baseline-reconciliation.json.gz
```

Ожидаемый **офлайн** результат supplement:

| Collection | Count | Digest | Stored bytes |
| --- | ---: | --- | ---: |
| days | 736 | cbe2b5a263890a42 | 54 678 841 |
| liturgicalTemplates | 16 | a1d498c34dd96ab8 | 3 028 498 |
| liturgicalProperTexts | 291 | dccd7a25a8393a4f | 3 279 569 |

Это не production receipt и не доказательство сегодняшних live значений. **Оригинальный contract PR113 не заменён этими вычислениями.** До production необходим новый проверенный Flutter bundle/report/handoff с учётом supplement (и подтверждение live baseline при разрешённом fresh preflight), затем реальный mobile release/native/installed-client compatibility review. Только после этого отдельным рассмотренным изменением обновить pins согласованного contract в writer; нельзя подменить candidate metadata без соответствующего выпущенного bundle. Текущий contract намеренно останавливает несовпадающий релиз. Удаление Web-only слоя остаётся последним отдельным PR после полной успешной миграции/manifest/readback/parity.

Точные inverse masks также сохраняются: `build-editorial-rollback-v3.mjs` использует только acknowledged `writtenFieldMasks`, не откатывает preflight already-after поля/документы и сверяет binary SHA source plan coordinated receipt. Отсутствие policy больше не позволяет legacy CLI писать days/templates. Rollback остаётся исключительно офлайн подготовкой с отдельным будущим review/authorization; автоматического rollback базы или manifest нет.

Проверка этой подготовки: 46/46 целевых локальных тестов (coordinated release, supplementary baseline, recovery, original preparation и app-content gates), ESLint без ошибок/предупреждений, YAML syntax, Node syntax всех встроенных workflow scripts. Тестируется сам production transaction adapter через injected SDK driver: metadata fence до set, indexes перед root, maxAttempts=1, no-op без повторных manifest writes; data/manifest crash resume, точные rollback masks и отказ до credential-read при неподтверждённом релизе. Полный редакционный аудит не повторялся, production/quota API не вызывались.
