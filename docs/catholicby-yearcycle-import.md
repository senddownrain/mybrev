# Импорт набажэнстваў: подготовка и применение

Импорт учитывает 33 позиции каталога Catholic.by (20 Крыжовых шляхоў,
один справочный материал), плюс четыре статические службы из MyBrev.
Пункт 33 — одна запись «Гадзінкі» из пользовательского DOCX, содержащая
восемь частей. Текст Catholic.by для этого пункта не загружается.

## Локальные источники

Распакуйте пользовательский ZIP в
`patchs/sources/catholicby-yearcycle/package/`, либо передайте `--package-dir`.
Пакет, DOCX, исходные HTML в `.cache/` и отчёты игнорируются Git; никакие
приватные снимки, документы пользователя или административные коллекции
не помещаются в `public/`. Проверочный манифест хранится рядом с пакетом.

При первом dry-run недостающие страницы загружаются последовательно,
с паузой, таймаутом и максимум двумя попытками. Последующие запуски читают
кэш. `--offline` запрещает сеть; `--html-dir DIR` также означает offline.
HTML-файлы называются `index.html`, `100105.html` и т. п., по исходному ID.

Сначала проверяется `backups/firestore-snapshot/manifest.json`. По умолчанию
используется самый свежий **существующий локальный** снимок для каждой
нужной коллекции. `--snapshot DIR` можно повторять; указанные каталоги
заменяют автоматический поиск. Ни refresh, ни live-аудит не выполняются.
Если молитв/категорий нет в снимках, план получает `database-not-audited`.

```sh
npm run db:import-catholicby-yearcycle
npm run db:import-catholicby-yearcycle -- --offline
npm run db:import-catholicby-yearcycle -- --snapshot backups/priest-live-20261012 --offline
node --test tests/catholicby-yearcycle.test.mjs
node scripts/smoke-catholicby-yearcycle.mjs
```

В `reports/catholicby-yearcycle/` создаются `import-plan.json`,
`catalog-audit.json`, `summary.md`, `dedup-report.md`, `content-quality.md`,
`manual-review.md`, `docx-gadzinki-audit.md`, `mybrev-hours-audit.md` и
полные Markdown-файлы в `markdown/`. Отчёт указывает хэши, стации,
ссылки, исключённые элементы и источники всех частей служб.

## Четыре службы

Порядок соответствует `Laudes.vue` и `Vesper.vue`. Тексты берутся из
`patchs/feasts/common-texts/{office-for-dead,blessed-virgin-mary}.json`.
Марыйная Ютрань разрешает `from-first-week` через предназначенный
`patchs/db-templates/sunday-week-1.json`, либо такой же ID из локального
snapshot `liturgicalTemplates`; отсутствие источника блокирует запись.
Используются обычные `vesper*`, не `vesper1*`.

Полные Benedictus/Magnificat извлекаются из компонентов; вступление и
завершение — из Intro/EndOfVesper. Полный «Ойча наш» берётся из молитвы
`import-08-asnounyya-malitvy-na-pratsyagu-dnya` в локальном снимке.
Если она отсутствует, службы помечаются blocked, продолжение не сочиняется.
Первый вариант каждой части соответствует исходному выбору MyBrev;
остальные сохраняются в отдельных подписанных разделах с указанием выбора.
Литургические `*` экранируются. Текущая дата не участвует в сборке.

## Применение после отдельного разрешения владельца

Первый этап заканчивается dry-run. Проверьте отчёты, права повторной
публикации Catholic.by и позиции `needs-review`. Служебная ссылка на
источник сама по себе не означает разрешение переиздания.

Следующая команда приведена для будущего применения; автоматически
не запускалась. Она читает **сохранённый проверенный план**, создаёт только
`create`-кандидаты и недостающую публичную категорию `devotions`.
Позиции `needs-review`, blocked, уже имеющиеся записи и предложенные
патчи метаданных пропускаются. Тексты не обновляются и не удаляются.

```sh
npm run db:import-catholicby-yearcycle -- --apply \
  --plan reports/catholicby-yearcycle/import-plan.json \
  --confirm import-catholicby-yearcycle --rights-reviewed
```

Применение требует версии `priestContentControl/state` из локального снимка.
Версия, блокировка, целевые ID в публичном и защищённом хранилищах,
`sourceUrl`, `importKey` и название категории проверяются до записи внутри
одной транзакции. Любой конфликт отменяет её целиком. Версия увеличивается
вместе с импортом. Транзакционная квитанция `contentImportLogs` делает
повторное применение того же плана безопасным. Отчёт — `apply-result.json`.

Существующие молитвы не заменяются; их изменения требуют отдельного
проверенного diff и разрешения. Категория использует существующие теги,
без добавления `categoryId` к молитвам. Её восстановление в админке также
использует новый элемент `DEFAULT_CATEGORIES` и сохраняет текущие настройки.

После разрешённой записи отдельно выполните `npm run content:manifest`.
Только вердикт SAFE CONTENT PATCH допускает публикацию через
`npm run content:manifest -- --apply`. Пересборку/изменение схемы не обходить:
порядок описан в `docs/app-content-distribution.md`. Production deploy
в этот импорт не входит.
