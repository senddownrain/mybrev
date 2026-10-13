# Final phase: independent Definition of Done re-check

Generated 2026-10-13T11:35:33Z on branch `audit/dod-recheck` (base `8b02183`). Machine-readable twin: `reports/final-phase-dod-recheck.json`.

Method: production Firestore `ibreviaryby` was exported read-only (REST) as snapshot `20261013110158860` (2026-10-13T11:01:58.860Z, 11 collections, 3573 documents) and compared field by field with (a) the bundle sources (`.html` through `scripts/liturgy/lib/lh-catholic-by.mjs`, `.docx` through unzip/XML, `.pdf` through pdftotext), (b) 23 Catholic.by Lectionary pages re-fetched on 2026-10-13 and parsed with the repository parser, (c) the repository code and tests. Nothing was written to Firestore, no manifest was published, no `--apply` was run.

**Result: 38 PASS, 2 PARTIAL, 0 FAIL, 0 NOT_VERIFIED** (of 40). Both PARTIAL items (32, 33) and one more defect found outside the 40 items (F1, §19 memorial prayer) are fixed in the repository on this branch; the production data still needs the authorized publish described at the end.

| # | Spec | Item | Status | Short evidence |
|---|---|---|---|---|
| 1 | §4, §14, §16-18 | Mass readings support several reading sets per celebration/date | **PASS** | Model: src/utils/massReadingSets.js (MASS_READINGS_SCHEMA=1; defaultSetId :121; validateMassReadings :295); additive field `readings.massReadings` (docs/readings-mass-... |
| 2 | §5.1, §5.2 | 15.08 and 29.06: vigil + day, default day | **PASS** | readings/15-08-assumption-blessed-virgin-mary#1a138fc7325daa97: sets [vigil "Св. Імша ў вігілію", day "Св. Імша ўдзень"], default=day, flatSet=day, source catholic.by ... |
| 3 | §5.1, §21 | Label «Св. Імша ў вігілію», never «Імша навячэр'я» | **PASS** | grep of the whole production snapshot (11 collections, 3573 documents): 0 occurrences of «навячэр»; labels of vigil sets are exactly «Св. Імша ў вігілію» (15.08, 29.06... |
| 4 | §5.3, §5.4 | 15.07 Bonaventure and 11.08 Clare follow Catholic.by | **PASS** | readings/15-07-sv-bonaventure#9802e7249b792d1d: Еф 3,14-19; Пс 119(118),9-14; Мц 23,9b.10b; Мц 23,8-12 = page urachystasci/uspaminy/4948 (EXACT). |
| 5 | §5.5, §5.6 | Cathedral dedication and Lahišyn/Trakai are reference-only, no fake text | **PASS** | 01-05-pinsk / 04-12-grodno / 10-10-vitebsk cathedral-dedication: one set `mass`, referenceOnly=true, citations Нм 8,2-4а.5-6.8-10; Пс 119(118),129-130.132-133.135.144;... |
| 6 | §5.7 | Palm Sunday: procession + Mass + cycles + role markup | **PASS** | readings/feast-palmsunday#dbd7d87db2e8a6c9: set procession [gospel A/B/C], set mass [reading1, psalm, reading2, alleluia, 5 rubrics (incl. role legend), Passion A/B/C]... |
| 7 | §5.8 | Holy Thursday: two Mass contexts | **PASS** | readings/holyweek-w1-d5#8cae8474d5a5cf68: sets chrism (post/5100) and evening (tryduum/5103, default). parseLectionaryPage(live catholic.by page fetched 2026-10-13) ==... |
| 8 | §5.9 | Good Friday: role-marked Passion kept | **PASS** | readings/holyweek-w1-d6#430e1bf56d01a648: Passion by John, 28 blocks, roles narrator/christ/crowd/speaker, source rubric kept. parseLectionaryPage(live catholic.by pag... |
| 9 | §5.10 | Easter Vigil is not flattened | **PASS** | readings/holyweek-w1-d7--vigil#5d8f9a17e6850ec0: ordered sections rubric, 7 x (reading + psalm), rubric, epistle, psalm (alleluia), Gospel A/B/C. The page has no colle... |
| 10 | §5.11 | Easter Sunday day Mass imported | **PASS** | readings/feast-eastersunday#cf9cc692fb4d1a57: set day (tryduum/5106) with reading1, psalm, reading2, sequence, acclamation, Gospel. parseLectionaryPage(live catholic.b... |
| 11 | §5.12 | Pentecost: morning / vigil / day separated, evening default | **PASS** | readings/easter-w7-d7#8a033e387e5079cc: sets morning (velikodny/5167) + vigil (velikodny/5172, default); readings/feast-pentecost#084be736a4e0321a: day (velikodny/5171... |
| 12 | §5.13 | Ascension: shared readings + cycle Gospel | **PASS** | readings/feast-ascension#7f90979731cc018a: one set, reading1/psalm/reading2/acclamation shared, Gospel A/B/C. parseLectionaryPage(live catholic.by page fetched 2026-10... |
| 13 | §5.14 | 24.12 morning/evening separated, evening default | **PASS** | readings/advent-24-12#71b82cc87e8b9184: sets morning (advent/4604) + vigil (urachystasci/5023, default). parseLectionaryPage(live catholic.by page fetched 2026-10-13) ... |
| 14 | §5.15 | 25.12 three sets, day default | **PASS** | readings/25-12-naradzhenne-pana#0eb560ed50b1b531: sets night, dawn, day with source labels, default=day. parseLectionaryPage(live catholic.by page fetched 2026-10-13) ... |
| 15 | §5.16 | Sequence is a first-class section | **PASS** | kind `sequence` in the model (src/utils/massReadingSets.js SECTION_KINDS), editor field (src/components/admin/MassReadingSetsEditor.vue), renderer; present in feast-ea... |
| 16 | §5.17 | Andrew Bobola: readings and Hours from the supplied sources | **PASS** | Readings readings/16-05-sv-andrei-bobola#d8e9e81ec140655e: EXACT vs catholic.by uspaminy/4942. |
| 17 | §8.1 | ordinary-w21-d3 / d4 Office of Readings R1/R2 | **PASS** | days/ordinary-w21-d3#3cfd30b21a96565a vs bundle "…Аўторак - 25 жніўня 2026.html": 61/61 text fields EXACT (R1 Ер 1,1-19 + Рэспансорый Ер 1,5ab; R2 Гамілія Яна Хрызасто... |
| 18 | §8.2 | lent-w5-d1 restored | **PASS** | days/lent-w5-d1#320f53e6c5e00f3d (created in production) vs bundle "…`lent-w5-d1.html" (V Sunday of Lent, 22.03.2026): 55/55 text fields EXACT, raw HTML identical for ... |
| 19 | §7.3 | Cyril and Methodius Vespers hymn | **PASS** | liturgicalProperTexts/14-02-sv-cyril-methodius#de5fc5a5dcce39c4: vesperHymn «Браты, абраныя Богам…» is plain-text EXACT to the bundle Lauds hymn of "…14.02.html" (514 ... |
| 20 | §7.1 | Apostles Common: laudesHymn is a structured Proper reference | **PASS** | liturgicalTemplates/apostles has no literal laudesHymn; _fieldRules.laudesHymn = {source:"proper"} (liturgicalTemplates/apostles#c5f51632258e49bc); all 10 apostle Prop... |
| 21 | §7.2 | Matthias hymn: same-day-field reference | **PASS** | liturgicalProperTexts/14-05-sv-matthias#bd6cdcc17f2214fa: _fieldRules.laudesHymn = {ref:"officeOfReadingsHymn"}; own officeOfReadingsHymn present (720 chars). |
| 22 | §7.4 | 03.01 Holy Name of Jesus: temporal day, no fake Common | **PASS** | liturgicalProperTexts/03-01-holy-name-of-jesus#caf0555c98301bc8: _templates=[], _templatesConfirmed, _officeSource="current-day"; liturgicalCelebrations/holy-name-of-j... |
| 23 | §7.5-7.7 | Juan Diego holy-men; Dismas holy-men; Jadwiga holy-women | **PASS** | liturgicalProperTexts/09-12-sv-juan-diego#55f2591a83d056cf _templates [holy-men]; liturgicalProperTexts/26-03-sv-dismas-pinsk#10474d35506826cd [holy-men] (+ liturgical... |
| 24 | §9 | 12 unexplained legacy differences (02.11 / 18.11 / 28.12) | **PASS** | Fresh audit (npm run liturgy:audit against the 2026-10-13 snapshot, before and after my commits): legacyComparison.unexplained = 0; 13 reconciled rows with a source ve... |
| 25 | §10, §25 | ordinary-w9-d4: clean source (not 07.06.2023) | **PASS** | days/ordinary-w9-d4#40e12abb0cc1d488 vesper* (11 fields): EXACT to the clean Wednesday IX-week page 06.06.2018 (patchs/sources/lh-catholic-by/2018-06-06.html, header "... |
| 26 | §11.1 | All Souls on Sunday: Hours of the Sunday, Mass All Souls, 3 reading sets | **PASS** | 2025-11-02 (Sunday) through the production-fed pipeline (scripts/liturgy/lib/snapshot-content.mjs): sources.office = temporal:ordinary-w31-d1 (sunday), sources.mass = ... |
| 27 | §11.2 | Immaculate Heart + obligatory memorial: two memorials, no weekday | **PASS** | 2026-06-13 (all dioceses): options = [immaculate-heart (primary), sv-anthony-padua]; suppressed = temporal weekday + saturday-blessed-virgin-mary; rule concurrent-obli... |
| 28 | §11.3 | Mary, Mother of the Church + obligatory memorial: both | **PASS** | 2028-06-05 (Monday after Pentecost, Boniface): options = [mary-mother-church (first), sv-boniface]; no weekday option. |
| 29 | §11.4 | Christ the High Priest collision keeps both (provisional) | **PASS** | Rule christ-high-priest-collision-both-options (status provisional): src/utils/ordo/display.js:141; covered by a synthetic collision (28.05.2026 + a test feast). A sca... |
| 30 | §12 | Transfers computed and materialized as editable Year Overrides | **PASS** | Production liturgicalYearOverrides: 15 documents = 11 `auto-transfer-*` (source auto-transfer, status needs-review, originalDate / computedDate / effectiveDate, transf... |
| 31 | §12 | Manual override keeps computedDate and controls effectiveDate | **PASS** | src/utils/ordo/transferOverrides.js:266 confirmTransferOverride (source manual, status confirmed, computedDate kept, effectiveDate = admin date); planTransferOverrides... |
| 32 | §13 | Grodno/Pinsk general notes re-audited and meaningful notes restored | **PARTIAL** | Production liturgicalOrdoNotes: 1337 documents; Grodno 112 and Pinsk 14 general notes (basis general-notes); semantic audit 0 violations in 92,036 shown notes; no cler... |
| 33 | §13.1 | Lectionary / Hours volumes moved to structured metadata above the notes | **PARTIAL** | Mechanism OK: category `books` notes carry books {lectionaryVolume, hoursVolume}; src/utils/ordo/notes.js booksFromNotes / isBooksNote; resolveLiturgicalDate returns d... |
| 34 | §14 | Reading editor edits the structured model (roles, sequence, variants) | **PASS** | src/views/admin/ParsedReadingEditor.vue (preview toggle line 50, «Адмяніць», changed-field list, sanitizeSetsDraft) + src/components/admin/MassReadingSetsEditor.vue: s... |
| 35 | §15 | Hours editor keeps the sparse Proper and structured refs | **PASS** | src/views/admin/DayEditor.vue: sparse notice (own / from Common / from current day / structured ref, lines 29-46), field rules listed, save writes only the difference ... |
| 36 | §20 | App-content / export validators updated | **PASS** | scripts/content/lib/app-content.mjs: DOCUMENT_RULES for readings (validateMassReadings, _massReadingsRef), liturgicalProperTexts (_schema 2), liturgicalYearOverrides (... |
| 37 | §21 | Automated tests pass | **PASS** | npm test on the final branch: 767 tests, 759 pass, 1 fail, 7 skipped (skips are emulator/browser/real-source tests: mass-v4 real dry-run ×2, prayer collection source f... |
| 38 | §22 | New deficit report generated from current data | **PASS** | docs/liturgical-data-deficits.md (generated 2026-10-13 by npm run liturgy:audit; P0 0, P1 0, P2 19). A fresh run against the 2026-10-13 snapshot after my commits is co... |
| 39 | §22, §26 | Final residual reference-only / missing list produced | **PASS** | docs/liturgical-data-deficits.md READINGS MISSING: 10 rows (3 cathedral dedications, Lahišyn, Trakai, Częstochowa, Dung-Lac, Anthony of Padua, Kolbe, Stanisław Kostka)... |
| 40 | §1, §14, §26 | No invented text, no annual static runtime calendar, no localChurch | **PASS** | Every text compared against a bundle/live source in this audit is EXACT (apart from the documented app conventions: abbreviated responsory repeats «Н. Больш.», short c... |

## Evidence per item

### 1. Mass readings support several reading sets per celebration/date — PASS

- Model: src/utils/massReadingSets.js (MASS_READINGS_SCHEMA=1; defaultSetId :121; validateMassReadings :295); additive field `readings.massReadings` (docs/readings-mass-sets.md); app-content schema `DOCUMENT_SCHEMAS.readings.massReadings` scripts/content/lib/app-content.mjs:25.
- Production: 24 `readings` documents carry massReadings, 31 non-reference sets + 5 reference-only documents. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT (31/31 sets EXACT; 23/23 live pages byte-identical to tests/fixtures/catholicby/*).
- validateCollection("readings", 822 production documents) = 0 errors (scripts/content/lib/app-content.mjs DOCUMENT_RULES).
- Tests: `every special Lectionary page parses and passes the semantic validation` (tests/readings-mass-sets.test.mjs:43, pass); `app-content contract: canonical set documents are valid, broken sets refused` (tests/readings-mass-sets.test.mjs:267, pass)

### 2. 15.08 and 29.06: vigil + day, default day — PASS

- readings/15-08-assumption-blessed-virgin-mary#1a138fc7325daa97: sets [vigil "Св. Імша ў вігілію", day "Св. Імша ўдзень"], default=day, flatSet=day, source catholic.by urachystasci/5043. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- readings/29-06-sv-peter-paul-apostles#b4a1bc3ebf3c18d5: sets [vigil, day], default=day, source urachystasci/5041. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Same pattern also on 24.06 (found by the Lectionary audit): readings/24-06-nativity-john-baptist#20d8e4274855c9d0
- Tests: `15.08 Assumption: exactly vigil + day, default day, source labels` (tests/readings-mass-sets.test.mjs:52, pass); `29.06 Peter and Paul: exactly vigil + day, default day` (tests/readings-mass-sets.test.mjs:66, pass)

### 3. Label «Св. Імша ў вігілію», never «Імша навячэр'я» — PASS

- grep of the whole production snapshot (11 collections, 3573 documents): 0 occurrences of «навячэр»; labels of vigil sets are exactly «Св. Імша ў вігілію» (15.08, 29.06, 24.06, 24.12, Pentecost Saturday).
- Validator rejects the label: src/utils/massReadingSets.js:314.
- Tests: `15.08 Assumption: exactly vigil + day, default day, source labels` (tests/readings-mass-sets.test.mjs:52, pass)

### 4. 15.07 Bonaventure and 11.08 Clare follow Catholic.by — PASS

- readings/15-07-sv-bonaventure#9802e7249b792d1d: Еф 3,14-19; Пс 119(118),9-14; Мц 23,9b.10b; Мц 23,8-12 = page urachystasci/uspaminy/4948 (EXACT).
- readings/11-08-sv-clare#fce09708e8217930: Флп 3,8-14; Пс 16(15); Мц 5,3; Мц 19,27-29 = page uspaminy/4957 (EXACT).
- Note: the live Catholic.by page itself prints Мц 23, 8-12 for Bonaventure, so the spec hint "do not leave the old Mt23" does not apply; production equals the source.
- Tests: `Bonaventure, Clare and Andrew Bobola follow the Catholic.by pages` (tests/readings-mass-sets.test.mjs:214, pass)

### 5. Cathedral dedication and Lahišyn/Trakai are reference-only, no fake text — PASS

- 01-05-pinsk / 04-12-grodno / 10-10-vitebsk cathedral-dedication: one set `mass`, referenceOnly=true, citations Нм 8,2-4а.5-6.8-10; Пс 119(118),129-130.132-133.135.144; Эф 2,19-22; Мц 16,13-19, no text field anywhere (checked section by section and in the flat projection).
- 22-08-our-lady-lahishyn-pinsk / 05-07-our-lady-trakai-grodno: reference-only, Саф 3,14-18 (alt Рым 12,9-16аb), Лк 1,39-59.
- Minsk 16.03 keeps its full text from its own Catholic.by page (uspaminy sviaty/17068, EXACT) - a confirmed source, not an invention.
- Observation: the flat (old-app) projection of Lahišyn/Trakai drops the "або Рым 12,9-16аb" alternative (kept in the structured set).
- Tests: `reference-only sets: citations only, rendered as such, invisible to old apps` (tests/readings-mass-sets.test.mjs:193, pass)

### 6. Palm Sunday: procession + Mass + cycles + role markup — PASS

- readings/feast-palmsunday#dbd7d87db2e8a6c9: set procession [gospel A/B/C], set mass [reading1, psalm, reading2, alleluia, 5 rubrics (incl. role legend), Passion A/B/C]; shared readings stored once; Passion blocks with runs narrator/christ/speaker/crowd (A 13 blocks, B 11, C 12). parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `Palm Sunday: shared readings once, cycle-specific procession Gospel and Mass Passion` (tests/readings-mass-sets.test.mjs:93, pass)

### 7. Holy Thursday: two Mass contexts — PASS

- readings/holyweek-w1-d5#8cae8474d5a5cf68: sets chrism (post/5100) and evening (tryduum/5103, default). parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `Holy Thursday: two Mass contexts, default the evening Mass of the Lord’s Supper` (tests/readings-mass-sets.test.mjs:116, pass)

### 8. Good Friday: role-marked Passion kept — PASS

- readings/holyweek-w1-d6#430e1bf56d01a648: Passion by John, 28 blocks, roles narrator/christ/crowd/speaker, source rubric kept. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `Good Friday: one set, role-marked Passion preserved with its rubrics` (tests/readings-mass-sets.test.mjs:124, pass)

### 9. Easter Vigil is not flattened — PASS

- readings/holyweek-w1-d7--vigil#5d8f9a17e6850ec0: ordered sections rubric, 7 x (reading + psalm), rubric, epistle, psalm (alleluia), Gospel A/B/C. The page has no collects between readings; the only rubrics (start, before the epistle «Чытаецца калекта і гімн Хвала на вышынях Богу…») are kept. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `Easter Vigil: ordered multi-reading structure, rubrics and cycle Gospels` (tests/readings-mass-sets.test.mjs:136, pass)

### 10. Easter Sunday day Mass imported — PASS

- readings/feast-eastersunday#cf9cc692fb4d1a57: set day (tryduum/5106) with reading1, psalm, reading2, sequence, acclamation, Gospel. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `sequence is a first-class section: parse, project, edit round trip` (tests/readings-mass-sets.test.mjs:177, pass)

### 11. Pentecost: morning / vigil / day separated, evening default — PASS

- readings/easter-w7-d7#8a033e387e5079cc: sets morning (velikodny/5167) + vigil (velikodny/5172, default); readings/feast-pentecost#084be736a4e0321a: day (velikodny/5171) with sequence. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- old.catholic.by 103542 (named in the spec) parses to exactly the same set as the modern catholic.by page 5172 (checked), so the modern URL is the provenance.
- Tests: `Pentecost: Saturday morning / evening vigil on Saturday, Sunday day Mass separate` (tests/readings-mass-sets.test.mjs:154, pass); `Pentecost Saturday taken by the Visitation (31.05.2031): the feast Mass AND the evening Vigil Mass of Pentecost, vigil default` (tests/liturgical-decisions.test.mjs:18, pass)

### 12. Ascension: shared readings + cycle Gospel — PASS

- readings/feast-ascension#7f90979731cc018a: one set, reading1/psalm/reading2/acclamation shared, Gospel A/B/C. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `Ascension: shared readings + A/B/C Gospel, no three identical documents` (tests/readings-mass-sets.test.mjs:170, pass)

### 13. 24.12 morning/evening separated, evening default — PASS

- readings/advent-24-12#71b82cc87e8b9184: sets morning (advent/4604) + vigil (urachystasci/5023, default). parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `24.12: morning + evening (vigil) sets, default evening; legacy groups prefer the evening too` (tests/readings-mass-sets.test.mjs:80, pass); `engine: on a Sunday 24 December the Christmas Vigil Mass is a lookup of the option (evening default)` (tests/lectionary-audit.test.mjs:339, pass)

### 14. 25.12 three sets, day default — PASS

- readings/25-12-naradzhenne-pana#0eb560ed50b1b531: sets night, dawn, day with source labels, default=day. parseLectionaryPage(live catholic.by page fetched 2026-10-13) == production readings.massReadings set, field by field (sections, citations, text, roles, rubrics): EXACT
- Tests: `25.12 Christmas: exactly 3 sets with source labels, default day` (tests/readings-mass-sets.test.mjs:73, pass)

### 15. Sequence is a first-class section — PASS

- kind `sequence` in the model (src/utils/massReadingSets.js SECTION_KINDS), editor field (src/components/admin/MassReadingSetsEditor.vue), renderer; present in feast-eastersunday and feast-pentecost, absent where the page has none.
- Tests: `sequence is a first-class section: parse, project, edit round trip` (tests/readings-mass-sets.test.mjs:177, pass); `Pentecost sequence is extracted without losing a word` (tests/reading-structural-cleanup.test.mjs:15, pass)

### 16. Andrew Bobola: readings and Hours from the supplied sources — PASS

- Readings readings/16-05-sv-andrei-bobola#d8e9e81ec140655e: EXACT vs catholic.by uspaminy/4942.
- Hours: bundle "Літургія гадзінаў андрэй баболя.html" (16.05.2025) vs production Proper texts - officeOfReadingsHymn, R1, R2 (own, with responsories), laudesHymn, laudesAntBen, laudesPr, vesperHymn, vesperAntMag, vesperPr = EXACT in all four documents: liturgicalProperTexts/16-05-sv-andrei-bobola#667f3b14e194421b, liturgicalProperTexts/16-05-sv-andrei-bobola-pinsk#b9a33a3de8c2f07c, liturgicalProperTexts/16-05-sv-andrei-bobola-minsk-mohilev--minsk-mohilev#7921f1a9216f9028, liturgicalProperTexts/16-05-sv-andrei-bobola-minsk-mohilev--vitebsk#d4e41b6814381e9f.
- Tests: `§5.17 St Andrew Bobola: own R2 and hymns from the 16.05.2025 source survive every choice` (tests/liturgy-hours-final-phase.test.mjs:195, pass)

### 17. ordinary-w21-d3 / d4 Office of Readings R1/R2 — PASS

- days/ordinary-w21-d3#3cfd30b21a96565a vs bundle "…Аўторак - 25 жніўня 2026.html": 61/61 text fields EXACT (R1 Ер 1,1-19 + Рэспансорый Ер 1,5ab; R2 Гамілія Яна Хрызастома + Рэспансорый Тоб 12) - IDs are right: d3 = Tuesday, d4 = Wednesday.
- days/ordinary-w21-d4#cea55a25236db6ba vs bundle "…Серада - 30 жніўня 2023.html": 61/61 EXACT (R1 Ер 2,1-13, R2 Настаўленні св. Калумбана + responsory). The checked-in copies patchs/sources/lh-catholic-by/2026-08-25.html and 2023-08-30.html parse to the same fields as the bundle files (0 differences).
- Tests: `§8.1 ordinary-w21-d3 (Tuesday) and -d4 (Wednesday): R1/R2 with responsories from the source` (tests/liturgy-hours-final-phase.test.mjs:159, pass)

### 18. lent-w5-d1 restored — PASS

- days/lent-w5-d1#320f53e6c5e00f3d (created in production) vs bundle "…`lent-w5-d1.html" (V Sunday of Lent, 22.03.2026): 55/55 text fields EXACT, raw HTML identical for every field; _periodType lent, week 5, day 1, name «V нядзеля Вялікага посту», no Te Deum, laudesAntBen has the A/B/C Gospel antiphons.
- Compared with lent-w4-d1 only empty placeholder keys (sext*Ant2/3, vesper1*) are absent; no text hole.
- Tests: `§8.2 lent-w5-d1 is created complete enough for every hour` (tests/liturgy-hours-final-phase.test.mjs:182, pass)

### 19. Cyril and Methodius Vespers hymn — PASS

- liturgicalProperTexts/14-02-sv-cyril-methodius#de5fc5a5dcce39c4: vesperHymn «Браты, абраныя Богам…» is plain-text EXACT to the bundle Lauds hymn of "…14.02.html" (514 chars); no «Гімн, с. 1279» anywhere in the 11 production collections.
- Note: on 14.02.2026 the evening of the source page is I Vespers of Sunday (own heading), so only the Lauds hymn is source text; the owner confirmed Vespers = Lauds in a clean year.
- Tests: `§7.3 Cyril & Methodius: Vespers hymn is the confirmed full Lauds hymn` (tests/liturgy-hours-final-phase.test.mjs:96, pass)

### 20. Apostles Common: laudesHymn is a structured Proper reference — PASS

- liturgicalTemplates/apostles has no literal laudesHymn; _fieldRules.laudesHymn = {source:"proper"} (liturgicalTemplates/apostles#c5f51632258e49bc); all 10 apostle Propers have their own laudesHymn or a rule. Production scan: no «Гімн з Уласных тэкстаў» string left in any collection.
- Tests: `§7.1 apostles Common laudesHymn is a structured Proper ref, not a literal instruction` (tests/liturgy-hours-final-phase.test.mjs:68, pass)

### 21. Matthias hymn: same-day-field reference — PASS

- liturgicalProperTexts/14-05-sv-matthias#bd6cdcc17f2214fa: _fieldRules.laudesHymn = {ref:"officeOfReadingsHymn"}; own officeOfReadingsHymn present (720 chars).
- Observation: the legacy fixed document days/14-05-sv-matthias (kept for released Flutter apps, not read by the web runtime) still contains «Гімн з Гадзіны чытанняў»; the same holds for 4 more legacy days (agnes ×2, gregory-great ×2).
- Tests: `§7.2 Matthias: Lauds hymn = the Office of Readings hymn (same-day field)` (tests/liturgy-hours-final-phase.test.mjs:87, pass)

### 22. 03.01 Holy Name of Jesus: temporal day, no fake Common — PASS

- liturgicalProperTexts/03-01-holy-name-of-jesus#caf0555c98301bc8: _templates=[], _templatesConfirmed, _officeSource="current-day"; liturgicalCelebrations/holy-name-of-jesus templates=[].
- Tests: `§7.4 Holy Name (03.01): no Common, the Office is the Christmas weekday` (tests/liturgy-hours-final-phase.test.mjs:104, pass)

### 23. Juan Diego holy-men; Dismas holy-men; Jadwiga holy-women — PASS

- liturgicalProperTexts/09-12-sv-juan-diego#55f2591a83d056cf _templates [holy-men]; liturgicalProperTexts/26-03-sv-dismas-pinsk#10474d35506826cd [holy-men] (+ liturgicalDioceseOverrides pinsk--sv-dismas); liturgicalProperTexts/08-06-sv-jadwiga-queen-grodno#383f63d45444bd64 [holy-women] (+ grodno--sv-jadwiga-queen). All _templatesConfirmed.
- 30 other Propers keep `_templatesInferred` (automatic logic, as decided in §7.8/§23).
- Tests: `§7.5–7.7 confirmed Commons: Juan Diego, Dismas (holy men), Jadwiga (holy women)` (tests/liturgy-hours-final-phase.test.mjs:116, pass)

### 24. 12 unexplained legacy differences (02.11 / 18.11 / 28.12) — PASS

- Fresh audit (npm run liturgy:audit against the 2026-10-13 snapshot, before and after my commits): legacyComparison.unexplained = 0; 13 reconciled rows with a source verdict.
- 02.11 (bundle "…2 ноября.html", 02.11.2026): the assembled option fixed-all-faithful-departed equals the source in laudesAnt3, laudesPr, sext1Pr, sext2Pr, sext3Pr, vesperPr (6/6 EXACT); legacy had an appended alternative antiphon and a «Малітва» label. Proper liturgicalProperTexts/02-11-all-faithful-departed#d37214a633ffdad4.
- 18.11 (bundle docx, extracted by unzip/XML): liturgicalProperTexts/18-11-dedication-basilicas-peter-paul#8777f815595949c5: rank memoria-ad-libitum, Common apostles, own R2 (+ responsory) 1763 chars EXACT, laudesHymn EXACT, laudesAntBen EXACT, laudesPr EXACT, vesperAntMag EXACT; _fieldRules.vesperHymn = {ref:"laudesHymn"} (no raw «Гімн прымі цяпер з Ютрані»). Daytime prayers sext1-3Pr: the docx lists no Daytime text, the assembler uses the weekday prayer (GILH 236) where legacy repeated the collect.
- 28.12 (bundle "…28 12.html", 28.12.2023): liturgicalProperTexts/28-12-holy-innocents#d29871fa67652022: sext1/2/3Ant1 EXACT, Ant2 absent in source and assembled; the legacy «``` ## sext2Ant3» artefacts are not texts of the Office. Daytime psalms differ only because 2023-12-28 was a Thursday and 2026-12-28 is a Monday.
- Tests: `§9.1 All Faithful Departed matches the 02.11.2026 source in the compared fields` (tests/liturgy-hours-final-phase.test.mjs:243, pass); `§9.2 18.11: own elements from the source, Vespers hymn → Lauds hymn (structured)` (tests/liturgy-hours-final-phase.test.mjs:230, pass); `§9.3 Holy Innocents: one Daytime antiphon, as in the 28.12 source` (tests/liturgy-hours-final-phase.test.mjs:251, pass); `every former unexplained legacy difference has a source verdict` (tests/liturgy-hours-final-phase.test.mjs:265, pass)

### 25. ordinary-w9-d4: clean source (not 07.06.2023) — PASS

- days/ordinary-w9-d4#40e12abb0cc1d488 vesper* (11 fields): EXACT to the clean Wednesday IX-week page 06.06.2018 (patchs/sources/lh-catholic-by/2018-06-06.html, header "Серада - 6 чэрвеня 2018 / ІХ звычайны тыдзень / І тыдзень псалтыра", no foreign-identity hour) AND to the 8 equivalent psalter documents ordinary-w1/5/13/17/21/25/29/33-d4 (8/8 for each field). It differs from the 07.06.2023 evening, which the parser classifies as I Vespers of Corpus Christi (foreign identity), exactly as the spec warns.
- Bundle "…07 06 23.html": daytime = IX week Wednesday, vespers heading «НАЙСВЯЦЕЙШАГА ЦЕЛА І КРЫВІ ХРЫСТА / І нешпары»; extractPageFields keeps its vesper* under `foreign` (vesper1*), never in the day fields.
- Tests: `§25 07.06.2023: daytime is IX week Wednesday, Vespers belong to Corpus Christi` (tests/liturgy-hours-final-phase.test.mjs:130, pass); `§10 ordinary-w9-d4 Vespers: clean 06.06.2018 page = psalter week I Wednesday (30.08.2023)` (tests/liturgy-hours-final-phase.test.mjs:149, pass)

### 26. All Souls on Sunday: Hours of the Sunday, Mass All Souls, 3 reading sets — PASS

- 2025-11-02 (Sunday) through the production-fed pipeline (scripts/liturgy/lib/snapshot-content.mjs): sources.office = temporal:ordinary-w31-d1 (sunday), sources.mass = all-faithful-departed, split=true, appliedRules all-souls-sunday-split (src/utils/ordo/display.js:105); readingResolution.variants = 3 (all-souls-mass-1..3); dayOptions = only the Sunday Office; readings/02-11-all-faithful-departed has 3 sets.
- Tests: `All Souls on a Sunday: Hours of the Sunday, Mass of All Souls with 3 reading sets (§11.1)` (tests/ordo-transfer-overrides.test.mjs:23, pass); `All Souls: 3 reading sets; on a Sunday 2 November the Mass readings are All Souls` (tests/readings-mass-sets.test.mjs:224, pass)

### 27. Immaculate Heart + obligatory memorial: two memorials, no weekday — PASS

- 2026-06-13 (all dioceses): options = [immaculate-heart (primary), sv-anthony-padua]; suppressed = temporal weekday + saturday-blessed-virgin-mary; rule concurrent-obligatory-memorials-legal-choice (src/utils/ordo/display.js:75).
- Tests: `Immaculate Heart + obligatory memorial: exactly two memorial choices, NO weekday (13.06.2026)` (tests/ordo-transfer-overrides.test.mjs:45, pass); `Immaculate Heart + another obligatory memorial: two memorial choices, no weekday (§11.2)` (tests/liturgy-ui-references.test.mjs:206, pass)

### 28. Mary, Mother of the Church + obligatory memorial: both — PASS

- 2028-06-05 (Monday after Pentecost, Boniface): options = [mary-mother-church (first), sv-boniface]; no weekday option.
- Tests: `Mary, Mother of the Church + obligatory memorial: both offered, Marian first, no weekday (§11.3)` (tests/ordo-transfer-overrides.test.mjs:55, pass)

### 29. Christ the High Priest collision keeps both (provisional) — PASS

- Rule christ-high-priest-collision-both-options (status provisional): src/utils/ordo/display.js:141; covered by a synthetic collision (28.05.2026 + a test feast). A scan of 2025-2035 for all four dioceses finds no real date on which the High Priest coincides with another feast, so the evidence is unit-level only.
- Tests: `Christ the High Priest + another feast: both kept, provisional (§11.4)` (tests/ordo-transfer-overrides.test.mjs:70, pass)

### 30. Transfers computed and materialized as editable Year Overrides — PASS

- Production liturgicalYearOverrides: 15 documents = 11 `auto-transfer-*` (source auto-transfer, status needs-review, originalDate / computedDate / effectiveDate, transferRule, transferCase) + 4 legacy manual records. The 11: Annunciation 2027/2029/2032/2035, Bobola Pinsk 2027 and 2032 (rankEvidence pinsk 2026-05-16), St Joseph 2028/2034 (→ Monday) and 2035 (→ Saturday before Palm Sunday), Immaculate Conception 2030, John Baptist 2033 (Sacred Heart). Hashes: auto-transfer-2027-belarus-annunciation-lord#a57df6c1db16d096, auto-transfer-2027-pinsk-sv-andrei-bobola#c9bae0aa513f211f, auto-transfer-2028-belarus-sv-joseph#d5a86150e9caf897, auto-transfer-2029-belarus-annunciation-lord#56cfaf25b0ae9f24, auto-transfer-2030-belarus-immaculate-conception#6915c96c4abd5c62, auto-transfer-2032-belarus-annunciation-lord#bc8029e572c2e523, auto-transfer-2032-pinsk-sv-andrei-bobola#2fbe9ea0eab2a8d7, auto-transfer-2033-belarus-nativity-john-baptist#7ed415d30b4b9730, auto-transfer-2034-belarus-sv-joseph#75b3577e1595fbea, auto-transfer-2035-belarus-annunciation-lord#4ea42b200a2c6c17, auto-transfer-2035-belarus-sv-joseph#48fed51d6dfc82be.
- `npm run ordo:materialize-transfers -- --live` (DRY RUN, read-only, executed against production): targets 11, create 0, update 0, unchanged 11, keepManual 0, stale 0 (idempotent). The same against the fresh snapshot: identical.
- UI: src/views/admin/YearOverrides.vue (auto badge, «Вылічана engine», confirm flow); the old "automatic transfers are not stored" text is gone.
- Note: the 4 manual records still use legacy from/to; they are normalized at read time (src/utils/ordo/yearOverrides.js), not rewritten in Firestore.
- Tests: `St Joseph in Holy Week: computed transfer + materialized auto override (case B)` (tests/ordo-transfer-overrides.test.mjs:90, pass); `Annunciation impeded: computed transfer + materialized auto override (case C)` (tests/ordo-transfer-overrides.test.mjs:106, pass); `diocesan patron transfers only with a source-confirmed solemnity rank (case A)` (tests/ordo-transfer-overrides.test.mjs:113, pass); `Lord solemnity collision: the Lord stays, the other solemnity transfers (case D)` (tests/ordo-transfer-overrides.test.mjs:145, pass); `auto materialization is idempotent` (tests/ordo-transfer-overrides.test.mjs:153, pass)

### 31. Manual override keeps computedDate and controls effectiveDate — PASS

- src/utils/ordo/transferOverrides.js:266 confirmTransferOverride (source manual, status confirmed, computedDate kept, effectiveDate = admin date); planTransferOverrides (:187) never overwrites manual/confirmed (keepManual) and updates computedDate only for auto + needs-review. No manual-confirmed auto record exists in production yet, so the evidence is unit-level.
- Tests: `a manual-confirmed override survives regeneration and controls the effective date` (tests/ordo-transfer-overrides.test.mjs:171, pass); `legacy from/to overrides normalize to one canonical representation` (tests/ordo-transfer-overrides.test.mjs:206, pass)

### 32. Grodno/Pinsk general notes re-audited and meaningful notes restored — PARTIAL

- Production liturgicalOrdoNotes: 1337 documents; Grodno 112 and Pinsk 14 general notes (basis general-notes); semantic audit 0 violations in 92,036 shown notes; no clergy personal data / collections (scripts/ordo/lib/exclusions.mjs scan 0 hits on production; regex scan: only diocesan-foundation anniversaries and a martyrs' anniversary).
- Independent re-read of the bundle PDFs (pdftotext pages 3-14 Pinsk, 15-36 Grodno): every meaningful paragraph is published except ONE: the Grodno Advent rubric «Традыцыйна ва ўсе дні Адвэнту… можна цэлебраваць «Раратнюю» Імшу аб НПМ…» (candle symbolism, dawn start). extractGeneralNotes produced it (grodno:rule:352) but the cross-diocese merge in scripts/ordo/lib/notes.mjs clustered it with a Vitebsk note («Да 17 снежня… ватыўную Імшу…») whose guard hides it («dated text without an observed date»), and the whole cluster, including the Grodno general note, was dropped silently (not even in the review list).
- Pinsk: the diocesan list of holy days of obligation («у Пінскай дыяцэзіі неабходна адзначаць як абавязковыя святы…») is skipped on purpose as holy-days-of-obligation-list - an owner decision, listed in "owner decisions".
- Tests: `no clergy personal data and no collections in the published notes` (tests/ordo-notes-final.test.mjs:21, pass); `Grodno and Pinsk general notes are recovered from the front matter` (tests/ordo-notes-final.test.mjs:30, pass); `recheck §13: every extracted Grodno / Pinsk general note is published (none is lost in a cross-diocese cluster)` (tests/ordo-notes-final.test.mjs:108, pass)
- **Cause:** Cross-diocese clustering (scripts/ordo/lib/notes.mjs, "Merge across dioceses", jaccard >= 0.35) merged an explicit-selector general note into a cluster whose lead is hidden by note-guards; the member was hidden with it, without a review record.
- **Fix:** Done on the branch (commit "fix(ordo-notes): keep the Grodno Advent Rorate rule…"): a general note whose cluster is hidden is judged alone and published after the canonical rules (no id moves); test added; notes revision 5. Production needs the notes publish (see owner authorization).
- **Needs owner authorization:** Publish notes: `npm run ordo:import-calendar` (dry run) then `-- --apply` after review: plan against the production snapshot = 10 create (ordo-note-1486..1495), 7 update (wording «Літургія гадзінаў т.» in 0287, 0645, 0794, 0909, 1121, 1147, 1213), 1330 unchanged, 0 obsolete; bumps notesRevision 4 → 6.
- Repository: FIXED on branch audit/dod-recheck (commit 7ca7ad2); production NOT published

### 33. Lectionary / Hours volumes moved to structured metadata above the notes — PARTIAL

- Mechanism OK: category `books` notes carry books {lectionaryVolume, hoursVolume}; src/utils/ordo/notes.js booksFromNotes / isBooksNote; resolveLiturgicalDate returns day.books and removes books from ordoNotes (src/utils/ordo/index.js:182); label above the notes in src/components/ordo/OrdoDay.vue (booksLabel); 57 production books notes all have `books`; no «Лекцыянарый т.» text in any published note of another category.
- Coverage defect (production data): only Minsk (6) and Grodno (51, per feast or exact 2027 date) have books notes; Vitebsk and Pinsk none. With the production notes: Minsk shows nothing for Christmas, Ordinary Time before Lent and Easter, and III/III for ALL days after Pentecost although the Minsk docx prints Hours vol. IV from the XVIII Sunday (paragraph 2419) and Lectionary vol. V from the XXII Sunday (paragraph 2689; Grodno 29.08.2027 p. 108 agrees); the extractor kept 3 of the 6 Minsk headings (paragraphs 8/9, 817/818, 1728/1729 and not 463/464, 2419, 2689). Grodno's period headings (11.01.2027 III/III, 10.02.2027 II/II, 28.11.2027 I/I) exist only as exact-date notes of 2027.
- Tests: `Lectionary / Hours volumes are structured metadata, not «Асаблівыя заўвагі»` (tests/ordo-notes-final.test.mjs:69, pass); `the same volume value is stored once per selector (no duplicates across dioceses)` (tests/ordo-notes-final.test.mjs:101, pass); `recheck §13.1: period volumes are Belarus-wide structured metadata for every diocese (Minsk + Grodno calendars)` (tests/ordo-notes-final.test.mjs:126, pass)
- **Cause:** The adapter lost three Minsk volume headings; period volumes were generalized only from the three it kept (Minsk-only, "after-pentecost" = III/III for the whole phase) and Grodno's were kept as year instances.
- **Fix:** Done on the branch (commit "feat(ordo-notes): Belarus-wide Lectionary / Hours volumes per period"): scripts/ordo/lib/books.mjs PERIOD_VOLUMES (9 rows, each cites Minsk docx paragraphs / Grodno pdf pages; rows without their own heading are marked inherited), appended as Belarus-wide books notes (ordo-note-1487..1495, no id moves), BOOK_SELECTOR_RANK any:2, ordo:check accepts period-volumes provenance, tests for all four dioceses.
- **Needs owner authorization:** Same notes publish as item 32 (ordo:import-calendar --apply after the dry run).
- Repository: FIXED on branch (commit 5db8366); production NOT published

### 34. Reading editor edits the structured model (roles, sequence, variants) — PASS

- src/views/admin/ParsedReadingEditor.vue (preview toggle line 50, «Адмяніць», changed-field list, sanitizeSetsDraft) + src/components/admin/MassReadingSetsEditor.vue: set label/id/context/default/referenceOnly/note, provenance read-only, section add/move/remove, cycle A/B/C, bible citation, comment/title, alternatives («або»), psalm chorus/altChorus/verses, acclamation, sequence, rubrics, Passion by roles (Ев./Е./І./Л. markup round trip), per-set «Адмяніць змены набору», flatSet choice; helpers src/utils/massReadingSetsEditor.js; unknown fields are kept; HTML sanitized (sanitizeReadingHtml).
- Observation: reading text is a plain HTML textarea (p, br, em, strong), not Quill; acceptable under §14 ("or a small specialized editor"), but not rich-text.
- Tests: `sets editor: canonical documents round-trip with roles, cycles, ordered sections, rubrics, reference-only and unknown fields` (tests/lectionary-audit.test.mjs:424, pass); `sets editor: sanitizing a draft keeps new source fields (year, form, altChorusRef, prayers, preface) and drops markup` (tests/lectionary-audit.test.mjs:456, pass); `editor: linked legacy documents follow an edited set; unknown fields kept` (tests/readings-mass-sets.test.mjs:248, pass); `reading HTML is sanitized` (tests/readings-mass-sets.test.mjs:261, pass); `legacy editor keeps unknown fields of sections, alternatives, psalm, alleluia and sequence; null Lent week stays null` (tests/lectionary-audit.test.mjs:410, pass)

### 35. Hours editor keeps the sparse Proper and structured refs — PASS

- src/views/admin/DayEditor.vue: sparse notice (own / from Common / from current day / structured ref, lines 29-46), field rules listed, save writes only the difference (sparseUpdatePayload), InlineEditor preview sanitized and cancel never writes the model (src/components/admin/InlineEditor.vue).
- Tests: `DayEditor: a sparse Proper is written as a difference only (unknown fields untouched), a full day with merge` (tests/lectionary-audit.test.mjs:498, pass); `§15 editor: own / Common / current day / structured ref are told apart; save writes only overrides` (tests/liturgy-hours-final-phase.test.mjs:281, pass); `InlineEditor preview is sanitized (formatting survives, scripts/handlers/frames/unsafe URLs do not); cancel never writes the model` (tests/lectionary-audit.test.mjs:484, pass)

### 36. App-content / export validators updated — PASS

- scripts/content/lib/app-content.mjs: DOCUMENT_RULES for readings (validateMassReadings, _massReadingsRef), liturgicalProperTexts (_schema 2), liturgicalYearOverrides (validateYearOverride), liturgicalOrdoNotes, ORDO_CONTENT_COLLECTIONS. Run on the fresh production snapshot: validateCollection = OK for all 11 collections (completoriums 35, days 736, invitatoriums 4, liturgicalCalendarMeta 1, liturgicalCelebrations 241, liturgicalDioceseOverrides 75, liturgicalOrdoNotes 1337, liturgicalProperTexts 291, liturgicalTemplates 16, liturgicalYearOverrides 15, readings 822). CONTENT_SCHEMA_VERSION unchanged (additive); Flutter contract: reports/lectionary/flutter-export-contract.json.
- The manifest was NOT published (no `npm run content:manifest` run).
- Tests: `app-content contract: canonical set documents are valid, broken sets refused` (tests/readings-mass-sets.test.mjs:267, pass)

### 37. Automated tests pass — PASS

- npm test on the final branch: 767 tests, 759 pass, 1 fail, 7 skipped (skips are emulator/browser/real-source tests: mass-v4 real dry-run ×2, prayer collection source files, three Firestore emulator tests, songbook layout). The 1 failure is environmental: "the service-account key is ignored, untracked and nothing like it is committed" (tests/mass-content-v4.test.mjs) - `git ls-files backups/mass-v4/x.json` aborts because backups/ is a symlink in this worktree; the same file passes on the main checkout (tests 20, pass 19, fail 0). The priest tests (argon2) pass here; no argon2 failure was observed in the worktree.
- Also: npm run ordo:check OK; npm run build OK (3495 modules, built in 13.9 s); eslint clean on every touched file.
- Baseline before my commits: 764 tests, 756 pass, 1 fail (same env failure), 7 skipped.

### 38. New deficit report generated from current data — PASS

- docs/liturgical-data-deficits.md (generated 2026-10-13 by npm run liturgy:audit; P0 0, P1 0, P2 19). A fresh run against the 2026-10-13 snapshot after my commits is consistent: raw instructions 0, integrity errors 0, unexplained legacy differences 0; it also shows the pending publication as OPEN drift (159 Proper texts, 10+7 notes, notes revision 4 vs bundled 6) - expected until the authorized publish.
- Reproducibility defect (not a data defect): build-deficits reads untracked reports (reports/db-feasts-generation-report.json, hidden-notes review, …). Without reports/db-feasts-generation-report.json the committed document omits 30 «inferred Commons» P2 rows and 4 DONE rows (03.01, 09.12, 26.03, 08.06); with it the same run gives P2 48. Regenerate the document after the publish, on a machine that has run the generator, and commit it then (I did not commit a regenerated copy so as not to freeze a pending-publish state).

### 39. Final residual reference-only / missing list produced — PASS

- docs/liturgical-data-deficits.md READINGS MISSING: 10 rows (3 cathedral dedications, Lahišyn, Trakai, Częstochowa, Dung-Lac, Anthony of Padua, Kolbe, Stanisław Kostka) + docs/readings-mass-sets.md reference-only table; reports/liturgy/readings-reference-only.json. Residual P2 NEEDS_REVIEW: hidden/published notes flagged for review (46 published NEEDS_REVIEW).

### 40. No invented text, no annual static runtime calendar, no localChurch — PASS

- Every text compared against a bundle/live source in this audit is EXACT (apart from the documented app conventions: abbreviated responsory repeats «Н. Больш.», short conclusion «Праз Пана нашага.», abbreviated psalm doxology). No `localChurch` in src/ (grep 0). src/data/ordo/evidence/*.json (annual calendars) is imported by no runtime module (only transfer-rank-evidence.js, a small generated rank table); runtime = calendar-definitions.json + generative engine.
- Observation: ordo-note-0946 (Vitebsk) mentions the appointment of the first bishop in a diocese-foundation anniversary; personal but historical - owner decision, listed below.

## Sections 7, 11, 12, 13, 14/15, 19, 21, 25

| Section | Status | Evidence |
|---|---|---|
| §7 closed Commons decisions | **PASS** | Items 20-23 (apostles ref, Matthias ref, Cyril/Methodius hymn, 03.01, Juan Diego, Dismas, Jadwiga) all verified in production; §7.8: 30 Propers still `_templatesInferred` (automatic logic kept). |
| §11 collision decisions | **PASS** | Items 26-29; runtime check on 2025-11-02, 2026-06-13, 2028-06-05; High Priest only unit-level (no real collision 2025-2035). |
| §12 transfers in Year Overrides | **PASS** | 11 auto-transfer-* records in production; live dry run: 11 unchanged / 0 create / 0 update; idempotency + manual-confirmed tests pass. Four legacy manual records keep from/to (normalized at read). |
| §13 Grodno/Pinsk notes, books metadata | **PARTIAL** | Items 32-33: one general note lost (fixed), period volumes incomplete (fixed); production publish pending. |
| §14/§15 editors | **PASS** | Items 34-35; editor tests pass (parsed-reading-editor, readings-mass-sets, liturgical-editor-sources, office-assembly). |
| §19 Hours regressions | **PARTIAL** | Guardian Angels 02.10.2026: Lauds Ps 63 (Sunday week I), own antiphons, no raw instruction (PASS). Bruno 06.10.2026: options «З дня» (default), «Пра пастыраў», «Пра законнікаў»; own OOR R2 survives (PASS). Memorial rule «Proper prayer»: FAIL on production data for 159 sparse Propers - Lauds/Vespers showed the Common «Калі няма ўласнай малітвы… Пра папу: …» list instead of the saint's own prayer (Bruno, Thomas Aquinas, Bonaventure, Anthony of Padua, Bl. Antoni and Jerzy 12.06, …) because the prayer was stored only as officeOfReadingsPr. Fixed on the branch (generator refs laudesPr/vesperPr → officeOfReadingsPr; all four source pages show OOR prayer = Lauds prayer). Feast/solemnity/Dec 17-24/Lent general rules unchanged and green (audit: 0 integrity errors, 0 raw instructions). |
| §21 required tests | **PASS** | Every required test exists and passes (see tests per item): reading model/parser, Hours, collision/transfer, Ordo notes; plus 4 regression tests added by this audit. |
| §25 07.06.2023 regression test | **PASS** | tests/liturgy-hours-final-phase.test.mjs "§25 07.06.2023: daytime is IX week Wednesday, Vespers belong to Corpus Christi" (passes); checked-in page copies equal the bundle files field by field. |

## Findings outside the 40 items

- **F1 Lauds/Vespers prayer of 159 sparse Propers was the Common list, not the own prayer** (high (user-visible text); fixed on branch; production publish needs authorization). Propers with only officeOfReadingsPr (Bruno, Thomas Aquinas, Bonaventure, Clare, Anthony of Padua, Bl. Antoni/Jerzy 12.06 Vitebsk, …) had no laudesPr/vesperPr and no rule, so the assembler fell to the Common («Калі няма ўласнай малітвы, чытаецца ніжэйпададзеная: Пра папу: …»). All 4 bundle source pages have OOR prayer = Lauds prayer. Fix: scripts patchs/generate-db-feasts.mjs writes _fieldRules laudesPr/vesperPr = {ref: officeOfReadingsPr}; 159 db-feasts regenerated; tests office-assembly (memorial) and final-phase (every Proper, Antoni 12.06) cover it. Commit 2e1d87f.
- **F2 Grodno Advent Rorate rule silently dropped from the published notes** (medium; fixed on branch; publish pending). See item 32. Commit 7ca7ad2.
- **F3 Period volumes incomplete / wrong for Minsk after week 18, missing elsewhere** (medium; fixed on branch; publish pending). See item 33. Commit 5db8366.
- **F4 scripts/liturgy/migrate-readings-sets.mjs is stale against production** (info (do not run); open (recommend retiring or pinning)). A dry run against the 2026-10-13 snapshot plans 38 updates; production already has the sets (31/31 EXACT). The plan would only re-project 9 flat fields with older paragraph breaks (transfiguration reading2, feast-palmsunday--A/B/C gospel, holyweek-w1-d7--A/B/C-vigil reading3, feast-pentecost reading2, advent-24-12--christmas-vigil gospel) and would undo the later audit resync. Never run `migrate-readings-sets.mjs --apply` again.
- **F5 Deficit report is not reproducible from a clean checkout** (low; open). See item 38.
- **F6 Flat projection of reference-only Lahišyn/Trakai drops the «або Рым 12» alternative** (low; open). Visible only to released Flutter apps; the structured set has it.

## Owner decisions (not mine to make)

- Pinsk «у Пінскай дыяцэзіі неабходна адзначаць як абавязковыя святы…» list is skipped (holy-days-of-obligation-list): publish as a Pinsk note or keep skipped?
- ordo-note-0946 (Vitebsk) names the first bishop in a foundation anniversary: keep or treat as clergy personal data?
- Reading text editor is a plain HTML textarea: add Quill later?

## Production vs bundle sources

- Hours: every bundle text that production should carry is EXACT (ordinary-w21-d3/d4 R1/R2 + responsories, lent-w5-d1, Cyril/Methodius hymn, Bobola ×4 documents, All Souls and Innocents compared fields, 18.11 docx, Bl. Antoni/Jerzy PDF R2 + responsory + prayer + bio, ordinary-w9-d4 vs 2018 page).
- Conventions: abbreviated responsory repeats, short conclusion «Праз Пана нашага.», abbreviated psalm doxology and the Common's alternative stanzas are app conventions, not differences.
- Real differences: Lauds/Vespers prayer of 159 Propers (F1), Grodno Rorate note (F2), period volumes (F3).
- Readings: production massReadings == live catholic.by (31/31 sets); legacy flat copies differ from the re-projection only in paragraph breaks (F4).

## Needs owner authorization (NOT executed)

Plan counts are computed against the 2026-10-13 production snapshot.

1. Proper texts (F1): `npm run ordo:import-feasts` (dry run), then `npm run ordo:import-feasts -- --apply`. Plan: {"target": 291, "create": 0, "update": 159, "unchanged": 132, "set": 0, "keepExisting": 0, "obsolete": 0, "delete": 0} (159 updates, templates unchanged).
2. Ordo notes (F2, F3, item 32/33): `npm run ordo:import-calendar` (dry run), then `npm run ordo:import-calendar -- --apply`. Plan: {"target": 1347, "create": 10, "update": 7, "unchanged": 1330, "set": 0, "keepExisting": 0, "obsolete": 0, "delete": 0}; creates ordo-note-1486, ordo-note-1487, ordo-note-1488, ordo-note-1489, ordo-note-1490, ordo-note-1491, ordo-note-1492, ordo-note-1493, ordo-note-1494, ordo-note-1495; updates ordo-note-0287, ordo-note-0645, ordo-note-0794, ordo-note-0909, ordo-note-1121, ordo-note-1147, ordo-note-1213.
3. Afterwards: new snapshot, `npm run liturgy:audit -- --snapshot <dir>`, commit the regenerated `docs/liturgical-data-deficits.md`; `npm run content:manifest` only when the owner wants the content shipped to apps.

## Tests, lint, build

- `npm test`: 767 tests, 759 pass, 1 fail (environmental, see item 37), 7 skipped. Baseline before my commits: 764 / 756 / 1 / 7.
- `npm run ordo:check` OK; `npm run build` OK; `npx eslint` clean on every touched file.
- Fix commits: `2e1d87f` fix(hours): a Proper's own prayer is also the Lauds and Vespers prayer; `7ca7ad2` fix(ordo-notes): keep the Grodno Advent Rorate rule that a cross-diocese merge hid; `5db8366` feat(ordo-notes): Belarus-wide Lectionary / Hours volumes per period.
