# MyBrev

Белорусский католический молитвенник и литургический календарь. Клиент — Vue 3/Vite PWA, данные приложения хранятся в Firestore.

## Запуск

```sh
npm install
npm run dev
```

Основные проверки:

```sh
npm run build
npm test
```

Деплой текущей локальной версии:

```sh
npm run deploy:hosting
```

`npm run release:hosting` сначала требует чистое рабочее дерево и успешный `git push`, затем выполняет деплой.

## Структура

- `src/` — приложение: маршруты, компоненты, stores, composables и литургическая логика.
- `tests/` — модульные тесты литургической логики, Markdown и локального Firestore snapshot.
- `scripts/` — действующие аудиты, импорты и миграции. Запись в Firestore должна быть отдельной фазой `--apply`.
- `docs/advent-md/`, `docs/christmas-md/` — редактируемые источники сезонных литургических текстов.
- `patchs/feasts/` — исходные тексты фиксированных праздников.
- `patchs/db-feasts/` — подготовленные документы фиксированных праздников.
- `backups/firestore-snapshot/` — приватный локальный snapshot; каталог не входит в Git.

## Работа с Firestore

Для анализа сначала используется локальный snapshot:

```sh
npm run db:snapshot:query -- --collection days
```

Не обновляйте snapshot и не запускайте live-аудит без подтверждения доступной квоты. Локальный service account хранится в `patchs/serviceAccountKey.json`, но исключён из Git.

Подробности: [Firestore snapshots](docs/firestore-snapshots.md) и [архитектура литургических данных](docs/liturgical-data-architecture.md).
