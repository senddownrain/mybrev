# Контент приложения: bundle и манифест версий

Flutter-приложение (ibreviarybyapp) поставляется с полным каноническим
контентом и обновляет его по манифесту версий. Архитектура и замеры — в
`ibreviarybyapp/docs/data-loading-architecture.md`.

Коллекции: `days`, `readings`, `liturgicalTemplates`, `invitatoriums`,
`completoriums`, `prayers`, `prayerCategories`, `songs`
(`scripts/content/lib/app-content.mjs` → `APP_CONTENT_COLLECTIONS`).

## После любой правки контента в Firestore

Импорт, миграция, правка в админке — затем:

```bash
npm run content:manifest              # dry-run: какие коллекции изменились
npm run content:manifest -- --apply   # публикует contentManifest/*
```

`contentManifest/current` — digest, число документов и версия каждой
коллекции; `contentManifest/<collection>` — хеш и размер каждого документа.
Пишутся только документы `contentManifest/*`; контент только читается
(~2.2 тыс. чтений). Пока манифест не перепубликован, приложения правку не
получат: скачанный документ не совпадёт с хешем манифеста, и обновление будет
отклонено целиком (текущие тексты остаются).

## Перед релизом приложения

```bash
npm run db:backup -- --output backups/firestore-snapshot --collection days …   # свежий snapshot
npm run content:app-bundle -- --snapshot backups/firestore-snapshot \
  --snapshot backups/firestore-snapshot-static --out ../ibreviarybyapp/assets/content
```

Сборка bundle читает только локальные snapshot (AGENTS.md). Дата bundle —
самая ранняя дата использованных snapshot: обновление, скачанное после неё,
новее bundle; скачанное до неё — вытесняется новым bundle.

## Хеш документа

sha256 (16 hex) канонического JSON (ключи отсортированы) хранимой формы
документа (Timestamp → мс), без `updatedAt`, `importedAt`, `parsedAt`,
`miniSavedAt`. Тот же алгоритм в Dart (`documentHash`), сверено на всех
документах. Не менять одну сторону без другой.
