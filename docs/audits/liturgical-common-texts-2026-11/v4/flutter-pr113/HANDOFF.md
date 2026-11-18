# PR255 — Flutter bundle и handoff в Web

## Результат

Готов офлайн candidate полного Flutter bundle: **7 791/7 791** утверждённых fields / 749 документов (734 days + 15 templates), дополнительно 406 ранее опубликованных Proper fields / 226 документов и все 14 опубликованных Advent fields / 2 документа. **843 held fields сохранены побайтно как в прежнем Flutter baseline**. Остальные поля/коллекции не изменены (проверено обратным восстановлением только allowlisted paths и полным deep equality). Принятые renderer/типографика PR111 не изменены.

PR111 объединён после успешного Flutter PR checks run 43813465428 и проверки mergeable=true: merge SHA `cb538b10aea322fd464a4dd377ca8939ede2a294`.

Источник: **точный merge PR255** `c35dbad33b3f56ff6176fff3120c5f39dce75242`, а не движущийся Web main. Использованы v4/full-content-plan.json.gz, штатный selectDaysTemplates, receipt Proper, утверждённые Advent JSON и сохранённые hashes compatibility-review.json. Никаких повторных редакционных аудитов, Firebase SDK/credentials/production reads/writes, Web/Firestore edits или mobile releases.

Полный snapshot из другого окружения отсутствует. За baseline взяты существующие 16 asset-коллекций Flutter main после PR111. Проверка паритета относится ко всем 7 791 целевым строкам, 406 Proper и 14 Advent, а не ко всем нецелевым полям живого Firestore. Полный parity с текущим production НЕ заявляется. В живых документах могут быть дополнительные изменения; сверка будущих live digests обязательна перед публикацией.

В одном поле `days/ordinary-w30-d6|vesperR` старый Flutter baseline предшествует Web before-строке и содержит иное чтение. Разрешена только точная старая строка SHA256 `51ab96d9b99433d559d91e27809403f25caa4cfab37dd20715ae5543eac6f15b`; результат равен утверждённому afterSHA. Это перенос подтверждённого поля из старого bundle, не правило разрешать произвольные конфликты. Все прочие before/after несовпадения прерывают сборку.

## Версии и hashes

- Asset schemaVersion **1**, без фиктивного повышения схемы.
- contentVersion трёх изменённых коллекций и всего bundle: **1794815100000**, `2026-11-16T07:45:00.000Z` — время подготовки, НЕ receipt публикации.
- Остальные 13 коллекций, их bytes и contentVersion сохранены.
- Общий gzip bundle: **4 895 246 bytes**, 16 коллекций / 4 171 документов.
- pubspec оставлен **1.0.0+6**. Это версия исходников, не новый выпущенный build. Перед релизом выбрать свободный buildNumber выше опубликованных Play/TestFlight; не переиспользовать +6.
- Binary SHA256 файла full-content-plan.json.gz: `afd2ce11bd20e70ee934f8a7e726d11064a0097e6638b0b846b9849a7e29ac1e`.
- Web index sourceSha256 `adb05cfee3a90528a0588a3ff3a3f85dd9db4ef712469e0e3e738340fccabbf1` исторически вычислен как SHA256(String(Buffer)), а не binary SHA256 gzip. Различие проверено; эти два идентификатора не взаимозаменяемы.

| Collection | Count | App digest | Stored bytes | gzip bytes |
|---|---:|---|---:|---:|
| days | 736 | `259c01cbdac7469d` | 54673238 | 2326153 |
| liturgicalTemplates | 16 | `a1d498c34dd96ab8` | 3028066 | 324576 |
| liturgicalProperTexts | 291 | `dccd7a25a8393a4f` | 3271712 | 593316 |

| File | Binary SHA256 |
|---|---|
| manifest.json | `d7a515cf5e748f3cc5504729fb326bf7ab375fb77f442e2b95cb07d6f6e711af` |
| days.json.gz | `9b691b3229d0dccb3835e13873d4a6f79c5c98ce9b90216219988ac6708fbae7` |
| liturgicalTemplates.json.gz | `cd55ff3fbfe024cb6905e2e1b238effdc6740cc07ffdb676d3dac61cfd8b27ad` |
| liturgicalProperTexts.json.gz | `e73cf03ef2652e904465e3743c872f292f40a420443e9762d49f1361716bcc18` |

