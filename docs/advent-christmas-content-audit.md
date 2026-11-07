# Advent 17–24 і Christmas 25.12–12.01: аўдыт зместу

Згенеравана `npm run liturgy:audit` (2026-11-07), snapshot 2026-11-06T07:32:45.664Z. Гады 2025–2032, дыяцэзіі: minsk-mohilev, vitebsk, pinsk, grodno.
Крыніца: `flutter-bundle`. Гэта офлайн-праверка, не live-аўдыт Firestore.

Стан «пасля»: `liturgicalProperTexts` + рамонт temporal `days`; «да»: legacy fixed `days`.

| Статус | Дат×дыяцэзій |
|---|---|
| PASS | 864 |

## Па гадах

| Сезон | PASS | FIXED | NEEDS_REVIEW | MISSING |
|---|---|---|---|---|
| 2025/2026 | 108 | 0 | 0 | 0 |
| 2026/2027 | 108 | 0 | 0 | 0 |
| 2027/2028 | 108 | 0 | 0 | 0 |
| 2028/2029 | 108 | 0 | 0 | 0 |
| 2029/2030 | 108 | 0 | 0 | 0 |
| 2030/2031 | 108 | 0 | 0 | 0 |
| 2031/2032 | 108 | 0 | 0 | 0 |
| 2032/2033 | 108 | 0 | 0 | 0 |

## Паходжанне палёў Адвэнту (issue #200)

256 дат×дыяцэзій, 4084 праверак палёў; памылак: 0. Правяраюцца і тэкст, і дакумент/поле-крыніца; непустое поле з няправільнай крыніцы не праходзіць.

| Вечар 2026 | Нешпары | Поле | Крыніца | Статус |
|---|---|---|---|---|
| 2026-12-19 | I | vesperHymn | advent-w4-d1.vesper1Hymn | PASS |
| 2026-12-19 | I | vesperAnt1 | advent-w4-d1.vesper1Ant1 | PASS |
| 2026-12-19 | I | vesperAnt2 | advent-w4-d1.vesper1Ant2 | PASS |
| 2026-12-19 | I | vesperAnt3 | advent-w4-d1.vesper1Ant3 | PASS |
| 2026-12-19 | I | vesperPs1 | advent-w4-d1.vesper1Ps1 | PASS |
| 2026-12-19 | I | vesperPs2 | advent-w4-d1.vesper1Ps2 | PASS |
| 2026-12-19 | I | vesperPs3 | advent-w4-d1.vesper1Ps3 | PASS |
| 2026-12-19 | I | vesperR | advent-w4-d1.vesper1R | PASS |
| 2026-12-19 | I | vesperAntMag | advent-19-12.vesperAntMag | PASS |
| 2026-12-19 | I | vesperInter | advent-w4-d1.vesper1Inter | PASS |
| 2026-12-19 | I | vesperPr | advent-w4-d1.vesper1Pr | PASS |
| 2026-12-20 | II | vesperHymn | advent-w4-d1.vesperHymn | PASS |
| 2026-12-20 | II | vesperAnt1 | advent-w4-d1.vesperAnt1 | PASS |
| 2026-12-20 | II | vesperAnt2 | advent-w4-d1.vesperAnt2 | PASS |
| 2026-12-20 | II | vesperAnt3 | advent-w4-d1.vesperAnt3 | PASS |
| 2026-12-20 | II | vesperPs1 | advent-w4-d1.vesperPs1 | PASS |
| 2026-12-20 | II | vesperPs2 | advent-w4-d1.vesperPs2 | PASS |
| 2026-12-20 | II | vesperPs3 | advent-w4-d1.vesperPs3 | PASS |
| 2026-12-20 | II | vesperR | advent-w4-d1.vesperR | PASS |
| 2026-12-20 | II | vesperAntMag | advent-20-12.vesperAntMag | PASS |
| 2026-12-20 | II | vesperInter | advent-w4-d1.vesperInter | PASS |
| 2026-12-20 | II | vesperPr | advent-w4-d1.vesperPr | PASS |
| 2026-12-21 | weekday | vesperHymn | advent-21-12.vesperHymn | PASS |
| 2026-12-21 | weekday | vesperAnt1 | advent-w4-d2.vesperAnt1 | PASS |
| 2026-12-21 | weekday | vesperAnt2 | advent-w4-d2.vesperAnt2 | PASS |
| 2026-12-21 | weekday | vesperAnt3 | advent-w4-d2.vesperAnt3 | PASS |
| 2026-12-21 | weekday | vesperPs1 | ordinary-w4-d2.vesperPs1 | PASS |
| 2026-12-21 | weekday | vesperPs2 | ordinary-w4-d2.vesperPs2 | PASS |
| 2026-12-21 | weekday | vesperPs3 | ordinary-w4-d2.vesperPs3 | PASS |
| 2026-12-21 | weekday | vesperR | advent-21-12.vesperR | PASS |
| 2026-12-21 | weekday | vesperAntMag | advent-21-12.vesperAntMag | PASS |
| 2026-12-21 | weekday | vesperInter | advent-21-12.vesperInter | PASS |
| 2026-12-21 | weekday | vesperPr | advent-21-12.vesperPr | PASS |
| 2026-12-23 | weekday | vesperHymn | advent-23-12.vesperHymn | PASS |
| 2026-12-23 | weekday | vesperAnt1 | advent-23-12.wednesday | PASS |
| 2026-12-23 | weekday | vesperAnt2 | advent-23-12.wednesday | PASS |
| 2026-12-23 | weekday | vesperAnt3 | advent-23-12.wednesday | PASS |
| 2026-12-23 | weekday | vesperPs1 | ordinary-w4-d4.vesperPs1 | PASS |
| 2026-12-23 | weekday | vesperPs2 | ordinary-w4-d4.vesperPs2 | PASS |
| 2026-12-23 | weekday | vesperPs3 | ordinary-w4-d4.vesperPs3 | PASS |
| 2026-12-23 | weekday | vesperR | advent-23-12.vesperR | PASS |
| 2026-12-23 | weekday | vesperAntMag | advent-23-12.vesperAntMag | PASS |
| 2026-12-23 | weekday | vesperInter | advent-23-12.vesperInter | PASS |
| 2026-12-23 | weekday | vesperPr | advent-23-12.vesperPr | PASS |

Усе дыяцэзіі правяраюцца асобна. Захаваны per-field вынік — [advent-provenance.json.gz](evidence/issue-200/advent-provenance.json.gz); поўны лакальны справаздачны JSON — `reports/advent-christmas-content-audit.json`; крыніцы і dry-run — [advent-vespers-issue-200.md](advent-vespers-issue-200.md).

## Што было выпраўлена (FIXED)

_няма_

## NEEDS_REVIEW / MISSING

_няма_

## Як чытаць

- 17–24.12: будні — уласныя тэксты даты + актуальны псалтыр; нядзелі — уласны нядзельны Office. Антыфоны Benedictus/Magnificat па даце захоўваюцца; у I Нешпарах O-антыфона адпавядае грамадзянскаму вечару. Успаміны — толькі коммемарацыя.
- 24.12.2028: днём IV нядзеля, вечарам I Нешпары Нараджэння Пана (GNLYC 33, 39).
- 25–28.12, 1.01, 6.01: Office — празднаванне; дакумент даты — дзень актавы, з якога дабіраецца sparse Proper.
- Да 12.01: дакументы `christmas-DD-01` ужываюцца, пакуль ідзе перыяд Нараджэння (мяжа перыяду ≠ акно захоўвання).

