# Реализация утверждённого календаря Беларуси — 06.11.2026

Подготовлены рабочий Web-календарь, его механизм обновления, новая статическая Web-публикация первоисточника, тесты и полный read-only план миграции. **Production Firestore, Hosting и мобильное приложение не изменены.** Merge, deploy, manifest apply и app release не выполнялись.

База: актуальный при старте `origin/main` **a8ca4b4e53600d10081388963daa62b20059b629**. Ветка `fix/belarus-calendar-approved-2026-11`. Evidence предыдущего финального аудита: **9ecd0fdfd2e0230cfd1159476c11291893dd46bf**, ветка `audit/belarus-own-calendar-2026-final`. Аудит использован как baseline, не как нормативное решение поверх новой редакции PDF. Точные implementation SHA, PR и результаты CI будут закреплены в `PR_ACCEPTANCE_STATUS.md`; этот файл является частью того же diff.

## Принятые решения A/B/C/D и реализация

| Решение владельца | Результат |
|---|---|
| A: постоянные даты и ранги | Все 262 строки новой редакции проверены; 959 эффективных назначений совпали по рангу и фиксированным датам. Source seeds исправлены, generated definitions воспроизводимы. Старый набор «17 рангов/3 даты/18 cases» включает устаревшее предложение сделать Витебск 16.11 optional: оно отменено. По новому источнику это сохранение memoria, а не понижение. |
| B: 8 сентября | Braslau `our-lady-braslau` — единственный festum Витебска. Nativity `nativity-blessed-virgin-mary` остаётся в остальных трёх диоцезиях. Это разные identities. Витебский Office получает существующие проверенные тексты Nativity с собственной молитвой Braslau; Mass/readings ссылаются на Nativity. |
| C: 16 ноября | Минск/Витебск/Пинск memoria, Гродно solemnitas; обязательная память не предлагает weekday как альтернативу. Новый PDF и HTML говорят то же самое. |
| D: дополнительные назначения | 23 scoped add исключены до решения о будущих локальных календарях; все записи/тексты и IDs сохранены. Это утверждённая область показа, не объявление почитания незаконным. |
| E: ручные переносы | Четыре manual records сохраняются с enabled=false; старый серверный overlay не включит их в новом Web shell. Общие auto-transfer продолжают вычисляться. |
| F: High Priest / Christ King | Непроверенный выбор двух feast удалён. Применяется общая Таблица; отдельно протестированы оба разных празднования и конкурирующие дни. |
| G: две римские нормы | Mother Church имеет преимущество над памятью святого; Immaculate Heart при совпадении двух обязательных памятей делает обе optional с weekday primary. Основания: уведомление 24.03.2018 и 2671/98/L, 08.12.1998. |

Редакционные 10 применений: патрональный титул архангела Михаила ×4, полный список витебских мучеников, Цэліна Бажэнцкая в Гродно, титул доктора Касцёла у Иренея ×4. Служебные тексты не переписаны. Опечатка Loreto/«Латэранскай» в первоисточнике не перенесена как новое название праздника. Утверждённый буквальный PDF оставлен без исправления этой опечатки.

## Примеры для ручной приёмки

| Дата / область | До | После |
|---|---|---|
| 05.07/10.07.2027 Гродно | Trakai 10.07 festum | Trakai 05.07 memoria, 10.07 повторного назначения нет |
| 02.07 Пинск | Budslav memoria | optional; Минск solemnitas, Витебск festum, Гродно optional сохранены |
| 08.09.2026/2027/2028 Витебск | Nativity identity под названием Braslau | отдельная Braslau identity, одна видимая цэлебрация; чтения Nativity |
| 16.11.2026/2027 Витебск | engine memoria, опубликованный старый PDF optional | engine и опубликованный в ветке PDF/HTML memoria |
| 22.08 Пинск | Lahishyn diocesan solemnity | Queenship of Mary; локальные тексты Lahishyn сохранены |
| 04.12 Пинск/Гродно | Barbara как общедиоцезальная option | Barbara отсутствует в общем выборе; храмовый proper не удалён |
| 04.12/06.12.2027 Гродно | кафедральное посвящение перенесено на 06.12 | установленная дата 04.12; 06.12 без искусственного переноса |
| 15.02.2027 Витебск | Sopocko отсутствует | optional → commemoratio в Великий пост |
| 09.10.2026 четыре диоцезии | Newman отсутствует | optional, с общими текстами и честным статусом отсутствующего proper |
| 05.06.2028 четыре диоцезии | Boniface доступен альтернативой либо Mother Church имела завышенный ранг | Mother Church memoria, Boniface подавлен |

