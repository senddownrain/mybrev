import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { buildCalendarLayers, LAYER_LEVELS } from '../src/utils/ordo/layers.js';
import { getCalendarDefinitions, setCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { contextKey } from '../src/utils/ordo/yearPlan.js';
import { LEGACY_STORAGE_KEYS, removeLegacyStorageKeys } from '../src/utils/legacyStorageCleanup.js';
import {
  announcesOtherDate, buildMonthOverview, getOrdoYear, groupOrdoNotes, listCalendarCelebrations,
  NOTE_GROUPS, buildDayUnion, buildMonthUnion, legalColors, massSummary, normalizeDioceseFilter, noteAppliesToYear,
  officeDirections, ordoMonthRoute, ordoRouteFor, parseOrdoMonth, parseOrdoRouteDate, resolveOrdoDay, shiftOrdoMonth,
  suppressionReason, yearCelebrations, ORDO_FILTER_DIOCESES, celebrationViewDate, celebrationTextContext, periodTextContext,
} from '../src/utils/ordoScreen.js';
import { planReadings } from '../src/utils/ordo/runtime.js';
import { orderReadingsByPlan } from '../src/utils/ordo/readingsPlan.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('period reader opens its temporal position even under an obligatory saint, without changing Ordo', () => {
  const canonical = resolveOrdoDay('2026-01-21', { diocese: 'minsk-mohilev' });
  const original = JSON.stringify(canonical);
  assert.equal(canonical.primary.id, 'sv-agnes');
  const period = periodTextContext('2026-01-21', { diocese: 'minsk-mohilev' });
  assert.equal(period.primary.id, 'temporal:ordinary-w2-d4');
  assert.equal(period.primary.color, 'viridis');
  assert.equal(period.officeOptions.length, 1);
  assert.equal(JSON.stringify(canonical), original);
  const plan = planReadings(period);
  assert.equal(plan.options.length, 1);
  const docs = orderReadingsByPlan(plan, [
    { id: 'weekday', _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 4 },
    { id: 'saint', _date: '21.01', title: 'Св. Агнешкі' },
  ], { includeAlternatives: true });
  assert.deepEqual(docs.map((doc) => doc.id), ['weekday']);
  assert.equal(plan.cycle, canonical.readingCycle.weekday);
});

test('period reader preserves temporal seasons, date entities and reading cycles', () => {
  const positions = [
    ['2026-01-20', 'ordinary', 2, 3], ['2026-12-17', 'advent', 3, 5],
    ['2026-02-18', 'lent', 0, 4], ['2026-04-02', 'holyweek', 1, 5],
    ['2026-04-05', 'easter', 1, 1], ['2026-12-25', 'christmas', 1, 6],
  ];
  for (const [date, period, week, dow] of positions) {
    const day = periodTextContext(date, { diocese: 'minsk-mohilev' });
    assert.deepEqual([day.period, day.week, day.dayOfWeek], [period, week, dow]);
    assert.equal(day.officeOptions.length, 1);
    assert.equal(day.periodOnly, true);
    assert.ok(planReadings(day).options[0].lookup.length);
  }
  assert.deepEqual(planReadings(periodTextContext('2026-12-17')).options[0].lookup[0].where, { _date: '17.12', dateOnly: true });
  assert.equal(new Set(['2025-01-21', '2026-01-20'].map((date) => planReadings(periodTextContext(date)).cycle)).size, 2);
});

