# Production-выпуск календаря Беларуси — 08.11.2026

**PR #201 слит; новый Web опубликован. Firestore revision 4 не применена: остановка перед записью, поскольку сетевой доступ окружения не позволяет выполнить предусмотренную проверку опубликованного Web.** План из 71 операции утверждён, свежие production preconditions совпадают. Повторное утверждение литургии или этого diff не требуется.

Это отчёт о фактически завершённых этапах. Он не объявляет полную production-приёмку пройденной и не подменяет реальный browser smoke локальными тестами.

## 1. Разрешение владельца и нормативный эталон

[Окончательное разрешение](https://github.com/senddownrain/mybrev/pull/201#issuecomment-6714161064) подтверждено: владелец `senddownrain`, comment updated `2026-11-07T22:58:00Z`, решение в тексте датировано 08.11.2026.

Основной источник — общий календарь 06.11.2026, PDF SHA256 `a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696`. Старые годовые Ordo не используются для отмены утверждённых постоянных назначений. Полный повторный нормативный аудит не проводился.

Новый принятый план сохранён в [APPROVED_PATCH_PLAN.json](../../../reports/ordo-approved-release/APPROVED_PATCH_PLAN.json). Его операции точно совпадают с историческим `NEW_PATCH_PLAN_NOT_AUTHORIZED.json`; добавлены сведения о принятии и независимых revisions. Прежний NOT_AUTHORIZED status заменён явным разрешением владельца.

## 2. Merge, main и сохранение других PR

- [PR #201](https://github.com/senddownrain/mybrev/pull/201) **слит** с сохранением истории, без squash/rebase.
- Проверенный HEAD: `bdefc2250f2e0a463b9f27023e62ce0c45126d6c`.
- Итоговый merge SHA main и источник опубликованного Web: **`8b635f2e8dd102e145c34767a5eb0528f101dd11`**.
- Merge выполнен официальным GitHub API с обязательным expected `sha`; проверено, что дерево merge-коммита идентично проверенному PR HEAD.
- Включён указанный владельцем main `7fa750c1d30e5c54e76445d0f7078038b4532855`, затем актуальный на момент merge `faf509d486a3422db135838dd601620e367738a5`.
- Сохранены reader settings/alignment, editor persistence, PWA graphite navigation, полные тексты декретов, изменения Introduction и исправления адвентских Нешпар. Единственный содержательный merge conflict возник между двумя добавленными source tests: обе проверки сохранены. Старые версии целых файлов поверх новых не подставлялись.

Отчётные изменения после указанного merge SHA затрагивают только документацию и evidence, не код опубликованного приложения.

## 3. CI и локальные проверки

- [PR CI — SUCCESS](https://github.com/senddownrain/mybrev/actions/runs/42456364397), точный HEAD `bdefc22…`.
- [CI итогового main — SUCCESS](https://github.com/senddownrain/mybrev/actions/runs/42456701486), точный SHA `8b635f2…`.
- Полный локальный набор: **1 167 tests; 1 156 PASS, 11 SKIP, 0 FAIL**.
- Ordo: **227/227 PASS** (217 исходных и 10 publisher tests).
- ESLint без `--fix`, production build, `ordo:check`, генерация calendar definitions и document generator `--check` — PASS. После merge повторён `ordo:check`: definitions воспроизводимы, рабочее дерево чистое.
- 11 штатных SKIP не объявлены PASS; причины доступны в [полном логе](../../../reports/ordo-approved-release/production-2026-11-08/checks/all.log). Re-extraction annual raw sources не запускался; `ordo:check` явно сообщает соответствующий skip.
- В CI приватный snapshot отсутствует: зависимые от него publisher tests пропускаются без запросов к production. Локально все десять выполнены с явно указанной принятой приватной базой.

## 4. Firebase Hosting

[Ручной Hosting workflow — SUCCESS](https://github.com/senddownrain/mybrev/actions/runs/42456727170), `workflow_dispatch`, SHA `8b635f2e8dd102e145c34767a5eb0528f101dd11`.

Текущая конфигурация workflow проверена перед запуском: только main, production environment, строгая проверка project `ibreviaryby`, команда `deploy --only hosting --project ibreviaryby`, cleanup ключа с `if: always()`. В правила, индексы и коллекции этот workflow не пишет.

Лог GitHub подтверждает загрузку **195 файлов**, finalized version и `release complete` **08.11.2026 06:58:06 UTC**. Версия приложения в package.json — 4.5.2; календарный bundle revision 4/schema 1. Источник публикации — merge SHA выше. Внутренний Hosting version ID в обычном CLI-логе не выведен и не выдумывается.

Адрес: **https://ibreviaryby.web.app**. Это подтверждённая публикация Hosting; полноценная проверка отданного браузеру production контента пока не завершена.

## 5. Production Firestore: состояние и preconditions

Первый scoped preflight после принятия плана — 08.11.2026 06:41 UTC. Проверены все **332 ID, canonical SHA256, exact data hash, updateTime**, counts и все 71 per-operation preconditions. Дополнительно вся принятая база защищена fingerprint:

`c95e86a8fb40a96d8a331e9260f74393873061a6c7f8d7f38e562e3a0571f614`.

Проверена и реальная REST read-write transaction: begin → транзакционные чтения → сверка → rollback **незафиксированной** транзакции. Commit не вызывался; это не откат данных.

После Hosting выполнен второй полный read-only preflight, завершён **08.11.2026 07:02:04.473 UTC**: все hashes/updateTimes/ID и 71 precondition снова совпали. [Результат](../../../reports/ordo-approved-release/production-2026-11-08/POST_HOSTING_PREFLIGHT.json).

| Параметр | Принятая база | Последний readback без записи | Цель миграции |
|---|---:|---:|---:|
| schemaVersion | 1 | 1 | 1 |
| calendar revision | 3 | **3** | 4 |
| notesRevision | 6 | **6** | 6 |
| properTextsRevision | 6 | **6** | 6 |
| templatesRevision | 4 | **4** | 4 |
| celebrations total/active | 241/241 | 241/241 | 242/242 |
| diocese overrides total/active | 75/75 | 75/75 | 77/39 |
| year overrides total/active | 15/15 | 15/15 | 15/11 |

Metadata updateTime остаётся `2026-11-07T14:03:05.302442Z`; canonical hash `f98551a4dc0836608f67e23a479e83f2a26480d5cc7ac65fe5b0c4a0f967f1d4`. Тракельская уже имеет 05.07/memoria, не входит в writes; её updateTime `2026-11-07T14:02:10.287433Z` совпал с принятой базой.

Эти сведения относятся к указанному времени чтения; перед будущим commit всё необходимо сверить снова. Ни одного apply attempt не сделано.

## 6. Утверждённые операции и manifest

SHA256 списка операций:

`bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238`.

| Действие | Утверждено | Выполнено |
|---|---:|---:|
| Create | 3 | 0 |
| Update | 25 | 0 |
| Disable | 42 | 0 |
| Publish metadata | 1 | 0 |
| Всего | **71** | **0** |
| Delete | **0** | **0** |

[Sanitized RELEASE_MANIFEST.json](../../../reports/ordo-approved-release/production-2026-11-08/RELEASE_MANIFEST.json) перечисляет каждый из 71 ID, действие, **NOT_EXECUTED**, observed/target revision, safe hashes/updateTimes и совпадение precondition. Это manifest попытки выпуска, не успешный publication receipt. Приватного backup и credentials в нём нет.

## 7. Guarded publisher и проверка отказов

`publish-approved-calendar.mjs` и узкий REST adapter обновлены под принятый seal. Default — dry-run; live apply требует явных flags и точного confirmation hash. Проверяются project/database, schema/revision, notes6/properTexts6/templates4, все поля и collections, весь baseline fingerprint, ID/hashes/updateTimes, before fields, counts и отсутствие Trakai в writes.

Механизм предусматривает **одну атомарную transaction из 71 write**, включая publication barrier metadata и server timestamp. Строгие exists/updateTime preconditions, без удаления, bulk import, retry commit, повторного применения и автоматического data rollback. До commit сохраняется приватный маркер попытки; неопределённый результат требует read-only reconciliation. Post-commit verifier проверяет 71 результат и все остальные scoped документы.

Десять offline tests проходят: altered seal, nested ignored-metadata injection, foreign project, revision/schema, независимые revisions, field/collection scope, changed hash/updateTime/ID/count, подмена baseline, повторная revision 4, отказ операции, единственный commit без retry, ошибка readback и inverse под revision 5. Ошибка commit проверена fake transport; реальная production write transaction не выполнялась. Реальный транзакционный путь чтения проверен отдельно.

## 8. Контроль четырёх диоцезий и 16 068 случаев

На совмещённом коде выполнена полная локальная матрица **2025–2035 × 4**, всего **16 068/16 068** совпадений planned server definitions и bundled definitions, включая primary, alternatives, commemorations, suppressed, Office, readings/Mass references, I/II Vespers. Проверены 262 строки источника и 959 эффективных назначений. [Sweep summary](../../../reports/ordo-approved-release/production-2026-11-08/SWEEP_SUMMARY.json).

Это проверка будущей модели; actual post-write server parity пока не выполнялась, поскольку записи не было.

| Дата | Минск-Могилёв | Витебск | Пинск | Гродно |
|---|---|---|---|---|
| 08.09 | Рождество Богородицы | Браславская, единственное видимое празднование | Рождество Богородицы | Рождество Богородицы |
| 16.11 | memoria | обязательная memoria | memoria | solemnitas |
| 05.07 | без нового назначения Тракельской | то же | то же | Тракельская, memoria, с учётом общего старшинства |
| 04.12 | нет неподтверждённого общего назначения Варвары | то же | то же | то же |

В bundle скрыты 23 неподтверждённых назначения и отключены четыре manual overrides. В production это ещё не опубликовано этой миграцией. Правила Mother Church, Immaculate Heart и High Priest сохранены. При проверке 05.07 следует различать календарную дату и подавление memoria воскресеньем: удобный weekday case — 05.07.2027.

## 9. Локальные browser и визуальные проверки

- Calendar smoke: **12 контекстов**, 320/390/768/1440 × light/dark/marian; новый PDF URL/hash, 13 страниц, ноябрьский текст, смена диоцезии на открытом экране, definitions epoch, большая rollback revision и warm offline — PASS.
- Source documents smoke: **4 контекста**, 390/1440 × light/dark; вся цепочка About → Sources → документы, каждый символ календаря/ранговая колонка, полный Introduction/декреты, anchors, safe back, отсутствие overflow и page errors — PASS.
- Reader: **6 контекстов**, 390/1440 × light/dark/marian; 5 fonts × 2 sizes × 3 modes, persistence, Bible/Readings/Prayer/Compendium и изоляция Hours — PASS. Fixtures переведены на реальные revision/epoch cache key functions.
- Editor smoke: local Firestore double, сохранение/повторное открытие, обновление stale Vesper, отказ записи и несовпадение readback — PASS. В production тексты не записывались.
- Визуально просмотрены свежие [ноябрь](../../../reports/ordo-approved-release/production-2026-11-08/november-390-light.png) и [Браславская](../../../reports/ordo-approved-release/production-2026-11-08/braslau-390-light.png).

Все эти browser проверки используют локальный Web; внешние запросы блокировались. Первые запуски выявили устаревшие smoke assumptions после новых PR main (удалённые ссылки/сноска, reader alignment и старые cache keys); они исправлены. Итоговые проверки успешны, продуктовые файлы ради прохождения тестов не откатывались.

## 10. Причина остановки и production PWA

Прямые curl и Chromium к Hosting не проходят: CONNECT 403 / `ERR_TUNNEL_CONNECTION_FAILED`. Повтор после deploy — **08.11.2026 07:02:05 UTC**. [Browser evidence](../../../reports/ordo-approved-release/production-2026-11-08/PRODUCTION_BROWSER_ACCESS.json).

Работающий экземпляр cloud environment сообщает applied/observed **spec revision 1**, policy enforced, восемь разрешённых доменов; `ibreviaryby.web.app` и `ibreviaryby.firebaseapp.com` отсутствуют. Владелец сообщил о добавлении доменов, но к этому экземпляру настройки ещё не применились. Доступного инструмента runtime network changes нет. Ограничение сети не обходилось через другой прокси, отключение TLS или неподконтрольные удалённые команды.

Поэтому production cold/warm start, reload, смена диоцезии, возврат во вкладку, установленный PWA, offline → online, реальные Hours/readings и I/II Vespers **не подтверждены**. Фактических ошибок приложения или установленного Android PWA не установлено: сайт недоступен для этих проверок. Локальные fixtures не выдаются за реальный сервер. Полная production-приёмка не пройдена.

Firestore write остановлена на предусмотренном этапе: нельзя заменить обязательную проверку опубликованного Web предположением на основании CI/deploy. Новый bundled revision 4 при server revision 3 — ожидаемый промежуточный режим, предусмотренный заданием.

## 11. Credentials и отсутствие записей вне scope

Firebase service account декодирован и JWT подписан только в памяти, TTL 15 минут; ключ, base64 и JWT не печатались и не записывались в файлы/Git/артефакты. Временных файлов Firebase-ключа в этом окружении не создавалось. Hosting использовал существующий GitHub secret; cleanup step workflow завершился успешно.

Admin preflight выполнено **17 REST запросов**: 15 GET и два POST для beginTransaction/освобождения незакоммиченной transaction; **0 commit, 0 data writes**. Только metadata/current и три разрешённые календарные коллекции. [Sanitized ledger](../../../reports/ordo-approved-release/production-2026-11-08/READ_ONLY_REQUEST_LEDGER.json).

Не записывались `days`, `readings`, templates, Proper, notes, contentManifest, молитвы/песенник, пользователи, роли/доступы или аналитика. Тексты скрываемых празднований не удалялись. Editor smoke выполнял только локальные fake writes. Приватный snapshot и rollback остаются вне Git; staged artifacts отдельно проверены на Firebase credentials.

## 12. Откат

Firestore откат этой попытки не нужен: data writes отсутствуют. Подготовленный inverse под принятый 71-operation plan проверен offline: restore 25 updates, restore 42 disabled records, три созданных ID становятся disabled без удаления текстов, meta получает **revision 5**, server publishedAt; notes6/properTexts6/templates4 сохраняются. Trakai вне forward/inverse. Cache epoch должен пройти через новую большую revision.

До реального rollback требуются свежие post-release hashes/updateTimes и проверка отсутствия независимых изменений, затем отдельное решение о восстановлении. Ни понижение 4→3, ни blind rollback не предусмотрены. Web Hosting rollback автоматически не выполнялся: локальные и CI проверки успешны, production runtime error не обнаружен.

## 13. 2033 и Newman

Коллизия Nativity of John the Baptist / Sacred Heart 2033 остаётся **needs-review**, общий алгоритм даёт **25.06.2033**. Дополнительное специальное правило не придумано, дата не объявлена официальным решением для 2033.

Собственный утверждённый перевод Newman отсутствует. Используются законные общие тексты, без фиктивного proper и ошибочной привязки к John Leonardi. Ни одно из этих ограничений не отменяет принятие остальных решений календаря.

## 14. Готовность Web и оставшиеся действия

Код принят, PR слит, Hosting опубликован. Для завершения выпуска нужно применить сетевые настройки к используемому executor либо продолжить в экземпляре, где оба Hosting-домена реально разрешены. Повторная приёмка 71-operation diff **не нужна**.

Дальнейший порядок: реальный production smoke → свежая полная сверка preconditions → явный guarded apply с принятым seal → readback всех 71 результатов и counts/revisions → 16 068 actual server/bundle parity → реальные browser/PWA/cache/Hours/readings/I/II Vespers проверки. Любое новое несовпадение production блокирует старый план; нельзя молча обновлять seal. До этого момента конечная цель согласованного Web + Firestore revision 4 не достигнута.

## 15. Flutter

Flutter-репозиторий не изменён, mobile bundles/stores/contentManifest не опубликованы. [FLUTTER_FOLLOWUP.md](FLUTTER_FOLLOWUP.md) содержит решения, offline/settings/overlay/cache требования и parity matrix. Технические definitions готовы, но финальная сверка мобильного набора должна опираться на фактически опубликованный и подтверждённый server revision 4. Сейчас передавать задачу как завершённый production-выпуск нельзя.

История предыдущей остановки из-за изменившегося diff сохранена отдельно: [07.11.2026](PRODUCTION_RELEASE_ATTEMPT_2026-11-07.md). В этой попытке diff совпал; оставшийся блок относится к доступу для проверки Web.
