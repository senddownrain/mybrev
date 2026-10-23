# Матрица: платформа × регион → что разрешено

Дата: 2026-10-17. Это не юридическое заключение. «Network allowed» не выставлено ни в одной ячейке: **сетевая передача аналитики заблокирована везде** до закрытия D-01…D-09 (`analytics-owner-decisions.md`). Регион по умолчанию `UNKNOWN` (D-04 = «региона нет»); определение `BY` по часовому поясу или языку не обещается.

Статусы: **LOCAL-ONLY** — только локальный буфер в тестовых сборках (D-10 = B); **BLOCKED** — отправка запрещена; **N/A** — нет такой функции.

| Платформа | Регион | Локально (тестовая сборка) | Сеть | Причина блока и что нужно для снятия |
|---|---|---|---|---|
| Web (PWA/браузер) | BY | LOCAL-ONLY | **BLOCKED** | Закон 99-З: согласие должно быть «свободным, однозначным, информированным» (ст. 5); если категория «религиозные убеждения» применима (ст. 1, 8), обработка без согласия запрещена (ст. 8 п. 1); передача за рубеж только в страны с надлежащей защитой или с информированным согласием (ст. 9). Нужны: D-01 (заключение), D-02, D-03, D-05, D-06 |
| Web | OTHER | LOCAL-ONLY | **BLOCKED** | GDPR/ePrivacy: ст. 5(3) ePrivacy — доступ к хранилищу устройства требует согласия, кроме strictly necessary; особые категории (ст. 9 GDPR) при религиозной практике. «OTHER» неоднороден (EEA/UK/остальные); одна галочка не покрывает страны. Нужны D-01, D-04, D-05 |
| Web | UNKNOWN | LOCAL-ONLY | **BLOCKED** | Регион неизвестен ⇒ применяем самое строгое из возможных; до заключения отправка запрещена |
| Android | BY | LOCAL-ONLY (internal / closed testing) | **BLOCKED** | как Web/BY + Google Play Data safety: данные «transmitted off device» считаются collection; форма обязательна для closed/open/production, internal testing освобождён (источник ниже). Нужны D-01…D-03, D-05, D-06, D-09 |
| Android | OTHER | LOCAL-ONLY | **BLOCKED** | как Web/OTHER + Data safety + User Data policy |
| Android | UNKNOWN | LOCAL-ONLY | **BLOCKED** | то же |
| iOS | BY | LOCAL-ONLY (TestFlight/Simulator) | **BLOCKED** | Apple 5.1.1(ii): согласие нужно даже для данных, «anonymous at the time of or immediately following collection», и должен быть простой отзыв; плюс закон 99-З. Нужны D-01…D-03, D-05, D-06, D-09 и реализация согласия |
| iOS | OTHER | LOCAL-ONLY | **BLOCKED** | то же + GDPR |
| iOS | UNKNOWN | LOCAL-ONLY | **BLOCKED** | то же |

## Что разрешено уже сейчас (LOCAL-ONLY)

- Веб: `VITE_ANALYTICS_LOCAL=true` только в тестовой сборке; буфер `localStorage` ≤ 64 КиБ / 14 суток; транспорта нет (`ANALYTICS_NETWORK_DEFAULT = false`, тест «no analytics module contains a network call»).
- Flutter: `--dart-define=ANALYTICS_LOCAL=true` только в тестовых сборках; Hive-box `analytics_local_v1`; в `codemagic.yaml` и релизном workflow флага нет, значит в TestFlight/Play-сборках аналитика выключена.
- ATT: аналитика контракта не связывает данные с данными других компаний и не используется для рекламы, значит ATT-запрос по определению Apple не требуется (определение «tracking»: связывание данных приложения с данными других компаний для таргетированной рекламы или измерения рекламы, либо передача брокерам данных). Это **не** отменяет требование согласия по 5.1.1(ii).

## Первичные источники (проверены 2026-10-17)

| Источник | Что подтверждено | Определённость |
|---|---|---|
| Apple App Review Guidelines, 5.1.1(ii), 5.1.2: https://developer.apple.com/app-store/review/guidelines/ | цитата 5.1.1(ii) о согласии и отзыве; 5.1.2 о ATT; дата ревизии на странице не показана | высокая (текст страницы) |
| Apple, tracking definition: https://developer.apple.com/app-store/user-privacy-and-data-use/ | определение tracking, что не tracking; first-party analytics отдельно не описана | высокая |
| Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469 | «collection» = передача с устройства; обработка только на устройстве раскрытию не подлежит; privacy policy обязательна; internal testing освобождён, closed/open/production — нет; дата изменений на странице — 5.12.2023 | высокая |
| Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ | Free: 100 000 запросов/сутки, 10 мс CPU на HTTP-запрос, 50 subrequests; страница обновлена 12.10.2026 | высокая |
| Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/ | Free: 5 млн строк чтения/сутки, 100 000 строк записи/сутки (индексы добавляют записи), 5 ГБ; при превышении запросы останавливаются | высокая |
| Закон РБ 99-З, официальный текст pravo.by: https://pravo.by/document/?guid=12551&p0=H12100099 (PDF `https://pravo.by/upload/docs/op/H12100099_1620939600.pdf`) | ст. 1 (специальные персональные данные включают сведения о религиозных убеждениях), ст. 5 (согласие), ст. 8 (специальные данные, исключения, в т. ч. религиозные организации в отношении своих членов), ст. 9 (трансграничная передача), ст. 10 (право отзыва) | высокая для текста; **применимость к агрегатам с IP и объём исключений — не определена, нужен специалист** |
| GDPR, EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679 | преамбулы 26 и 30 (идентифицируемость, онлайн-идентификаторы) получены; **тексты ст. 4(1) и ст. 9 в этой сессии не получены дословно** | средняя; номера статей известны, дословность NOT CONFIRMED |
| ePrivacy 2002/58/EC, EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219 | ст. 5(3): согласие на хранение/доступ к информации на устройстве, исключение strictly necessary | высокая |
| НЦЗПД https://cpd.by | **недоступен (HTTP 503)**: требования регистрации/уведомления операторов, перечень стран с надлежащим уровнем защиты — **NOT CONFIRMED**; в тексте закона 99-З обязанности регистрации оператора найти не удалось | NOT CONFIRMED |
