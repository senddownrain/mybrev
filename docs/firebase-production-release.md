# Ручная публикация Firebase

Рабочие workflows для Hosting и Firestore Rules запускаются через GitHub Actions вручную, с ветки main репозитория senddownrain/mybrev. Поле approved_sha содержит полный SHA проверенной ревизии. Job с production credentials стартует, только если SHA совпадает с SHA события. Checkout привязан к этому коммиту.

В Deploy Web to Firebase Hosting выберите одну цель:

| Цель | Операция |
| --- | --- |
| firestore-rules | Публикует firestore.rules. Для совместимого обновления сначала отдельно проверьте и утвердите Rules. |
| hosting | Собирает Web, формирует проверенный публичный каталог и публикует Hosting. |

При выпуске только кода можно передать `published_catalog_sha256` с проверенным lowercase SHA‑256 текущего публичного каталога. Hosting workflow повторно использует опубликованный файл только при совпадении контрольной суммы и пропускает прямой экспорт из Firestore.

Целевые workflow для Issue 198, XI Sunday, Basilicas и High Priest запускаются вручную с `approved_sha`. Issue 198, XI Sunday и Deploy Web делят очередь публикации. Для записи через Basilicas и High Priest при запуске выберите `apply`.

При всплеске трафика Firestore используйте [аварийный порядок](firebase-finops.md).

На момент подготовки PR у окружения production не настроены required reviewers и ограничения ветки. В репозитории действует gate ручного события, репозитория, ветки и SHA. Для независимого подтверждения владельцем на уровне GitHub до первого V2-выпуска требуется настроить required reviewer, запрет self-review и допуск только main. Настройки GitHub environment и Firebase IAM контролируются владельцем. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
