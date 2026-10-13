/**
 * One rule for the readings of memorials (web + Flutter): weekday readings by
 * default, the memorial's own readings only where the Lectionary prescribes
 * PROPER readings (src/utils/ordo/memorialReadings.js), own/Common readings
 * as legal alternatives; and the Hours -> Readings route adds nothing the
 * plan does not offer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESCRIBED_PROPER_MEMORIALS, memorialReadingsRule } from '../src/utils/ordo/memorialReadings.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { createReadingsRuntime, screenFor } from '../scripts/lectionary/lib/runtime-sim.mjs';
import { pickerOptionsOf, pickerRouteFor } from '../src/utils/ordoDatePicker.js';

const reading = (bible) => ({ bible, text: `text of ${bible}` });
const weekday = (id, week, dow, year = '') => ({ id, _periodType: 'ordinary', _periodWeekNumber: week, _dayOfWeek: dow, ...(year ? { year } : {}), title: 'Будзень', reading1: reading('Рым 1, 1'), gospel: reading('Лк 1, 1') });
const titleOf = (iso, optionId) => { const day = resolveLiturgicalDate(iso, { country: 'BY', diocese: 'minsk-mohilev' }); return [day.primary, ...day.alternatives].find((item) => item.id === optionId).title; };
const saint = (id, date, extra = {}) => ({ id, _date: date, title: extra.title || `Святы ${id}`, reading1: reading('Фп 4, 4'), gospel: reading('Ян 21, 15'), ...extra });
const route = (runtime, date, optionId, diocese = 'minsk-mohilev') => {
  const loaded = runtime.load(date, diocese);
  const option = pickerOptionsOf(date, diocese).find((item) => item.id === optionId);
  assert.ok(option, `${optionId} is a legal option of ${date}`);
  const picked = pickerRouteFor(option, date, 'readings', { today: '2000-01-01' });
  return { loaded, screen: screenFor(loaded, picked.query || {}), query: picked.query };
};

test('the rule: weekday by default; proper readings only for the closed, source-confirmed list', () => {
  assert.equal(memorialReadingsRule('sv-john-paul-ii', 'optional-memorial').mode, 'weekday-default');
  assert.equal(memorialReadingsRule('sv-martin-de-porres', 'optional-memorial').mode, 'weekday-default');
  assert.equal(memorialReadingsRule('sv-clement-i', 'optional-memorial').mode, 'weekday-default');
  assert.equal(memorialReadingsRule('sv-joachim-anne', 'memorial').mode, 'weekday-default'); // specially chosen, not proper
  assert.equal(memorialReadingsRule('sv-martha', 'memorial').mode, 'proper-prescribed');
  assert.deepEqual(memorialReadingsRule('sv-martha', 'memorial').parts, ['gospel']);
  assert.equal(memorialReadingsRule('sv-martha', 'feast'), null, 'only memorials have the rule');
  assert.equal(Object.keys(PRESCRIBED_PROPER_MEMORIALS).length, 12);
  // a diocesan prescription applies only there: Budslav is a memorial with proper readings in Pinsk only
  assert.equal(memorialReadingsRule('our-lady-budslav', 'memorial', 'pinsk').mode, 'proper-prescribed');
  assert.equal(memorialReadingsRule('our-lady-budslav', 'optional-memorial', 'grodno').mode, 'weekday-default');
});

test('every prescribed memorial is a memorial option of the engine (id and rank), in every diocese', () => {
  const dates = { 'holy-name-of-jesus': '2026-01-03', 'sv-timothy-titus': '2026-01-26', 'sv-joseph-worker': '2026-05-01', 'sv-barnabas': '2026-06-11', 'sv-martha': '2026-07-29', 'beheading-john-baptist': '2026-08-29', 'our-lady-sorrows': '2026-09-15', 'holy-guardian-angels': '2026-10-02', 'dedication-basilicas-peter-paul': '2026-11-18', 'mary-mother-church': '2026-05-25', 'immaculate-heart': '2026-06-13' }; // Budslav: tests/liturgical-decisions.test.mjs
  for (const [id, date] of Object.entries(dates)) {
    let found = 0;
    for (const diocese of ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno']) {
      const day = resolveLiturgicalDate(date, { country: 'BY', diocese });
      const option = [day.primary, ...day.alternatives].find((item) => item.id === id);
      if (!option) continue;
      found += 1;
      // Mother of the Church is a feast in the diocese of Pinsk: the rule applies to memorials only
      if (!(id === 'mary-mother-church' && option.officeKind === 'feast')) assert.ok(['memorial', 'optional-memorial'].includes(option.officeKind), `${id} ${diocese}: ${option.officeKind}`);
    }
    assert.ok(found > 0, `${id} appears on ${date}`);
  }
});

test('descriptor: the lookup order follows the rule and the allowed choice names it', () => {
  const day = resolveLiturgicalDate('2026-07-29', { country: 'BY', diocese: 'minsk-mohilev' });
  const martha = [day.primary, ...day.alternatives].findIndex((item) => item.id === 'sv-martha');
  const resolution = [day.readingResolution.primary, ...day.readingResolution.alternatives][martha];
  assert.deepEqual(resolution.lookup.map((entry) => entry.purpose), ['proper', 'weekday', 'common']);
  assert.equal(resolution.allowedChoices[0].default, 'proper');
  assert.equal(resolution.allowedChoices[0].rule, 'proper-prescribed');
  const jp = resolveLiturgicalDate('2026-10-22', { country: 'BY', diocese: 'minsk-mohilev' });
  const index = [jp.primary, ...jp.alternatives].findIndex((item) => item.id === 'sv-john-paul-ii');
  const jpResolution = [jp.readingResolution.primary, ...jp.readingResolution.alternatives][index];
  assert.deepEqual(jpResolution.lookup.map((entry) => entry.purpose), ['weekday', 'proper', 'common']);
  assert.equal(jpResolution.allowedChoices[0].default, 'weekday');
});

test('22.10 John Paul II (optional memorial with own readings): the calendar route opens the WEEKDAY readings, own readings are an alternative', () => {
  const runtime = createReadingsRuntime([weekday('ordinary-w29-d5--2', 29, 5, '2'), saint('22-10-sv-john-paul-ii', '22.10', { title: titleOf('2026-10-22', 'sv-john-paul-ii') })]);
  const { screen } = route(runtime, '2026-10-22', 'sv-john-paul-ii');
  assert.equal(screen.activeGroup.documents[0].id, 'ordinary-w29-d5--2');
  assert.ok(screen.groups.some((group) => group.documents.some((doc) => doc.id === '22-10-sv-john-paul-ii')), 'own readings stay selectable');
});

test('03.11 Martin de Porres and 23.11 Clement behave the same way', () => {
  for (const [date, id, doc, week, dow] of [['2026-11-03', 'sv-martin-de-porres', '03-11-sv-martin-de-porres', 31, 3], ['2026-11-23', 'sv-clement-i', '23-11-sv-clement-i', 34, 2]]) {
    const runtime = createReadingsRuntime([weekday(`ordinary-w${week}-d${dow}--2`, week, dow, '2'), saint(doc, date.slice(8) + '.' + date.slice(5, 7), { title: titleOf(date, id) })]);
    const { screen } = route(runtime, date, id);
    assert.equal(screen.activeGroup.documents[0].id, `ordinary-w${week}-d${dow}--2`, id);
    assert.ok(screen.groups.some((group) => group.documents.some((item) => item.id === doc)));
  }
});

test('29.07 Martha (proper Gospel prescribed): the route and the default open the memorial readings; the weekday group stays selectable', () => {
  const runtime = createReadingsRuntime([weekday('ordinary-w17-d4--2', 17, 4, '2'), saint('29-07-sv-martha', '29.07', { title: titleOf('2026-07-29', 'sv-martha') })]);
  const { screen } = route(runtime, '2026-07-29', 'sv-martha');
  assert.equal(screen.activeGroup.documents[0].id, '29-07-sv-martha');
  assert.ok(screen.groups.some((group) => group.documents.some((doc) => doc.id === 'ordinary-w17-d4--2')));
  // without a chosen option the memorial is the primary of the day: its default readings are proper
  const loaded = runtime.load('2026-07-29', 'minsk-mohilev');
  assert.equal(screenFor(loaded, {}).activeGroup.documents[0].id, '29-07-sv-martha');
});

test('a prescribed optional memorial without a document of its own falls back to the weekday readings (a data gap, reported by the audit)', () => {
  const runtime = createReadingsRuntime([weekday('christmas-03-01', 1, 1)]);
  const day = resolveLiturgicalDate('2026-01-03', { country: 'BY', diocese: 'minsk-mohilev' });
  assert.ok([day.primary, ...day.alternatives].some((item) => item.id === 'holy-name-of-jesus'));
  const loaded = runtime.load('2026-01-03', 'minsk-mohilev');
  assert.ok(loaded.items.every((doc) => doc.id !== '03-01-holy-name-of-jesus'));
});

test('Hours -> Readings route: a document linked by the Hours day id is shown only when the plan offers it', () => {
  // IV Sunday of Advent 2025: the seasonal date document of 21.12 is not an option of that Sunday
  const runtime = createReadingsRuntime([
    { id: 'advent-w4-d1--A', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'A', title: 'IV Нядзеля Адвэнту', reading1: reading('Іс 7, 10'), gospel: reading('Мц 1, 18') },
    { id: 'advent-21-12', _date: '21.12', _dayId: 'advent-sunday-link', title: 'Будзень 21 снежня', reading1: reading('Пс 2, 8'), gospel: reading('Лк 1, 39') },
  ]);
  const day = runtime.resolve('2025-12-21', 'minsk-mohilev');
  assert.equal(day.primary.kind, 'temporal');
  const loaded = runtime.load('2025-12-21', 'minsk-mohilev', { dayId: 'advent-sunday-link' });
  assert.ok(!loaded.items.some((doc) => doc.id === 'advent-21-12'), 'the foreign date document is not added');
  assert.equal(screenFor(loaded, { dayId: 'advent-sunday-link' }).activeGroup.documents[0].id, 'advent-w4-d1--A');
});
