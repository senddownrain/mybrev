/** Liturgical date picker and the diocesan context of routes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_PICKER_COLORS, colorGradient, pickerColorsOf, pickerOptionsOf, pickerRouteFor, pickerSwatch,
} from '../src/utils/ordoDatePicker.js';
import { resolveRuntimeDay, planReadings } from '../src/utils/ordo/runtime.js';
import { orderReadingsByPlan } from '../src/utils/ordo/readingsPlan.js';
import { colorInfo } from '../src/utils/ordoScreen.js';
import { nextRouteDiocese } from '../src/utils/ordoDiocese.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('one colour: a plain circle', () => {
  // All Saints: a solemnity, one legal Office.
  assert.deepEqual(pickerColorsOf('2026-11-01', 'minsk-mohilev'), ['albus']);
  assert.equal(colorGradient(['albus']), pickerSwatch('albus'));
  assert.equal(colorGradient(['ruber']), colorInfo('ruber').swatch);
  assert.deepEqual(pickerColorsOf('2026-03-04', 'minsk-mohilev'), ['violaceus'], 'a commemoration does not colour a Lent weekday');
  assert.equal(colorGradient([]), 'transparent');
});

test('two and three colours: segments of a conic gradient', () => {
  // Monday 28.09.2026: green weekday, St Wenceslaus (red), St Lawrence Ruiz (red).
  const two = pickerColorsOf('2026-09-28', 'minsk-mohilev');
  assert.deepEqual(two, ['viridis', 'ruber']);
  const gradient = colorGradient(two);
  assert.match(gradient, /^conic-gradient\(from 0deg, /);
  assert.match(gradient, /0\.00% 50\.00%, .* 50\.00% 100\.00%\)$/);
  const three = colorGradient(['viridis', 'ruber', 'albus']);
  assert.equal(three.match(/%/g).length, 6);
  assert.match(three, /33\.33% 66\.67%/);
  // A date with three legal colours exists and is capped at three.
  const dates = [];
  for (let day = 1; day <= 365 && dates.length < 1; day += 1) {
    const iso = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    if (pickerColorsOf(iso, 'grodno').length === 3) dates.push(iso);
  }
  assert.ok(MAX_PICKER_COLORS === 3);
});

test('only legal options are offered, with rank and colour; suppressed never colour a date', () => {
  // 12.11.2026 in Vitebsk: St Josaphat is a solemnity; the weekday is suppressed.
  const options = pickerOptionsOf('2026-11-12', 'vitebsk');
  assert.deepEqual(options.map((item) => item.id), ['sv-josaphat']);
  assert.equal(options[0].rank, 'Урачыстасць');
  assert.deepEqual(pickerColorsOf('2026-11-12', 'vitebsk'), ['ruber']);
  const day = resolveRuntimeDay('2026-11-12', { diocese: 'vitebsk' });
  assert.ok(day.suppressed.some((item) => item.kind === 'temporal'));

  const weekday = pickerOptionsOf('2026-09-28', 'minsk-mohilev');
  assert.deepEqual(weekday.map((item) => item.role), ['primary', 'alternative', 'alternative']);
  assert.equal(weekday[0].rank, 'Будзень');
  assert.equal(weekday[1].rank, 'Неабавязковы ўспамін');
  assert.ok(weekday.every((item) => item.swatch && item.colorLabel));
  // An option without proper content is still offered.
  const scaffold = pickerOptionsOf('2028-10-11', 'minsk-mohilev');
  assert.ok(scaffold.some((item) => item.id === 'sv-john-xxiii' && item.hasProperHours === false));
  // The options are the engine's, in the same order.
  assert.deepEqual(weekday.map((item) => item.id),
    [resolveRuntimeDay('2026-09-28', { diocese: 'minsk' }).primary.id, ...resolveRuntimeDay('2026-09-28', { diocese: 'minsk' }).alternatives.map((item) => item.id)]);
});

test('Hours route of the chosen option', () => {
  const [primary, alternative] = pickerOptionsOf('2026-09-28', 'minsk-mohilev');
  const context = { today: '2026-09-30' };
  assert.deepEqual(pickerRouteFor(primary, '2026-09-28', 'hours', context),
    { name: 'SelectedDay', params: { day: '2026-09-28' }, query: { option: primary.id } });
  assert.deepEqual(pickerRouteFor(alternative, '2026-09-28', 'hours', context),
    { name: 'SelectedDay', params: { day: '2026-09-28' }, query: { option: alternative.id } });
  assert.deepEqual(pickerRouteFor(pickerOptionsOf('2026-09-30', 'minsk-mohilev')[0], '2026-09-30', 'hours', context), { name: 'Today' });
  // The diocesan context of the screen is kept.
  assert.deepEqual(pickerRouteFor(primary, '2026-09-28', 'hours', { ...context, diocese: 'pinsk', defaultDiocese: 'minsk-mohilev' }).query,
    { diocese: 'pinsk', option: primary.id });
  // The Hours list forwards to the Office of that option.
  const list = read('src/components/ItemsList.vue');
  assert.match(list, /item\.ordo\?\.optionId === optionId/);
  assert.match(list, /router\.replace\(optionRoute\(option\)\)/);
});

test('Readings route of the chosen option', () => {
  const [primary, alternative] = pickerOptionsOf('2026-09-28', 'minsk-mohilev');
  const context = { today: '2026-09-30' };
  assert.deepEqual(pickerRouteFor(primary, '2026-09-28', 'readings', context), { name: 'ReadingsByDate', params: { date: '2026-09-28' } });
  assert.deepEqual(pickerRouteFor(alternative, '2026-09-28', 'readings', context),
    { name: 'ReadingsByDate', params: { date: '2026-09-28' }, query: { option: alternative.id } });
  assert.deepEqual(pickerRouteFor(pickerOptionsOf('2026-09-30', 'minsk-mohilev')[0], '2026-09-30', 'readings', context), { name: 'Readings' });
  // Every readings document knows the legal option it belongs to.
  const day = resolveRuntimeDay('2026-09-28', { diocese: 'minsk' });
  const plan = planReadings(day);
  const docs = [
    { id: 'wd', _periodType: 'ordinary', _periodWeekNumber: 26, _dayOfWeek: 2 },
    { id: 'saint', _date: '28.09', title: alternative.title },
  ];
  const ordered = orderReadingsByPlan(plan, docs, { includeAlternatives: true });
  assert.equal(ordered.find((doc) => doc.id === 'wd')._ordoOptionId, primary.id);
  assert.equal(ordered.find((doc) => doc.id === 'saint')._ordoOptionId, alternative.id);
  assert.match(read('src/components/readings/ReadingsView.vue'), /document\._ordoOptionId === optionId/);
});

test('the picker uses the resolved day; both navigation bars pass the screen context', () => {
  const picker = read('src/components/common/CustomDatePicker.vue');
  assert.match(picker, /pickerColorsOf\(isoOf\(day\), props\.diocese\)/);
  assert.match(picker, /emit\('select-option', \{ option, date: selectedIso \}\)/);
  const helper = read('src/utils/ordoDatePicker.js');
  assert.match(helper, /resolveRuntimeDay/);
  assert.ok(!/precedence|compareCandidates|resolveDisplay/.test(helper), 'no selection algorithm of its own');
  for (const [file, mode] of [['src/layouts/default/BottomNav.vue', 'hours'], ['src/layouts/default/ReadingsBottomNav.vue', 'readings']]) {
    const nav = read(file);
    // Colours and options of every diocese of Settings.
    assert.match(nav, /liturgical\s+show-options\s+:diocese="effectiveOrdoDioceses"/);
    // date + option → that option; «Выбраць» → the main screen of the date.
    assert.match(nav, new RegExp(`pickerRouteFor\\(option, date, '${mode}'`));
    assert.match(nav, new RegExp(`pickerDateRoute\\(date, '${mode}'`));
    assert.match(nav, />Выбраць</);
    assert.ok(!/Выберыце дзень і варыянт/.test(nav));
  }
  // The Ordo screen keeps its own multi-diocese filter: colours only there.
  const ordoNav = read('src/layouts/default/OrdoBottomNav.vue');
  assert.match(ordoNav, /liturgical\s+:diocese="ordoDioceseFilter"/);
  assert.ok(!/show-options/.test(ordoNav));
});

test('diocesan context of a route: explicit, kept within the same day, dropped elsewhere', () => {
  const day = (name, date, query = {}) => ({ name, params: name === 'ReadingsByDate' ? { date } : { day: date }, query });
  assert.equal(nextRouteDiocese(day('SelectedDay', '2026-11-12', { diocese: 'pinsk' }), { name: 'OrdoByDate', params: { date: '2026-11-12' }, query: {} }), 'pinsk');
  assert.equal(nextRouteDiocese(day('SelectedDay', '2026-11-12', { diocese: 'nope' }), {}, 'pinsk'), '');
  assert.equal(nextRouteDiocese(day('oras', '2026-11-12'), day('SelectedDay', '2026-11-12'), 'pinsk'), 'pinsk');
  assert.equal(nextRouteDiocese(day('laudes', '2026-11-12'), day('oras', '2026-11-12'), 'pinsk'), 'pinsk');
  assert.equal(nextRouteDiocese(day('SelectedDay', '2026-11-13'), day('SelectedDay', '2026-11-12'), 'pinsk'), '');
  assert.equal(nextRouteDiocese({ name: 'Today', params: {}, query: {} }, day('oras', '2026-11-12'), 'pinsk'), '');
  assert.equal(nextRouteDiocese({ name: 'Settings', params: {}, query: {} }, day('oras', '2026-11-12'), 'pinsk'), '');
});
