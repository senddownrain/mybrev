# D-1: чтения holy-men в наборе законных чтений holy-women (данные)

Ветка `feature/d1-holy-men-reference-set` (от `origin/main` 2949f66). Решение владельца 2026-10-24: включить чтения `holy-men` в `holy-women` R1 (сезоны) и в том III. **Ничего не опубликовано** (ни Firestore, ни manifest/версия, ни Hosting, ни Flutter). Идёт вместе с UI-PR mybrev#164 (выбор чтения), но от него не зависит.

## Что изменено

| Поле | До | После |
|---|---|---|
| `holy-women.officeOfReadingsR1`, Адвент/Рождество (с. 1272–1274), Пост/Пасха (с. 1782–1787) | отсылка + два чтения для святой в браке | отсылка · первые чтения `holy-men` **того же тома** (3 в Адвенте/Рождестве, 2 в Посту, 2 в Пасхе — как у `holy-men`) · «Іншае, пра святую…» Прып 31 · «Або іншае, пра святую…» 1 Пт 3 |
| `holy-women.officeOfReadingsR1`, база (том III, с. 1580–1583) | отсылка + Прып 31 + 1 Пт 3 без вводных строк | отсылка · 3 чтения `holy-men` (Кал 3; Рым 12; Эф 5) · «Іншае, пра святую, якая жыла ў сужэнстве:» + Прып 31 · «Або іншае, таксама пра святую:» + 1 Пт 3 |
| `holy-women.officeOfReadingsR2`, база (с. 1584–1587) | отсылка + «Або іншае» Пій XII | отсылка · 2 чтения `holy-men` (Хрызастом, Аўгустын) · «Або іншае…» Пій XII |
| `holy-women.officeOfReadingsR2`, сезоны | отсылка + чтения `holy-men` | без изменений |

Тексты не писались: вставляются сохранённые тексты `holy-men` без правок. Руками набраны только две вводные строки, которые печатает том III (`03_ordinary_utf8.txt`, строки 5587 и 5604). Между альтернативами стоит `<hr />` (ридер делит только по ним).

Файлы: `scripts/liturgy/common-seasons/apply-d1-reference-set-base.mjs` (база, идемпотентно), `lib/analyze.mjs` (`completeReferenceReadings` для сезонов; метод варианта `render+reference-set`), результат генерации: `patchs/feasts/common-texts/holy-women.json`, `patchs/db-templates/holy-women.json`, `patchs/sources/common-seasons/provenance.json`; отчёты и фикстура Flutter (`common-seasons-audit.json`, `common-seasons-import-plan.json`, `common-seasons-flutter-fixture.json`, хэши изменились только у holy-women R1); `docs/common-seasons-decisions.md`; тесты в `tests/common-seasons-reaudit.test.mjs`.

## Проверки

- Новые тесты: в каждом сезоне набор = отсылка + чтения `holy-men` того же тома без изменений + остаток, совпадающий с печатью тома слово в слово (без «аллелюя» и склеенных «книга+глава»); база R1/R2 так же по тому III; скрипт идемпотентен.
- `npm run test:common-seasons` — все зелёные; `npm test` — 1 падение `marian-feast-references` (падает и на чистом `main`); `npx eslint .` чисто.
- `liturgy:common-seasons:plan` → SAFE CONTENT PATCH; `--check` без расхождений.
- NOT TESTED: браузер с этими данными (проверялся вид в #164 на старых данных), импорт и манифест (не запускались), Flutter (бандл `liturgicalTemplates.json.gz` содержит старый holy-women; нужен refresh после публикации), поведение старых клиентов (читают плоские поля: в базе R1/R2 теперь больше текста, всё законное).

## Публикация (только с отдельного разрешения)

1. WEB UI #164 (выбор чтения) — иначе пользователь увидит длинный список вариантов в старом виде вкладок, они работают, но с названиями «Варыянт N».
2. Резервная копия и `ordo:import-feasts --only templates --ids holy-women` (dry-run), затем `--apply`, `content:version:bump`, `content:manifest` (SAFE CONTENT PATCH). Остальные 12 Common не затрагиваются.
3. Flutter: `scripts/refresh_common_bundle.mjs` + порт D-1 (docs/common-seasons-flutter-plan.md в ibreviarybyapp#38).
