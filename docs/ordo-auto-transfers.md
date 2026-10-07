# Ordo: аўтаматычныя пераносы як Year Overrides

Згенеравана `npm run ordo:materialize-transfers` (dry run) — не рэдагаваць уручную.

Гады: **2025–2035**, дыяцэзіі: minsk-mohilev, vitebsk, pinsk, grodno. Існуючыя выключэнні: snapshot backups/firestore-snapshot.

Engine вылічвае перанос (`src/utils/ordo/transfers.js`), вынік запісваецца ў `liturgicalYearOverrides`
як рэдагаваны запіс з provenance (`source: 'auto-transfer'`, `status: 'needs-review'`,
`originalDate`, `computedDate`, `effectiveDate`). Ручная праўка робіць `source: 'manual'`,
`status: 'confirmed'`; `computedDate` застаецца. Паўторны запуск нічога не дублюе, пацверджаныя
запісы не перазапісваюцца (`src/utils/ordo/transferOverrides.js`).

Дыяцэзіяльная ўрачыстасць пераносіцца толькі калі ранг пацверджаны календаром
(`src/data/ordo/transfer-rank-evidence.js`).

## Колькасць па выпадках

| Выпадак | Запісаў |
|---|---|
| A. Уласная ўрачыстасць дыяцэзіі (ранг пацверджаны календаром) | 2 |
| B. Св. Юзаф у Вялікім тыдні | 1 |
| C. Звеставанне Пана | 4 |
| D. Супадзенне дзвюх урачыстасцяў агульнага календара | 1 |
| Урачыстасць, якой перашкаджае дзень з большым першынством | 3 |

## План

| create | update | unchanged | keep-manual | stale |
|---|---|---|---|---|
| 11 | 0 | 0 | 0 | 0 |

## Запісы

| Год | Дзе | Празднаванне | Дата | Вылічана | Выпадак | Статус | Аперацыя |
|---|---|---|---|---|---|---|---|
| 2027 | уся Беларусь | `annunciation-lord` | 25.03.2027 | 05.04.2027 | annunciation | needs-review | create |
| 2027 | pinsk | `sv-andrei-bobola` | 16.05.2027 | 18.05.2027 | diocesan-solemnity | needs-review | create |
| 2028 | уся Беларусь | `sv-joseph` | 19.03.2028 | 20.03.2028 | impeded-solemnity | needs-review | create |
| 2029 | уся Беларусь | `annunciation-lord` | 25.03.2029 | 09.04.2029 | annunciation | needs-review | create |
| 2030 | уся Беларусь | `immaculate-conception` | 08.12.2030 | 09.12.2030 | impeded-solemnity | needs-review | create |
| 2032 | уся Беларусь | `annunciation-lord` | 25.03.2032 | 05.04.2032 | annunciation | needs-review | create |
| 2032 | pinsk | `sv-andrei-bobola` | 16.05.2032 | 18.05.2032 | diocesan-solemnity | needs-review | create |
| 2033 | уся Беларусь | `nativity-john-baptist` | 24.06.2033 | 25.06.2033 | coinciding-solemnities | needs-review | create |
| 2034 | уся Беларусь | `sv-joseph` | 19.03.2034 | 20.03.2034 | impeded-solemnity | needs-review | create |
| 2035 | уся Беларусь | `sv-joseph` | 19.03.2035 | 17.03.2035 | joseph-holy-week | needs-review | create |
| 2035 | уся Беларусь | `annunciation-lord` | 25.03.2035 | 02.04.2035 | annunciation | needs-review | create |
