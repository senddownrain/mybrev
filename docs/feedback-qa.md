# Обратная связь: QA

Окружение: локально (workerd `wrangler dev --local` + local D1, Firebase Auth/Firestore emulators с реальными `firestore.rules`, Chrome, iOS Simulator `fb-iphone`, Android AVD `MyBrev_Test_API34`). Cloudflare, staging и production **не затрагивались**.

## Автоматические проверки

| Проверка | Команда | Результат |
|---|---|---|
| Worker: валидация, 401/403, JWT (подделка/просрочка/чужой aud,iss/alg none), ACL, смена категории, смена роли без перелогина, конкуренция, дубликаты, SQL/XSS, CORS, лимиты, fail-closed, retention | `npm run test:feedback` | PASS (17) |
| E2E: Web 390 px → workerd/D1 → inbox двух ролей, ошибка сети без потери текста, отзыв роли | `npm run test:feedback-e2e` (JDK 21) | PASS (8 проверок) |
| Регрессия Web | `npm test` | PASS (1094 pass, 0 fail, 12 skipped) |
| Web сборка | `npm run build` (с фиктивными `VITE_FIREBASE_*`) | PASS |
| Flutter unit/widget (форма, контекст, сервис, ошибки, повтор по кнопке) | `flutter test test/feedback` | PASS (7) |
| Flutter `analyze` | `flutter analyze` | PASS по ошибкам; info-замечания стиля (в новых файлах — curly_braces/null-aware; в репозитории их уже 27) |
| iOS Simulator (iPhone 16, `fb-iphone`): форма, контекст, отправка в локальный Worker, строка в D1 с `platform=ios` | вручную | PASS |
| Android AVD API 34 (`MyBrev_Test_API34`): `flutter build apk --debug`, форма, контекст, отправка в локальный Worker, строка в D1 с `platform=android` | вручную | PASS (тёмная тема) |
| `npm run lint` | не запускался (`--fix` меняет файлы); eslint запущен точечно на новых файлах без `--fix` | PASS |
| Staging / production | — | NOT TESTED (нет разрешения на Cloudflare) |
| Реальная подпись Google JWKS | — | NOT TESTED (тесты с локальными RSA-ключами; реальный токен проверяется только в staging) |

## Android
`flutter build apk --debug` собран (первые две попытки упали по таймауту скачивания kotlin-compiler-embeddable с maven central — сеть; третья прошла). Для эмулятора: `adb reverse tcp:8791 tcp:8791`, `--dart-define=FEEDBACK_API_URL=http://127.0.0.1:8791` (debug разрешает http на loopback; production — только https). Скриншоты: `docs/feedback-evidence/flutter-android-*.png`, `flutter-ios-success.png`. Автоматизированного Android/iOS UI-теста нет — это ручной прогон через adb/simctl.

## 6 проверок для владельца (после staging)

1. **Web:** Налады → Зваротная сувязь → «Памылка ў тэксце» → `ТЭСТ WEB ТЭКСТ` → Адправіць. Ожидается «Дзякуй» и номер.
2. **Android:** молитва → меню ⋯ → «Паведаміць пра памылку»; кантэкст (название, ID) подставлен; `ТЭСТ ANDROID ТЭКСТ`.
3. **iOS:** то же, категория «Тэхнічная праблема», `ТЭСТ IOS ТЭХНІКА`.
4. **Обычный админ:** вход → /admin → «Звароты па тэкстах»: только 2 текстовых обращения; нет email, фильтра категории, технического; прямой запрос технического ID → 404.
5. **Superadmin:** «Усе звароты»: все три, email виден; смена категории технического на «Памылка ў тэксце» — у админа появляется; возврат — исчезает.
6. **Негатив:** без входа `GET /api/admin/feedback` → 401; при выключенной сети текст не пропадает, повтор только кнопкой.

## Не сделано / долг
Скриншот-вложения (вторая очередь, кнопки нет); Turnstile; управление ролями из UI (роли правятся в Firestore `admins/{uid}`); защита «последнего superadmin» — только процедурная; отозванный в Auth пользователь сохраняет валидный ID-токен до 1 ч (роль при этом всё равно читается из Firestore).