Все 16 файлов, версии, размеры и binary SHA256: [bundle-report.json](bundle-report.json). Точные document hashes/sizes будущего целевого manifest без текстов: `days-manifest-candidate.json`, `liturgicalTemplates-manifest-candidate.json`, `liturgicalProperTexts-manifest-candidate.json`; требования: [manifest-requirements.json](manifest-requirements.json). Это офлайн эталоны, не файлы для слепого upload.

## Проверки и совместимость

- Сборка двумя независимыми прогонами: manifest и все gzip побайтно совпали. Для 16 коллекций проверены schema validation, decode, document hashes, collection digests, counts, storedBytes, bundleBytes и per-collection contentVersion. Штатные codec/describeDocuments/writeBundle Web повторно использованы.
- Все 7 791 UTF-8 afterSHA совпали без HTML normalization. Независимо выполнен реальный applyWebLiturgicalCorrections из семи версионированных shard-файлов PR255; все 7 791 выходных значений равны bundle. Before-состояния для этой проверки взяты из утверждённого плана (включая указанное старое Flutter расхождение).
- 87/87 regressions: content_offline, ordo_content_update, prayer_formatting_bundle, doxology_bundle, approved_calendar_update, office_responsory_formatting, liturgical_html. Проверяют offline, испорченный/пропавший документ, crash recovery, атомарность поколений, старый/новый overlay, прежний renderer. До сборки отдельно прошли 42 существующих offline/calendar теста; это подмножество 87, не дополнительные уникальные тесты.
- Ещё 44/44 scoped assembly-регрессии: common_office, hours_regression, liturgical_vespers, high_priest_daytime, high_priest_daytime_parity, high_priest_minimal_patch, pastors_hymn, devotional_office. Существующими генераторами обновлены 19 Common cases и 44 High Priest dates/dioceses, а также hashes прежнего reference-only patch. Его 12 полей не менялись. Историческое plain-text сравнение в двух тестах теперь сохраняет границы p/br, чтобы не склеивать слова после подтверждённой разметки PR255; exact HTML/SHA проверки не ослаблены. Полный аудит дат/--full не запускался.
- 4/4 новых pr255_bundle_update: точный будущий manifest => current/0 downloads; старые реальные main hashes => rebuild/0 downloads/неизменный store; прямой apply массового плана => отказ до network; старый Hive overlay уступает bundle и правильный текст сохраняется после offline restart.
- Дополнительный временный source-level тест: извлечены **настоящий updater и gzip assets SHA 04f66103389f52938e9746d04df2a36cfa907bb8**, обозначенного в `docs/release/common-seasons/phase-00.md` как Android alpha run 39379866530. Старый updater c новым целевым manifest вернул appReleaseRequired(rebuild), plan=null, 0 downloads, baseline digest и overlay сохранены. Использовано текущее хранилище/тестовый harness; это не запуск исторического APK. SHA256 исходника updater: `1d5a7712950adc8b5dab24d4af2e9147ea871a2b6ef7eaceff13a7b1565f21b1`. Временные файлы удалены из рабочего дерева; лог сохранён в окружении `/workspace/scratch/pr255-final-tests.log`.
- dart format / diff --check passed; flutter analyze --no-pub --no-fatal-infos: exit 0, 0 errors / 0 warnings, 29 существующих info.
- Chrome visual smoke: не повторялся, UI/renderer не менялись; визуально принятый PR111 уже имеет собственные снимки и успешный CI. Проверка его formatter-регрессий выполнена. Native smoke, установка и upgrade APK/IPA: **НЕ ВЫПОЛНЕНЫ, обязательны перед релизом**.

**Защита MASS CONTENT REBUILD не ослаблена.** По сравнению с main baseline меняются 734/736 days (54 670 556 download bytes), 15/16 templates (3 012 875 bytes), 226/291 Proper (3 187 640 bytes). Пороги клиента: 12 MiB всего либо >50 changed/removals и >50% коллекции. Один days уже блокирует весь план; apply ничего не получает. Новый прямой guard apply дополнительно отказывается от rebuild-плана, даже если вызывающая сторона обошла check. Он не может задним числом исправить старые APK.

