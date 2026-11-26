# Роли `admin` / `superadmin` и вход в аналитику

Статус: код и проверки локальные (эмуляторы). Реальные роли в production **не назначались**, Cloudflare/Worker/D1/ingest **не менялись**, `VITE_ANALYTICS_REPORTS_URL` для production **не задан**.

## 1. Модель ролей

Единственный источник правды — Firestore `admins/{uid}` (клиентская запись закрыта правилами для всех, включая superadmin). Вход остаётся прежним: email + пароль Firebase Authentication.

| Состояние | Права |
|---|---|
| нет входа / нет документа `admins/{uid}` | нет доступа к `/admin` |
| документ без поля `role` (старый формат) | `admin` |
| `role: "admin"` | все прежние редакторы; без «Аналітыка» |
| `role: "superadmin"` | всё из `admin` + карточка и маршрут `/admin/analytics` + управление доступом священников |
| `priestAccess`, `accessSetsV2` | исторические поля, которые можно сохранить в записи. Управление молитвенником и доступом определяется ролью. |
| любая другая `role` (опечатка, `"SuperAdmin"`) | **никаких прав** по этому документу (и в клиенте, и в Rules) |

Резервные `ADMIN_UIDS` (`src/constants/admin.js`, а также списки в `firestore.rules`) не менялись и не удалялись: без документа, при ошибке чтения или неизвестной роли они дают прежний `admin` + управление священниками, **но никогда не `superadmin`**. Явный `role: "superadmin"` в `admins/{uid}` работает и для них. Роль не привязана к одному UID: работает для любого доверенно созданного документа.

Web и `canonicalCatalog` используют общий `resolveAdminRole()` в `src/utils/adminAccess.js`. Обычный `admin` управляет молитвами, категориями, черновиками, наборами, профилями и кодами. Административные роли по-прежнему назначаются через привилегированный серверный канал. При смене аккаунта и выходе Web сразу сбрасывает права и отбрасывает устаревший ответ Firestore.

## 2. Как владельцу назначить первого superadmin (вручную)

GitHub-ник (`senddownrain`) — не учётная запись Firebase; UID угадывать нельзя.

1. Firebase Console → проект MyBrev → **Authentication → Users**. Найдите **точный email**, которым вы входите в MyBrev. Скопируйте столбец **User UID** (кнопка копирования рядом).
2. **Firestore Database → Data → коллекция `admins`**. Если документ с ID = этому UID уже есть — откройте его, иначе **Add document**, *Document ID* = UID (вставьте, не набирайте).
3. Добавьте/измените поле `role` (string) = `superadmin`. **Остальные поля не трогайте** (`email`, `name`, `priestAccess` и т. д.).
   ```json
   { "email": "email из Authentication", "name": "имя, если есть", "role": "superadmin", "priestAccess": true }
   ```
4. Выйдите из MyBrev и войдите снова (или F5): в `/admin` появится карточка «Аналітыка».

Если у вас один из резервных UID — документ можно создать так же; без него вы останетесь обычным `admin`.

### Admin SDK (необязательно, доверенная операция, без нового backend)

Dry-run по умолчанию, запись только с `--apply` и только под вашими учётными данными:

```js
// node set-role.mjs <uid> <admin|superadmin> [--apply]
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const [uid, role, flag] = process.argv.slice(2);
if (!uid || !['admin', 'superadmin'].includes(role)) throw new Error('usage: set-role.mjs <uid> <admin|superadmin> [--apply]');
const db = getFirestore(initializeApp({ credential: applicationDefault() }));
const ref = db.doc(`admins/${uid}`);
console.log('before:', (await ref.get()).data() ?? '(no document)');
console.log('would set:', { role });
if (flag === '--apply') { await ref.set({ role }, { merge: true }); console.log('written'); }
```
`merge: true` сохраняет `priestAccess` и прочие поля.

## 3. Другой admin / superadmin позже

Те же шаги: найти UID в Authentication → Users, создать/обновить `admins/{uid}` с `role: "admin"` или `"superadmin"`. Авторегистрации и самостоятельного повышения нет (Rules запрещают клиенту любую запись в `admins`; проверено в эмуляторе, в том числе для superadmin и резервных UID). **Дополнительному superadmin доступ в Cloudflare Access добавляется отдельно** (п. 5) — Firebase-роль его не открывает.

