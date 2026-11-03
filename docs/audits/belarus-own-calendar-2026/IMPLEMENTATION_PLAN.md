# IMPLEMENTATION_PLAN — предложение, без выполнения исправлений

Ни один шаг с изменением runtime, данных, текстов или публикацией в этой задаче не выполнялся. Данный документ предназначен для общего решения владельца после FINAL_REPORT. Матрица содержит 172 строки: 33 A (23 содержательных назначения и 10 применений заголовков/титула), 2 общих правила B, 31 C (30 случаев), 48 D и 58 KEEP. KEEP означает сохранить, не превращать буквальное отличие в автоматическую правку.

## 1. Одним этапом утвердить границы следующей работы

Владелец выбирает: принять A/B/D как пакет; выбрать временное исключение C01–C23 из общего диоцезального выбора с сохранением proper либо оставить конкретные строки pending до ответа; по C24 не создавать автоматически второй option; по C25–C28 принять или отложить точные годовые решения; C29/C30 оставить явно нерешёнными до применимой нормы. Отдельные действующие акты могут переопределить конкретную строку, но не заменяются догадкой по одному annual Ordo.

23 прямых содержательных A: 17 расхождений ранга и 3 даты составляют 18 уникальных identity×diocese (две даты одновременно имеют rank difference), плюс 5 отсутствующих назначений (Newman×4 и Сапоцька Витебск). Дополнительно A включает полные имена Витебска, Цэліна, патронат Михаила и титул Иренея; существующие службы не переписываются. При отсутствии approved новой белорусской редакции проверять её источник отдельно, не придумывать перевод. Безусловное сохранение 58 KEEP не требует миграции.

## 2. Сначала подготовить безопасное обновление Web (D)

До календарной публикации исправить/проверить как минимум два обязательных механизма: invalidation `resolveRuntimeDay` по definitions epoch и bounded online revalidation meta/year keys. Иначе смена server revision может не обнаружиться, а уже посещённая дата — остаться старой даже после получения новых данных. Source of truth — definitions; не создавать ещё один календарь в UI.

Дополнительно: гарантировать фактическое server refresh в admin reload; единообразно проверять schema restored cache и network; определить явную обработку rollback; связать notes loader с notesRevision, если требуется обновление в открытом сеансе; обновлять календарь до контента в пользовательском refresh; утвердить смысл enabled/needs-review и canonical year storage. Эти изменения идут отдельным Web implementation commit/PR после разрешения, а не в документационной ветке аудита.

Не менять настройки приложения, аналитику, Advent 17–24, общие тексты/переводы и прочие темы без отдельного основания. Существующий fallback при offline сохраняется; исправление revalidation не должно превращаться в unbounded collection polling.

## 3. Зафиксировать приватный исходный набор и preconditions

Перед будущими изменениями повторно использовать или ограниченно актуализировать private calendar snapshot и зафиксировать expected meta revision, counts и canonical hashes. Текущий reference: revision3, 241+75 permanent, 15 year, notes4/1337; bundle notes6/1347. Это precondition для будущего patch, не разрешение писать сейчас. Если состояние изменилось, пересчитать только delta относительно сохранённого аудита.

Приватный snapshot/credentials не помещать в docs/public/PR. Для proper использовать существующие локальные content refs; если требуется содержимое `days`/`readings`, согласовать минимальный дополнительный scope и прочитать нужные документы по IDs. Этот аудит не давал массового content-read разрешения и не объявлял реальные proper тела проверенными.

## 4. Построить узкий seed patch (A и одобренная часть C)

Изменять editable источники: `fixedCalendar.js`, `src/data/ordo/layers.js`, необходимые identity/source metadata; затем контролируемо получить generated definitions и проверить diff. Не чинить один `calendar-definitions.json` в отрыве от seed.

- Trakelskaya: 05.07 memoria, без постоянного 10.07 festum; будущий annual move, если разрешён, отдельно.
- Pinsk Budslav optional; Minsk solemnitas, Vitebsk festum, Grodno optional сохранить.
- Vitebsk Mother Mercy optional; снять ошибочное безусловное BY повышение либо явно восстановить витебский вариант, сохранив остальные ранги.
- Mother Church в Pinsk/Grodno memoria; восстановить наследуемый universal слой, а не сохранять ложную diocesan promotion с новым rank и изменённым precedence.
- Остальные Grodno rank/date differences по полной таблице, без выведения бессрочного правила из annual 2027.
- Добавить Sopocko Vitebsk 15.02 optional, проверить content scope/fallback.
- Newman 09.10 optional с 2026; не ретроактивно на 09.10.2025. Сохранить подтверждённые универсальные дни вне собственного PDF.
- При одобрении временного режима C: снять только 23 diocesan assignments, не удалять тексты, ID, templates или библиографические источники. Отдельный reference access должен остаться работоспособным.

