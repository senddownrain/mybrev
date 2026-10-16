import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRouter, createMemoryHistory } from 'vue-router';
import { feastCatalog, periodCatalog, findCatalogEntry, catalogMatches, periodMatchesDay } from '../src/utils/liturgicalCatalog.js';
import { calendarOccurrence, occurrenceRoute, nearestCatalogYear } from '../src/utils/catalogOccurrence.js';
import { loadCatalogPreview } from '../src/utils/catalogPreview.js';
import { getCalendarDefinitions, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { pickerColorsOf, pickerSwatch } from '../src/utils/ordoDatePicker.js';
import { colorInfo } from '../src/utils/ordoScreen.js';
import { VESTMENT_COLORS } from '../src/constants/liturgical.js';
import { openFirestoreSnapshot } from '../scripts/lib/firestore-snapshot.mjs';

const dioceses = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];
const entry = (id, diocese = dioceses[0]) => findCatalogEntry(id, [diocese], diocese);
const json = async (file) => JSON.parse(await fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('Nicholas is a year-independent white definition, searchable by name, rank, diocese, date and dated year', () => {
  const n = entry('sv-nicholas');
  assert.equal(n.title, 'Св. Мікалая, біскупа');
  assert.equal(n.color, 'albus');
  assert.deepEqual(n.daysRef.dayIds, ['06-12-sv-nicholas']);
  assert.deepEqual(n.templates, ['pastors']);
  for (const query of ['Мікалая', '06.12', '06.12.2026', 'Неабавязковы', 'Мінска']) assert.ok(catalogMatches(n, query), query);
  assert.ok(!catalogMatches(n, '', 'dynamic'));
  const merged = feastCatalog(dioceses).filter((e) => e.id === n.id);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].dioceses, dioceses);
  for (const color of Object.keys(VESTMENT_COLORS)) assert.equal(colorInfo(color).swatch, VESTMENT_COLORS[color].swatch);
  assert.notEqual(colorInfo('albus').swatch, pickerSwatch('albus'), 'white fill and contrasting calendar border stay distinct');
  assert.deepEqual(pickerColorsOf('2026-12-06', 'minsk-mohilev'), ['violaceus']);
});

