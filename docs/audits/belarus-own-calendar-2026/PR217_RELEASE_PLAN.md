# PR #217: проверка и порядок выпуска — 09.11.2026

**Firestore revision 4 ещё не применена. Выпуск revision 5 заблокирован до её подтверждённого readback. Ни Firestore writes, ни merge PR, ни deploy в этой проверке не выполнялись.**

## Проверенная база и границы

PR: https://github.com/senddownrain/mybrev/pull/217. Исходный HEAD `7a5fb196c129814d1be436d57cbce368eafb91fd`; включён актуальный main `ce9eeaf99a6f460c57c237df802ad1bc87541165` обычным merge без конфликтов. Сохранены исправления пятничных Нешпар и content revision из main.

Календарный diff остаётся узким: исключены `sv-juan-diego` (09.12) и `our-lady-guadalupe` (12.12) из fixedCalendar/metadata, воспроизводимо обновлены definitions и ожидания. Новых изменений рангов и дат нет. Исторические файлы `patchs/feasts`, PDF и его HTML-данные идентичны main. Никакие серверные тексты не читались и не менялись административным preflight. Обычный production browser загружал публичный контент приложения.

PDF SHA256: `a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696`. Опечатка «Латэранскай» не исправлялась.

## Свежая ограниченная проверка Firestore

Приватного общего `backups/firestore-snapshot/manifest.json` нет. Согласно заданию выполнено ровно пять GET: meta/current → celebrations → diocesan overrides → year overrides → meta/current. Bookends updateTime совпали. Не выполнялись beginTransaction, commit, import или обновление общего snapshot.

Время завершения: **09.11.2026 01:25:39 МСК** (`2026-11-08T22:25:39.292Z`). Project `ibreviaryby`, database `(default)`.

| Показатель | Фактически |
| --- | --- |
| schema/calendar revision | 1 / **3** |
| notes/properTexts/templates revisions | **6 / 6 / 4** |
| celebrations total/active | 241/241 |
| diocese overrides total/active | 75/75 |
| year overrides total/active | 15/15 |
| meta updateTime | `2026-11-07T14:03:05.302442Z` |

Fingerprint всех ID, exact data hashes и updateTimes: `c95e86a8fb40a96d8a331e9260f74393873061a6c7f8d7f38e562e3a0571f614`. Он совпадает с принятой базой revision 4. Существующий sealed validator проверил утверждённый план и все preconditions на сохранённом scoped capture: **0 mismatches**.

Утверждённый seal 71 операций неизменён: `bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238` (25 update, 3 create, 42 disable, 1 meta). Это проверка готовности исходной транзакции, **не receipt её выполнения**. Publisher, REST adapter и принятый plan не изменены.

Оба исключаемых документа сейчас `enabled=true`:

| ID | updateTime | Exact data SHA256 |
| --- | --- | --- |
| sv-juan-diego | `2026-10-07T18:14:52.931649Z` | `68da20659b5930f42e62f6615c69d01a93f7268182c111c6e9baa511eeecd68c` |
| our-lady-guadalupe | `2026-10-01T08:55:15.578926Z` | `6e0ba82beb97c09da5fb7a80148984221084a1023c6c0b28b7227813e6bee855` |

Эти наблюдения относятся к revision 3. Они **не используются как preconditions будущего revision 5 dry-run**. Новый Firestore diff не создан и не опубликован. Приватный scoped capture остаётся вне Git; безопасные summary/ledger приложены отдельно.

## Проверки Web