## 4. Снять роль

- Понизить: `role: "admin"` (или удалить поле `role`) — карточка и маршрут исчезнут после перезахода.
- Убрать админа целиком: удалить документ `admins/{uid}`. **Исключение — резервные `ADMIN_UIDS`:** они остаются `admin` (и управляют священниками) без документа; убрать их можно только правкой кода и Rules.
- Отдельно удалите почту из политики Cloudflare Access и (если задан) списка разрешённых email Reports Worker.

## 5. `VITE_ANALYTICS_REPORTS_URL` и Cloudflare Reports

- Публичный (не секретный) URL отдельной панели R05. Только `https://` (для локальной проверки допустим `http://localhost`), без логина/пароля в URL; иначе показывается «Панэль аналітыкі яшчэ не падключана». Страница `/admin/analytics` — заголовок, пояснение, кнопка «Адкрыць аналітыку» (`target="_blank" rel="noopener noreferrer"`); без iframe, без запросов к API панели из Vue, без токенов в URL и коде.
- Пример staging (закрыт Cloudflare Access, team `holy-bush-6f5a`, политика — только почта владельца): `https://mybrev-analytics-reports-staging.slovo-app.workers.dev/reports`. Значение для production **не прописано** и в build-пайплайны/Hosting не добавлялось; локально — `.env.local`, см. `.env.example`.
- **Firebase-вход не заменяет Cloudflare Access.** Панель открывает Cloudflare отдельным входом по почте из политики Access; Worker сам проверяет JWT Access. Пока нет SSO-интеграции, каждому новому superadmin доступ добавляется в Access вручную владельцем.
- Панель читает R05 (`/reports`, JSON/CSV). Контракты rollup, k=5, режимы `qa`/`live`, хранение, ingest и D1 не менялись.

## 6. Проверка за 60 секунд (для владельца)

1. Войдите обычным админом (документ без `role` или `role: admin`): в `/admin` **нет** карточки «Аналітыка»; адрес `/admin/analytics` возвращает на `/admin`.
2. После назначения себе `superadmin` (п. 2) войдите заново: карточка «Аналітыка» есть, «Доступ для святароў» тоже.
3. Нажмите карточку: страница «Аналітыка». Без `VITE_ANALYTICS_REPORTS_URL` — надпись «Панэль аналітыкі яшчэ не падключана».
4. Для локальной проверки укажите в `.env.local` staging-URL из п. 5 и перезапустите `npm run dev`: кнопка «Адкрыць аналітыку» открывает панель в новой вкладке; Cloudflare запросит вход по вашей почте.
5. F5 на `/admin/analytics` под superadmin остаётся на странице; в приватном окне без входа — редирект на форму входа.

## 7. Что проверено автоматически (локально)

- `node --test tests/admin-access.test.mjs` — роли, резервные UID, ошибки чтения, решения роутера, валидация URL, обвязка ссылки.
- `npm run test:rules` — Firestore Rules в эмуляторе (в т. ч. запрет записи в `admins/*` всем, неизвестная роль, superadmin и `managesPriests`).
- `npm run test:admin-roles-ui` — настоящий Vue/Router/Pinia + Auth и Firestore эмуляторы + Chrome: admin, legacy, superadmin, не-админ, аноним (без мигания контента), F5, состояния «подключено / не подключено»; скриншоты — `docs/superadmin-analytics-screens/`.

## 8. Блокеры и что требует решения владельца

- Реальные роли в production не назначены (п. 2 — ручная операция владельца).
- Reports Worker развёрнут на staging и закрыт Access, но данных нет и приём (`INGEST_ENABLED`) выключен; цифр в панели пока нет. Production URL панели, значение `VITE_ANALYTICS_REPORTS_URL` для production и добавление других superadmin в Cloudflare Access — отдельные решения владельца.
- Правила `firestore.rules` в этом PR меняются (роль `admin|superadmin`, `managesPriests` для superadmin): вступают в силу только после `firebase deploy --only firestore:rules`, который здесь не выполнялся. Старый клиент с новыми Rules и новый клиент со старыми Rules остаются совместимыми для admin; superadmin-карточка не требует Rules.
