# Воспроизведение аудита

Утилиты читают только локальные файлы. Импорты `setCalendarDefinitions()` меняют память отдельного Node-процесса для сравнения, не runtime-файлы приложения и не Firestore. Не запускайте import/publish/deploy или генераторы без `--check`. Исходный checkout аудита должен соответствовать base commit из `source-manifest.json`; другие ревизии могут давать иной результат.

Нужны установленный проектный `node_modules`, Node с JSON import attributes, Python, PyMuPDF и python-dateutil. Версии исходного запуска указаны в manifest. Пакеты здесь не устанавливаются и по сети ничего не запрашивается.

Из корня репозитория, с уникальным scratch-каталогом:

```bash
mkdir -p work/belarus-audit-replay/input
cp docs/audits/belarus-own-calendar-2026/input/* work/belarus-audit-replay/input/
python docs/audits/belarus-own-calendar-2026/tools/extract_pdf.py --pdf work/belarus-audit-replay/input/SOURCE_Ulasny_kalyandar_dyiacezii_na_Belarusi.pdf --work work/belarus-audit-replay
python docs/audits/belarus-own-calendar-2026/tools/parse_reference.py --repo . --work work/belarus-audit-replay > work/belarus-audit-replay/reference-review.txt
python docs/audits/belarus-own-calendar-2026/tools/prepare.py --repo . --work work/belarus-audit-replay
node docs/audits/belarus-own-calendar-2026/tools/sweep.mjs --repo . --work work/belarus-audit-replay
python docs/audits/belarus-own-calendar-2026/tools/check_anchors.py --work work/belarus-audit-replay
node docs/audits/belarus-own-calendar-2026/tools/cache-probe.mjs --repo . > work/belarus-audit-replay/cache-probe.json
python docs/audits/belarus-own-calendar-2026/tools/build_results.py --repo . --work work/belarus-audit-replay --out work/belarus-audit-replay/results
```

`--render` в extract_pdf.py дополнительно создаст PNG всех 13 страниц для повторной визуальной проверки. Парсер использует вспомогательную текстовую копию и ручные правила разбиения/идентификации; ранги независимы от рангов кода. Проверенный эталон в `REFERENCE.csv` приоритетнее нового автоматического fuzzy match на иной версии репозитория. Признак visual_checked фиксирует выполненную в исходном аудите визуальную проверку; повторный запуск парсера сам по себе не заменяет её.

Воспроизводятся `REFERENCE.csv`, `DIFF.csv`, machine inventory, full daily CSV, acceptance cases и counts. REPORT/OPEN_QUESTIONS — проверенная человеком читаемая интерпретация результатов; они не перезаписываются утилитой. Полные annual inventory, source manifest и логи находятся в evidence. После запуска сравнивайте CSV по содержимому, gzip — после распаковки. Cache-probe намеренно фиксирует дефект базовой ревизии; после будущего исправления его baseline assertions должны измениться в новой версии аудита.

Поля:

- `REFERENCE.csv`: одна печатная запись/вариант, не одна дата и не один независимый UI option; printed_rank отдельно от нормализованного ранга; applies_to, superseding variants и буквальная цитата сохранены.
- `DIFF.csv`: filter `row_kind=permanent` даёт 1011 effective сравнений. Категории разделены `|`, их суммы не равны числу строк. `runtime_roles_2025_2035` — наблюдения текущего bundle, без production snapshot. MISSING не означает отсутствие текстов.
- `POSSIBLE_LOCAL_ONLY` — гипотеза области, не доказанный local-only акт. `NEEDS_DECREE` — для разрешения конфликта с annual practice/нового источника, не требование заново доказать все протоколы на с.1 PDF.
- `MISSING_PROPER` при `row_kind=content` относится к declared metadata (`day-fallback`, `missing`, `reference-only`), не является утверждением об отсутствующем праве или проверке всех документов сервера.
- `UNIVERSAL_UPDATE` включает подтверждённые общие добавления вне PDF и Newman, уже напечатанного в PDF; не все акты относятся к периоду после PDF.
- `daily-projection-diff` — условная data-only модель. Она использует тот же engine, сохраняет годовые решения и provisional правила, не решает Braslau, не добавляет Newman задним числом в 2025.
- `annual` файлы — практика исходных Ordo и качество parser identity. Они не превращаются автоматически в постоянные определения.

Read-only проверки проекта, выполненные отдельно: `npm run test:ordo`, `npm run ordo:check`, targeted `npx eslint` без `--fix`, полный `npm test` в изолированном локальном Git-клоне базового commit. Build запускался напрямую через Vite с `--outDir` в work, чтобы не исполнять mutating `prebuild` генератор. Результаты и пределы проверки описаны в REPORT.