Для каждой изменённой assignment сохранять source document, PDF page, authority class, decision ID, scope и статус. Титул/патронат не поднимать в rank автоматически. Braslau требует решения C24 о identity: миграция ID без него может потерять доступ к proper либо породить ложный второй выбор.

## 5. Алгоритмические изменения B

Разделить две специальные коллизии. Mother Church: преимущество марийного memoria, другого saint alternative нет. Immaculate Heart: оба memoria optional в этом году и weekday primary; постоянные ranks вне коллизии остаются прежними. Проверить все 21 actual Heart occurrences и Mother Church 05.06.2028 по всем четырём после data rank restoration. Правки не должны служить поводом менять прочие precedence rules без источника.

Существующие 11 auto-transfer не считать добавочными праздниками и не удалять ради совпадения числа year documents с bundle4. Сравнить computedDate/effectiveDate, все 38 occurrences и review policy. C30 для 2033 не «исправляется» простым отключением stored записи — нужен ответ о специальном правиле. Четыре manual решения, если приняты, сохранить только для указанных лет, нормализовав storage без смены поведения.

## 6. Сформировать read-only dry-run по snapshot

Dry-run обязан принимать локальный snapshot, не Firestore по умолчанию. Выход: точный перечень изменённых calendar docs и expected precondition hashes, before/after default/alternatives/commemoratio/suppressed, Office/Readings refs и I/II Vespers. Отдельно: новый meta revision, schema, counts, expected warnings=0; year decisions diff; список сохранённых proper и reference routes. Не включать литургические тексты в patch.

Оставить current production notes4 без автоматического downgrade bundled notes6. Если в будущем scope включает заметки, сначала отдельно проверить их bodies и источники; одна разность counts1337/1347 не даёт разрешения добавлять/удалять «10 заметок».

## 7. Проверки до какой-либо публикации

1. Воспроизводимый PDF comparison всех 263 rows и всех approved decisions; исходный SHA PDF неизменен.
2. Whole-year генерация 2025–2035 ×4, включая every role и Office/Readings; отдельный General update application date.
3. 4.12.2026 Pinsk/Grodno и обе даты Grodno 2027; 5/10.07.2027; 22.08 Pinsk с I Vespers; Budslav×4; Braslau выбранная схема; Sopocko Sunday/Lent/ordinary; Mother Mercy Vitebsk; Newman; все 23 additions.
4. 21 Heart +4 Mother Church expected outcomes после rank changes; generic High Priest branch не объявлять подтверждённой без C29.
5. 15 year docs: 4 manual, 11 auto; все actual transfers и отдельно C30.
6. Cache matrix: cold/warm, same/new revision, online/offline, cached future schema, already visited date, admin reload, notes once loaded, explicit saved-content refresh, rollback under larger revision.
7. После получения нового calendar data уже открытые Ordo, Hours, Readings и date picker должны согласованно сменить identity; старый memo/Pinia/payload не должен возвращать прежнее назначение.
8. Сохранность доступа к proper после снятия assignment, без удаления Office/readings texts.
9. Existing tests: test:ordo, ordo:check, full tests, read-only lint и isolated build. Green parity — техническое свойство, не замена PDF/нормативным cases.
10. Перед публикацией человек сверяет окончательный dry-run и даёт отдельное разрешение. Автопубликации/auto-merge нет.

## 8. Выпуск Web и только затем перенос во Flutter

Кэш-исправления и календарные данные выпускать согласованно, с монотонной revision и publication manifest. Пока revision не больше 3, нынешний Web берёт bundle; исправление только Firestore при том же номере не исправит его календарь. CONTENT_REVISION bump полезен при доставке нового Web build, но не является единственным detector для уже установленного старого клиента — требуется проверенная revalidation strategy.

Flutter сейчас не изменялся и не обследовался. После Web приёмки отдельная задача: утверждённые definitions/content bundle, семантика 15 year overrides, local overlays/Hive, offline/upgrade path и parity по утверждённому нормативному набору. Подпись приложения, package name, аналитика и магазин вне scope. Способ распространения согласовать с действующим `docs/app-content-distribution.md`; calendar patch не даёт разрешения на массовую публикацию содержимого.

## 9. Риски и откат

Главные риски: обязательное →optional меняет default и источники псалмодии/чтений; removal assignment может спрятать прямой доступ к proper; identity Braslau может перепривязать тексты; годовые исключения могут быть случайно превращены в постоянные; кэши могут раздать разные версии; notes revision может быть ошибочно понижена.

Сохранить полный private календарный исходный набор и patch manifest. Если релиз 4 надо откатить, публиковать восстановленный набор как revision5 (пример монотонности), а не уменьшать server meta до 3. Годовые записи восстановить отдельно; UI должен увидеть новый epoch и очистить memo. Для runtime-кода готовить обратимый отдельный commit/release. После отката повторить cases и проверить уже открытый/старый client. Тексты не удалялись — откат назначения не требует восстановления утраченных Office/readings документов. Никакой из этих write/deploy шагов сейчас не выполнялся.
