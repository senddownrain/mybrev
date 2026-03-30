# Спецификация проверки полноты данных (`readings` + `days`)

> Цель: согласовать стабильный контракт и правила валидации, чтобы далее на его основе сгенерировать автоматический скрипт/тест и регулярно считать «чего не хватает» в базе.

## 1) Область проверки

Проверяются две коллекции Firestore:

- `readings` — чтения.
- `days` — литургические часы (канонический источник литургического содержания).

Проверка должна поддерживать три типа поиска:

1. По периоду: `_periodType` + `_periodWeekNumber` + `_dayOfWeek`.
2. По фиксированной дате: `_date` в формате `DD.MM` (допускается ввод `D.M`, при сравнении нормализуется в `DD.MM`).
3. По подвижному празднику: `_feast`.

---

## 2) Нормализация и общие правила

## 2.1. Нормализация ключей

- `_periodType`: сравнивается в lowercase.
- `_periodWeekNumber`: числовое значение (`1..N`).
- `_dayOfWeek`: `1..7`, где `1 = воскресенье`, `7 = суббота`.
- `_date`: приводится к `DD.MM`.
- `_feast`: сравнивается в lowercase.

## 2.2. Служебные константы

### Типы периодов

```js
advent | christmas | ordinary | lent | easter | holyweek
```

### Дни недели

```js
1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday
```

### Канонический набор подвижных праздников (`_feast`)

```js
holyfamily
buptismofthelord
trinity
christking
heartofjesus
heartofmary
christthehighpriest
ash
eastersunday
pentecost
palmsunday
corpuschristi
ascension
```

---

## 3) Data contract: `readings`

Коллекция `readings` поддерживается в текущем формате.

### 3.1. Обязательные поля

- `_date`
- `_feast`
- `_periodType`
- `_periodWeekNumber`
- `_dayOfWeek`
- `cycle`
- `title`
- `text`
- `place`
- `rank`
- `createdAt`
- `updatedAt`

> Примечание: для конкретной записи может использоваться один из ключей идентификации (period/date/feast), но в контракте перечислен полный набор поддерживаемых полей.

### 3.2. Что считается «нет чтения»

Запись считается неполной/отсутствующей, если:

- `text` пустой, или
- `text` содержит заглушку вроде `чтения пока нету` (в любом регистре), или
- `text` техническая заглушка `чтения`.

---

## 4) Data contract: `days`

Коллекция `days` — канонический источник литургического содержания.

### 4.1. Обязательные идентификаторы

- `_dayOfWeek`
- `_periodType`
- `_periodWeekNumber`
- `_date`
- `_feast`

### 4.2. Обязательные метаданные

- `_psalmWeek`
- `_dayName`
- `_weekDay`
- `_weekNum`
- `_feastName`
- `_feastType`
- `allowedAlleluia`
- `feastComment`

### 4.3. Обязательные блоки контента

- Invitatorium
- Office of Readings
- Laudes
- Daytime Prayer
- Vesper
- Vesper I (`vesper1*`)
- Completorium

Практически эти блоки проверяются через набор `DAY_EDITOR_FIELDS` (поля для конкретных элементов каждого часа).

### 4.4. Специальное правило для `feastComment`

- `feastComment` допускается **только** у праздничных дней.
- День считается праздничным, если заполнен `_feast` или `_feastType` входит в: `solemnity | feast | memorial`.
- Если `feastComment` заполнен у непраздничного дня — это ошибка аудита.

---

## 5) Правила покрытия по периодам (ожидаемые ключи period/day)

## 5.1. Ordinary

- 34 недели.
- Исключения по воскресеньям:
  - Воскресенье 1-й недели связано с `buptismofthelord`.
  - Воскресенье 34-й недели связано с `christking`.

## 5.2. Lent

- Всего 6 недель, где 6-я неделя фактически переход к Holy Week.
- Есть «нулевая» часть от Пепельной среды (`ash`) до 1-го воскресенья поста.
- Воскресенье 6-й недели: `palmsunday`.

## 5.3. Holy Week

- Отдельный период на одну неделю.

## 5.4. Easter

- 7 недель.
- Воскресенье 1-й недели: `eastersunday`.
- После субботы 7-й недели ближайшее воскресенье: `pentecost`.

## 5.5. Advent

- 4 недели от 1-го воскресенья Адвента до 4-го воскресенья Адвента.
- Интервал 17.12–24.12 хранится по `_date` и имеет приоритет над period-записями.

## 5.6. Christmas

- Период хранится по `_date`.
- Диапазон 25.12–12.01 — все дни должны быть в `_date`.
- 25.12 — Рождество (`_date`).
- Первое воскресенье после 25.12: `holyfamily`.
- Первое воскресенье после 06.01: `buptismofthelord`.