Именование/заголовок не создаёт новый перевод службы. Для Newman установлен `validFrom=2026-02-03` по дате публикации общего акта (декрет 09.11.2025, опубликован 03.02.2026); 09.10.2025 он не появляется. Fuzzy matching имени «John» больше не привязывает его к John Leonardi. Нет собственного утверждённого текста Newman в проверенных `days`/`liturgicalProperTexts` на 09.10: предлагаются доступные общие тексты, отсутствие собственного proper маркируется штатным механизмом.

## Скрытые общедиоцезальные назначения — 23 IDs

Сохранены в `LOCAL_CALENDAR_REFERENCES` с датами, рангами и evidence; документы контента не удаляются. В плане Firestore отключается assignment, а не proper.

| Диоцезия | ID |
|---|---|
| grodno | `grodno--bl-vincent-lewoniuk-companions` |
| grodno | `grodno--our-lady-help-of-christians` |
| grodno | `grodno--sv-jadwiga-queen` |
| grodno | `grodno--sv-albert-chmielowski` |
| grodno | `grodno--our-lady-of-angels` |
| grodno | `grodno--bl-sancja-szymkowiak` |
| grodno | `grodno--bl-bronislawa` |
| grodno | `grodno--bl-ladislaus-gielniow` |
| grodno | `grodno--bl-honorat-kozminski` |
| grodno | `grodno--five-martyred-brothers` |
| grodno | `grodno--bl-karolina-kozka` |
| grodno | `grodno--bl-salomea` |
| grodno | `grodno--bl-maria-jesus-good-shepherd` |
| grodno | `grodno--sv-barbara` |
| pinsk | `pinsk--sv-dismas` |
| pinsk | `pinsk--sv-florian` |
| pinsk | `pinsk--our-lady-perpetual-help` |
| pinsk | `pinsk--bl-czeslaw` |
| pinsk | `pinsk--sv-hyacinth` |
| pinsk | `pinsk--our-lady-lahishyn` |
| pinsk | `pinsk--bl-maria-stella-companions` |
| pinsk | `pinsk--bl-honorat-kozminski` |
| pinsk | `pinsk--sv-barbara` |

## Отключённые годовые исключения

- `2026-minsk-mohilev-sv-stanislaus-bishop-martyr`
- `2027-grodno-sv-peter-damian`
- `2027-grodno-holy-name-mary`
- `2027-grodno-grodno-cathedral-dedication`

Не применяются moves 11.04→16.04.2026, 21.02→20.02.2027, 12.09→11.09.2027, 04.12→06.12.2027. В исходные даты применяются общие правила подавления. Все 11 auto documents сохранены как материализация общего расчёта, не как дополнительные локальные праздники. После rank fix Mother Church вычисленный Bobola в Пинске переносится на **17.05.2027 и 17.05.2032**, вместо 18.05; соответствующие два auto records меняются в плане.

## Runtime и доставка обновления

- `resolveRuntimeDay` включает definitions epoch в memo key. Открытая дата после новой публикации перестраивается.
- Полный cache при неизменном CONTENT_REVISION больше не блокирует новые meta/year docs: online check не чаще одного раза за 5 минут, concurrent dedup, backoff после ошибки и без запросов offline. Триггеры: запуск, возвращение вкладки, восстановление сети, интервал на видимой вкладке. Постоянные коллекции повторно читаются только при новой revision; годы — ограниченная отдельная коллекция.
- Meta/year сначала читаются через барьер публикации и применяются одним шагом; отменённые IDs защищены также при равной bundled revision. Неизменённые auto-materializations с устаревшим computedDate не переопределяют исправленный общий расчёт.
- Admin fresh использует `revalidate:true`; тест проходит через реальный service/cache pipeline с подменой только I/O/storage.
- Schema99 отвергается и из cache, и из network. Invalid/empty публикация не заменяет последний полный календарь. Revision downgrade отвергается; откат — восстановленный набор под следующей большей revision.
- Calendar version/epoch входит в ключи сохранённых Hours/Readings. Сначала восстанавливается календарь, затем вычисляются ключи первоначального cache. Открытые список служб, часы, чтения и предварительная загрузка следующих Vespers следят за epoch и диоцезией; явное обновление сохранённого сначала обновляет календарь. Ключи reference/canonical/period и диоцезий остаются разделёнными.
- Notes server4 не заменяют bundled6. Notes reader может проверить новую публикацию в открытом сеансе, не удерживая навсегда первый успешный promise.
- Старый установленный бинарный Web/PWA shell не получает исправленный алгоритм одной записью Firestore: необходим согласованный выпуск Web после приёмки и загрузка нового shell. Реальные пользовательские PWA-кэши не обследовались; моделирование complete cache и warm offline выполнено локально.

