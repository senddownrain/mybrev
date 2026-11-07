# Отдельное следующее задание для ibreviarybyapp

В этой ветке изменён только Web. Flutter-репозиторий не изменялся, релиз и публикация манифеста не выполнялись.

После приёмки Web diff создать отдельную ветку от актуального main `senddownrain/ibreviarybyapp`, прочитать его AGENTS.md и действующие правила доставки контента. Зафиксировать SHA принятого Web commit и источника `a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696`.

1. Перенести календарные definitions revision 4/schema 1 (либо фактически принятую большую revision), сохранив стабильные IDs. Четыре manual overrides должны быть disabled и в bundle, и в серверном overlay; старые Hive records не должны включать их обратно. 11 auto-transfer остаются отдельным видом, две даты Bobola исправляются на 17.05.2027/17.05.2032. 2033 сохраняется needs-review, без нового специального универсального декрета.
2. Витебск 8.09: единственный Braslau festum, отдельная identity; Nativity подавлено только там. Проверенные существующие тексты Nativity используются как fallback Office и источник Mass/readings, собственная молитва Braslau сохраняется. Прямые старые ссылки, выбор диоцезии после открытия, Vespers и сохранённые чтения должны соответствовать новой identity.
3. 16.11 Витебск memoria; Гродно solemnitas, остальные memoria. Trakai 05.07 memoria; Budslav solemnitas/festum/optional/optional; Mother Church memoria во всех. Исключить 23 scoped assignments, сохранить `days`, Proper, templates и технические ссылки. Newman доступен с публикации общего акта в 2026, без фиктивного proper и без ошибочной привязки к John Leonardi. Sopocko Витебск 15.02 optional, в Великий пост commemoratio.
4. Портировать обе римские нормы: Mother Church подавляет совпавшую память святого; при коллизии Heart с обязательной памятью обе optional, weekday primary. Проверить 21 исторический case: 20 коллизий сохраняются, 2034 Grodno Albert исчезает после исключения назначения. High Priest и Christ King различаются и используют общую Таблицу.
5. Проверить monotonic revision, schema99 rejection, bounded meta/year revalidation, notesRevision ≥ bundled6, rollback под большей revision, очистку memo/пересборку открытого дня, clean/warm/offline/online и старый установленный bundle. Собственные изменения пользователя не удалять; overlay заменяет только опубликованные календарные назначения.
6. Получить новый разрешённый private snapshot после фактической Web/Firestore-публикации. Построить parity fixture 2025–2035 ×4, сравнить 16 068 дней, все роли, Office/readings и I/II Vespers с принятым Web. Для проверок UI нужны реальные часы и чтения в холодном/тёплом/offline состояниях.
7. Выпускать через `docs/app-content-distribution.md`. Изменение более 25% существующих diocesan overrides и более 20 документов ожидаемо требует **MASS CONTENT REBUILD**, нового bundle и app release, а не автоматического small patch/override. Сначала отдельный `content:manifest` dry-run; решение о выпуске и любом `--apply` принимает владелец после точного diff. Notes, prayers, songs и остальные коллекции не включать без основания.

Сдать отдельный PR с русским отчётом, результатами parity/UI и новым планом публикации/отката. Не выполнять app release, запись Firestore, manifest apply или merge по разрешению, данному только на текущую Web-задачу.

## Статус попытки выпуска 07.11.2026

Web/Firestore-выпуск остановлен до merge/deploy/записи: live preconditions изменились. На 17:16:08 UTC production имеет calendar revision 3, notesRevision 6, properTextsRevision 6; Тракельская уже исправлена на 05.07 memoria. Не рассчитывать на опубликованную server revision 4.

Новый НЕ утверждённый dry-run содержит 71 операцию вместо 72, сохраняет независимую notesRevision 6. Его принятие и Web-публикация должны предшествовать финальной Flutter parity и доставке bundle. Не переносить старую notesRevision 4 в новый overlay/rollback. Подробности и безопасные manifests: [PRODUCTION_RELEASE_REPORT.md](PRODUCTION_RELEASE_REPORT.md). Мобильный код этой задачей не меняется.