test('feast reading reference dates keep exact diocesan identities and leave Ordo unchanged', () => {
  for (const diocese of ORDO_FILTER_DIOCESES) {
    for (const mode of ['oras', 'readings']) {
      const date = celebrationViewDate('sv-nicholas', 2026, { diocese, mode });
      assert.equal(date, '2025-12-06');
      const day = resolveOrdoDay(date, { diocese });
      const options = mode === 'readings' ? [day.primary, ...day.alternatives] : day.officeOptions;
      assert.ok(options.some((item) => item.id === 'sv-nicholas'));
    }
  }
  assert.equal(celebrationViewDate('sv-nicholas', 2027, { diocese: 'minsk-mohilev' }), '2027-12-06');
  assert.equal(celebrationViewDate('sv-nicholas', 2027, { diocese: 'grodno' }), '2027-12-06');
  assert.equal(celebrationViewDate('corpus-christi', 2026, { diocese: 'minsk-mohilev' }), '2026-06-04');
  assert.equal(celebrationViewDate('not-a-celebration', 2026, { diocese: 'minsk-mohilev' }), '');
  const canonical = resolveOrdoDay('2026-12-06', { diocese: 'minsk-mohilev' });
  const before = JSON.stringify(canonical);
  const reference = celebrationTextContext('2026-12-06', 'sv-nicholas', { diocese: 'minsk-mohilev' });
  assert.equal(reference.referenceOnly, true);
  assert.equal(reference.primary.id, 'sv-nicholas');
  assert.equal(reference.primary.color, 'albus');
  assert.ok(reference.readingResolution.primary.lookup.every((item) => item.purpose !== 'weekday'));
  assert.equal(JSON.stringify(canonical), before);
  assert.ok(!resolveOrdoDay('2026-12-06', { diocese: 'minsk-mohilev' }).officeOptions.some((item) => item.id === 'sv-nicholas'));
});

test('permanently impeded memorials use isolated reference descriptors and preserve diocesan text refs', () => {
  assert.equal(celebrationViewDate('sv-patryk', 2026, { diocese: 'minsk-mohilev' }), '');
  for (const diocese of ORDO_FILTER_DIOCESES) {
    const reference = celebrationTextContext('2026-03-17', 'sv-patryk', { diocese });
    const definition = buildCalendarLayers({ country: 'BY', diocese }).celebrations.get('sv-patryk');
    assert.deepEqual(reference.primary.daysRef, definition.daysRef);
    assert.deepEqual(reference.primary.readingsRef, definition.readingsRef);
    assert.equal(reference.officeResolution.primary.officeKind, 'optional-memorial');
    assert.ok(reference.officeResolution.primary.allowedChoices.some((item) => item.options.includes('common')));
    const day = resolveOrdoDay('2026-03-17', { diocese });
    assert.ok(!day.officeOptions.some((item) => item.id === 'sv-patryk'));
  }
  assert.throws(() => celebrationTextContext('2026-03-17', 'unknown', { diocese: 'pinsk' }));
});

test('feast search includes every effective definition even when Ordo suppresses it', () => {
  const rows = yearCelebrations(2026, ORDO_FILTER_DIOCESES);
  for (const diocese of ORDO_FILTER_DIOCESES) {
    for (const definition of buildCalendarLayers({ country: 'BY', diocese }).celebrations.values()) {
      if (definition.suppressedBy) continue;
      assert.ok(rows.some((row) => row.optionId === definition.id && row.dioceses.includes(diocese)), `${diocese}: ${definition.id}`);
    }
  }
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
  const nicholas = rows.filter((row) => /Мікалая, біскупа/.test(row.title));
  assert.ok(nicholas.length);
  nicholas.forEach((row) => {
    assert.equal(row.date, '2026-12-06');
    assert.equal(row.color, 'albus');
    assert.equal(row.hoursAllowed, false);
    assert.equal(row.readingsAllowed, false);
    assert.match(row.statusLabel, /не адзначаецца ў гэтым годзе/);
  });
  for (const diocese of ['minsk-mohilev', 'grodno']) {
    const row = yearCelebrations(2027, [diocese]).find((item) => /Мікалая, біскупа/.test(item.title));
    const day = resolveOrdoDay('2027-12-06', { diocese });
    assert.equal(row.hoursAllowed, day.officeOptions.some((item) => item.id === row.optionId), diocese);
    assert.equal(row.hoursAllowed, true);
    assert.equal(row.readingsAllowed, [day.primary, ...day.alternatives].some((item) => item.id === row.optionId), diocese);
    assert.equal(row.color, 'albus');
  }
  assert.ok(rows.some((row) => row.dioceses.length === 1 && row.dioceses[0] === 'vitebsk' && row.badges.includes('Віцебск')));
});