## Подтверждение источника и опубликованной страницы

[Подробный source changelog](APPROVED_SOURCE_CHANGELOG.md). `/sources` сохраняет ссылку на одну непрерывную `/documents/proper-calendar`, 13 листов, 12 якорей, 365 дат; JSON содержит 493 строки и новый SHA. Smoke сверяет каждый видимый символ с JSON, ранговую колонку, стиль и возврат; отдельная проверка скачивает реальный локальный PDF URL и проверяет SHA, а также текст 16 ноября.

Скриншоты: [390/light, 16 ноября](approved-evidence/ui/november-390-light.png), [390/marian, Braslau](approved-evidence/ui/braslau-390-marian.png). Сравнение обеих PDF-страниц 12 сохранено отдельно. Все размеры 320/390/768/1440 и light/dark/marian проверены. Другие документы и copyright не менялись.

## Фактические production preconditions и миграция

Чтение: **2026-11-06T21:18:57.176119+03:00 (Москва)**, project `ibreviaryby`, database `(default)`. Пригодного local snapshot не было; сначала проверен AGENTS.md, затем использовано данное владельцем разрешение на bounded read-only snapshot. Метаданные стабильны между началом/концом; дополнительное чтение полного meta имело тот же updateTime. Это не транзакционный snapshot всей БД и не измеренный Firebase billing.

Текущее состояние: schema1 / revision3 / notesRevision4; **241 celebrations, 75 diocesan overrides, 15 year overrides**. Полный meta также содержит properTextsRevision и templatesRevision: они сохраняются. Private snapshot и полные тела не коммитятся.

Доступ сервисного аккаунта использован только в локальном процессе: B64 декодирован в памяти, JWT создан в памяти, HTTPS через штатный proxy с TLS. Ни ключ, ни JWT не записаны в файл/логи/PR. Календарный bounded capture: 6 HTTP (5 GET + read-only COUNT); дополнительно 1 GET полного meta, 11 выборочных GET контента (7 найденных, 4 HTTP404 диагностических путей) и 3 ограниченных read-only query (5 Proper +1 readings +3 days). Не читались auth/admin/user collections. [Безопасная сводка чтений](approved-evidence/PRODUCTION_READ_SUMMARY.json).

[Точный план](../../../reports/ordo-approved/PRODUCTION_PATCH_PLAN.json): **72 операции**, все с expected updateTime/hash либо exists=false. Новая meta revision **4**, откат revision **5**; notesRevision4 не меняется (Web сохраняет bundled notes6).

| Коллекция | Создать | Обновить | Отключить | Удалить | Всего после / enabled |
|---|---:|---:|---:|---:|---:|
| Celebrations | 1 | 5 | 0 | 0 | 242 / 242 |
| Diocese overrides | 2 | 19 | 38 | 0 | 77 / 39 |
| Year overrides | 0 | 2 | 4 | 0 | 15 / 11 |
| Calendar meta | 0 | 1 | 0 | 0 | 1 |

38 отключённых diocesan records: 23 extra add и 15 прежних annual promotions/modifications. Витебское переименование Nativity обновляется на том же ID в suppress, а отдельная Braslau identity добавляется. Meta публикуется вместе со всем diff одним атомарным preconditioned batch (меньше 500 операций), publishedAt — server REQUEST_TIME. Если любое precondition изменилось, повторно рассчитать diff; не перезаписывать чужие правки. План не имеет `--apply` и не импортирует Firebase SDK.

Никаких изменений `days`, `readings`, templates, Proper texts, notes bodies, prayers, songs, Firebase rules/auth/admin/analytics. Манифест мобильного контента не опубликован. Из-за доли изменённых diocesan documents будущая доставка во Flutter требует отдельного manifest dry-run; ожидается MASS CONTENT REBUILD/new bundle, а не скрытый override лимита. [Следующее задание Flutter](FLUTTER_FOLLOWUP.md).

