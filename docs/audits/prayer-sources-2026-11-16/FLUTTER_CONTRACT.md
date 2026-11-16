# Контракт Web / Flutter и handoff публикации

Дата: 2026-11-16. Только офлайн; этот документ не разрешает production-действия.

## Поле источника

- Firestore `prayers`, `priestProtectedPrayers`: `source?: string`, только каноническое короткое название. Поле остаётся строкой, schemaVersion остаётся 1.
- `prayerDrafts`: `source` и исторический `sourceBook` используют тот же справочник. Числа PDF/печатных страниц остаются отдельными внутренними provenance-полями; они не конкатенируются в `source` при сохранении или публикации.
- Единственный справочник коротких названий: `src/data/sourceBibliography.json` в Web. Flutter получает готовую строку. Независимый Dart-справочник и собственные сокращения не нужны.
- Сохраняются заголовок, текст, все языковые версии, теги, категории, ID, доступ, publication status и неизвестные поля. Скрипт миграции меняет только явно перечисленные `source` / `sourceBook` через updateMask, без изменения updatedAt.
- Неизвестный источник возвращается нормализатором без изменений для отчёта/предпросмотра. Запись неизвестного значения блокируется до подтверждения справочника; исходный ввод остаётся у редактора. Исторические неизвестные значения миграция не переписывает.
- Отсутствующий/пустой `source` в старом bundle допустим для чтения; фиктивная атрибуция не подставляется. Библейские ссылки внутри текста не обрабатываются этим нормализатором.
- `/sources` сохраняет полную библиографию и copyright. URL `/sources` не добавляется в поле молитвы.

## Текущее Flutter-приложение

Checkout `senddownrain/ibreviarybyapp` проверен на commit `66288466d6a6ef8c9bfded22fe63bcc71a1337f3`.
Старая модель Prayer игнорировала `source`, поэтому старая установленная версия не ломается от короткой строки, но обычную атрибуцию не показывает. Подготовлены изменения модели (`fromMap`, `toMap`, `copyWith`), примечания источника для обычной молитвы и devotional office и четыре Dart-теста. English Mass использует короткое `The Roman Missal`; полный notice сохранён в Web `/sources`.

Flutter/Dart SDK в этой среде нет. `flutter analyze`, `dart format`, `flutter test` и обязательный Flutter Chrome visual smoke не выполнены. Это блокер готовности Flutter-релиза, не блокер Web PR. Перед релизом выполнить:

```sh
dart format lib/models/prayer.dart lib/widgets/prayer_content.dart lib/screens/prayer_detail_screen.dart test/prayer_source_test.dart
flutter analyze
flutter test test/prayer_source_test.dart test/prayer_formatting_widget_test.dart test/mass_reader_test.dart
flutter devices
flutter run -d chrome -t tool/prayer_formatting_smoke.dart --web-port 5237
```

В Chrome проверить обычную молитву и devotional office с коротким `source`: светлая/тёмная тема, крупный шрифт, мобильная ширина, прокрутка и ссылки; сохранить и просмотреть реальные скриншоты. Native smoke не требовался для данной общей UI-правки; перед мобильным релизом нужен отдельный smoke по правилам Flutter-репозитория.

## Офлайн-кандидат bundle

Не изменялись `assets/content/*` и manifest установленного Flutter bundle. Подготовлен отдельный кандидат в ignored `backups/prayer-source-flutter-candidate/` Web checkout:

```sh
node scripts/prepare-prayer-source-bundle.mjs --bundle ../ibreviarybyapp/assets/content --out backups/prayer-source-flutter-candidate
```

Основа `prayers`: 115 записей, версия `1791877294111` от 2026-10-13. Проверены исходные document hashes. Кандидат применяет 52 уверенные замены только источников, сохраняет 63 спорные записи и все остальные данные. Digest кандидата: `fd3576cf48ff95d2`. Повторная подготовка из кандидата даёт 0 замен. Сохранены schemaVersion=1 и базовая версия; `candidateOnly=true`, `releaseReady=false`. Версия production не выдумана. Это не актуальный полный состав молитв и не готовый релиз; кандидатом нельзя подменять поставляемый bundle.

## Отдельный пакет PR #245 / #255

Источники молитв не смешиваются с литургической миграцией. Проверены версионированные Web-артефакты, без восстановления snapshot через Firebase:

- `v4/full-content-plan.json.gz`, SHA256 `adb05cfee3a90528a0588a3ff3a3f85dd9db4ef712469e0e3e738340fccabbf1`;
- `scripts/liturgy/prepare-days-templates.mjs` и `src/data/liturgical/web-corrections`, версия `2026-11-16-pr255-web-only-v1`;
- ровно 7 791 подтверждённое поле / 749 документов `days` и `liturgicalTemplates`;
- исключены 843 неподтверждённых поля и ранее опубликованные 406 Proper-полей;
- manifest days=6 и 14 Advent-правок не изменяются этим пакетом; Web overlay не является Flutter bundle или записью Firestore.

Пакет содержит только точечные замены, а не полный текущий snapshot молитв. Его нельзя использовать для подсчёта новых `prayerDrafts` или как основание для назначения источников. Регрессии Web проверяют точные afterSHA, границы Advent и отсутствие повторного применения. В этой задаче литургические данные и shipped Flutter bundle не менялись. Полный исторический handoff: `../liturgical-common-texts-2026-11/FLUTTER_HANDOFF.md`.

## Для Web Codex после отдельного разрешения production

1. Взять имеющийся частный snapshot со всеми коллекциями молитв; сначала офлайн dry-run и проверка coverage. Если его нет, согласовать один ограниченный экспорт коллекций молитв. Текущая задача новых production-чтений не разрешает.
2. Уточнить спорные источники по первичным материалам; не заимствовать источники соседних молитв. Текущие 63 случая относятся только к старому публичному bundle; actual draft/protected totals ещё неизвестны.
3. Применить reviewed source-only план `scripts/unify-prayer-sources.mjs --apply` с сохранением исходных значений и точных updateTime. Не менять категории, тексты, статусы, даты и access fields. Держать acknowledged commit journal; один контрольный readback на батч. При 429 остановиться без retry.
4. После записи молитв выполнить предусмотренный AGENTS.md `npm run content:manifest -- --collection prayers` как dry-run; затем `--apply` только если verdict SAFE CONTENT PATCH. Не расширять release gate при MASS CONTENT REBUILD: собрать совместимый bundle и согласовать app release. `prayerDrafts` и защищённые молитвы не попадают в публичный bundle/manifest.
5. Для отдельной доставки 7 791 литургических полей использовать исходные hashes/маски, новый минимальный preflight/updateTime/readback и проверенный совместимый Flutter bundle. Согласовать одну generation Firestore + bundle + manifest; не повторять публикацию Proper, не вводить новые коллекции и не включать held/Advent-поля по аналогии. Гейт существующего writer не обходить.
6. Развернуть Web-код нормализации через штатный Hosting workflow с подходящими правами. Не менять IAM в рамках задачи. После миграции сравнить hashes и точные source-строки Web/Flutter, подтвердить actual written count. До этого не заявлять production-унификацию или совместимый установленный Flutter-релиз.