test('feast search permissions are those of Ordo for each date, mode and diocese', () => {
  for (const year of [2026, 2027]) {
    for (const row of yearCelebrations(year, ORDO_FILTER_DIOCESES)) {
      for (const diocese of row.dioceses) {
        if (!row.routeDate) {
          assert.equal(row.hoursAllowed || row.readingsAllowed, false);
          continue;
        }
        const day = resolveOrdoDay(row.routeDate, { diocese });
        assert.equal(row.hoursAllowed, day.officeOptions.some((item) => item.id === row.optionId), row.key);
        assert.equal(row.readingsAllowed, [day.primary, ...day.alternatives].some((item) => item.id === row.optionId), row.key);
      }
    }
  }
});

test('feast search preserves text/color/title/date/rank variants and local suppression', () => {
  const definitions = getCalendarDefinitions();
  const id = 'picker-test';
  const base = { id, title: 'Picker test', scope: 'universal', rank: 'memoria-ad-libitum', color: 'albus', dateRule: { type: 'fixed', month: 9, day: 28 }, daysRef: { id: 'base' } };
  const rowsFor = () => yearCelebrations(2026, ORDO_FILTER_DIOCESES).filter((row) => row.optionId === id);
  try {
    for (const changes of [
      { title: 'Іншая назва' }, { rank: 'festum' }, { color: 'ruber' },
      { dateRule: { type: 'fixed', month: 9, day: 29 } },
      { daysRef: { id: 'other' } }, { readingsRef: { id: 'other' } },
      { templates: ['other'], defaultTemplate: 'other' },
    ]) {
      setCalendarDefinitions({ ...definitions, celebrations: [base], dioceseOverrides: [
        { id: 'picker-variant', celebrationId: id, dioceseId: 'vitebsk', action: 'modify', ...changes },
      ] });
      const rows = rowsFor();
      assert.equal(rows.length, 2, JSON.stringify(changes));
      assert.deepEqual(rows.find((row) => row.dioceses.includes('vitebsk')).dioceses, ['vitebsk']);
    }
    setCalendarDefinitions({ ...definitions, celebrations: [base], dioceseOverrides: [
      { id: 'picker-suppressed', celebrationId: id, dioceseId: 'grodno', action: 'suppress' },
    ] });
    const rows = rowsFor();
    assert.equal(rows.length, 1);
    assert.ok(!rows.some((row) => row.dioceses.includes('grodno')));
    assert.ok(rows.find((row) => row.dioceses.includes('minsk-mohilev')).hoursAllowed);
  } finally {
    setCalendarDefinitions(null);
  }
});

test('feast search uses Ordo for named, movable, last-weekday dates and transfers', () => {
  const definitions = getCalendarDefinitions();
  try {
    setCalendarDefinitions({ ...definitions, celebrations: [...definitions.celebrations,
      { id: 'picker-last-sunday', title: 'Last Sunday', scope: 'universal', rank: 'festum', dateRule: { type: 'last-weekday-of-month', month: 10, isoWeekday: 7 } },
      { id: 'picker-leap', title: 'Leap day', scope: 'universal', rank: 'memoria', dateRule: { type: 'fixed', month: 2, day: 29 } },
      { id: 'picker-unresolved', title: 'Outside this year', scope: 'universal', rank: 'memoria', dateRule: { type: 'movable', anchor: 'christmas', offsetDays: 120 } },
    ] });
    const rows = yearCelebrations(2026, ['minsk-mohilev']);
    assert.equal(rows.find((row) => row.optionId === 'picker-last-sunday').date, '2026-10-25');
    assert.equal(rows.find((row) => row.optionId === 'holy-family').date, '2026-12-27');
    assert.equal(rows.find((row) => row.optionId === 'corpus-christi').date, '2026-06-04');
    const leap = rows.find((row) => row.optionId === 'picker-leap');
    assert.equal(leap.date, '2026-02-29');
    assert.equal(leap.routeDate, '');
    assert.equal(leap.color, '');
    assert.equal(leap.hoursAllowed || leap.readingsAllowed, false);
    const unresolved = rows.find((row) => row.optionId === 'picker-unresolved');
    assert.equal(unresolved.movable, true);
    assert.equal(unresolved.date, '');
    assert.equal(unresolved.routeDate, '');
    assert.equal(unresolved.hoursAllowed || unresolved.readingsAllowed, false);
    const transferred = yearCelebrations(2024, ['minsk-mohilev']).find((row) => row.optionId === 'annunciation-lord');
    assert.equal(transferred.date, '2024-03-25');
    assert.equal(transferred.routeDate, '2024-04-08');
    assert.match(transferred.statusLabel, /перанесена на 08.04/);
    assert.equal(transferred.hoursAllowed, true);
    const commemoration = rows.find((row) => row.statusLabel === 'памінанне');
    assert.ok(commemoration);
    assert.equal(commemoration.hoursAllowed || commemoration.readingsAllowed, false);
  } finally {
    setCalendarDefinitions(null);
  }
});

