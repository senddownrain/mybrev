# Публикация пакета Адвэнт/Нараджэнне — после отдельного одобрения владельца

Ничего из этого не выполнено. Статус и вопросы — `AUDIT_STATUS.md`.

## Готовые артефакты

- Web PR ветки `fix/advent-christmas-final-20261128` (включает коммиты #331).
- Flutter PR той же ветки (включает #153). Старые #331 / #153 после мержа новых закрыть, отдельно не мержить.
- Манифест: `reports/liturgy/advent-christmas-2026/manifest.json` — 24 документа, 50 полей, SHA-256 патча и отката.
- Патч с полными текстами **не в git**, на машине владельца:
  `~/Documents/GitHub/senddownrain/audit-advent-christmas/patches/data/final-2026-11-28/`
  - `patch.private.json` — `18333c16c89b21caa526f52e25d0fb876496702c5c4c68eede25e714addfa7f0`
  - `rollback.private.json` — `0d89ebab7d0240c862ec2ded8f5a2274b29a6091a7df37e8089526ae49060023`
  - `blocked-editor.private.json` — гимн св. Андрэя, не применять без редактора.
  - сборщик: `audit-advent-christmas/tools/build-final-patch.py`.

## Порядок

Данные совместимы со старыми клиентами (замена строк в существующих полях, календарь — по номеру revision),
поэтому сначала данные, затем код. Мерж в `main` сам Hosting не разворачивает.

1. Перед записью — проверка предусловий (24 чтения, 0 записей), из корня mybrev, `P` — папка патча:

```bash
node scripts/liturgy/apply-field-patch.mjs --patch $P/patch.private.json --live --service-account <ключ ibreviaryby>
```

Ожидается `documents: 24, fields: 50, conflicts: []`. Любой конфликт — стоп: пересобрать патч по новым данным и показать diff.
Базой был бандл, а не живой Firestore, поэтому конфликт возможен.

2. Применение: одна транзакция, 48 чтений + 24 записи; резервная копия и повторное чтение внутри скрипта.

```bash
node scripts/liturgy/apply-field-patch.mjs --patch $P/patch.private.json --apply --confirm 18333c16c89b21caa526f52e25d0fb876496702c5c4c68eede25e714addfa7f0 --backup <папка вне git> --service-account <ключ>
```

Ожидается `mode: applied, readbackMismatches: []`.

3. Манифест приложений (OTA). Сначала оценить чтения: команда читает все коллекции контента, а лимит Spark — 50 000 в сутки.
   Порядок и вердикты — `docs/app-content-distribution.md`.

```bash
npm run content:manifest
```

Только при вердикте `SAFE CONTENT PATCH` и ожидаемом diff:

```bash
npm run content:manifest -- --apply
```

4. Смержить Web PR (CI зелёный), запустить workflow `Deploy Web to Firebase Hosting`:
   `approved_sha` = SHA вершины main, `target` = `hosting` (не `firestore-rules`).
   `CONTENT_REVISION` в PR уже поднят; если данные изменятся после деплоя — `npm run content:version:bump` и повторный деплой.
5. Flutter: смержить PR. Исправления Dart (†, ADV-03/09, 10, 12) дойдут **только с новым релизом** Play/TestFlight
   (отдельное одобрение). Обновление базы новый Dart-код не доставляет.

## Проверка после публикации

- 09.12: будзень + св. Хуана Дыега по выбору (4 диоцезии).
- 08.12 дневные часы: три псалма, над первым — рубрика замены.
- 20.12 дневные часы: Рым 13 / 1 Тэс 3 / 2 Тэс 1.
- 04.01 Нешпары: «Слова сталася целам, * аллелюя, аллелюя».
- 02.01 и 07.01 дневные часы: нет адвентских антифонов.

## Откат

```bash
node scripts/liturgy/apply-field-patch.mjs --patch $P/rollback.private.json --apply --confirm 0d89ebab7d0240c862ec2ded8f5a2274b29a6091a7df37e8089526ae49060023 --backup <папка> --service-account <ключ>
```

Календарь откатывается вперёд: поля святого прежние, `revision` = 8 (меньший номер клиенты не примут).
После отката снова опубликовать манифест; код откатывать revert-коммитом, учитывая, что в его bundled-календаре revision 7.
