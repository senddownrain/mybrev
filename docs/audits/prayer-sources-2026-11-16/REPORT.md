# Унификация источников молитв — результат и остаток

Дата: 2026-11-16. Код Web и миграция подготовлены; production Firestore, manifest и Hosting не обновлены. После уточнения владельца работа продолжалась только офлайн. PR не означает разрешения production-записи.

## Точные числа и границы аудита

Исходный `backups/firestore-snapshot/manifest.json` отсутствовал. Вместо массового восстановления использован существующий публичный Flutter bundle: `prayers.contentVersion=1791877294111`, дата 2026-10-13, 115 записей. Общий manifest bundle от 2026-11-08 не делает коллекцию prayers свежей.

| Показатель | Подтверждённый результат |
|---|---:|
| Уникальных молитв проверено в доступном публичном bundle | 115 |
| Опубликованных молитв проверено в bundle | 115 |
| Черновиков проверено по реальным данным | 0 — в bundle отсутствуют |
| Production prayer documents прочитано в этой задаче | 0 |
| Источников со страницами в доступном bundle | 0 |
| Подготовлено source-only изменений документов bundle | 52 |
| Из них длинных / библиографических источников | 48 |
| Длинных источников реально исправлено в Firestore | 0 |
| Документов реально обновлено в Firestore | 0 |
| Спорных записей старого bundle | 63 |
| Из них источник отсутствует / пустой / иной неподтверждённый | 48 / 11 / 4 |

Точные общие production totals, опубликованные/обычные/закрытые черновики, protected/priest и недавние импорты ещё не установлены. Числа bundle нельзя выдавать за полный production-аудит. Новые полные import corpus/payload files в checkout отсутствуют; проверены все 9 book-конфигураций импорта, English Mass dry-run и fixtures импортёров.

Все 52 source diff и все 63 спорные записи с ID/старыми значениями: [bundle-audit.json](bundle-audit.json). Единая таблица старое → каноническое / disputed: [mapping.md](mapping.md). Отсутствующие источники не назначались по соседним молитвам, заголовкам или догадке.

Четыре иных спорных значения: документ «Гадзінкі.docx», «складзеная Піем VII», повреждённая Markdown-ссылка `import-02-agulny-katekhizis`, «Св. Бонавэнтура». Их первичное происхождение/корректное описание нужно подтвердить, прежде чем пополнять справочник.

## Что изменено

Единый справочник — `src/data/sourceBibliography.json`, тот же файл отображается на `/sources`. У каждой записи есть короткое `shortTitle` и подтверждённые aliases. Издания, notices и подробности сохранены; добавлены известные цифровые источники и полный существующий English Mass copyright. Номеров страниц в канонических названиях нет. Неоднозначное «Біблія» не приравнивается к конкретному переводу; точное описание издания распознаётся по наиболее специфичному подтверждённому alias.

Общая функция `src/utils/prayerSource.mjs` нормализует известные названия идемпотентно. Поля исходного текста молитвы не передаются в неё. Неизвестный источник возвращается byte-for-byte для отчёта и предпросмотра; сохранение блокируется с понятной ошибкой до подтверждения справочника. Ввод не подменяется фиктивным источником. В админке осталось одно обычное поле «Крыніца».

Проверенные пути записи:

| Путь | Общая защита |
|---|---|
| Создание и редактирование молитвы через админку | saveStoredPrayer + transactional content writer |
| Создание/сохранение закрытого или исторического черновика | createDraftActions, source и sourceBook |
| Публикация черновика | buildPrayerFromDraft + writer; source без страниц и copyright |
| Канонический и Bog Dobry bulk import | planners + new/replacement/draft document constructors |
| Старые уже подготовленные import payloads | нормализация на границе apply constructors |
| Markdown/document import | sourceToPrayer / buildImportPlan |
| English Mass import | sourceForSave; static variant source также короткий |
| Исторические source-fix / source-extraction utilities | тот же guard; неопределённые извлечения попадают в ambiguous |
| Показ существующих известных source в Web cache | чистая нормализация для отображения, без Firestore write |

Существующие source-only изменения не затрагивают текст, title, категории, доступ, publication status, copyrightNotices или другие поля. Старые утилиты извлечения источников из текста сохраняют своё прежнее назначение, но здесь не запускались; новый unify writer вообще не редактирует текст/заголовок.

## Миграция, применение и восстановление

`npm run db:unify-prayer-sources` по умолчанию работает офлайн. Она принимает snapshot или старый bundle для анализа. План перечисляет coverage, категории статусов, old/new, спорные случаи и SHA256; готовится отдельно от apply. Bundle-план не разрешается применять к production. Для apply нужны snapshot всех трёх известных коллекций, точный approved SHA, исходные updateTime и новый private output directory для первого запуска.

При наличии частного snapshot:

```sh
npm run db:unify-prayer-sources -- --snapshot backups/firestore-snapshot --out backups/prayer-sources-review
```

После будущего отдельного разрешения production:

```sh
node scripts/unify-prayer-sources.mjs --apply --plan backups/prayer-sources-review/plan.json --approve-sha PLAN_SHA --out backups/prayer-sources-apply
```