// ---------------------------------------------------------------------------
// Routes and drawer
// ---------------------------------------------------------------------------

test('router has lazy /ordo and /ordo/:date routes with the Ordo bottom navigation', () => {
  const router = read('src/router/index.js');
  for (const [path, name] of [['ordo', 'Ordo'], ['ordo/:date', 'OrdoByDate']]) {
    const block = router.match(new RegExp(`path: '${path.replace('/', '\\/')}',\\s*name: '${name}',[\\s\\S]*?\\n      \\},`));
    assert.ok(block, `route ${path}`);
    assert.match(block[0], /default: \(\) => import\('@\/views\/Ordo\.vue'\)/);
    assert.match(block[0], /bottomNav: \(\) => import\('@\/layouts\/default\/OrdoBottomNav\.vue'\)/);
  }
  assert.doesNotMatch(router, /^import .*Ordo/m, 'the Ordo view is never a static import');
});

test('drawer entry «Літургічны каляндар» with a Phosphor icon', () => {
  const drawer = read('src/layouts/default/NavigationDrawer.vue');
  const item = drawer.match(/<v-list-item[^>]*title="Літургічны каляндар"[\s\S]*?<\/v-list-item>/);
  assert.ok(item);
  assert.match(item[0], /:to="\{ name: 'Ordo' \}"/);
  assert.match(item[0], /<PhCalendarDots :size="22" class="drawer-icon" \/>/);
  assert.match(drawer, /PhCalendarDots,\s*\n\} from '@phosphor-icons\/vue'/);
  assert.match(drawer, /ORDO_ROUTE_NAMES = \['Ordo', 'OrdoByDate'\]/);
});

