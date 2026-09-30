import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { LAYER_LEVELS } from '../src/utils/ordo/layers.js';
import { contextKey } from '../src/utils/ordo/yearPlan.js';
import { LEGACY_STORAGE_KEYS, removeLegacyStorageKeys } from '../src/utils/legacyStorageCleanup.js';
import {
  announcesOtherDate, buildMonthOverview, getOrdoYear, groupOrdoNotes, listCalendarCelebrations,
  NOTE_GROUPS, massSummary, noteAppliesToYear, officeDirections, ordoRouteFor, parseOrdoRouteDate, resolveOrdoDay,
  suppressionReason,
} from '../src/utils/ordoScreen.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

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

test('route helpers: today is /ordo, other dates /ordo/:date, invalid dates fall back', () => {
  assert.deepEqual(ordoRouteFor('2026-09-29', '2026-09-29'), { name: 'Ordo' });
  assert.deepEqual(ordoRouteFor('2026-12-29', '2026-09-29'), { name: 'OrdoByDate', params: { date: '2026-12-29' } });
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
  return candidates.find((path) => existsSync(path)) || null;
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
  assert.ok(graph.has(join(root, 'src/utils/ordo/index.js')), 'the engine itself is part of the startup graph');
  assert.ok(!graph.has(notesPath), 'notes.json is reachable from src/main.js through static imports');
  assert.ok(!graph.has(join(root, 'src/utils/ordoNotesLoader.js')));
  assert.ok(!graph.has(join(root, 'src/views/Ordo.vue')));

  const loader = read('src/utils/ordoNotesLoader.js');
  assert.match(loader, /import\('\.\.\/data\/ordo\/notes\.json'\)/);
  assert.deepEqual(staticImports(loader), []);
  // The Ordo view is the only static importer of the loader.
  const view = staticGraph(join(root, 'src/views/Ordo.vue'));
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
  assert.deepEqual(offenders.map((file) => file.slice(root.length + 1)), ['src/utils/legacyStorageCleanup.js']);
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
