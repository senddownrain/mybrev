# Firebase Blaze при всплеске трафика

Проект `ibreviaryby`, Firestore `(default)`. Назначьте ответственного за
уведомления и публикацию правил. Применение настроек требует согласования
владельца.

## Уведомления

1. В [Monitoring][monitoring] создайте и подтвердите email-канал, доступный
   дежурному с телефона. Запустите локальный генератор с именем канала.

   ```sh
   node scripts/prepare-firestore-alerts.mjs --channel projects/ibreviaryby/notificationChannels/CHANNEL_ID
   ```

2. Проверьте существующие политики по имени, затем создайте или обновите две
   политики из `.firebase/finops/`: `reads.json` (25 000 чтений за 10 минут)
   и `response.json` (64 МиБ ответов API за 10 минут). Это стартовые пороги
   по наблюдавшемуся трафику. При необходимости задайте
   `--reads-per-10m` и `--response-mib-per-10m`. Публикация новой политики
   через Cloud SDK выглядит так:

   ```sh
   gcloud monitoring policies create --project ibreviaryby --policy-from-file .firebase/finops/reads.json
   gcloud monitoring policies create --project ibreviaryby --policy-from-file .firebase/finops/response.json
   ```

   Объём ответов API — ранний сигнал. Фактический сетевой расход Firestore
   проверяйте в [Billing Reports][billing]. Отдельно подтвердите доставку
   уведомления дежурному через тестовый канал Monitoring или согласованную
   временную политику на имеющейся метрике без генерации трафика.

3. В [Billing → Budgets & alerts][budgets] проверьте бюджеты для проекта.
   `.firebase/finops/budget.json` задаёт месячный бюджет 30 PLN с порогами
   фактических расходов 3, 7,50, 15, 22,50 и 30 PLN. Обновите существующий
   месячный бюджет проекта. Если такого бюджета нет, создайте его в Console
   или через [Billing Budget API][budget-api] после проверки валюты счёта.
   Привяжите подтверждённый email-канал. Доставку бюджетного письма можно
   подтвердить после пересечения порога. Бюджетные уведомления приходят с
   задержкой и не ограничивают расходы Firestore.

## Аварийные правила

1. Сопоставьте всплеск с запланированными публикациями и задачами. Запишите
   время начала, текущий Firebase Rules release `cloud.firestore` и его
   `rulesetName`. Сверьте файл активных правил с утверждённым коммитом.
   Разберите любые различия до публикации. На время инцидента остановите
   другие публикации Firestore Rules.
2. Из утверждённого коммита сформируйте вариант и проверьте его в локальном
   Emulator Suite. Тест использует Java 21 и Firebase CLI 15.28.1.

   ```sh
   npx --yes --package firebase-tools@15.28.1 -- npm run test:emergency-rules
   ```

   Вариант запрещает `list` на `days`, `readings`, `liturgicalProperTexts`,
   `liturgicalOrdoNotes` и `liturgicalTemplates`, включая запросы редакторов,
   запросы с `limit` и старые запросы Flutter с `whereIn`. Отдельные
   `get`, `contentManifest` и авторизация закрытых каталогов доступны по
   штатным правилам. Клиенты, которым нужен запрещённый список, могут временно
   остаться без сетевого обновления. Ранее загруженные офлайн-данные доступны
   клиентам по их обычным правилам. Серверные запросы через IAM и отдельные
   чтения остаются возможны.
3. После одобрения владельца опубликуйте только правила. Убедитесь, что
   Firebase Rules release переключился. Проверьте одиночное чтение и отказ
   для одного ограниченного запроса в выбранной коллекции. Следите за
   динамикой обеих метрик и ошибками клиентских сценариев.

   ```sh
   npx --yes firebase-tools@15.28.1 deploy --config .firebase/finops/firebase.json --only firestore:rules --project ibreviaryby --non-interactive
   ```

4. После стабилизации согласуйте откат. Верните точный исходный набор правил
   из истории Firebase Console или через [Rules API][rules-patch]. Через CLI
   используйте штатный `firebase.json` из коммита, файл которого совпадает
   с исходным ruleset. Проверьте активный release, один штатный запрос
   старого клиента и доступ к закрытому набору. Возобновите обычный выпуск.

[monitoring]: https://console.cloud.google.com/monitoring/alerting?project=ibreviaryby
[billing]: https://console.cloud.google.com/billing
[budgets]: https://docs.cloud.google.com/billing/docs/how-to/budgets
[budget-api]: https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets
[rules-patch]: https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/patch
