# PR #245 — v3

Тесты: [validation.json](validation.json). Текущий результат: [REPORT.md](../REPORT.md), [summary.json](summary.json), [publication-summary.json](publication-summary.json).

- Исходные поля/ответы и точные обратимые диапазоны: [editorial-source-proofs.json.gz](editorial-source-proofs.json.gz). Входы: [input-queue.json.gz](input-queue.json.gz), [source-baseline.json.gz](source-baseline.json.gz).
- Только нерешённое: [EXCEPTIONS.md](EXCEPTIONS.md), [exceptions.html](exceptions.html) (скачать и открыть локально), [exceptions.json](exceptions.json). 10 групп / 10 полей / 15 реплик. Экспорт не отправляет данные в сеть.
- Единственный актуальный publishing dry-run: [publication-plan.json.gz](publication-plan.json.gz). Независимый ready-список: [ready-fields.tsv](ready-fields.tsv). Прежние планы в родительском каталоге — исторические входы; их не применять поверх v3.
- [RELEASE_PLAN.md](RELEASE_PLAN.md): offline-команды, отдельные будущие preflight/write, авторизация, readback, rollback и MASS CONTENT REBUILD gate. [rollback-blueprint.json.gz](rollback-blueprint.json.gz) не содержит актуальных post-write timestamps, поскольку writes не было.
- [regeneration-check.json](regeneration-check.json): 567 файлов, нулевой diff после полного offline replay. [release-classification.json](release-classification.json): действующий classifier и валидация коллекций. [derived-generation-proof.json.gz](derived-generation-proof.json.gz): отдельное cache-derived поле.
- [runtime-verification.json](runtime-verification.json), [web/](web/): actual Web reader / исключения; Flutter renderer просмотрен read-only, released bundle не подтверждён. Следующее Flutter-задание: [FLUTTER_HANDOFF.md](../FLUTTER_HANDOFF.md).

Все 467 полей обработаны. Среди 866 повторяемых реплик 820 раскрыты, 18 уже полные, 15 требуют редактора, 13 сами допускают копирование, но удержаны внутри целого спорного поля. Последние 13 не записаны частично. 455 source-полей / 820 source-ответов не смешиваются с 3 629 заменами материализованных реплик Firestore.

Production не изменён. Fresh live preflight не выполнен. 8 153 ready-поля / 974 документа — готовность содержания, а не разрешение выполнить загрузку.
