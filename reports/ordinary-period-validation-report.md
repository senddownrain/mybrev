# Ordinary Period Validation Report

Дата: 2026-03-30T09:52:10.643Z

Общий статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>

## 1) dayTemplates
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Найдено документов: **28**
- Psalm weeks: **1, 2, 3, 4**
- Покрытие по дням:
  - week 1: [1, 2, 3, 4, 5, 6, 7]
  - week 2: [1, 2, 3, 4, 5, 6, 7]
  - week 3: [1, 2, 3, 4, 5, 6, 7]
  - week 4: [1, 2, 3, 4, 5, 6, 7]
- Проверенные поля (52):
- _dayOfWeek
- _periodType
- _psalmWeekNumber
- laudesHymn
- laudesAnt1
- laudesAnt2
- laudesAnt3
- laudesPs1
- laudesPs2
- laudesPs3
- laudesR
- laudesAntBen
- laudesInter
- laudesPr
- sext1Hymn
- sext1Ant1
- sext1Ant2
- sext1Ant3
- sext1Ps1
- sext1Ps2
- sext1Ps3
- sext1R
- sext1Pr
- sext2Hymn
- sext2Ant1
- sext2Ant2
- sext2Ant3
- sext2Ps1
- sext2Ps2
- sext2Ps3
- sext2R
- sext2Pr
- sext3Hymn
- sext3Ant1
- sext3Ant2
- sext3Ant3
- sext3Ps1
- sext3Ps2
- sext3Ps3
- sext3R
- sext3Pr
- vesperHymn
- vesperAnt1
- vesperAnt2
- vesperAnt3
- vesperPs1
- vesperPs2
- vesperPs3
- vesperR
- vesperAntMag
- vesperInter
- vesperPr
- Документы с незаполненными полями: **4**

## 2) completoriumTemplates
Статус: <span style="color:#0f9d58;font-weight:700">✅ PASS</span>
- Найдено документов: **7**
- Найденные дни недели: **1, 2, 3, 4, 5, 6, 7**
- Отсутствующие дни недели: **нет**
- Дубликаты по дню недели: **0**
- Проверенные поля (9):
- _dayOfWeek
- _periodType
- compHymn
- compAnt1
- compPs1
- compR
- compResp
- compAntS
- compPr
- Документы с незаполненными полями: **0**

## 3) readings
Статус: <span style="color:#0f9d58;font-weight:700">✅ PASS</span>
- Правило: покрытие всех 34 недель, исключения: **1 неделя / воскресенье** и **34 неделя / воскресенье**.
- Покрытые недели: **1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34**
- Пропущенные слоты (week/day) по правилу: **0**

## 4) calendarMap
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Правило покрытия: все 34 недели, исключения: **1 неделя / воскресенье** и **34 неделя / воскресенье**.
- Покрытые недели: **1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34**
- Пропущенные слоты (week/day): **4**
- Поля, которые должны быть заполнены (8):
- officeOfReadingsVers
- officeOfReadingsR1
- officeOfReadingsR2
- officeOfReadingsPr
- readingRef
- templateRef
- compRef
- _psalmWeek
- Документы calendarMap с незаполненными полями: **232**

## Детали ошибок

### dayTemplates: первые 20 проблем
```json
[
  {
    "id": "ordinary-psalmweek-1-day-1",
    "psalmWeek": 1,
    "dayOfWeek": 1,
    "missing": [
      "laudesAntBen",
      "vesperAntMag"
    ]
  },
  {
    "id": "ordinary-psalmweek-2-day-1",
    "psalmWeek": 2,
    "dayOfWeek": 1,
    "missing": [
      "laudesAntBen",
      "vesperAntMag"
    ]
  },
  {
    "id": "ordinary-psalmweek-3-day-1",
    "psalmWeek": 3,
    "dayOfWeek": 1,
    "missing": [
      "laudesAntBen",
      "vesperAntMag"
    ]
  },
  {
    "id": "ordinary-psalmweek-4-day-1",
    "psalmWeek": 4,
    "dayOfWeek": 1,
    "missing": [
      "laudesAntBen",
      "vesperAntMag"
    ]
  }
]
```

### completoriumTemplates: первые 20 проблем
```json
[]
```

### readings: первые 50 пропусков
```json
[]
```

### calendarMap: первые 20 проблем полей
```json
[
  {
    "id": "0RcgyimYC0AcwNEdUHh5",
    "week": 7,
    "day": 3,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "0jPRg5mA84C4jCpkVROb",
    "week": 3,
    "day": 4,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "0qTyadMPnazaqohNaN9i",
    "week": 13,
    "day": 1,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "1VqzNg6QHv86wDZB5gNZ",
    "week": 24,
    "day": 3,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "1Wb6LRzqElon9oHly0IR",
    "week": 12,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "2DR4OXHPcoV8jVp5MqGS",
    "week": 17,
    "day": 1,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "2ZKMLsxj853LsMjNUWGm",
    "week": 30,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "2i1iKixkCSmBdV3MVLvO",
    "week": 32,
    "day": 7,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "355EjmObeCuIqcUnrP1C",
    "week": 23,
    "day": 3,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "38KnwDmGJZMmtd2MYCi4",
    "week": 13,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "38TDODVDExkltLQRux60",
    "week": 15,
    "day": 1,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "3Fv0NyNzpPV3ATjgTwAc",
    "week": 30,
    "day": 1,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "3o8aDY56zAHjJaKn1MpJ",
    "week": 21,
    "day": 3,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "4XkCgjqMZOtzCOTQHKS1",
    "week": 6,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "4og198w2QjVpQthMXAo1",
    "week": 10,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "4pvXFTzaui1GvtAvelR4",
    "week": 14,
    "day": 3,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "4vn3MsmHcZcY2hRmm51M",
    "week": 1,
    "day": 5,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "5pdPvMpP20JwHi4gZgaf",
    "week": 23,
    "day": 1,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "5rGQBOcXggDEx7EzimgT",
    "week": 3,
    "day": 2,
    "missing": [
      "officeOfReadingsVers"
    ]
  },
  {
    "id": "5t3XwFvVszTvQXBfOWf2",
    "week": 32,
    "day": 5,
    "missing": [
      "officeOfReadingsVers"
    ]
  }
]
```

### calendarMap: первые 50 пропусков week/day
```json
[
  {
    "week": 8,
    "day": 5
  },
  {
    "week": 20,
    "day": 7
  },
  {
    "week": 24,
    "day": 2
  },
  {
    "week": 24,
    "day": 4
  }
]
```