## Проверки и воспроизведение

Полный sweep: **16 068** сочетаний 2025–2035 ×4. Сравнено с фактическим production snapshot на исходниках старого main, затем проверена будущая production-модель на новом коде. **647** изменившихся дневных результатов: Минск 42, Витебск 69, Пинск 184, Гродно 352; включает изменения refs/Office, не только primary. Будущая published модель и bundle совпали во всех **16 068** случаях. [Сводка](../../../reports/ordo-approved/SWEEP_SUMMARY.json), [полный сжатый diff](../../../reports/ordo-approved/DAY_ROLE_DIFF.json.gz), [959 source assignments](../../../reports/ordo-approved/SOURCE_ASSIGNMENT_CHECK.json).

21 старый Heart-case проверен: 20 реальных коллизий дают weekday + две optional; Grodno 17.06.2034 перестал быть коллизией после снятия Albert. Mother Church 4/4 cases. Проверены Budslav, Trakai, 23 hidden IDs, 4 cancelled moves, 2033, Newman start, Sopocko Lent, 8.09×3 года×4, 16.11×2 года×4, Vespers, Office/Mass refs и runtime cache. Годовые Ordo намеренно расходятся с новым постоянным календарём: отдельный registry approved differences сохраняет raw MATCH rate; threshold не понижен, новая метрика отдельно учитывает только явно перечисленные решения. Нормативная проверка против 262 строк PDF независима от этой метрики.

Команды:

```sh
npm test
npm run test:ordo
npm run ordo:check
npx eslint .
npm run build
python3 scripts/documents/build-proper-calendar.py --check
SMOKE_WIDTHS=320,390,768,1440 node scripts/smoke-source-documents.mjs
node scripts/smoke-approved-calendar.mjs
node scripts/ordo/plan-approved-calendar.mjs --snapshot <private-local-snapshot> --out reports/ordo-approved/PRODUCTION_PATCH_PLAN.json
node scripts/ordo/sweep-approved-calendar.mjs --snapshot <private-local-snapshot> --baseline <archive-of-a8ca4b4-with-node_modules> --out reports/ordo-approved
```

Финальный локальный результат: **1 130 tests: 1 119 PASS, 11 SKIP, 0 FAIL; Ordo 217/217 PASS**. В отдельном реальном mounted Hours view с локальными контентными fixtures проверены переключение Витебск → Минск → Витебск на том же старом URL и смена definitions epoch: [результат](approved-evidence/ui/mounted-hours-result.json), [скриншот](approved-evidence/ui/hours-390-vitebsk-fixture.png). Внешние запросы в этом UI-тесте блокировались; это не проверка доставки production Hosting.

Фактические итоги и ссылки на журналы: [VERIFICATION.json](approved-evidence/VERIFICATION.json). `ordo:check` проверяет generated definitions/identities; проверка повторного извлечения старых raw annual sources пропущена, поскольку исходных файлов старого parser pipeline в текущем main нет. Новый PDF проверен собственным deterministic extractor. Пропущенные tests не обозначаются PASS. UI и сборка локальные; CI указан после появления результата PR.

## Оставшийся нормативный вопрос и пределы проверки

**2033 Nativity of John Baptist / Sacred Heart:** общий алгоритм вычисляет 25.06.2033, materialized document остаётся needs-review. Применимое специальное общее решение именно на 2033 не установлено; исключение 2022 нельзя распространить автоматически. Ни 23, ни 25 июня не объявлены окончательной специальной нормой. Не изменён неподтверждённый special rule; вопрос явно сохранён в meta-плане/ambiguities.

Витебский Ordo 05.06.2027 говорит «прапускаецца ... Баніфацыя»; это зафиксировано как расхождение с общим актом 2671/98/L, а не превращено в новую постоянную норму. Отсутствующий собственный перевод Newman не выдан за существующий. Полные корпуса всех литургических текстов заново не аудировались; точечно проверены необходимые production references и существующие тексты Braslau/Nativity/Sopocko/Common. Все изменённые календарные сочетания проверены по ссылкам и ролям.

Приёмка этой ветки не равна разрешению выполнить подготовленные записи. Следующий шаг после просмотра точного diff — отдельное решение владельца о согласованном выпуске Web/Firestore, затем отдельный Flutter этап.