Авторизация берётся из предусмотренного безопасного окружения (`FIREBASE_SERVICE_ACCOUNT_B64`) либо `--service-account` с частным внешним файлом. Ключей в репозитории нет, секреты в чате не требуются. `--capture` — отдельная явно вызываемая возможность однократного scoped export, не включённая в dry-run и не разрешённая текущим офлайн-этапом.

До первой записи эксклюзивно сохраняется `before.json`. Пакеты не больше 100 операций. Пишутся только реально изменённые `source`/`sourceBook` через updateMask с updateTime precondition. Не обновляется даже updatedAt. Ack каждого commit и новые updateTime сохраняются в journal; один документ на батч читается для readback. Любая ошибка, включая 429, немедленно останавливает работу без retry. При прерывании требуется проверить journal; автоматического продолжения нет. Явный повтор той же команды с тем же output проверяет immutable backup/journal и пропускает уже acknowledged записи; незавершённый контрольный readback выполняется до следующих батчей. Полностью завершённый journal даёт 0 записей и 0 новых readback, даже без авторизации.

Откат только подтверждённых этим journal записей, с проверкой принадлежности исходному плану и новыми updateTime:

```sh
node scripts/unify-prayer-sources.mjs --rollback --plan backups/prayer-sources-review/plan.json --approve-sha PLAN_SHA --journal backups/prayer-sources-apply/journal.json --out backups/prayer-sources-rollback
```

Повторный офлайн dry-run над нормализованными значениями даёт 0 изменений. Старый apply-план не перезаписывает изменившиеся документы: устаревший updateTime блокирует запись.

## Проверки

- Полный Web suite: 1 362 успешно, 22 пропущены, 0 ошибок (1 384 зарегистрировано); результат в `evidence/full-suite.log`; целевые source tests проверяют страницы, диапазоны, тома, годы, одноимённые источники, ручное сохранение, draft save/publish, Markdown/bulk import, неизвестные источники, повторное сохранение, checksum и маски.
- Firestore emulator: 27/27 успешно — реальные admin/draft/import транзакции, создание/редактирование/публикация, source-only REST migration, точный round-trip rollback и отказ при устаревшем updateTime. Production не используется.
- ESLint изменённых модулей и Vue-компонентов прошёл; production Web build прошёл.
- Chromium: `/sources` и обычная молитва, 390/1440 px, light/dark, без JS-ошибок и горизонтального overflow. Библейский текст `Пс 23, 1–6. Ян 3, 16` сохранён. Скриншоты просмотрены. Воспроизведение: `npm run build`, `npm run preview -- --host 127.0.0.1`, `npm run smoke:prayer-sources`. Все внешние запросы, включая Firebase, в smoke блокируются.
- Flutter SDK отсутствует; Dart unit/widget/analyze и Flutter Chrome visual smoke не заявляются выполненными. Подготовлены patch и тесты, старый shipped bundle не изменён.

Подробный контракт, офлайн-кандидат prayers bundle и порядок согласования с пакетом PR #245/#255: [FLUTTER_CONTRACT.md](FLUTTER_CONTRACT.md). 7 791 литургическое исправление не подменяет snapshot молитв и не включено в эту source-only миграцию.

## Подтверждённые production-блокировки

В начале, до уточнения офлайн-границ, запрос metadata подтвердил `ibreviaryby/(default)`, STANDARD. Первый запрос `documents:listCollectionIds` вернул HTTP 429 `Quota exceeded / RESOURCE_EXHAUSTED`; повторов и чтения документов не было. CLI Hosting сначала не смог аутентифицироваться через proxy, затем OAuth-запрос metadata Firebase проекта вернул HTTP 403 `The caller does not have permission`. Деплоя не было. После уточнения владельца production-запросов не выполнялось. Временный credential file удалён; IAM не менялся.

Осталось: получить существующий полный snapshot/подтверждённые материалы без массового Firebase reread; проверить все actual drafts/protected/imported records; разрешить disputed; подготовить actual dry-run; затем в отдельном production-этапе выполнить source-only apply/readback, предусмотренную проверку/публикацию manifest и штатный Hosting release. Для Flutter завершить SDK/Chrome проверки и согласованный bundle/app release. Actual production dispute count пока неизвестен.

## Чек-лист задачи

- [ ] Во всех существующих production-молитвах источники унифицированы либо спорные случаи перечислены — полный production snapshot пока недоступен; bundle полностью перечислен.
- [ ] Все реальные черновики проверены — только fixtures/emulator, реальные drafts в bundle отсутствуют.
- [x] Код всех обнаруженных путей добавления/сохранения больше не записывает страницы; неизвестные значения блокируются. Production deploy ещё не выполнен.
- [x] Все обнаруженные механизмы импорта исправлены в коде и проверены доступными fixtures.
- [x] Единая справочная страница `/sources` сохранена с полной библиографией и notices.
- [ ] Web и Flutter проверены до готовности релиза — Web прошёл проверки, контракт/Flutter patch готовы, SDK/Chrome Flutter проверки впереди.
- [ ] Production Firestore обновлён с подтверждением записи — записей 0.
