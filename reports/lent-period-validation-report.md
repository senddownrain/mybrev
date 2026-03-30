# Lent Period Validation Report

Дата: 2026-03-30T21:00:45.551Z

Общий статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>

## 1) dayTemplates
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Правило: есть 4 недели псалтири (1..4), каждая с днями 1..7.
- Найдено документов: **28**
- Psalm weeks: **1, 2, 3, 4**
- Покрытие по дням:
  - week 1: [1, 2, 3, 4, 5, 6, 7]
  - week 2: [1, 2, 3, 4, 5, 6, 7]
  - week 3: [1, 2, 3, 4, 5, 6, 7]
  - week 4: [1, 2, 3, 4, 5, 6, 7]
- Проверенные поля (20):
- laudesHymn
- laudesPs1
- laudesPs2
- laudesPs3
- sext1Hymn
- sext1Ps1
- sext1Ps2
- sext1Ps3
- sext2Hymn
- sext2Ps1
- sext2Ps2
- sext2Ps3
- sext3Hymn
- sext3Ps1
- sext3Ps2
- sext3Ps3
- vesperHymn
- vesperPs1
- vesperPs2
- vesperPs3
- Только для воскресенья (3):
- vesper1Ps1
- vesper1Ps2
- vesper1Ps3
- Документы с незаполненными полями: **28**

## 2) completoriumTemplates
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Правило: по одному шаблону на каждый день недели (1..7).
- Найдено документов: **7**
- Найденные дни недели: **1, 2, 3, 4, 5, 6, 7**
- Отсутствующие дни недели: **нет**
- Дубликаты по дню недели: **0**
- Проверенные поля (11):
- _dayOfWeek
- _periodType
- compHymn
- compAnt1
- compAnt2
- compPs1
- compPs2
- compR
- compResp
- compAntS
- compPr
- Документы с незаполненными полями: **4**

## 3) readings
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Правило: покрыты недели 1..5 (все дни 1..7), плюс неделя 0: только 5/6/7 (чт/пт/сб после Пепельной среды).
- Покрытые недели: **0, 1, 2, 3, 4, 5**
- Пропущенные слоты (week/day): **1**

## 4) calendarMap
Статус: <span style="color:#d93025;font-weight:700">❌ FAIL</span>
- Правило покрытия: недели 1..5 (1..7), плюс неделя 0: 5/6/7.
- На неделе 0: `_psalmWeek = 4` и `templateRef` должен указывать на шаблон 4-й недели.
- Покрытые недели: **0, 1, 2, 3, 4, 5**
- Пропущенные слоты (week/day): **2**
- Поля, которые должны быть заполнены (22):
- officeOfReadingsVers
- officeOfReadingsR1
- officeOfReadingsR2
- officeOfReadingsPr
- laudesR
- laudesAntBen
- laudesInter
- laudesPr
- sext1Ant1
- sext1R
- sext2Ant1
- sext2R
- sext3Ant1
- sext3R
- vesperR
- vesperAntMag
- vesperInter
- vesperPr
- readingRef
- templateRef
- compRef
- _psalmWeek
- Дополнительно только для воскресенья (13):
- vesper1Ant1
- vesper1Ant2
- vesper1Ant3
- vesper1R
- vesper1AntMag
- vesper1Inter
- vesper1Pr
- vesperAnt1
- vesperAnt2
- vesperAnt3
- laudesAnt1
- laudesAnt2
- laudesAnt3
- Документы calendarMap с незаполненными полями: **38**
- Проблемы _psalmWeek на неделе 0: **4**
- Проблемы templateRef на неделе 0: **4**

## Детали ошибок

