/**
 * The 24 mandatory cases of the Ordo spec (§29), checked against the Table of
 * Liturgical Days and the published Belarusian calendars (2025/26, 2027).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { getLiturgicalCelebrationPriority } from '../src/constants/liturgical.js';
import { hasFirstVespersRank } from '../src/utils/liturgicalVespers.js';

const BY = { country: 'BY' };
const resolve = (date, context = BY) => resolveLiturgicalDate(date, context);
const ids = (items) => items.map((item) => item.id);
const reasonOf = (day, id) => day.suppressed.find((item) => item.id === id)?.reason;

test('01 ordinary weekday without a saint', () => {
  const day = resolve('2026-01-12');
  assert.equal(day.primary.kind, 'temporal');
  assert.equal(day.primary.officeKind, 'weekday');
  assert.deepEqual(day.alternatives, []);
  assert.deepEqual(day.commemorations, []);
  assert.equal(day.color, 'viridis');
  assert.equal(day.officeResolution.primary.teDeum, false);
});

test('02 weekday + optional memorial: the weekday is primary, the memorial an alternative', () => {
  const day = resolve('2026-01-13');
  assert.equal(day.primary.kind, 'temporal');
  assert.deepEqual(ids(day.alternatives), ['sv-hilary']);
  assert.equal(day.officeResolution.alternatives[0].officeKind, 'optional-memorial');
});

test('03 several optional memorials are all legal alternatives', () => {
  const day = resolve('2026-01-20');
  assert.equal(day.primary.kind, 'temporal');
  assert.deepEqual(ids(day.alternatives).sort(), ['sv-fabian', 'sv-sebastian']);
});

test('04 obligatory memorial: weekday is not an alternative Office', () => {
  const day = resolve('2026-01-28');
  assert.equal(day.primary.id, 'sv-thomas-aquinas');
  assert.equal(day.primary.officeKind, 'memorial');
  assert.deepEqual(day.alternatives, []);
  assert.equal(reasonOf(day, 'temporal:ordinary-w3-d4'), 'weekday-under-memorial');
  const office = day.officeResolution.primary;
  assert.equal(office.teDeum, false);
  assert.deepEqual(office.hours.officeOfReadings.reading1.chain, ['current-day']);
  assert.deepEqual(office.hours.lauds.psalmody.chain, ['proper', 'current-day']);
  // Common ↔ current day is a real choice for memorials …
  assert.ok(office.allowedChoices.some((item) => item.hour === 'lauds' && item.component === 'hymn'
    && item.options.includes('common') && item.options.includes('current-day')));
  // … while the concluding prayer is a Proper → Common fallback, not a choice.
  assert.ok(!office.allowedChoices.some((item) => item.component === 'prayer'));
  assert.ok(office.sourceFallbacks.some((item) => item.hour === 'lauds' && item.component === 'prayer'));
});

test('05 feast: no I Vespers, Sunday-week-I psalms at Lauds, weekday Compline, Te Deum', () => {
  const day = resolve('2026-07-03'); // St Thomas, Friday
  assert.equal(day.primary.id, 'sv-thomas-apostle');
  assert.equal(day.primary.officeKind, 'feast');
  assert.deepEqual(day.alternatives, []);
  const office = day.officeResolution.primary;
  assert.equal(office.firstVespers.byRight, false);
  assert.equal(office.teDeum, true);
  assert.deepEqual(office.hours.lauds.psalmody.chain, ['sunday-week-1']);
  assert.deepEqual(office.hours.daytime.psalmody.chain, ['current-day']);
  assert.equal(office.compline, 'current-weekday');
  assert.equal(day.color, 'ruber');
});

test('06 solemnity: I and II Vespers, Sunday Compline, Te Deum', () => {
  const day = resolve('2026-06-29'); // Sts Peter and Paul, Monday
  assert.equal(day.primary.id, 'sv-peter-paul-apostles');
  assert.equal(day.primary.precedence, 3);
  assert.equal(day.officeResolution.firstVespers.byRight, true);
  assert.equal(day.officeResolution.firstVespers.celebratedOnEve, true); // beats Sunday OT II Vespers
  assert.equal(day.officeResolution.evening.vespers.type, 'second');
  assert.equal(day.officeResolution.evening.compline, 'sunday-after-second-vespers');
  assert.equal(day.officeResolution.primary.teDeum, true);
  assert.deepEqual(day.officeResolution.primary.hours.daytime.psalmody.chain, ['complementary']);
});

test('07 Sunday + conflicting fixed saint; feasts of the Lord replace a Sunday of Ordinary Time', () => {
  const paul = resolve('2026-01-25');
  assert.equal(paul.primary.officeKind, 'sunday');
  assert.equal(reasonOf(paul, 'conversion-saint-paul'), 'impeded-omitted');

  const lateran = resolve('2025-11-09');
  assert.equal(lateran.primary.id, 'dedication-lateran-basilica');
  assert.equal(lateran.officeResolution.firstVespers.byRight, true);
  assert.ok(lateran.appliedRules.some((rule) => rule.rule === 'feast-of-the-lord-replaces-sunday'));

  const presentation = resolve('2025-02-02');
  assert.equal(presentation.primary.id, 'presentation-lord');
  assert.equal(presentation.officeResolution.primary.compline, 'sunday-after-second-vespers');
});

test('08 Sundays of Advent, Lent and Easter outrank feasts and solemnities', () => {
  const lent = resolve('2026-02-22');
  assert.equal(lent.primary.precedence, 2);
  assert.equal(reasonOf(lent, 'chair-of-saint-peter'), 'impeded-omitted'); // Vitebsk: "Прапускаецца свята Катэдры"
  assert.equal(lent.officeResolution.primary.teDeum, false);

  const easter = resolve('2026-05-03');
  assert.equal(easter.primary.officeKind, 'sunday');
  assert.equal(reasonOf(easter, 'sv-philip-james-apostles'), 'impeded-omitted');
  assert.equal(easter.officeResolution.primary.teDeum, true);

  const advent = resolve('2026-11-29');
  assert.equal(advent.primary.id, 'temporal:advent-w1-d1');
  assert.equal(advent.readingCycle.sunday, 'B');
});

test('09 17–24 December + saint: commemoration only', () => {
  const day = resolve('2026-12-21');
  assert.equal(day.primary.kind, 'temporal');
  assert.equal(day.primary.daysRef.seasonalDateId, 'advent-21-12');
  assert.deepEqual(ids(day.commemorations), ['sv-peter-canisius']);
  assert.deepEqual(day.alternatives, []);
  assert.equal(day.officeResolution.commemorations[0].mode, 'commemoratio');
  assert.equal(day.readingResolution.primary.lookup[0].where._date, '21.12');
});

test('10 Lent weekday + memorial: commemoratio, but a diocesan feast is celebrated', () => {
  const perpetua = resolve('2026-03-07');
  assert.equal(perpetua.primary.kind, 'temporal');
  assert.deepEqual(ids(perpetua.commemorations), ['sv-perpetua-felicity']);
  assert.equal(perpetua.readingResolution.commemorations[0].lookup[0].purpose, 'weekday');

  assert.deepEqual(ids(resolve('2026-03-04').commemorations), ['sv-casimir']);
  const grodno = resolve('2026-03-04', { ...BY, diocese: 'grodno' });
  assert.equal(grodno.primary.id, 'sv-casimir');
  assert.equal(grodno.primary.officeKind, 'feast');
  assert.equal(grodno.primary.precedence, 8);
});

test('11 Christmas octave', () => {
  const stephen = resolve('2026-12-26');
  assert.equal(stephen.primary.id, 'sv-stephen-protomartyr');
  const becket = resolve('2026-12-29');
  assert.equal(becket.primary.officeKind, 'christmas-octave');
  assert.equal(becket.officeResolution.primary.teDeum, true);
  assert.deepEqual(ids(becket.commemorations), ['sv-thomas-becket']);
  assert.equal(becket.periodPhase, 'octave');
  const jan2 = resolve('2027-01-02');
  assert.equal(jan2.primary.officeKind, 'memorial'); // outside the octave
});

test('12 Easter octave: every day ranks as a solemnity, memorials omitted', () => {
  const saturday = resolve('2026-04-11');
  assert.equal(saturday.primary.officeKind, 'easter-octave');
  assert.equal(saturday.primary.precedence, 2);
  assert.equal(reasonOf(saturday, 'sv-stanislaus-bishop-martyr'), 'impeded-omitted');
  assert.equal(saturday.officeResolution.primary.teDeum, true);
  assert.equal(saturday.officeResolution.primary.compline, 'sunday-after-first-or-second-vespers');
  const divineMercy = resolve('2026-04-12');
  assert.equal(divineMercy.primary.officeKind, 'sunday');
});

test('13 Holy Week: Monday–Thursday exclude every other celebration', () => {
  const monday = resolve('2026-03-30');
  assert.equal(monday.period, 'holyweek');
  assert.equal(monday.primary.precedence, 2);
  const annunciation = resolve('2027-03-25', BY); // Holy Thursday 2027
  assert.equal(reasonOf(annunciation, 'annunciation-lord'), 'transferred');
});

test('14 Paschal Triduum', () => {
  const goodFriday = resolve('2026-04-03');
  assert.equal(goodFriday.primary.officeKind, 'triduum');
  assert.equal(goodFriday.primary.precedence, 1);
  assert.equal(goodFriday.color, 'ruber');
  assert.equal(goodFriday.officeResolution.primary.teDeum, false);
  assert.deepEqual(goodFriday.officeResolution.primary.hours.lauds.psalmody.chain, ['proper-of-season']);
  const holySaturday = resolve('2026-04-04');
  assert.equal(holySaturday.officeResolution.evening.vespers.type, 'of-the-day'); // Easter has no I Vespers
  const easter = resolve('2026-04-05');
  assert.equal(easter.primary.id, 'easter-sunday');
  assert.equal(easter.officeResolution.firstVespers.byRight, false);
  assert.deepEqual(easter.readingResolution.primary.vigilLookup, {
    _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 7, _variant: 'vigil',
  });
});

test('15 Saturday evening belongs to Sunday', () => {
  const day = resolve('2026-01-17'); // St Anthony, Saturday
  assert.equal(day.primary.officeKind, 'memorial');
  assert.equal(day.officeResolution.evening.vespers.type, 'first');
  assert.equal(day.officeResolution.evening.vespers.celebrationId, 'temporal:ordinary-w2-d1');
  assert.equal(day.officeResolution.evening.compline, 'sunday-after-first-vespers');
});

test('16 II Vespers of today vs I Vespers of tomorrow (GNLYC 61)', () => {
  // Solemnity on Saturday beats the Sunday of Ordinary Time.
  const assumption = resolve('2026-08-15');
  assert.equal(assumption.officeResolution.evening.vespers.type, 'second');
  assert.equal(assumption.officeResolution.evening.conflict.winner, 'today');
  // A feast on Saturday yields to the Sunday.
  const james = resolve('2026-07-25');
  assert.equal(james.primary.officeKind, 'feast');
  assert.equal(james.officeResolution.evening.vespers.type, 'first');
  // Sunday of Lent keeps its II Vespers against the transferred St Joseph.
  const lentSunday = resolve('2028-03-19');
  assert.equal(lentSunday.officeResolution.evening.vespers.type, 'second');
  assert.equal(lentSunday.officeResolution.evening.omittedFirstVespers, 'sv-joseph');
  const joseph = resolve('2028-03-20');
  assert.equal(joseph.officeResolution.firstVespers.celebratedOnEve, false);
  // Equal rank: the current day keeps its Vespers.
  const sacredHeart = resolve('2022-06-24');
  assert.equal(sacredHeart.officeResolution.evening.conflict.winner, 'today');
  // Advent weekday before Christmas.
  assert.equal(resolve('2026-12-24').officeResolution.evening.vespers.celebrationId, 'nativity-lord');
});

test('17 diocesan rank override (St Josaphat, 12 November)', () => {
  const vitebsk = resolve('2026-11-12', { ...BY, diocese: 'vitebsk' });
  const minsk = resolve('2026-11-12', { ...BY, diocese: 'minsk' });
  const grodno = resolve('2026-11-12', { ...BY, diocese: 'grodno' });
  assert.deepEqual([vitebsk.primary.officeKind, vitebsk.primary.precedence], ['solemnity', 4]);
  assert.deepEqual([minsk.primary.officeKind, minsk.primary.precedence], ['feast', 8]);
  assert.deepEqual([grodno.primary.officeKind, grodno.primary.precedence], ['memorial', 10]);
  assert.equal(vitebsk.primary.daysRef._place, 'vitebsk');
  assert.deepEqual(vitebsk.primary.fallbackDaysRefs[0], { source: 'fixed', _date: '12.11', _rank: 'memoria', dayIds: ['12-11-sv-josaphat--martyr-one', '12-11-sv-josaphat--pastors'] });
  assert.ok(vitebsk.appliedRules.some((rule) => rule.rule === 'layer-modification' && rule.id === 'sv-josaphat'));
  assert.equal(resolve('2026-11-11', { ...BY, diocese: 'vitebsk' }).officeResolution.evening.vespers.type, 'first');
});

test('18 cathedral dedication: feast in the diocese, solemnity in the cathedral', () => {
  const diocese = resolve('2026-10-10', { ...BY, diocese: 'vitebsk' });
  assert.equal(diocese.primary.id, 'vitebsk-cathedral-dedication');
  assert.equal(diocese.primary.officeKind, 'feast');
  const cathedral = resolve('2026-10-10', { ...BY, diocese: 'vitebsk', localChurch: { id: 'vitebsk-cathedral', isCathedral: true } });
  assert.equal(cathedral.primary.officeKind, 'solemnity');
  assert.equal(cathedral.primary.precedence, 4);
  assert.equal(cathedral.officeResolution.firstVespers.celebratedOnEve, true);
});

test('19 local titular solemnity and dedication of the own church', () => {
  const title = resolve('2027-06-13', { ...BY, diocese: 'minsk', localChurch: { titleCelebrationId: 'sv-anthony-padua' } });
  assert.equal(title.primary.id, 'sv-anthony-padua');
  assert.equal(title.primary.localRole, 'title-own-church');
  assert.equal(title.primary.precedence, 4); // beats the Sunday of Ordinary Time (row 6)
  const lent = resolve('2026-03-04', { ...BY, localChurch: { titleCelebrationId: 'sv-casimir' } });
  assert.equal(lent.primary.officeKind, 'solemnity');
  const dedication = resolve('2026-09-20', { ...BY, localChurch: { dedicationDate: '09-20' } });
  assert.equal(dedication.primary.id, 'local-church-dedication');
  assert.equal(dedication.primary.daysRef.template, 'church-dedication');
  // A General Calendar solemnity as title keeps row 3.
  const joseph = resolve('2026-03-19', { ...BY, localChurch: { titleCelebrationId: 'sv-joseph' } });
  assert.equal(joseph.primary.precedence, 3);
});

test('20 transferred solemnity (Annunciation 2027 → Monday after Divine Mercy)', () => {
  const day = resolve('2027-04-05');
  assert.equal(day.primary.id, 'annunciation-lord');
  assert.equal(day.primary.transferredFrom, '2027-03-25');
  assert.ok(day.appliedRules.some((rule) => rule.rule === 'transfer' && rule.to === '2027-04-05'));
  assert.equal(resolve('2024-12-09').primary.id, 'immaculate-conception');
});

test('21 Baptism of the Lord closes the Christmas season', () => {
  const baptism = resolve('2026-01-11');
  assert.equal(baptism.primary.id, 'baptism-of-the-lord');
  assert.equal(baptism.period, 'christmas');
  assert.equal(baptism.officeResolution.firstVespers.byRight, true); // feast of the Lord on Sunday
  assert.equal(resolve('2026-01-12').period, 'ordinary');
  assert.equal(resolve('2030-01-13').primary.id, 'baptism-of-the-lord'); // Epiphany on Sunday 2030
  assert.deepEqual(resolve('2026-01-11').readingResolution.primary.lookup[0].where, { _feast: 'feast-buptismofthelord' });
});

test('22 Holy Family: Sunday in the octave, or 30 December without I Vespers', () => {
  const sunday = resolve('2026-12-27');
  assert.equal(sunday.primary.id, 'holy-family');
  assert.equal(reasonOf(sunday, 'sv-john-apostle-evangelist'), 'impeded-omitted');
  assert.equal(sunday.officeResolution.firstVespers.byRight, true);
  const friday = resolve('2022-12-30');
  assert.equal(friday.primary.id, 'holy-family');
  assert.equal(friday.officeResolution.firstVespers.byRight, false);
});

test('23 source calendars vs current MyBrev behaviour', () => {
  // (a) Current dayOptions ordering ranks any solemnity above the period day,
  // so 8 Dec 2024 (II Sunday of Advent) would show the Immaculate Conception.
  assert.ok(getLiturgicalCelebrationPriority({ _rank: 'solemnitas' }) < getLiturgicalCelebrationPriority({}));
  const sunday = resolve('2024-12-08');
  assert.equal(sunday.primary.officeKind, 'sunday');
  assert.equal(sunday.suppressed.find((item) => item.id === 'immaculate-conception').transferredTo, '2024-12-09');
  // (b) Current I Vespers audit treats every `festum` as having I Vespers.
  assert.equal(hasFirstVespersRank({ _rank: 'festum' }), true);
  assert.equal(resolve('2026-07-03').officeResolution.firstVespers.byRight, false);
  // (c) Vitebsk 2025/26 prints "27 снежня … прапускаецца свята святых Немаўлят";
  // by the Table it is St John (27.12) that is omitted; the Innocents stay on 28.12.
  assert.equal(reasonOf(resolve('2026-12-27'), 'sv-john-apostle-evangelist'), 'impeded-omitted');
  assert.equal(resolve('2026-12-28').primary.id, 'holy-innocents');
  // (d) Ascension: sources give Thursday 14 May 2026; the calendar store's
  // fallback (Pentecost − 7 days) would give Sunday 17 May.
  assert.equal(resolve('2026-05-14').primary.id, 'ascension');
  assert.equal(resolve('2026-05-17').primary.officeKind, 'sunday');
});

test('24 same date, different dioceses', () => {
  const grodno = resolve('2026-11-16', { ...BY, diocese: 'grodno' });
  const minsk = resolve('2026-11-16', { ...BY, diocese: 'minsk-mohilev' });
  const vitebsk = resolve('2026-11-16', { ...BY, diocese: 'vitebsk' });
  assert.equal(grodno.primary.officeKind, 'solemnity');
  assert.equal(minsk.primary.officeKind, 'memorial');
  // Ostra Brama is an obligatory memorial in every Belarusian diocese
  // (Belarus layer, Vitebsk 2025/26), a solemnity in Grodno.
  assert.equal(vitebsk.primary.id, 'our-lady-mother-mercy');
  assert.equal(vitebsk.primary.officeKind, 'memorial');
  assert.ok(resolve('2026-11-16', { country: 'universal' }).primary.kind === 'temporal');

  // Pentecost 16 May 2027 impedes the Pinsk patron (proper solemnity). In
  // Pinsk Mary, Mother of the Church is a feast (row 8, Pinsk 2026), which
  // impedes Monday too, so the solemnity moves to Tuesday 18 May.
  const pinsk = resolve('2027-05-18', { ...BY, diocese: 'pinsk' });
  const pinskMonday = resolve('2027-05-17', { ...BY, diocese: 'pinsk' });
  const minsk2027 = resolve('2027-05-17', { ...BY, diocese: 'minsk' });
  assert.equal(pinsk.primary.id, 'sv-andrei-bobola');
  assert.equal(pinsk.primary.transferredFrom, '2027-05-16');
  assert.equal(pinskMonday.primary.id, 'mary-mother-church');
  assert.equal(pinskMonday.primary.officeKind, 'feast');
  assert.equal(minsk2027.primary.id, 'mary-mother-church');
  assert.equal(minsk2027.primary.officeKind, 'memorial');
});