test('route helpers: /ordo is the month, a day is /ordo/:date, invalid dates fall back', () => {
  assert.deepEqual(ordoRouteFor('2026-09-29'), { name: 'OrdoByDate', params: { date: '2026-09-29' } });
  assert.deepEqual(ordoRouteFor(''), { name: 'Ordo' });
  // Current month needs no query; another month is `?month=YYYY-MM`.
  assert.deepEqual(parseOrdoMonth(undefined, '2026-09-29'), { year: 2026, month: 9 });
  assert.deepEqual(parseOrdoMonth('2027-02', '2026-09-29'), { year: 2027, month: 2 });
  assert.deepEqual(parseOrdoMonth('2027-13', '2026-09-29'), { year: 2026, month: 9 });
  assert.deepEqual(ordoMonthRoute({ year: 2026, month: 9 }, '2026-09-29'), { name: 'Ordo' });
  assert.deepEqual(ordoMonthRoute({ year: 2026, month: 12 }, '2026-09-29'), { name: 'Ordo', query: { month: '2026-12' } });
  assert.deepEqual(shiftOrdoMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftOrdoMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.equal(parseOrdoRouteDate('2026-08-14', 'x'), '2026-08-14');
  assert.equal(parseOrdoRouteDate('2026-02-30', '2026-09-29'), '2026-09-29');
  assert.equal(parseOrdoRouteDate('nonsense', '2026-09-29'), '2026-09-29');
  assert.equal(parseOrdoRouteDate(undefined, '2026-09-29'), '2026-09-29');
});

// ---------------------------------------------------------------------------
// Notes grouping
// ---------------------------------------------------------------------------

const note = (id, category, text, extra = {}) => ({
  id, category, text, scope: { level: 'diocese', dioceseId: 'vitebsk' },
  selector: { type: 'celebration', celebrationId: 'x' },
  classification: 'DISPLAY_NOTE',
  observed: [{ diocese: 'vitebsk', dates: ['2026-11-02'] }],
  ...extra,
});

test('notes are grouped by category in display order, deduplicated, with diocesan variants', () => {
  const { groups, periodNotes, count } = groupOrdoNotes([
    note('a', 'indulgence', 'Поўны адпуст.'),
    note('b', 'devotion', 'Ружанец.'),
    note('c', 'devotion', 'Ружанец.'),
    note('d', 'blessing', 'Благаслаўленне свечак.', { variants: [{ diocese: 'grodno', text: 'Благаслаўленне грамніц.' }] }),
    note('e', 'procession', 'Працэсія.'),
    note('f', 'special-prayer-day', 'Дзень малітвы за памерлых.'),
    note('g', 'pastoral-note', 'Заўвага дыяцэзіі.'),
    note('h', 'mass', 'Імша ўласная.'),
    note('i', 'unknown-kind', 'Нешта.'),
    note('p', 'liturgical-rule', 'Уводзіны ў перыяд.', { selector: { type: 'period', period: 'ordinary' } }),
  ], { date: '2026-11-02', diocese: 'grodno' });
  assert.deepEqual(groups.map((group) => group.id), [
    'mass', 'devotion', 'blessing', 'procession', 'indulgence', 'special-prayer-day', 'pastoral-note', 'other',
  ]);
  assert.equal(groups.find((group) => group.id === 'devotion').notes.length, 1);
  assert.equal(groups.find((group) => group.id === 'blessing').notes[0].text, 'Благаслаўленне грамніц.');
  assert.equal(groups.find((group) => group.id === 'mass').section, 'mass');
  assert.equal(groups.find((group) => group.id === 'indulgence').section, 'notes');
  assert.equal(groups[0].notes[0].source, 'Віцебская дыяцэзія · 2026');
  assert.deepEqual(periodNotes.map((item) => item.id), ['p']);
  assert.equal(count, 9);
});

test('one-year notes stay in their year; copied announcements only on the date they name', () => {
  const yearly = note('y', 'liturgical-rule', 'Прапускаецца свята св. Мацея.', { classification: 'YEAR_INSTANCE_ONLY' });
  assert.equal(noteAppliesToYear(yearly, 2026), true);
  assert.equal(noteAppliesToYear(yearly, 2027), false);
  assert.equal(noteAppliesToYear(note('z', 'devotion', 'x'), 2031), true);
  assert.equal(announcesOtherDate('1. Сёння, 4 студзеня, — І нядзеля месяца', '2026-04-05'), true);
  assert.equal(announcesOtherDate('Сёння, 4 студзеня, — І нядзеля месяца', '2026-01-04'), false);
  assert.equal(announcesOtherDate('Поўны адпуст з 1 па 8 лістапада', '2027-11-02'), false);
  const { groups } = groupOrdoNotes([yearly, note('s', 'special-prayer-day', 'У сераду, 25 сакавіка, Дзень святасці жыцця')], { date: '2027-04-05', diocese: 'vitebsk' });
  assert.deepEqual(groups, []);
});

test('grouping the real notes of a date through the engine', () => {
  const { notes } = JSON.parse(read('src/data/ordo/notes.json'));
  const day = resolveOrdoDay('2026-11-02', { diocese: 'pinsk', notes });
  const { groups } = groupOrdoNotes(day.ordoNotes, { date: day.date, diocese: 'pinsk' });
  assert.ok(groups.some((group) => group.id === 'blessing'));
  assert.ok(groups.every((group) => group.notes.every((item) => item.text && item.id)));
});

// ---------------------------------------------------------------------------
// Lazy-load boundary
// ---------------------------------------------------------------------------

function staticImports(source) {
  const script = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...script.matchAll(/(?:^|[\s;])import\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null; // package
  const base = specifier.startsWith('@/') ? join(root, 'src', specifier.slice(2)) : resolve(dirname(from), specifier);
  const candidates = extname(base) ? [base] : ['.js', '.vue', '.mjs', '.json', '/index.js'].map((ext) => base + ext);
  return candidates.map((path) => resolve(path)).find((path) => existsSync(path)) || null;
}

function staticGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(js|mjs|vue)$/.test(file)) continue;
    staticImports(readFileSync(file, 'utf8')).forEach((specifier) => {
      const target = resolveImport(file, specifier);
      if (target) queue.push(target);
    });
  }
  return seen;
}

