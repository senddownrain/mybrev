# PR #245 — отдельная будущая публикация v3

Статус: **content-ready, awaiting-live-preflight**. Этот файл не даёт разрешения на production. На этом проходе не выполнялись live preflight, Firestore writes, публикация manifest, bump content revision, deploy, merge или Flutter release.

## Состав и доказательства

- `publication-plan.json.gz` — единый план: 8 153 ready-поля / 974 документа, 888 held. Все 6 400 прежних ready-полей / 727 документов сохранены; 1 753 ранее удержанных поля включены только после успешного локального структурного доказательства. Новых путей сверх прежних 9 041 нет.
- `ready-fields.tsv` — отдельный список только полей, чьё содержание можно согласовывать к публикации, не дожидаясь решения остальных исключений. Это не разрешение выполнить запись.
- Для каждого поля: collection/id/path, before/after, SHA, статус/причина, exact updateMask, baseline source revision, provenance, caseIds, локальные блоки/диапазоны. Планы документов содержат точный snapshot updateTime (наносекунды).
- Источник сравнения — существующий local snapshot 13.11.2026 21:53:10 UTC. Свежесть production не предполагается. Любое расхождение updateTime или beforeSHA останавливает весь preflight до первого write.
- `editorial-source-proofs.json.gz` — 467 исходных полей: 455 раскрыты / 820 реплик, 2 уже полные, 10 удержаны. `source-baseline.json.gz` и `input-queue.json.gz` сохраняют состояние b05699f. Разрешение владельца: задание `pr245_codex_end_to_end_v3.md`, SHA256 `6fe04a58d7ecf24144893c18d839718503949daba7580f76ec41914a6b7796e8`.
- `derived-generation-proof.json.gz` — ещё один ответ `03-05-sv-philip-james-apostles:officeOfReadingsR1`, полученный из локального ranked-days cache штатным генератором. Кэш не переписан. Это производное поле, не 456-е поле исходной очереди.
- В плане 3 629 раскрытий конкретных реплик Firestore; это копии/материализации, не число исходных полей. 888 held-полей Firestore не равны 10 редакционным исходным исключениям: старые materialized days и Sunday psalter содержат дополнительные структуры/словесные варианты вне проверенных source signatures. Их не исправляют по аналогии и не предъявляют как новые 888 редакционных карточек.
- 54 ready-поля Proper имеют только отличия HTML от generated, при точном равенстве видимых слов. Они сохраняют прежнее проверенное HTML. Новые раскрытия совпадают с generated либо имеют те же проверенные локальные opening/verse signatures, сохраняя live-разметку и чтение вокруг замены. Sparse Proper поверх `days` не импортируется.

## Воспроизведение офлайн

Из корня Web на зафиксированном commit PR, с существующим snapshot:

```bash
node scripts/liturgy/editorial-responsories-v3.mjs --check
node scripts/liturgy/common-seasons.mjs --check
npm run generate:fixed-feasts -- --offline
node scripts/liturgy/common-seasons-fixture.mjs
node scripts/liturgy/build-editorial-exceptions-v3.mjs
node scripts/liturgy/prepare-editorial-publication-v3.mjs --snapshot backups/firestore-snapshot-public
node scripts/liturgy/review-common-text-queue.mjs --check
node scripts/liturgy/check-editorial-regeneration-v3.mjs --snapshot backups/firestore-snapshot-public
node --test tests/liturgical-editorial-v3.test.mjs tests/liturgical-manual-review.test.mjs tests/liturgical-common-texts.test.mjs tests/liturgical-alternatives.test.mjs tests/psalmody-doxology.test.mjs
```

Штатный `common-seasons.mjs --write --report` нужен при изменении исходников. Повторные генерации должны иметь нулевой diff. Исторические печатные проверки используют точное обратное отображение по file/field/afterSHA; сами прежние ожидаемые hashes и печатные транскрипции не заменены. Актуальное полное HTML отдельно проверяется по точным source spans.

## Редакторские исключения

Открыть локальный `exceptions.html` или [EXCEPTIONS.md](EXCEPTIONS.md): 10 отдельных сезонных групп / 10 полей / 15 спорных реплик. Предложение копирует исходное местное написание, включая спорное, и не является автоматическим исправлением опечатки. Выбор: принять кандидат / оставить сокращение / свой текст / отложить. Экспорт JSON не загружается на сервер.

После реальных решений владельца:

```bash
node scripts/liturgy/import-editorial-decisions-v3.mjs --decisions /private/pr245-decisions.json --out /private/pr245-decisions-validated.json
```