Старый известный updater сохраняет offline corpus и предлагает обновление приложения; автоматически доставить все исправления ему невозможно без нового bundle. Безопасность **всех** установленных версий не установлена: нет актуального инвентаря Play/TestFlight/iOS и native upgrade test. Git tags отсутствуют; gh release list в этом окружении получил Forbidden. Версия +6 сама по себе не идентифицирует SHA установленного приложения.

До общей публикации старый manifest не соответствует новому bundle; check также может показать rebuild, сохраняя локальные тексты. Не предлагать частичную синхронизацию как способ завершить миграцию. Новый bundle не отменяет преднамеренно более поздний overlay: штатное правило версии сохраняет его; это покрывается существующими тестами. При будущей публикации нельзя назначать старую contentVersion новым значениям.

## Воспроизведение без Firebase

Из Flutter checkout после PR111, сохранив прежний assets/content как отдельный baseline:

```sh
node scripts/prepare_pr255_bundle.mjs \
  --web ../mybrev --expect-web-commit c35dbad33b3f56ff6176fff3120c5f39dce75242 \
  --baseline /path/to/original-assets-content --out /path/to/new-candidate \
  --version 1794815100000 --report /path/to/bundle-report.json \
  --manifest-out /path/to/manifest-candidates
flutter test test/pr255_bundle_update_test.dart
flutter test test/content_offline_test.dart test/ordo_content_update_test.dart \
  test/prayer_formatting_bundle_test.dart test/doxology_bundle_test.dart \
  test/approved_calendar_update_test.dart test/office_responsory_formatting_test.dart \
  test/liturgical_html_test.dart
flutter analyze --no-fatal-infos
```

Для Common oracle использована команда `node scripts/build_common_parity.mjs --web ../mybrev --expect-web-commit c35dbad33b3f56ff6176fff3120c5f39dce75242` без `--full`; для High Priest — существующие `prepare_high_priest_daytime_patch.mjs` и `build_high_priest_daytime_parity.mjs` с тем же pin.

Инструменты этой сборки: Flutter 3.41.4 / Dart 3.11.1, Node v24.19.0, zlib `1.3.2.1-motley-3246f1b`. Collection/document digest независим от gzip; binary gzip SHA воспроизводить с совместимым codec/zlib.

Web checkout должен быть чистым на точном PR255 SHA; зависимости из lockfile нужны существующему селектору. Baseline воспроизводится из Flutter merge `cb538b10aea322fd464a4dd377ca8939ede2a294:assets/content`. Скрипт не импортирует Firebase SDK, не читает credentials и не запускает publisher. Два прогона с одинаковыми входами/версией должны совпасть побайтно.

## Точный handoff для Web Codex — последовательность публикации

