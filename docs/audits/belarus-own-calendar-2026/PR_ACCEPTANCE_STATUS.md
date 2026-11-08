# Актуальная приёмка владельца — 08.11.2026

[Владелец окончательно разрешил выпуск](https://github.com/senddownrain/mybrev/pull/201#issuecomment-6714161064), включая новый план из 71 операции с digest `bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238`, без повторного утверждения литургических решений. Сохранить notes6/properTexts6/templates4, Тракельскую не переписывать. Guarded publisher и rollback обновлены под этот точный план. Свежие production preconditions обязательны перед commit.

Актуальный ход выпуска: [PRODUCTION_RELEASE_REPORT.md](PRODUCTION_RELEASE_REPORT.md). Ниже сохранена историческая точка проверки первоначального 72-operation plan; она заменена новым утверждённым планом и не является текущим запретом публикации.

---

# PR и точка приёмки

**PR:** https://github.com/senddownrain/mybrev/pull/201

- Актуальная база: `b5d768714f25e55a56e6121d47b739a08fdaed14`.
- Functional implementation после rebase: `0ce530885f4402ef44a57ec4fab61216eebb8da9`.
- Предыдущий финальный аудит: `9ecd0fdfd2e0230cfd1159476c11291893dd46bf`.
- Следующий отчётный commit обновляет только evidence, сведения о базе и ссылку на эту приёмку. Фактический HEAD виден в PR; содержательные календарные операции не меняются.

**GitHub CI functional commit: SUCCESS.** [CI #490](https://github.com/senddownrain/mybrev/actions/runs/42296866946), job `Lint & Build`, включая новый шаг `Approved calendar and source documents`, проверки PWA-иконок, TTL/content-cache и существующие регрессии. Проверены завершённые success для всех шагов. Автоматический merge не включён. Дальнейшие результаты HEAD публикуются в Checks этого же PR.

Локально на актуальной базе: **1 135 tests, 1 124 PASS, 11 SKIP, 0 FAIL**; Ordo **217/217 PASS**. Lint без --fix, production build, ordo:check и deterministic PDF check — PASS. После rebase повторены Chrome/Playwright 320/390/768/1440 × light/dark/marian и mounted Hours switch/epoch. Результаты и ограничения: [VERIFICATION.json](approved-evidence/VERIFICATION.json).

**Точный будущий Firestore diff:** [PRODUCTION_PATCH_PLAN.json](../../../reports/ordo-approved/PRODUCTION_PATCH_PLAN.json).

- 72 операции, удалений нет; все изменения с exists/updateTime/hash preconditions.
- Observed schema1/revision3/notes4; целевая revision4; rollback revision5.
- SHA256 списка операций: `a9bd4ad1facefdd7f2df0382eefc841bec3d50d7fcf34fbc571aed49f3094565`.
- Снимок приватный, не коммитится. Изменение любого precondition требует пересчёта и новой приёмки точного diff.
- 16 068 сочетаний проверены; будущая published модель совпадает с bundle во всех 16 068 случаях. 647 дневных результатов меняются относительно production snapshot.

Проверить в PR: 16.11 Витебск и текст PDF/HTML, 8.09 по четырём диоцезиям, 05.07 Гродно, 22.08 Пинск, Newman/Sopocko, 23 скрытых assignment IDs, 4 disabled manual records и 2 исправленные auto dates Bobola. Первичный документ остаётся единой страницей `/documents/proper-calendar` со всеми 13 листами; production URL ещё не обновлялся.

Оставшиеся ограничения: специальное общее решение на коллизию 2033 не установлено; 25.06 — общий вычисленный результат needs-review, а не подтверждённая специальная норма. Собственный перевод Newman отсутствует; фиктивного proper нет. Старое raw annual source re-extraction и 11 тестов отмечены как SKIP, а не PASS. Пользовательские установленные PWA/Flutter и полные корпуса текстов заново не обследовались.

**Не выполнены:** merge, deploy, production Firestore writes, contentManifest apply, Flutter changes или app release. Правки календаря и опубликованного документа подготовлены в ветке; выпуск требует отдельной приёмки владельцем.