---

## 6) Фиксированные праздники

- Базовый справочник фиксированных праздников ведется по `DD.MM`.
- Допускаются несколько записей на одну дату (разный ранг/епархия).
- Для проверки полноты это не ошибка дубля; ошибка — отсутствие требуемого покрытия по дате/контенту.
- Канонический набор обязательных дат вынесен в `CANONICAL_FIXED_CALENDAR_DATES`.
- Если на дату есть несколько записей, аудит проверяет каждую запись на наличие названия и ранга:
  - `readings`: `title` + поле `rank` (значение `rank` может быть пустым, если так задано в календаре),
  - `days`: `_feastName` + поле `_feastType` (значение может быть пустым, если так задано в календаре).

---

## 7) Алгоритм проверки (план для будущего скрипта)

## 7.1. Входные данные

- Все документы `readings`.
- Все документы `days`.
- Литургический контекст дат на целевой год (`periodType`, `periodWeek`, `dayOfWeek`, dynamic feasts).

## 7.2. Выход

Отчёт в трех срезах для каждой коллекции:

- `dynamic` (по `_feast`)
- `date` (по `_date`)
- `period` (по `_periodType/_periodWeekNumber/_dayOfWeek`)

Для каждого среза:

- `existing[]` — что найдено и валидно.
- `missing[]` — чего нет или что невалидно.

## 7.3. Проверка `readings`

1. **Dynamic feasts**: для каждого `_feast` из канонического списка должна быть запись с непустым `text`.
2. **Fixed dates**: для каждой даты из `CANONICAL_FIXED_CALENDAR_DATES` должен быть минимум один документ с валидным `text`.
   - Если документов несколько, у каждого должны быть: непустой `title` и наличие поля `rank`.
3. **Period keys**: ожидаемый набор `(periodType, week, day)` рассчитывается календарной логикой года; для каждого ключа должна быть запись с валидным `text`.

## 7.4. Проверка `days`

1. **Dynamic feasts**: для каждого `_feast` из канонического списка должен быть документ.
2. **Fixed dates**: для каждой даты из `CANONICAL_FIXED_CALENDAR_DATES` должен быть документ в `days`.
   - Если документов несколько, у каждого должны быть: непустой `_feastName` и наличие поля `_feastType`.
3. **Period keys**: для каждого ожидаемого `(periodType, week, day)` должен быть документ.
4. **Content completeness**: для каждого документа `days` проверяется заполненность обязательных полей метаданных и контент-блоков (`DAY_EDITOR_FIELDS`, включая `vesper1*` и `comp*`).
5. **feastComment rule**: `feastComment` не должен быть заполнен у непраздничных дней.

## 7.5. Правило приоритетов для выбора источника на дату

При выдаче контента на конкретную календарную дату приоритет:

1. `_date` (фиксированная/спец-дата),
2. `_feast` (подвижный праздник),
3. period key (`_periodType + _periodWeekNumber + _dayOfWeek`).

---

## 8) Формат постоянной структуры результатов (рекомендуемый)

```ts
interface AuditBucketItem {
  key: string;
  type: 'dynamic' | 'date' | 'period';
  title: string;
  details: string[];
  identity: {
    _feast?: string;
    _date?: string; // DD.MM
    _periodType?: string;
    _periodWeekNumber?: number;
    _dayOfWeek?: number;
  };
  status: 'ok' | 'missing' | 'placeholder' | 'invalid';
  collection: 'readings' | 'days';
}

interface AuditReport {
  generatedAt: string; // ISO
  year: number;
  readings: {
    existing: AuditBucketItem[];
    missing: AuditBucketItem[];
  };
  days: {
    existing: AuditBucketItem[];
    missing: AuditBucketItem[];
  };
  summary: {
    readingsMissingTotal: number;
    daysMissingTotal: number;
  };
}
```

Эта структура фиксируется как «долгоживущий контракт отчета», чтобы UI, CLI и автотест использовали один и тот же формат.

---

## 9) Реализация в проекте

Базовый этап уже реализован:

1. Добавлены pure-функции аудита fixed dates в `src/utils/liturgicalAudit.js`.
2. Добавлен CLI-скрипт `npm run audit:cli -- --readings <file> --days <file>`.
3. Добавлен автотест `npm run test:audit` и подключение в CI.

Дальше расширяем до полного yearly-аудита:

- генератор expected coverage на год (period + dynamic),
- унифицированная сериализация полного `AuditReport`,
- синхронизация правил между UI/CLI/CI.
