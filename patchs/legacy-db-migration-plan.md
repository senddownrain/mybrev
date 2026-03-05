# План миграции старой БД (`src/json`) в `days`

## 1) Что в бэкапе

- Формат: экспорт phpMyAdmin, где в начале файла служебный комментарий, затем JSON-массив.
- Центральная таблица: `Bridge` — одна строка = один календарный день.
- Размер: **2809** записей (и 2809 уникальных `Bridge_DayId`), диапазон лет **2017..2026**.
- Все тексты лежат в справочниках (`UTR_*`, `GCH_*`, `MPD_*`, `NESH_*`, `KAMP_*`, `Zakl_*`, `Svyat`), а в `Bridge` хранятся ID ссылок на них.

> Автоматический отчет по структуре: `patchs/json/legacy-db-analysis-report.json`.

## 2) Как маппить в нашу сущность литургического дня (`days`)

Ниже соответствие полей из старой схемы к текущим полям `DAY_EDITOR_FIELDS`.

### Метаданные дня

- `Bridge_DayId` (`d.m.Y`) → `_date` (`DD.MM`) + (для doc id: `YYYY-MM-DD`)
- `Bridge_DayName` → `_weekDay`
- `Bridge_Week` → `_weekNum` (как строка, если не пусто)
- `Day` → `_dayName`
- `Svyata` → `_feastName`
- `Uspamin` + `Svyat_Text` → `feastComment`
- `Alleluia` (`1/0`) → `allowedAlleluia` (`true/false`)

### Заклік (Invitatorium)

- `Zakl_Ant.Zakl_Ant_Text` → `invitatoriumAnt`
- `Zakl_PS.Zakl_PS_Text1..6` → `invitatoriumPs1..6`

### Гадзіна чытанняў

- `GCH_Gimn_Text` → `officeOfReadingsHymn`
- `GCH_Ant_Text1..3` → `officeOfReadingsAnt1..3`
- `GCH_PS_Text1..3` → `officeOfReadingsPs1..3`
- `GCH_Versh_Text` → `officeOfReadingsVers`
- `GCH_CH_1_Text` → `officeOfReadingsR1`
- `GCH_CH_2_Text` → `officeOfReadingsR2`
- `GCH_Tabe_Text` → `officeOfReadingsTeDeum`
- `GCH_Mal_Text` / fallback `UTR_Mal_Text` при `Bridge.GCH_Mal = -1` → `officeOfReadingsPr`

### Ютрань (Laudes)

- `UTR_Gimn_Text` → `laudesHymn`
- `UTR_Ant_Text1..3` → `laudesAnt1..3`
- `UTR_PS_Text1..3` → `laudesPs1..3`
- `UTR_Chyt_Text` → `laudesR`
- `UTR_Ant_Zakh_Text` → `laudesAntBen`
- `UTR_Prosby_Text` → `laudesInter`
- `UTR_Mal_Text` → `laudesPr`

### Тры малітвы ўдзень (Sext)

- `MPD_*_1` → `sext1*`
- `MPD_*_2` → `sext2*`
- `MPD_*_3` → `sext3*`

Точные соответствия:
- `MPD_Gimn_1/2/3_Text` → `sext1Hymn`, `sext2Hymn`, `sext3Hymn`
- `MPD_Ant_1/2/3_Text1..3` → `sext{1|2|3}Ant1..3`
- `MPD_PS_1_Text1..3` (таблица общая для 1/2/3) → `sext{1|2|3}Ps1..3`
- `MPD_Chyt_1/2/3_Text` → `sext{1|2|3}R`
- `MPD_Mal_1/2/3_Text` / fallback `UTR_Mal_Text` при `-1` → `sext{1|2|3}Pr`

### Нешпары (Vesper)

- `NESH_Gimn_Text` → `vesperHymn`
- `NESH_Ant_Text1..3` → `vesperAnt1..3`
- `NESH_PS_Text1..3` → `vesperPs1..3`
- `NESH_Chyt_Text` → `vesperR`
- `NESH_Ant_M_Text` → `vesperAntMag`
- `NESH_Prosby_Text` → `vesperInter`
- `NESH_Mal_Text` / fallback `UTR_Mal_Text` при `-1` → `vesperPr`

### Камплета (Completorium)

- `KAMP_Gimn_Text` → `compHymn`
- `KAMP_Ant_Text1..2` → `compAnt1..2`
- `KAMP_PS_Text1..2` → `compPs1..2`
- `KAMP_Chyt_Text` → `compR`
- `KAMP_Resp_Text` → `compResp`
- `KAMP_Ant_S_Text` → `compAntS`
- `KAMP_Mal_Text` → `compPr`
- `KAMP_Ant_M_Text` → `compAntM`

## 3) Спец-правила из старого PHP (обязательно сохранить)

1. `-1` в молитвах (`GCH_Mal`, `MPD_Mal_*`, `NESH_Mal`) означает: брать текст из `UTR_Mal`.
2. Для `MPD_Ant_2/3` были `coalesce` на `MPD_Ant_1` (если 2/3 пустые, брать антифоны из 1).
3. Для `MPD_Gimn_2/3` при пустом значении брать `MPD_Gimn_1`.
4. `Svyat` — это дополнительный хвост к верхнему описанию праздника (добавляется к `Uspamin`).

## 4) Что делать дальше (миграция)

1. Пройтись по `Bridge`.
2. Для каждой строки сделать lookup по ID в соответствующих таблицах.
3. Собрать нормализованный объект `day` в нашей схеме.
4. Нормализовать `_date` в `DD.MM`, пустые строки в `null`, `Alleluia` в boolean.
5. Сохранить в промежуточный JSON для ручной проверки, затем импорт в Firestore `oldDays`.
   - Для `_periodType`/`_periodWeekNumber` сначала пытаемся разобрать поле `Day` (напр. `VІІ велікодны тыдзень` → `easter` + `7`), потом fallback к `Bridge_Period`/`Bridge_Week`.

## 5) Инструмент анализа

Добавлен скрипт: `patchs/legacy-json-migration-analysis.mjs`

Запуск:

```bash
node patchs/legacy-json-migration-analysis.mjs
```

Он формирует `patchs/json/legacy-db-analysis-report.json` со сводкой таблиц/колонок и проверкой связей `Bridge -> справочники`.


## 6) Готовый скрипт миграции в `oldDays`

Добавлен скрипт: `patchs/migrate-legacy-json-to-olddays.mjs`

```bash
# 1) Собрать промежуточный JSON для ручной проверки
node patchs/migrate-legacy-json-to-olddays.mjs

# 2) (Опционально) сразу импортировать в Firestore collection oldDays
node patchs/migrate-legacy-json-to-olddays.mjs --write
```

По умолчанию промежуточный файл создается в `patchs/json/oldDays-migration-preview.json`.