test('portable expected occurrences are checked against real Ordo for both modes', async () => {
  for (const expected of await json('tests/fixtures/liturgical-catalog-occurrences.json')) {
    for (const mode of ['hours', 'readings']) {
      const actual = calendarOccurrence(entry(expected.entryId, expected.diocese), expected.year, expected.diocese, mode);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${expected.entryId}/${expected.year}/${mode}/${key}`);
      const route = occurrenceRoute(actual, mode);
      assert.equal(Boolean(route), mode === 'hours' ? expected.canOpenHours : expected.canOpenReadings);
      if (route) {
        const day = resolveLiturgicalDate(actual.effectiveDate, { diocese: actual.diocese });
        const resolution = mode === 'hours' ? day.officeResolution : day.readingResolution;
        assert.ok([resolution.primary, ...resolution.alternatives].some((o) => o.optionId === route.query.option));
      }
    }
  }
});

test('diocesan differences stay separate; add, modify, suppress and annual suppression use active publication', () => {
  const original = getCalendarDefinitions();
  try {
    const j = feastCatalog(dioceses).filter((e) => e.id === 'sv-josaphat');
    assert.equal(j.length, 4, 'Minsk and Pinsk share rank but own different source IDs; do not lose either');
    assert.equal(j.find((e) => e.dioceses.includes('vitebsk')).rank, 'solemnitas');
    setCalendarDefinitions({ dioceseOverrides: [...original.dioceseOverrides,
      { id: 'test-suppress', dioceseId: 'grodno', celebrationId: 'sv-nicholas', action: 'suppress' },
      { id: 'test-add', dioceseId: 'pinsk', celebrationId: 'test-local', action: 'add', title: 'Мясцовае свята', rank: 'festum', color: 'ruber', dateRule: { type: 'fixed', month: 6, day: 8 } },
      { id: 'test-weekday', dioceseId: 'pinsk', celebrationId: 'test-weekday', action: 'add', title: 'Апошняя нядзеля', rank: 'solemnitas', color: 'albus', dateRule: { type: 'last-weekday-of-month', month: 10, isoWeekday: 7 } },
    ], yearOverrides: [...original.yearOverrides,
      { id: 'test-year', year: 2027, scope: 'diocese', dioceseId: 'pinsk', action: 'suppress', targetCelebrationId: 'sv-nicholas', reason: 'test' },
    ] });
    const n = feastCatalog(dioceses).find((e) => e.id === 'sv-nicholas');
    assert.ok(n.dioceses.includes('minsk-mohilev'));
    assert.ok(!n.dioceses.includes('grodno'));
    assert.equal(calendarOccurrence(n, 2027, 'grodno').status, 'not-applicable-in-diocese');
    assert.ok(entry('test-local', 'pinsk'));
    assert.ok(!entry('test-local', 'minsk-mohilev'));
    assert.equal(entry('test-weekday', 'pinsk').dateRule.type, 'last-weekday-of-month');
    assert.equal(calendarOccurrence(entry('test-weekday', 'pinsk'), 2026, 'pinsk').originalDate, '2026-10-25');
    const blocked = calendarOccurrence(n, 2027, 'pinsk');
    assert.equal(blocked.status, 'suppressed/impeded');
    assert.equal(blocked.canOpenHours, false);
    assert.ok(blocked.reason.includes('Рашэнне'));
    assert.equal(calendarOccurrence(n, 2027, 'minsk-mohilev').status, 'legal-alternative');
  } finally { setCalendarDefinitions(original); }
});

test('semantic positions persist without a year; actual dates and nearest years match exactly', () => {
  const positions = periodCatalog();
  assert.equal(new Set(positions.map((e) => e.id)).size, positions.length);
  assert.ok(positions.some((e) => e.id === 'period:ordinary-w1-d1'));
  assert.ok(positions.some((e) => e.id === 'period:ordinary-w34-d7'));
  const absent = entry('period:advent-w4-d7');
  assert.equal(calendarOccurrence(absent, 2026, dioceses[0]).effectiveDate, null);
  const nearest = nearestCatalogYear(absent, 2026, dioceses[0], 'hours');
  assert.ok(nearest);
  assert.ok(periodMatchesDay(absent, resolveLiturgicalDate(nearest.effectiveDate, { diocese: dioceses[0] })));
  assert.equal(calendarOccurrence(entry('period:ordinary-w1-d1'), 2026, dioceses[0]).effectiveDate, null);
  for (let day = 17; day <= 24; day += 1) {
    const occurrence = calendarOccurrence(entry(`period:advent-${day}-12`), 2026, dioceses[0]);
    assert.ok(!occurrence.effectiveDate || occurrence.effectiveDate === `2026-12-${day}`);
  }
  assert.equal(calendarOccurrence(entry('period:advent-20-12'), 2026, dioceses[0]).effectiveDate, null, 'Sunday never masquerades as the dated Advent weekday');
  assert.equal(calendarOccurrence(entry('period:christmas-13-01'), 2026, dioceses[0]).effectiveDate, null);
  assert.equal(calendarOccurrence(entry('period:christmas-02-01'), 2022, dioceses[0]).effectiveDate, null, 'a Christmas Sunday is not the dated feria');
});

test('All Souls Sunday independently gates Hours and Readings; commemoratio never routes as an Office', () => {
  const souls = entry('all-faithful-departed');
  const occurrence = calendarOccurrence(souls, 2025, dioceses[0], 'readings');
  assert.equal(occurrence.canOpenReadings, true);
  assert.equal(occurrence.canOpenHours, false);
  assert.equal(occurrenceRoute(occurrence, 'hours'), null);
  assert.equal(calendarOccurrence(souls, 2025, dioceses[0], 'hours').status, 'suppressed/impeded');
  const c = calendarOccurrence(entry('sv-casimir'), 2026, dioceses[0]);
  assert.equal(occurrenceRoute(c, 'hours'), null);
  assert.equal(occurrenceRoute(c, 'readings'), null);
});

test('router keeps mode, diocese and picker query across preview, calendar and back', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/picker', name: 'LiturgicalPicker', component: {} },
    { path: '/day/:day', name: 'SelectedDay', component: {} },
    { path: '/readings/:date', name: 'ReadingsByDate', component: {} },
  ] });
  for (const mode of ['hours', 'readings']) {
    const q = { mode, tab: 'feasts', q: 'Мікалая', entry: 'sv-nicholas', panel: 'preview' };
    await router.push({ name: 'LiturgicalPicker', query: q });
    const before = router.currentRoute.value.fullPath;
    const target = occurrenceRoute(calendarOccurrence(entry('sv-nicholas', 'pinsk'), 2027, 'pinsk', mode), mode);
    await router.push(target);
    assert.equal(router.currentRoute.value.query.diocese, 'pinsk');
    const back = new Promise((resolve) => { const stop = router.afterEach(() => { stop(); resolve(); }); });
    router.back(); await back;
    assert.equal(router.currentRoute.value.fullPath, before);
    assert.equal(occurrenceRoute(calendarOccurrence(entry('sv-nicholas'), 2026, dioceses[0], mode), mode), null);
  }
});

test('source preview reads real Nicholas/pastors IDs, keeps parts separate, never fills from a date', async () => {
  const proper = { ...await json('patchs/db-feasts/06-12-sv-nicholas.json'), id: '06-12-sv-nicholas' };
  const common = { ...await json('patchs/db-templates/pastors.json'), id: 'pastors' };
  const calls = [];
  const preview = await loadCatalogPreview(entry('sv-nicholas'), {
    async document(collection, id) { calls.push(`${collection}/${id}`); return collection === 'liturgicalProperTexts' && id === proper.id ? proper : collection === 'liturgicalTemplates' && id === 'pastors' ? common : null; },
    async query() { return []; },
  });
  assert.ok(calls.includes('liturgicalProperTexts/06-12-sv-nicholas'));
  assert.ok(calls.includes('liturgicalTemplates/pastors'));
  assert.equal(preview.availability, 'proper-and-common');
  assert.ok(preview.sources.find((s) => s.kind === 'proper').fields.some((f) => f.key === 'officeOfReadingsPr' && f.text.includes('Мікалая')));
  assert.ok(!preview.sources.find((s) => s.kind === 'proper').fields.some((f) => f.key === 'laudesPs1'), 'no invented psalter');
  assert.ok(preview.sources.some((s) => s.id === 'pastors:easter'), 'seasonal Commons remain independently viewable');
  assert.equal(calendarOccurrence(entry('sv-nicholas'), 2026, dioceses[0], 'hours', { preview }).canOpenHours, false);
});

test('missing and partial sources are explicit, including failures and no-content, without affecting rubrics', async () => {
  const reader = { document: async () => null, query: async () => [] };
  const n = entry('sv-nicholas');
  const empty = await loadCatalogPreview(n, reader);
  assert.equal(empty.status, 'no-content');
  assert.ok(empty.missing.includes('pastors'));
  const legal = calendarOccurrence(n, 2027, dioceses[0], 'hours', { preview: empty });
  assert.equal(legal.status, 'no-content');
  assert.equal(legal.calendarStatus, 'legal-alternative');
  assert.equal(legal.canOpenHours, true);
  assert.equal(calendarOccurrence(n, 2027, dioceses[0], 'readings', { preview: empty }).status, 'legal-alternative', 'a yearless preview cannot declare the prescribed weekday readings absent');
  const failed = await loadCatalogPreview(n, { ...reader, document: async () => { throw Error('offline'); } });
  assert.ok(failed.errors.length > 0);
  const commonOnly = await loadCatalogPreview(n, { ...reader, document: async (c) => c === 'liturgicalTemplates' ? { id: 'pastors', laudesHymn: 'Гімн' } : null });
  assert.equal(commonOnly.availability, 'common-only');
});

test('readings preview keeps every stored cycle, excludes another saint and preserves missing/null opening week', async () => {
  const reader = { document: async () => null, query: async () => [
    { id: 'A', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'A', gospel: { text: 'A' } },
    { id: 'B', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'B', gospel: { text: 'B' } },
    { id: 'C', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'C', gospel: { text: 'C' } },
  ] };
  const preview = await loadCatalogPreview(entry('period:advent-w4-d1'), reader);
  assert.deepEqual(preview.readings.map((d) => d.year), ['A', 'B', 'C']);
  const weekday = await loadCatalogPreview(entry('period:ordinary-w2-d2'), { ...reader, query: async () => ['1', '2'].map((year) => ({ id: year, year, _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 2, gospel: { text: year } })) });
  assert.deepEqual(weekday.readings.map((d) => d.year), ['1', '2']);
  const n = await loadCatalogPreview(entry('sv-nicholas'), { ...reader, query: async () => [
    { id: 'n', _date: '06.12', _dayIds: ['06-12-sv-nicholas'], title: 'Св. Мікалая, біскупа', gospel: { text: 'Тэкст' } },
    { id: 'other', _date: '06.12', title: 'Іншае свята', gospel: { text: 'Не гэты тэкст' } },
  ] });
  assert.deepEqual(n.readings.map((d) => d.id), ['n']);
  const ash = await loadCatalogPreview(entry('period:lent-w0-d4'), { ...reader, query: async () => [{ id: 'ash', _periodType: 'lent', _dayOfWeek: 4, _periodWeekNumber: null }] });
  assert.equal(ash.readings.length, 1);
});

test('available private snapshot is read locally; it is never refreshed or included in fixtures', async (t) => {
  try { await fs.access(new URL('../backups/firestore-snapshot/manifest.json', import.meta.url)); } catch { t.skip('private snapshot absent'); return; }
  const snapshot = await openFirestoreSnapshot(fileURLToPath(new URL('../backups/firestore-snapshot', import.meta.url)));
  const proper = await snapshot.document(snapshot.collectionPaths.includes('days') ? 'days' : 'fixedDays', '06-12-sv-nicholas');
  assert.ok(proper);
  const preview = await loadCatalogPreview(entry('sv-nicholas'), { document: async (c, id) => c === 'days' && id === proper.id ? proper : null, query: async () => [] });
  assert.ok(preview.sources.some((s) => s.fields.some((f) => f.key === 'officeOfReadingsPr')));
});
