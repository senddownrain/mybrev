# Контролируемое продолжение после HTTP 429

Содержимое и SHA плана неизменны: `4a9aceb089a77ce50aeda1ba39dbf0a08f41130214cd77327fff032c753dd589`, 226 Proper-документов / 406 полей. Редакторские проверки, полный аудит и date sweep не повторяются. Days/templates (7 791 поля), manifest days=6 и Advent не входят в writer.

Workflow `pr245-reviewed-content.yml` сначала запускается с `mode=diagnose`. Он читает только metadata database/billing, доступные consumer quotas, Monitoring descriptors и write/read/API-request counters за 48 часов, отдельно writes текущих суток America/Los_Angeles. Наличие данных, permissions/API errors и неполные выборки указываются явно; отсутствие метрик не выдаётся за здоровую квоту. Тела документов не читаются. Отчёт сохраняется в protected Actions artifact.

После анализа доступных метрик исполнитель запускает `mode=execute`, если нет установленного исчерпания квоты. Неясный RESOURCE_EXHAUSTED допускает только один контролируемый диагностический запрос и прекращает текущий запуск; суточное исчерпание не повторяется. Достоверный rate/capacity error допускает не более трёх попыток на партию и четырёх дополнительных попыток на запуск, exponential backoff с jitter, Retry-After/RetryInfo. Transport/5xx с неизвестным результатом не повторяются автоматически.

Партии по 25 (либо явно выбранные 50) документов не обладают общей атомарностью 226 документов. Каждая партия несёт прежние точные field masks/updateTime. В receipt до запроса записываются только metadata, masks, preconditions, bytes и request SHA — без payload. На отклонении немедленно сохраняются failed-write, HTTP/code/status/message/details и безопасные headers. Успешные server writeResults сохраняются до aggregate receipt, затем выполняется readback SHA/updateTime. Ошибка последующей партии сохраняет все предыдущие receipts, счётчики и remaining scope.

Resume принимает artifact предыдущего run, сверяет исходный planSHA/project и hashes. Уже verified документы не переписывает и заново не читает. Неоконченный подтверждённый batch проверяется чтением; crash между writeResults и aggregate journal восстанавливается только по сохранённым server timestamps и afterSHA. Неподтверждённый транспортный исход не считается отсутствием записи и требует явной readback-сверки. Новые записи идут только по оставшемуся плану со свежими preconditions.

Receipts содержат field hashes, но не исходные тексты. Обратные значения для rollback берутся из pinned исходного плана:

```bash
node scripts/liturgy/build-editorial-rollback-v3.mjs --receipt /private/server-receipt.json --out /private/rollback.gz --source-plan docs/audits/liturgical-common-texts-2026-11/v4/publication-plan.json.gz
```

Команда офлайн, обратный план затрагивает только реально подтверждённые партии; actual rollback требует отдельного решения и fresh afterSHA/post-write updateTime, как раньше. Автоматического rollback или снятия publication guards нет.

Проверены шесть новых узких регрессий: secret/body redaction, остановка при daily/unknown quota, bounded backoff, частичный успех/resume, восстановление acknowledgement и hash-only rollback. Дополнительно две прежние проверки preconditions/executor и ESLint. Статус production определяется фактическим следующим Actions receipt, не этим документом. Отложенный Hosting deploy выполняется только после всех 226/406 подтверждённых write/readback.
