# FIRESTORE_AUDIT — фактическое состояние календарных данных

Аудит продолжает commit `34301a65b0e58f43a514c0d62968e9bf043a7f42`. Чтения: **03.11.2026 21:05:59–21:07:29 UTC**, то есть **04.11.2026 00:05:59–00:07:29 Europe/Minsk**. Все дальнейшие анализы выполнялись локально по этому снимку; повторных запросов к БД для тестов не было.

## Разрешение, проект и способ чтения

Прочитан `AGENTS.md`; сначала проверены `backups/firestore-snapshot/manifest.json`, `reports/ordo-firestore-cache/manifest.json` и другие доступные локальные артефакты. Пригодного календарного snapshot не было. Явное разрешение владельца в текущем задании покрывает ограниченное read-only чтение и создание локального снимка; отдельного подтверждения не запрашивалось.

Project ID **ibreviaryby** независимо совпал в `.firebaserc` и `VITE_FIREBASE_PROJECT_ID`. Firestore — `(default)`, путь REST `projects/ibreviaryby/databases/(default)/documents`. Использовались штатный HTTPS proxy, TLS-проверка и REST без предоставления Authorization/API key. Service-account/ADC отсутствуют; ключи не использовались в запросах, не печатались и не публиковались. Коллекции в production доступны такому чтению; это установлено успешными ответами HTTP 200, а не предположением по локальным Rules.

Первым прочитан только `liturgicalCalendarMeta/current`, с маской четырёх нужных полей. Затем по одному ограниченному list-запросу каждой из трёх календарных коллекций, одна COUNT-агрегация заметок и контрольное чтение того же meta-документа. Лимит утилиты — 15 HTTP запросов, 1000 документов на страницу, максимум 5000 документов на коллекцию; фактически потребовалось 6 запросов без пагинации и без retry. Код захвата разрешает только эти ресурсы и GET либо read-only `runAggregationQuery`; нет write RPC.

## Измеренное состояние

| Данные | Измеренное значение | Реальное использование текущим Web |
|---|---|---|
| schemaVersion | 1 | Поддерживается Web schema 1 |
| revision | **3** | Равен bundled 3: permanent Firestore не заменяет bundle |
| notesRevision | **4** | Меньше bundled notes revision **6**: серверные заметки не выбираются |
| publishedAt | **2026-10-07T18:15:01.305Z** | Дата из meta, не дата PDF и не дата всех year edits |
| meta updateTime | 2026-10-24T16:48:11.306509Z | Совпал в начале и конце чтений |
| liturgicalCelebrations | **241** | Данные сверены, но current client при revision=3 берёт bundle |
| liturgicalDioceseOverrides | **75** | 41 add +34 modify, suppress нет; совпадают с bundle по календарным полям |
| liturgicalYearOverrides | **15** | Загружаются отдельно от permanent revision: 4 legacy manual +11 auto |
| liturgicalOrdoNotes | **1337** по COUNT | Bodies не читались: revision4 старше bundle6, в данном build проигрывают ему |
| Bundled notes | **1347**, revision6 | Используются при текущих meta; разность количества 10 не доказывает, какие именно IDs отличаются |

Снимок ограничен четырьмя календарными ресурсами (meta +3 коллекции) и результатом COUNT. `days`, `readings`, молитвы, auth/admin, пользовательские данные и другие коллекции не читались. Тексты заметок не выгружались. Сводные классы календаря не подменяют проверку реальных Office/readings bodies: они вне прочитанного набора.

## Счётчик запросов и чтений

| № | Операция | Цель | HTTP | Повтор |
|---|---|---|---|---|
| 1 | GET | liturgicalCalendarMeta/current | 200 | — |
| 2 | GET | liturgicalCelebrations | 200 | — |
| 3 | GET | liturgicalDioceseOverrides | 200 | — |
| 4 | GET | liturgicalYearOverrides | 200 | — |
| 5 | POST | :runAggregationQuery | 200 | — |
| 6 | GET | liturgicalCalendarMeta/current | 200 | — |


**6 HTTP запросов: 5 GET +1 POST COUNT.** POST здесь — запрос агрегации, не изменение Firestore. Получено 333 document payloads: 241+75+15+2 чтения meta; уникальных документов — 332. COUNT вернул 1337 и сам не вернул 1337 тел документов. Точный billing/Rule-dependent overhead не измерялся: счётчик payloads нельзя выдавать за фактический счёт Firebase. Отдельно могло тарифицироваться чтение индексных записей для COUNT. Не было неограниченных повторных запросов или auth/login попыток.

Журнал без URL-параметров credentials: [request-ledger.json](final-evidence/request-ledger.json). Метаданные, counts и SHA-256 приватных файлов: [firestore-read-summary.json](final-evidence/firestore-read-summary.json). Полный приватный snapshot находится вне Git в `/workspace/work/belarus-final/private`; его содержимое не включено в отчётную ветку. Снимок читается стандартным `scripts/lib/firestore-snapshot.mjs`, проверки его manifest/checksum прошли.