- Закрытый реестр: 262 исходные строки → **959/959** эффективных назначений по четырём диоцезиям, ID/rank/fixed date совпадают; дополнительных fixed entries нет.
- `ordo:check`, definitions `--check`, PDF generator `--check`, ESLint и production build: PASS. Annual raw re-extraction штатно пропущен; новый полный нормативный аудит не запускался.
- `npm test`: **1195 tests, 1176 PASS, 19 SKIP, 0 FAIL**. Отдельный `test:ordo`: **228 tests, 220 PASS, 8 SKIP, 0 FAIL**. Восемь Ordo skips требуют явно предоставленного приватного snapshot; production для тестов не опрашивается.
- Doxology CI check и 19 doxology tests: PASS.
- Новый `node scripts/smoke-approved-december.mjs`: 16 mounted Ordo checks, четыре диоцезии × 2026/2027 × 09/12 декабря. Запрещённых ID нет в primary/alternatives/commemorations и названий нет на странице; overflow и page errors отсутствуют. Внешние запросы заблокированы. Это проверка локального bundle, не server overlay.
- `smoke-approved-calendar.mjs`: 12 контекстов 320/390/768/1440 × light/dark/marian; PDF hash/13 страниц, ноябрьский текст, Braslau, mounted diocese switch, epoch update, monotonic rollback и warm offline: PASS. Снимок 09.12.2027 на 390px визуально просмотрен.
- Production `https://ibreviaryby.web.app` теперь доступен. Chromium проверил 09/12 декабря 2026/2027 и reload, без page errors. На 09.12.2026, 12.12.2026 и 09.12.2027 старые пункты ещё предлагаются; 12.12.2027 — воскресенье и подавляет воспоминание. Это ожидаемое состояние до выпуска PR. Production PDF hash совпадает. Установленный пользовательский PWA, полноценные Hours/I/II Vespers и offline→online с реальным server overlay этой узкой проверкой не подтверждены.

## Порядок безопасного выпуска

1. **Отдельно завершить ранее утверждённую revision 3→4.** Снова проверить актуальный production Web и все sealed preconditions. При любом drift остановиться. Применять только существующую атомарную транзакцию из 71 операции с принятым seal, без двух новых disable. Сохранить receipt и полный readback: revision4/schema1, notes6/properTexts6/templates4, totals/active 242/242, 77/39, 15/11, hashes/updateTimes всех изменённых и неизменённых документов, server/bundle parity. В этой сессии apply не разрешается выводом о совпадении preconditions и не выполнялся.
2. **Только после подтверждения revision 4** снять новую ограниченную базу с устойчивыми meta bookends. Подготовить самостоятельный точный revision 4→5 dry-run: два update `enabled: true→false` в `liturgicalCelebrations` и атомарный meta revision5/publishedAt. Документы и все ссылки на тексты сохранить. Прогноз при неизменной базе: celebrations total242/active240; остальные totals и active без изменений. Не запускать общий import/prune и не переиспользовать текущий planner целиком: он способен затронуть другие поля.
3. В отдельном dry-run зафиксировать source PDF hash, main/PR SHA, fingerprint базы, canonical и exact hashes документов, updateTime/exists, before/after, точный updateMask, hash операций и итоговые hashes. Meta update меняет только revision/publishedAt; notes/properTexts/templates/schema/source/counts сохранить. Перед apply перечитать и сверить всю согласованную базу внутри одной transaction, без retry; три записи с updateTime preconditions, одна атомарная публикация. Любой drift означает новый dry-run и отдельную проверку. Неопределённый commit сначала сверить read-only.
4. **Отдельно проверить и принять точный revision 5 diff**, включая независимую проверку того, что только два enabled изменились. Это новый diff; прежняя приёмка 71 операций на него не распространяется. До выполнения пунктов 1–3 нет точного dry-run и нет разрешения publish.
5. После формирования dry-run поднять bundled calendar revision до **5** через `build-calendar-definitions.mjs --revision 5`, повторить generation/tests/CI и mounted December checks с точным server5 fixture. До этого bundle в PR намеренно остаётся revision4. Слить только согласованный HEAD после успешного CI; deploy Hosting из проверенного main SHA, затем cold/warm/reload/diocese switch/tab return/offline→online и реальный server overlay, включая 2027. Обновлённый Web5 должен быть проверен перед атомарной публикацией Firestore5; затем обязательны readback трёх записей, сохранность остальных документов и повтор browser/cache/PWA checks. Не объявлять старые клиенты исправленными до публикации server5 и проверки обновления кеша.
6. **Rollback revision5:** сохранить before images двух документов и meta, после commit привязать inverse к фактическим post-updateTime/hash. В отдельной проверенной атомарной transaction восстановить только прежние enabled, опубликовать **revision6**, сохранить независимые revisions и остальные поля. Не понижать revision и не выполнять blind rollback при независимых изменениях. Web rollback не должен откатывать cache epoch; при необходимости выпустить совместимый bundle6. Исторический rollback исходной revision4 также использует номер5 — если он выполнен, номер занят, этот 4→5 план недействителен и нужен новый номер/новая приёмка.

Firestore/contentManifest/Flutter/rules/indexes не публиковались. PR остаётся Draft до устранения указанного условия и согласования порядка выпуска.