test('startup code never statically imports notes.json (lazy chunk of the Ordo screen)', () => {
  const graph = staticGraph(join(root, 'src/main.js'));
  const notesPath = join(root, 'src/data/ordo/notes.json');
  assert.ok(graph.has(join(root, 'src/router/index.js')), 'the walker follows the startup graph');
  assert.ok(graph.has(join(root, 'src/utils/ordoCalendarCache.js')), 'startup restores calendar definitions');
  assert.ok(!graph.has(join(root, 'src/utils/ordo/index.js')), 'the calendar engine loads with the route');
  assert.ok(!graph.has(notesPath), 'notes.json is reachable from src/main.js through static imports');
  assert.ok(!graph.has(join(root, 'src/utils/ordoNotesLoader.js')));
  assert.ok(!graph.has(join(root, 'src/views/Ordo.vue')));

  const loader = read('src/utils/ordoNotesLoader.js');
  assert.match(loader, /import\('\.\.\/data\/ordo\/notes\.json'\)/);
  assert.deepEqual(staticImports(loader), []);
  // The Ordo view is the only static importer of the loader.
  const view = staticGraph(join(root, 'src/views/Ordo.vue'));
  assert.ok(view.has(join(root, 'src/utils/ordo/index.js')));
  assert.ok(view.has(join(root, 'src/utils/ordoNotesLoader.js')));
  assert.ok(!view.has(notesPath));
});

// ---------------------------------------------------------------------------
// No parish / own-church level
// ---------------------------------------------------------------------------

test('no LocalChurch anywhere in the runtime', () => {
  const files = [];
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|vue|mjs)$/.test(entry.name)) files.push(full);
  });
  walk(join(root, 'src'));
  const pattern = /localChurch|LocalChurch|ordoLocalChurch|titleCelebrationId|patronCelebrationId|localRole|Мой касцёл|Тытулы парафій/;
  const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
  // The only mention left is the one-time removal of the stored setting.
  assert.deepEqual(offenders.map((file) => file.slice(root.length + 1).replaceAll('\\', '/')), ['src/utils/legacyStorageCleanup.js']);
  const stored = new Map([['ordoLocalChurch', '{"enabled":true}'], ['ordoDiocese', 'pinsk']]);
  removeLegacyStorageKeys({ removeItem: (key) => stored.delete(key) });
  assert.deepEqual([...stored.keys()], ['ordoDiocese']);
  assert.ok(LEGACY_STORAGE_KEYS.includes('ordoLocalChurch'));
  assert.ok(!LAYER_LEVELS.includes('local'));

  // A stale `localChurch` in the context is ignored: same plan, same day.
  const plain = resolveLiturgicalDate('2027-06-13', { diocese: 'minsk-mohilev' });
  const stale = resolveLiturgicalDate('2027-06-13', { diocese: 'minsk-mohilev', localChurch: { titleCelebrationId: 'sv-anthony-padua' } });
  assert.equal(stale.primary.id, plain.primary.id);
  assert.equal(plain.primary.kind, 'temporal');
  assert.equal(contextKey({ diocese: 'minsk' }), contextKey({ diocese: 'minsk', localChurch: { id: 'x' } }));
  assert.ok(!('localChurch' in plain.context));
});

test('parish-title notes are not part of the runtime Ordo', () => {
  const data = JSON.parse(readFileSync(join(root, 'src/data/ordo/notes.json'), 'utf8'));
  assert.ok(data.notes.length > 1000);
  assert.ok(data.summary.excludedParishNotes > 100);
  assert.deepEqual([...new Set(data.notes.map((note) => note.scope.level))].sort(), ['belarus', 'diocese']);
  assert.ok(!data.notes.some((note) => note.category === 'local-church'));
  assert.ok(!NOTE_GROUPS.some((group) => group.id === 'local-church'));
  // A note with the removed `local` scope is never selected.
  const notes = [{
    id: 'parish', scope: { level: 'local', dioceseIds: ['grodno'] }, category: 'other',
    selector: { type: 'fixed-date', month: 11, day: 1 }, text: 'Гродна — тыт. пар.',
  }];
  assert.equal(resolveLiturgicalDate('2026-11-01', { diocese: 'grodno', notes }).ordoNotes.length, 0);
});