## Сравнение с Web

Все **316 постоянных документов** (241+75) имеют те же IDs и календарные значения, что bundled definitions. Отличие server metadata — дополнительное `importedAt`; при canonical сравнении исключались только `importedAt`, `createdAt`, `updatedAt`. Влияние исключения проверено отдельным полным прогоном поведения. [Canonical hashes всех 316 документов](final-evidence/canonical-comparison.json) дают 316 MATCH, 0 различий календарных данных. Сам по себе номер revision не был принят за доказательство совпадения.

В четыре manual документа production ещё не записаны canonical `originalDate`, `effectiveDate`, `source`, `status`; есть legacy `from`/`to`. Нормализатор Web восстанавливает даты и defaults manual/confirmed. Это измеренный формат хранения, а не свидетельство того, кто и на каком литургическом основании подтвердил решение. После нормализации все четыре поведенчески равны bundled.

Ещё 11 документов — materialized auto-transfer для 2027–2035; все enabled=true, source=auto-transfer, status=needs-review, effectiveDate=computedDate. Они соответствуют 38 computed transfer occurrences по четырём диоцезиям и не меняют resolved-day результат относительно bundle. `needs-review` **не блокирует** их применение. Полный реестр:

| Документ | Область | Год: дата → дата | В Web bundle | Состояние в Firestore / применение |
|---|---|---|---|---|
| 2026-minsk-mohilev-sv-stanislaus-bishop-martyr | Минск-Могилёв | 2026: 04-11 → 04-16 | Ручной, присутствует | Raw source/status отсутствуют; runtime manual/confirmed; enabled=true |
| 2027-grodno-grodno-cathedral-dedication | Гродно | 2027: 12-04 → 12-06 | Ручной, присутствует | Raw source/status отсутствуют; runtime manual/confirmed; enabled=true |
| 2027-grodno-holy-name-mary | Гродно | 2027: 09-12 → 09-11 | Ручной, присутствует | Raw source/status отсутствуют; runtime manual/confirmed; enabled=true |
| 2027-grodno-sv-peter-damian | Гродно | 2027: 02-21 → 02-20 | Ручной, присутствует | Raw source/status отсутствуют; runtime manual/confirmed; enabled=true |
| auto-transfer-2027-belarus-annunciation-lord | Все четыре диоцезии | 2027: 03-25 → 04-05 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2027-pinsk-sv-andrei-bobola | Пинск | 2027: 05-16 → 05-18 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2028-belarus-sv-joseph | Все четыре диоцезии | 2028: 03-19 → 03-20 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2029-belarus-annunciation-lord | Все четыре диоцезии | 2029: 03-25 → 04-09 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2030-belarus-immaculate-conception | Все четыре диоцезии | 2030: 12-08 → 12-09 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2032-belarus-annunciation-lord | Все четыре диоцезии | 2032: 03-25 → 04-05 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2032-pinsk-sv-andrei-bobola | Пинск | 2032: 05-16 → 05-18 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2033-belarus-nativity-john-baptist | Все четыре диоцезии | 2033: 06-24 → 06-25 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2034-belarus-sv-joseph | Все четыре диоцезии | 2034: 03-19 → 03-20 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2035-belarus-annunciation-lord | Все четыре диоцезии | 2035: 03-25 → 04-02 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |
| auto-transfer-2035-belarus-sv-joseph | Все четыре диоцезии | 2035: 03-19 → 03-17 | Документа нет, перенос вычисляется | auto-transfer/needs-review; enabled=true |


Для Nativity/Sacred Heart 2033 существующий алгоритм и stored запись дают 25.06. Это не новое доказанное расхождение постоянной даты PDF: вопрос специального совпадения вынесен C30. Удаление materialized override само по себе не изменит вычисленный день.

## Что проверено и что осталось за пределами

Между двумя чтениями meta поля и updateTime не изменились. Это стабильные bookends в описанном окне, **не** транзакционный point-in-time backup всех коллекций. Нет оснований придумывать атомарность снимка. Содержимое 316 постоянных документов сверено целиком локально; 15 year документов валидны по текущему нормализатору. Три локальные модели дали 0 отличающихся day summaries на 16 068 сочетаниях дат/диоцезий каждая.

Реальные private caches конкретных браузеров, установленные PWA/Flutter и фактически доставленный Hosting build не обследовались. Для current Web исходники совпадают с `8a7017412ee04ec43eaee7a9fe2dacd64999b54c`; ответы о выборе данных относятся к этому build и явно описанным cache-состояниям. БД проверена в указанное окно, а не объявлена неизменной после него. Никаких записей, обновлений, удалений, публикаций или изменений Hosting не выполнялось.
