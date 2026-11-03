# Christ the Eternal High Priest — Daytime Prayer (2026-05-28)

## Liturgical source and date

The feast is celebrated on the Thursday after Pentecost, which is **28 May 2026** (Pinsk, Belarus). It is a **feast** (`festum`), not a solemnity. The rubrics for feasts in GILH 232 distinguish weekday hymn + weekday psalmody from **proper readings and collect**.

Source: International Commission on English in the Liturgy, *Our Lord Jesus Christ, The Eternal High Priest*, Gray Book, 11 April 2016, *Liturgy of the Hours*, p. 6, English/Latin. https://www.cbcew.org.uk/wp-content/uploads/sites/3/2018/11/Our-Lord-Jesus-feast-gray-book-130416-A4.pdf

The book provides separate proper **antiphons**, **short Scripture readings** and versicles/responses for the three daytime hours, with the **collect from Lauds**. It specifies psalms of the occurring weekday. These are not all one and the same reading.

| Hour | Source fields | Proper reading reference | Proper antiphon |
|---|---|---|---|
| Terce | `sext1Ant1`, `sext1R`, `sext1Pr` | Heb 7:26–27 | Eph 2:18 |
| Sext | `sext2Ant1`, `sext2R`, `sext2Pr` | 1 Pet 2:4–5 | Eph 2:20 |
| None | `sext3Ant1`, `sext3R`, `sext3Pr` | 1 Pet 2:9–10 | Eph 4:7 (cf. Eph 4:12) |

The app currently has no separate fields for the daytime *versicle/response* given after each short reading in the source. This is an independent structural/content follow-up.

## Required content validation (before declaring the bug fully resolved)

1. Inspect the existing document(s) in `days` where `_feast = feast-christthehighpriest`, via the **local Firestore snapshot**; do not perform quota-consuming live reads without approval (see `AGENTS.md`).
2. Check `sext1Ant1`, `sext2Ant1`, `sext3Ant1` — each has its own proper antiphon. Empty `Ant2`/`Ant3` are intentional when one antiphon surrounds the three weekday psalms.
3. Check `sext1R`, `sext2R`, `sext3R` — three different proper short readings with their **complete approved Belarusian biblical texts**, not weekday readings or placeholders.
4. For `sext1Pr`/`sext2Pr`/`sext3Pr`, the proper collect of Lauds is to be used. The runtime now reuses `laudesPr` when no separate daytime collect is stored.
5. Confirm that `ordinary-w8-d5` (or the correct four-week psalter fallback, Thursday of Psalter Week IV) exists with the `sext1/2/3` weekday hymns and psalmody.
6. Compare `terz`, `sext` and `none` visually on 2026-05-28 with the Pinsk diocese, then run same checks for 2027 and 2028 using each year's correct movable date.

## Scope of this PR

The code change only repairs **runtime inheritance of genuinely missing daytime psalter fields** for movable feasts and the **proper Lauds collect**. It does **not** modify Firestore or supply untranslated / unverified proper readings. If the production document lacks its three proper readings or antiphons, a **separate content patch** from verified Belarusian text will still be necessary.

No live Firebase deployment or data migration is performed by this PR.
