# Production-выпуск календаря Беларуси — 08.11.2026

**Разрешение владельца получено. Выпуск подготавливается; этот коммит ещё не подтверждает merge, Hosting или Firestore revision 4.**

Основание: [окончательное решение в PR #201](https://github.com/senddownrain/mybrev/pull/201#issuecomment-6714161064). Все литургические решения и новый diff утверждены; прежнее имя `NEW_PATCH_PLAN_NOT_AUTHORIZED.json` носит исторический характер.

- Эталон: общий календарь 06.11.2026, PDF SHA256 `a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696`.
- [Принятый план](../../../reports/ordo-approved-release/APPROVED_PATCH_PLAN.json): 71 операция — 3 create, 25 update, 42 disable, 1 meta, 0 delete. Digest `bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238`.
- Независимые revisions notes6/properTexts6/templates4 сохраняются. Уже исправленная Тракельская не входит в writes. Meta revision 4 должна публиковаться атомарно с остальными документами.
- Интегрированы все изменения main, включая `7fa750c` и последующий `faf509d`: reader settings, persistence editor, PWA graphite chrome, полные декреты, изменения Introduction и адвентские Нешпары. Конфликт двух добавленных тестов разрешён сохранением обеих проверок. Целые файлы из старой ветки поверх нового main не подставлялись.
- Live preflight 08.11.2026 06:41 UTC: все 332 ID/hash/updateTime и 71 per-operation precondition совпали. Состояние schema1/calendar3/notes6/properTexts6/templates4, counts 241/75/15. Выполнены также транзакционные чтения с освобождением транзакции без commit: проверен реальный REST transaction путь без изменений данных.
- Guarded publisher обновлён под точный seal и fingerprint всей принятой базы; по умолчанию dry-run. Отказы при изменённом плане/проекте/schema/revision/hash/updateTime/ID/count, подмене baseline, повторном применении и ошибке операции проверяются offline. Никаких retry commit, удалений, массового импорта и автоматического data rollback.
- Rollback blueprint подготовлен приватно: возврат прежних полей и disabled назначений, новые IDs становятся disabled, metadata публикуется только с большей revision 5; notes6/properTexts6/templates4 сохраняются. Нужны свежие post-release preconditions и отдельное решение об откате.
- Сверка 2025–2035 × 4 диоцезии: **16 068/16 068** planned server/bundled parity; 262 нормативные строки, 959 назначений. Разница с текущим исходным сервером — 641 день, поскольку Тракельская уже исправлена независимо.
- Локальные проверки: **1 167 tests, 1 156 PASS, 11 SKIP, 0 FAIL; Ordo 227/227 PASS**, включая 10 publisher tests с приватной принятой базой. ESLint, build, definitions и document generator check — PASS. Browser calendar smoke 12/12 контекстов; дополнительные проверки reader/documents выполняются после адаптации smoke к новым изменениям main.
- Известные ограничения: коллизия John Baptist/Sacred Heart 2033 остаётся needs-review, общий расчёт даёт 25.06.2033 без объявления специального утверждённого решения. Собственного перевода Newman нет; используются законные общие тексты без фиктивного proper.
- Credentials используются только в памяти, JWT краткоживущий; секреты и приватный snapshot в Git не включаются. Доступ ограничен четырьмя календарными ресурсами; другие коллекции и тексты не изменяются.
- Flutter не изменён. Итоговая передача и parity fixture выполняются после фактической проверки Web/Firestore.

Сетевой доступ к Hosting ещё проверяется после изменения настроек окружения. Итоговые SHA, CI, deploy run, readback manifest и browser/PWA результаты будут внесены после выполнения этапов. История предыдущей остановки: [07.11.2026](PRODUCTION_RELEASE_ATTEMPT_2026-11-07.md).
