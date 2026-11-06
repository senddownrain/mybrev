/**
 * Investigated validation differences (stage 6b). Each entry either
 *  - re-classifies a difference that is explained (diocesan practice, a
 *    one-year decision, a parser limitation), or
 *  - keeps GENERATOR_MISMATCH but marks it reviewed with `sourceError: true`
 *    when the published calendar contradicts the general norms (a typo or a
 *    copy/paste error). The engine is NOT bent to match those.
 * Never add an entry to hide an engine bug. Open questions are listed in
 * docs/ordo-engine-ambiguities.md.
 *
 * { diocese, date | dates[], checks?: string[], status, reason, sourceError? }
 */
const SOURCE_ERROR = { status: 'GENERATOR_MISMATCH', sourceError: true };

export const VALIDATION_EXPECTATIONS = Object.freeze([
  // --- Rubrics printed on the wrong day / copied from another day ---------
  {
    ...SOURCE_ERROR, diocese: 'minsk-mohilev', date: '2026-01-04', checks: ['firstVespers'],
    reason: 'I Vespers of Epiphany printed on Sunday 4 Jan; Epiphany is Tuesday 6 Jan (its I Vespers are on 5 Jan).',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', date: '2026-01-04', checks: ['firstVespers'],
    reason: '"Камплета пасля І Нешпараў нядзелі" printed on the Sunday itself.',
  },
  {
    ...SOURCE_ERROR, diocese: 'minsk-mohilev', date: '2026-02-01', checks: ['firstVespers'],
    reason: 'I Vespers of the Presentation (feast, Monday 2 Feb): feasts have no I Vespers unless a feast of the Lord falls on a Sunday (GNLYC 13); Sunday II Vespers (row 6) stand.',
  },
  {
    ...SOURCE_ERROR, diocese: 'minsk-mohilev', dates: ['2026-09-20', '2026-11-16'], checks: ['firstVespers'],
    reason: 'I Vespers of the Sunday printed on the Sunday / the following Monday instead of the Saturday.',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', dates: ['2026-08-10', '2026-08-24', '2026-09-21'], checks: ['firstVespers'],
    reason: '"І Нешпары і Камплета з нядзелі" on a Monday feast (template copied from a Saturday).',
  },
  {
    status: 'PARSER_UNCERTAIN', diocese: 'grodno', date: '2027-02-07', checks: ['firstVespers'],
    reason: '"І Нешп. і І Кампл. нядз." of Saturday 6 Feb read into the Sunday box of the PDF.',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', date: '2025-12-27', checks: ['secondVespers'],
    reason: 'Generic "ІІ Нешпары" on the octave day; Holy Family (feast of the Lord on Sunday 28 Dec) has I Vespers (Minsk prints them).',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', date: '2026-06-03', checks: ['secondVespers'],
    reason: '"ІІ Нешпары з урачыстасці Corpus Domini" on the eve (Wednesday); they are I Vespers.',
  },
  {
    ...SOURCE_ERROR,
    diocese: 'vitebsk',
    dates: ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14',
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-11-28'],
    checks: ['psalterWeek'],
    reason: 'Week heading repeats the previous psalter week (Lent III / OT XXIII are psalter week III; 28 Nov is week II).',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', date: '2026-06-02', checks: ['color'],
    reason: 'White printed for an Ordinary Time weekday (optional memorial of martyrs: green or red).',
  },
  // --- Offices printed inconsistently ---------------------------------------
  {
    status: 'PARSER_UNCERTAIN', diocese: 'minsk-mohilev', date: '2026-01-02', checks: ['officeType'],
    reason: '"з будня альбо з успаміну": the parser keeps the first alternative.',
  },
  {
    ...SOURCE_ERROR, diocese: 'minsk-mohilev', date: '2026-01-28', checks: ['officeType'],
    reason: '"Літургія гадзінаў з будня" on the obligatory memorial of St Thomas Aquinas.',
  },
  {
    status: 'PARSER_UNCERTAIN', diocese: 'minsk-mohilev', date: '2026-09-12', checks: ['officeType', 'teDeum'],
    reason: 'Two Offices printed: the memorial, and the solemnity for churches with that title; the parser keeps the last.',
  },
  {
    ...SOURCE_ERROR, diocese: 'vitebsk', date: '2026-08-22', checks: ['officeType', 'teDeum'],
    reason: 'Queenship of Mary printed as "успамін" but with "Афіцый са свята" and Gloria; universally a memorial.',
  },
  {
    ...SOURCE_ERROR, diocese: 'grodno', dates: ['2027-11-12', '2027-12-03'], checks: ['officeType'],
    reason: 'Obligatory memorial printed with the weekday Office line ("Аф. буд./звыч. перыяду").',
  },
  {
    ...SOURCE_ERROR, diocese: 'grodno', date: '2027-04-07', checks: ['primary', 'officeType'],
    reason: 'St John Baptist de la Salle (obligatory memorial, 7 April, Wednesday after the Easter octave) not printed.',
  },
  // --- One-year decisions -----------------------------------------------------
  {
    status: 'EXPECTED_YEAR_EXCEPTION', diocese: 'minsk-mohilev', date: '2026-04-16', checks: ['color', 'officeType'],
    reason: 'St Stanislaus kept on 16 April 2026 (year override); the source prints the weekday colour and Office line.',
  },
  {
    status: 'EXPECTED_YEAR_EXCEPTION', diocese: 'vitebsk', dates: ['2026-03-08', '2026-06-14'], checks: ['notes'],
    reason: 'The first-Sunday devotion is printed on the second Sunday of March and June 2026.',
  },
  // --- Local church / diocesan practice ---------------------------------------
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'vitebsk', date: '2026-10-25', checks: ['officeType'],
    reason: 'Solemnity of the dedication in churches whose date is unknown (local church, last Sunday of October).',
  },
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'pinsk', date: '2026-10-25', checks: ['officeType'],
    reason: 'Solemnity of the dedication in churches whose date is unknown (local church).',
  },
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'grodno', date: '2027-10-31', checks: ['rank', 'color', 'officeType'],
    reason: 'Solemnity of the dedication in churches whose date is unknown (local church, last Sunday of October).',
  },
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'grodno', date: '2027-05-21', checks: ['primary'],
    reason: 'St John of Nepomuk (Grodno/Polish proper, 16 May) kept on 21 May 2027 because of Pentecost; not in MyBrev data.',
  },
  {
    ...SOURCE_ERROR, diocese: 'grodno', date: '2027-12-09', checks: ['primary'],
    reason: 'Our Lady of Loreto printed on both 9 and 10 December (10 December is correct; 9 December is St Juan Diego).',
  },
  // --- Rubrics the engine applies and the calendars simplify ------------------
  {
    ...SOURCE_ERROR,
    diocese: 'minsk-mohilev', date: '2026-06-13', checks: ['primary'],
    reason: 'Immaculate Heart + St Anthony (obligatory): MyBrev product rule (§11.2): two memorial choices, Immaculate Heart first, no weekday; the calendar prints one order.',
  },
  {
    ...SOURCE_ERROR,
    diocese: 'vitebsk', date: '2026-06-13', checks: ['primary', 'alternatives'],
    reason: 'Immaculate Heart + St Anthony (obligatory): MyBrev product rule (§11.2): two memorial choices, Immaculate Heart first, no weekday; the calendar prints one order.',
  },
  {
    ...SOURCE_ERROR,
    diocese: 'pinsk', date: '2026-06-13', checks: ['primary'],
    reason: 'Immaculate Heart + St Anthony (obligatory): MyBrev product rule (§11.2): two memorial choices, Immaculate Heart first, no weekday; the calendar prints one order.',
  },
  {
    ...SOURCE_ERROR,
    diocese: 'grodno', date: '2027-06-05', checks: ['primary'],
    reason: 'Immaculate Heart + St Boniface (obligatory): MyBrev product rule (§11.2): two memorial choices, Immaculate Heart first, no weekday; the calendar prints one order.',
  },
  {
    ...SOURCE_ERROR,
    diocese: 'vitebsk', date: '2026-03-04', checks: ['primary'],
    reason: 'St Casimir on a Lent weekday is only a commemoration (GNLYC 14, 16; Vitebsk rules: "толькі калекта").',
  },
  {
    status: 'PARSER_UNCERTAIN', diocese: 'minsk-mohilev', date: '2025-12-24', checks: ['notes'],
    reason: 'Christmas notes printed with the Vigil (24 Dec) were generalized to the Christmas day selector only.',
  },
  {
    status: 'PARSER_UNCERTAIN', diocese: 'vitebsk', date: '2025-12-24', checks: ['notes'],
    reason: 'Christmas notes printed with the Vigil (24 Dec) were generalized to the Christmas day selector only.',
  },
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'grodno', date: '2027-07-05', checks: ['primary', 'color', 'alternatives'],
    reason: 'Our Lady of Trakai: owner decision — Grodno keeps it on 5 July as an obligatory memorial (memoria); the 2027 PDF prints no memorial on 5 July. The optional memorial of St Anthony Zaccaria is displaced by the obligatory one.',
  },
  {
    status: 'EXPECTED_DIOCESAN_DIFFERENCE', diocese: 'grodno', date: '2027-07-10', checks: ['primary', 'officeType', 'teDeum'],
    reason: 'Our Lady of Trakai: owner decision — 10 July is no longer a celebration of the diocese; the 2027 PDF prints «НПМ Тракельскай свята» there (feast). MyBrev keeps the memorial on 5 July and does not move or duplicate it.',
  },
]);
