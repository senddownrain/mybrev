# Firestore rules

`firestore.rules` (подключены в `firebase.json`) — правила базы `ibreviaryby`.

| Кто | Чтение | Запись |
|---|---|---|
| Любой клиент (web, Flutter, без входа) | весь контент, кроме `admins` | нет |
| Вошедший пользователь без прав | то же + своя запись `admins/{uid}` (проверка при входе) | нет |
| Администратор (`admins/{uid}` или UID из `src/constants/admin.js`) | то же | весь контент, кроме `admins` |
| Скрипты с service account (`patchs/serviceAccountKey.json`) | всё | всё (Admin SDK обходит правила) |

Список администраторов ведётся в консоли Firebase (`admins/{uid}`); UID в
правилах и в `src/constants/admin.js` должны совпадать.

## Проверка

```bash
npm run test:rules   # эмулятор Firestore, нужна Java 21
```

## Публикация и откат

```bash
firebase deploy --only firestore:rules --project ibreviaryby
```

До 2026-10-01 действовал тестовый набор правил 2023 года (чтение и запись
для всех до 2030-03-04): `projects/ibreviaryby/rulesets/1fdd9963-85be-4eb2-b4e2-ed5d8591ee82`.
Откат — в консоли Firebase → Firestore → Rules → история, или выпуском этого
ruleset через Rules API.
