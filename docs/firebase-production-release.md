# Ручная публикация Firebase

Рабочие workflows для Hosting и Firestore Rules запускаются через GitHub Actions вручную, с ветки main репозитория senddownrain/mybrev. Поле approved_sha содержит полный SHA проверенной ревизии. Job с production credentials стартует, только если SHA совпадает с SHA события. Checkout привязан к этому коммиту.

В Deploy Web to Firebase Hosting выберите одну цель:

| Цель | Операция |
| --- | --- |
| firestore-rules | Публикует firestore.rules. Для совместимого обновления сначала отдельно проверьте и утвердите Rules. |
| hosting | Собирает Web, формирует проверенный публичный каталог и публикует Hosting. |

Два целевых workflow для Issue 198 и XI Sunday выполняют свои существующие действия с данными и Hosting. Для них также требуется отдельный ручной запуск с approved_sha. Все три workflow делят очередь публикации. Изменения в main и метки сообщений коммитов сами по себе job публикации не запускают.

На момент подготовки PR у окружения production не настроены required reviewers и ограничения ветки. В репозитории действует gate ручного события, репозитория, ветки и SHA. Для независимого подтверждения владельцем на уровне GitHub до первого V2-выпуска требуется настроить required reviewer, запрет self-review и допуск только main. Настройки GitHub environment и Firebase IAM контролируются владельцем. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