### dayTemplates: первые 20 проблем
```json
[
  {
    "id": "lent-psalmweek-1-day-1",
    "psalmWeek": 1,
    "dayOfWeek": 1,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-2",
    "psalmWeek": 1,
    "dayOfWeek": 2,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-3",
    "psalmWeek": 1,
    "dayOfWeek": 3,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-4",
    "psalmWeek": 1,
    "dayOfWeek": 4,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-5",
    "psalmWeek": 1,
    "dayOfWeek": 5,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-6",
    "psalmWeek": 1,
    "dayOfWeek": 6,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-1-day-7",
    "psalmWeek": 1,
    "dayOfWeek": 7,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-1",
    "psalmWeek": 2,
    "dayOfWeek": 1,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-2",
    "psalmWeek": 2,
    "dayOfWeek": 2,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-3",
    "psalmWeek": 2,
    "dayOfWeek": 3,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-4",
    "psalmWeek": 2,
    "dayOfWeek": 4,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-5",
    "psalmWeek": 2,
    "dayOfWeek": 5,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-6",
    "psalmWeek": 2,
    "dayOfWeek": 6,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-2-day-7",
    "psalmWeek": 2,
    "dayOfWeek": 7,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-1",
    "psalmWeek": 3,
    "dayOfWeek": 1,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-2",
    "psalmWeek": 3,
    "dayOfWeek": 2,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-3",
    "psalmWeek": 3,
    "dayOfWeek": 3,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-4",
    "psalmWeek": 3,
    "dayOfWeek": 4,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-5",
    "psalmWeek": 3,
    "dayOfWeek": 5,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  },
  {
    "id": "lent-psalmweek-3-day-6",
    "psalmWeek": 3,
    "dayOfWeek": 6,
    "missing": [
      "laudesHymn",
      "sext1Hymn",
      "sext2Hymn",
      "sext3Hymn",
      "vesperHymn"
    ]
  }
]
```

### completoriumTemplates: первые 20 проблем
```json
[
  {
    "id": "9FbR59GijeVp4dAv2Yf5",
    "dayOfWeek": 3,
    "missing": [
      "compAnt2",
      "compPs2"
    ]
  },
  {
    "id": "RyOG28iSKQnJdFoDfiBn",
    "dayOfWeek": 6,
    "missing": [
      "compAnt2",
      "compPs2"
    ]
  },
  {
    "id": "WnVxLo60UeQEs09dNeeI",
    "dayOfWeek": 5,
    "missing": [
      "compAnt2",
      "compPs2"
    ]
  },
  {
    "id": "viwa62JQUOKQXhfs0OLS",
    "dayOfWeek": 1,
    "missing": [
      "compAnt2",
      "compPs2"
    ]
  }
]
```

### readings: первые 50 пропусков
```json
[
  {
    "week": 1,
    "day": 4
  }
]
```