Импортёр проверяет schema/revision, case/reply IDs, актуальные field/reply SHA, номер абзаца, основание решения и отсутствие дублей. Изменившийся SHA требует повторной сверки. Он создаёт локальный план, не записывает source или Firestore. Следующий Codex применяет подтверждённые решения к **полным** полям, сохраняет исходные диапазоны и авторский JSON в новой цепочке доказательств, переносит решения в политику генерации, пересобирает offline и обновляет этот единый план. `defer` или отсутствующее решение удерживает поле целиком. Выполнение этих локальных шагов уже входит в поручение после получения решений; production требует нового отдельного согласия.

## Release gate

`release-classification.json` прогоняет действующий `classifyPatch`: **MASS CONTENT REBUILD**, около 58.0 MiB хранимых изменённых документов, 974 документа. Это размер документов для доставки, не размер request body полевого commit. Три оценочных commit-пакета ограничены 400 writes / 8 MiB каждый; ограничение HTTP проверяется повторно при выполнении.

Опубликованный manifest и bundle не являются этим snapshot. Сохранённый предыдущий анализ: manifest 08.11.2026, schema 1; 276 days и 11 templates уже расходились с ним до v3, Proper отсутствовал в опубликованном manifest. Текущее released Flutter bundle не исследовано. Web revision остаётся `2026-11-09-pr184-xi-vespers`.

До production-согласия проверить выпущенную версию Flutter: HTML/alternatives, данные в assets, hashes, ContentStore поколения и поведение массового обновления. Подготовить согласованный app bundle по `docs/app-content-distribution.md` и отдельный релиз приложения. После выхода совместимого приложения отдельно согласовать manifest/новые коллекции и Web cache revision. `--allow-large-patch` и `--introduce-collections` не являются обходом этого gate; в данном задании их не выполнять.

## Конкретные команды будущего preflight / write

Только после отдельного согласия владельца на **точный planSHA**, состав и release-порядок. Сначала вычислить:

```bash
sha256sum docs/audits/liturgical-common-texts-2026-11/v3/publication-plan.json.gz
```

В private authorization JSON должны быть `project: "ibreviaryby"`, вычисленный `planSha256`, `action: "preflight"` либо `"execute"`, `ownerApproved: true`, конкретное `reason`, `massRebuildReleaseGateReviewed: true`. Эти отметки заполняются по фактически полученному согласию, а не самим агентом по наличию этой инструкции. Служебный JSON — приватный файл 0600 с project_id ibreviaryby; не помещать его или authorization/receipt в Git. При доступе через vault декодировать ключ во временный файл и удалить после использования; не выводить значение.

```bash
node scripts/liturgy/future-publish-editorial-v3.mjs --mode preflight --plan docs/audits/liturgical-common-texts-2026-11/v3/publication-plan.json.gz --authorization /private/preflight-authorization.json --service-account /private/firebase.json --receipt backups/pr245-preflight.json
```

Preflight читает **все** выбранные документы и сверяет updateTime/beforeSHA до первого write. Изменение только постороннего поля тоже останавливает старый план по updateTime. При конфликте получить отдельно разрешённый свежий snapshot, перебазировать точные поля и вернуть конкретный обновлённый план на согласование; не переписывать чужие данные и не ослаблять precondition.

После отдельного разрешения на запись и закрытия release gate:

```bash
node scripts/liturgy/future-publish-editorial-v3.mjs --mode execute --plan docs/audits/liturgical-common-texts-2026-11/v3/publication-plan.json.gz --authorization /private/write-authorization.json --service-account /private/firebase.json --receipt backups/pr245-write-receipt.json
```

Execute повторяет полный fresh preflight; старый успешный preflight не даёт повторно использовать stale данные. Каждый server commit несёт exact updateMask + updateTime precondition. После каждого ответа сначала сохраняется приватный журнал с серверным updateTime, затем читаются записанные документы, сверяются afterSHA и updateTime. Конфликт/ошибка останавливает продолжение без retry/автоматического rollback. Предыдущие пакеты могли успеть записаться — это видно в receipt. При потере ответа на commit сначала исследовать сервер, не повторять вслепую. Никаких иных коллекций, meta revision, manifest или deploy этот скрипт не меняет.

## Rollback

`rollback-blueprint.json.gz` содержит точные обратные полевые значения. Реальный rollback строится по **успешным server writeResults**, не по старому snapshot updateTime:

```bash
node scripts/liturgy/build-editorial-rollback-v3.mjs --receipt backups/pr245-write-receipt.json --out backups/pr245-rollback-plan.json.gz
sha256sum backups/pr245-rollback-plan.json.gz
```

Это офлайн-команда. Получить отдельное согласие на конкретный rollback planSHA и затем использовать тот же future-publish скрипт с rollback plan, новым authorization и новым receipt. Fresh preflight требует afterSHA и post-write server updateTime: любое последующее изменение останавливает rollback. Восстанавливаются только перечисленные поля, целые документы не заменяются. При утрате server writeResult получить отдельный fresh snapshot и согласовать восстановительный план; timestamp не угадывать.