test('celebration list covers fixed, diocesan and movable celebrations', () => {
  const items = listCalendarCelebrations('vitebsk');
  const ids = new Set(items.map((item) => item.value));
  assert.ok(ids.has('sv-anthony-padua'));
  assert.ok(ids.has('sv-josaphat'));
  assert.ok(ids.has('ascension'));
  assert.equal(items[0].subtitle.slice(0, 5), '01.01');
});

// ---------------------------------------------------------------------------
// Day summaries and month overview
// ---------------------------------------------------------------------------

test('day summaries: Office directions, Mass, suppressed reasons', () => {
  const octave = resolveOrdoDay('2026-12-29', { diocese: 'minsk-mohilev' });
  assert.deepEqual(octave.commemorations.map((item) => item.id).length, 1);
  const directions = Object.fromEntries(officeDirections(octave).map((item) => [item.id, item.value]));
  assert.equal(directions['te-deum'], 'Гаворыцца ў Афіцыі чытанняў');
  assert.equal(directions.evening, 'II Нешпары');
  assert.match(directions.compline, /I або II Нешпараў/);

  const kolbe = resolveOrdoDay('2026-08-14', { diocese: 'minsk-mohilev' });
  assert.match(officeDirections(kolbe).find((item) => item.id === 'evening').value, /^I Нешпары: Унебаўзяцце/);
  assert.equal(suppressionReason(kolbe.suppressed[0]), 'будзень не з’яўляецца альтэрнатывай абавязковаму ўспаміну');

  const weekday = resolveOrdoDay('2026-09-28', { diocese: 'minsk-mohilev' });
  assert.equal(weekday.alternatives.length, 2);
  assert.match(massSummary(weekday).cycle, /год II$/);
  assert.equal(suppressionReason({ reason: 'transferred', transferredTo: '2027-04-05' }), 'перанесена на 05.04');
});

test('month overview: one row per day with primary, rank and colour; year generation memoized', () => {
  const november = buildMonthOverview(2026, 11, { diocese: 'vitebsk' });
  assert.equal(november.length, 30);
  const josaphat = november.find((item) => item.date === '2026-11-12');
  assert.equal(josaphat.rank, 'Урачыстасць');
  assert.equal(josaphat.color, 'ruber');
  assert.equal(josaphat.isCelebration, true);
  const minsk = buildMonthOverview(2026, 11, { diocese: 'minsk-mohilev' }).find((item) => item.date === '2026-11-12');
  assert.equal(minsk.rank, 'Свята');
  assert.equal(november[0].isSunday, true);
  assert.equal(november[0].weekday, 'Нд');
  assert.ok(buildMonthOverview(2026, 9, { diocese: 'minsk-mohilev' }).find((item) => item.date === '2026-09-28').alternatives === 2);

  const first = getOrdoYear(2026, { diocese: 'vitebsk' });
  assert.equal(getOrdoYear(2026, { diocese: 'vitebsk' }), first, 'same array for the same year and context');
  assert.notEqual(getOrdoYear(2026, { diocese: 'grodno' }), first);

  assert.equal(buildMonthOverview(2028, 2, { diocese: 'pinsk' }).length, 29);
});

// ---------------------------------------------------------------------------
// Month mode and several dioceses
// ---------------------------------------------------------------------------

const ALL_DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];