1. **Не повторять редакционный аудит и не переписывать 406 Proper/14 Advent.** Зафиксировать merge SHA Flutter PR с этим candidate, app build/SHA и bundle-report. Проверить актуальные distribution/build сведения Android/iOS. Пройти native smoke новой сборки (offline cold start, Hours, upgrade без потери settings/favourites/user prayers, старый overlay, прерывание update). До публикации массового manifest нужен согласованный Flutter release с новым bundle и свободным buildNumber. Этот PR сам по себе mobile release не выполняет.
2. В Web использовать тот же `selectDaysTemplates` из `prepare-days-templates.mjs`: **ровно 7 791 поля / 749 документов**, plan binary hash фиксировать отдельно от legacy editorialHash. Не использовать старый proper-only план и не подмешивать 843 held. Без backups взять versioned Git plan/shards; никаких массовых backup/audit reads. В самом guarded execute выполнить fresh reads только целевых документов + manifest и необходимые readbacks. Захваченные updateTime ноября уже не подходят как production preconditions: новые timestamps допускаются только после полного совпадения соответствующих beforeSHA (или already-afterSHA); прочие конфликты останавливают публикацию и требуют точечного решения. Писать exact field masks с fresh updateTime, сохранить receipt каждого ограниченного batch и checked afterSHA. Незатронутые поля сохранить, включая Advent; повтор Proper запрещён.
3. **В текущем Web writer ещё есть программный барьер.** `future-publish-editorial-v3.mjs` вызывает `verifyCompatibleSubset`, который принимает исключительно policy `proper-only-keep-manifest` и запрещает days/templates. План `days-templates-awaiting-compatible-bundle` им отвергается. Web Codex должен сначала отдельным reviewable изменением расширить существующий writer поддерживаемой coordinated-release policy: связать разрешение с точными Flutter release/build, bundle digest report, неизменяемым набором 7 791 paths, manifest baseline, свежими hashes и receipts. Не удалять compatibility, не выдавать фиктивное `massRebuildReleaseGateReviewed=true`, не просто убирать guard/compatibility из плана. Использовать существующие update-mask/batching/resume/readback инструменты, не новый массовый импортёр. Исполнять production фазу только в отдельной разрешённой Web задаче.
4. После записи/проверки targeted fields построить живые document hashes/sizes штатным app-content алгоритмом. **Обязательный барьер: live digest/count/bytes должны совпасть с целевыми тремя candidate manifests.** Неполные Git-артефакты не доказывают равенство всех нецелевых live полей. Если обнаружены ранее неучтённые изменения — не публиковать hashes candidate поверх live, не затирать live полным bundle. Сохранить дельту, точечно перенести подтверждённые дополнительные данные в Flutter и пересобрать/перепроверить согласованную сборку. Production metadata/bookkeeping hash алгоритмом исключается штатно; HTML не нормализовать. Все остальные collection manifest entries сохранять.
5. Manifest schema остаётся **1**. При неизменном проверенном published baseline из PR255 ожидаются **days 6→7**, **liturgicalTemplates 3→4**, **Proper introduction →1**. Это ожидания, а не право переписать фактические более новые версии; runtime planManifest вычисляет next из freshly read current. contentVersion — реальное время публикации, не меньше bundleContentVersion 1794815100000; его не путать с integer version каждой коллекции. Точные `{hashes,sizes,digest,count,bytes}` брать из проверенных live данных, сравнивая с эталонами этого PR.
6. Штатный `content:manifest` должен по-прежнему отказать в обычной публикации MASS CONTENT REBUILD. После наличия проверенного нового Flutter release, полного равенства digest и отчёта совместимости использовать согласованный release-путь существующего publisher; если он требует `--allow-large-patch`, это **явный релизный override**, а не снятый автоматически барьер, и он требует отдельного конкретного release review. Proper вводится отдельным явным `--introduce-collections` только после релиза. Не повышать schema ради обхода. Нельзя сейчас выполнять generic `--apply`/`--allow-large-patch` по этому документу. Точный финальный apply набор Web Codex составляет из проверенного release report; офлайн bundle не является production authorization.
7. Ограничить publisher `--collection days --collection liturgicalTemplates --collection liturgicalProperTexts` (штатный scoped режим сохраняет остальные entries). Сначала collection manifests, затем current, readback всех трёх и current. Отказ/несовпадение => не переключать current; сохранить receipts. Проверить на известном старом клиенте appReleaseRequired без downloads, на новом — current без overlay downgrade, затем offline restart. Полная миграция content batch не атомарна на 749 документов: не считать её завершённой до всех receipts/readbacks и переключения manifest. При сбое использовать существующий resume, не повторять уже verified batch.
8. Web-only слой PR255 пока оставить: его beforeSHA guard не повторяет замену уже мигрированных after-строк. Удаление слоя — отдельный Web PR после полной миграции и parity с обновлением cache revision. Откат данных только точными обратными masks с fresh afterSHA/updateTime и receipt; не возвращать целые старые snapshot/manifest поверх новых Advent/Proper или независимых изменений.

**Статус:** content bundle и технические regression checks готовы к ревью. До согласованной production-публикации остаются native/release доказательства, поддерживаемая coordinated policy в Web writer и финальный live digest/readback gate. Production в этой работе не затрагивался.