### calendarMap: первые 20 проблем полей
```json
[
  {
    "id": "0JhpVlKJkaSPz00q7MEt",
    "week": 5,
    "day": 4,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "2cy1hTULjn08JptcgyuA",
    "week": 5,
    "day": 1,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "vesper1Ant1",
      "vesper1Ant2",
      "vesper1Ant3",
      "vesper1R",
      "vesper1AntMag",
      "vesper1Inter",
      "vesper1Pr",
      "laudesAnt1",
      "laudesAnt2",
      "laudesAnt3"
    ]
  },
  {
    "id": "2nfHOJOor9vsNlraPfw4",
    "week": 1,
    "day": 4,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "readingRef"
    ]
  },
  {
    "id": "5V70pZjsh8Hte5r190jY",
    "week": 5,
    "day": 2,
    "missing": [
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1"
    ]
  },
  {
    "id": "7lNZNRtiMFphz4JVoqmj",
    "week": 1,
    "day": 1,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "vesper1Ant1",
      "vesper1Ant2",
      "vesper1Ant3",
      "vesper1R",
      "vesper1AntMag",
      "vesper1Inter",
      "vesper1Pr",
      "laudesAnt1",
      "laudesAnt2",
      "laudesAnt3"
    ]
  },
  {
    "id": "B9v8Qt5JWRCtv4u2roFu",
    "week": 2,
    "day": 3,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "FcSTHi8WgO4uKdXRRAl0",
    "week": 2,
    "day": 7,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1"
    ]
  },
  {
    "id": "FfJLI8eiidME7KAFnQdI",
    "week": 3,
    "day": 1,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "vesper1Ant1",
      "vesper1Ant2",
      "vesper1Ant3",
      "vesper1R",
      "vesper1AntMag",
      "vesper1Inter",
      "vesper1Pr",
      "laudesAnt1",
      "laudesAnt2",
      "laudesAnt3"
    ]
  },
  {
    "id": "GbqtJnbT1JeMK37StwiL",
    "week": 4,
    "day": 1,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "vesper1Ant1",
      "vesper1Ant2",
      "vesper1Ant3",
      "vesper1R",
      "vesper1AntMag",
      "vesper1Inter",
      "vesper1Pr",
      "laudesAnt1",
      "laudesAnt2",
      "laudesAnt3"
    ]
  },
  {
    "id": "IJmYrg26vQZLuNs3yOcV",
    "week": 5,
    "day": 5,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "NBy7G7WZGcTS4L1WQmsk",
    "week": 3,
    "day": 2,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "Q8QJwkFN0fcDdO18EZVX",
    "week": 5,
    "day": 6,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "QwmtchxogIlAOVhK3eUq",
    "week": 1,
    "day": 2,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "TGd0eef2QCB0c3rUxVtF",
    "week": 2,
    "day": 1,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "vesper1Ant1",
      "vesper1Ant2",
      "vesper1Ant3",
      "vesper1R",
      "vesper1AntMag",
      "vesper1Inter",
      "vesper1Pr",
      "laudesAnt1",
      "laudesAnt2",
      "laudesAnt3"
    ]
  },
  {
    "id": "THqqtYzbifUYSKwI0UHE",
    "week": 3,
    "day": 6,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "WLqMsSu44YBMlDapZhz1",
    "week": 0,
    "day": 5,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr",
      "readingRef",
      "templateRef"
    ]
  },
  {
    "id": "Xmh1nic1eSekdR2j2JOG",
    "week": 4,
    "day": 3,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "Yshjcao4T2akerx8m6Bk",
    "week": 1,
    "day": 5,
    "missing": [
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1"
    ]
  },
  {
    "id": "ZeVajiGf3rsBtb1t6Y2E",
    "week": 5,
    "day": 3,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1",
      "vesperPr"
    ]
  },
  {
    "id": "bGAUpojwhZvoT1D22D6r",
    "week": 3,
    "day": 7,
    "missing": [
      "officeOfReadingsVers",
      "officeOfReadingsPr",
      "sext1Ant1",
      "sext2Ant1",
      "sext3Ant1"
    ]
  }
]
```

### calendarMap: проблемы _psalmWeek на неделе 0
```json
[
  {
    "id": "WLqMsSu44YBMlDapZhz1",
    "week": 0,
    "day": 5,
    "actualPsalmWeek": "Чацвер пасля Папяльца"
  },
  {
    "id": "oruwN8Dch2yfhJWJgE2a",
    "week": 0,
    "day": 4,
    "actualPsalmWeek": "Папялец"
  },
  {
    "id": "pe2yGXq7zTxyBErCCgmB",
    "week": 0,
    "day": 7,
    "actualPsalmWeek": "Субота пасля Папяльца"
  },
  {
    "id": "zH3y4sisOCntB8F8os9q",
    "week": 0,
    "day": 6,
    "actualPsalmWeek": "Пятніца пасля Папяльца"
  }
]
```

### calendarMap: проблемы templateRef на неделе 0
```json
[
  {
    "id": "WLqMsSu44YBMlDapZhz1",
    "week": 0,
    "day": 5,
    "templateRefId": "",
    "templatePsalmWeek": null,
    "reason": "template-not-found"
  },
  {
    "id": "oruwN8Dch2yfhJWJgE2a",
    "week": 0,
    "day": 4,
    "templateRefId": "",
    "templatePsalmWeek": null,
    "reason": "template-not-found"
  },
  {
    "id": "pe2yGXq7zTxyBErCCgmB",
    "week": 0,
    "day": 7,
    "templateRefId": "",
    "templatePsalmWeek": null,
    "reason": "template-not-found"
  },
  {
    "id": "zH3y4sisOCntB8F8os9q",
    "week": 0,
    "day": 6,
    "templateRefId": "lent-psalmweek-1-day-6",
    "templatePsalmWeek": 1,
    "reason": "template-not-from-week-4"
  }
]
```

### calendarMap: первые 50 пропусков week/day
```json
[
  {
    "week": 1,
    "day": 6
  },
  {
    "week": 3,
    "day": 3
  }
]
```