test('the Ordo main page is one month; the Hours screen links to the Ordo', () => {
  const view = read('src/views/Ordo.vue');
  assert.match(view, /<OrdoDay v-if="route\.params\.date" \/>\s*<OrdoMonth v-else \/>/);
  assert.match(view, /<OrdoDioceseFilter \/>/);
  const month = read('src/components/ordo/OrdoMonth.vue');
  assert.match(month, /parseOrdoMonth\(route\.query\.month, today\)/);
  assert.match(month, /scrollToToday/);
  assert.ok(!/generateLiturgicalYear|v-for="month in/.test(month), 'no year-long list');
  const hours = read('src/layouts/default/Default.vue');
  assert.match(hours, /:to="homeCalendarRoute" icon="mdi-calendar-text-outline"/);
  assert.match(hours, /name: 'OrdoByDate', params: \{ date: route\.params\.day \|\| moment\(\)\.format\('YYYY-MM-DD'\) \}/);
  assert.ok(!read('src/components/ItemsList.vue').includes('ordo-shortcut'));
  // The drawer entry stays.
  assert.match(read('src/layouts/default/NavigationDrawer.vue'), /Літургічны каляндар/);
});

test('display filter: valid, ordered, never empty, stored separately from the Hours diocese', async () => {
  assert.deepEqual(normalizeDioceseFilter(['grodno', 'minsk-mohilev', 'nope']), ['minsk-mohilev', 'grodno']);
  assert.deepEqual(normalizeDioceseFilter([], 'pinsk'), ['pinsk']);
  assert.deepEqual(normalizeDioceseFilter(null), ['minsk-mohilev']);
  const filter = read('src/utils/ordoMonthFilter.js');
  assert.match(filter, /ORDO_MONTH_FILTER_STORAGE_KEY = 'ordoMonthDioceses'/);
  assert.ok(!/setOrdoDiocese\(/.test(filter), 'the filter never changes the diocese of Settings');
});

test('month union: the same result in every selected diocese is one row', () => {
  const month = buildMonthUnion(2026, 11, ALL_DIOCESES);
  assert.equal(month.length, 30);
  const allSaints = month.find((item) => item.date === '2026-11-01');
  assert.equal(allSaints.rows.length, 1);
  assert.equal(allSaints.rows[0].shared, true);
  assert.deepEqual(allSaints.rows[0].badges, []);
  assert.equal(allSaints.differs, false);
  // One diocese selected: never a badge.
  buildMonthUnion(2026, 11, ['vitebsk']).forEach((item) => item.rows.forEach((row) => assert.deepEqual(row.badges, [])));
  // Legal variants: primary, alternatives, commemorations — never suppressed.
  const september = buildMonthUnion(2026, 9, ['minsk-mohilev']);
  const wenceslaus = september.find((item) => item.date === '2026-09-28');
  assert.deepEqual(wenceslaus.rows.map((row) => row.role), ['primary', 'alternative', 'alternative']);
  const advent = buildMonthUnion(2026, 12, ['minsk-mohilev']).find((item) => item.date === '2026-12-21');
  assert.ok(advent.rows.some((row) => row.role === 'commemoration'));
  month.forEach((item) => item.rows.forEach((row) => assert.ok(['primary', 'alternative', 'commemoration'].includes(row.role))));
});

test('month union: different ranks are split by diocese', () => {
  const day = buildMonthUnion(2026, 11, ALL_DIOCESES).find((item) => item.date === '2026-11-12');
  assert.equal(day.differs, true);
  const byRank = Object.fromEntries(day.rows.map((row) => [row.rank, row.badges]));
  assert.deepEqual(byRank['Свята'], ['Мінск', 'Пінск']);
  assert.deepEqual(byRank['Урачыстасць'], ['Віцебск']);
  assert.deepEqual(byRank['Успамін'], ['Гродна']);
  // Two dioceses with the same rank merge and need no badge.
  const pair = buildMonthUnion(2026, 11, ['minsk-mohilev', 'pinsk']).find((item) => item.date === '2026-11-12');
  assert.equal(pair.rows.length, 1);
  assert.deepEqual(pair.rows[0].badges, []);
  // A celebration only one diocese has is a badged row next to the shared one.
  const grodno = buildMonthUnion(2027, 6, ['minsk-mohilev', 'grodno']).find((item) => item.date === '2027-06-08');
  assert.ok(!grodno.rows.some((row) => row.id === 'sv-jadwiga-queen'));
  assert.equal(grodno.rows.length, 1);
});

test('day union: shared data once, differences with diocesan badges', () => {
  const union = buildDayUnion('2026-11-12', ALL_DIOCESES);
  assert.equal(union.differs, true);
  assert.equal(union.rows.filter((row) => row.role === 'primary').length, 3);
  assert.equal(union.days.length, 4);
  assert.deepEqual(legalColors(union.days), ['ruber']);
  assert.equal(buildDayUnion('2026-11-01', ALL_DIOCESES).differs, false);
  const day = read('src/components/ordo/OrdoDay.vue');
  assert.match(day, /v-if="union\.differs"/);
  // Links carry the diocesan context without touching the stored setting.
  assert.match(day, /contextDiocese\.value !== ordoDiocese\.value \? \{ diocese: contextDiocese\.value \} : \{\}/);
  assert.ok(!/setOrdoDiocese|settings\.setDiocese/.test(day));
});
