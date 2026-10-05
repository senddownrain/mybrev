/**
 * Reading references, several dioceses, colours and the Ordo / date-dialog UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { readingReferencesForDay, READING_REFERENCE_STATUS as S } from '../src/utils/ordo/readingReferences.js';
import { unionDayOptions } from '../src/utils/dayOptionsUnion.js';
import { pickerColorsOf, pickerDateRoute, pickerOptionsOf } from '../src/utils/ordoDatePicker.js';
import { normalizeOrdoDioceses, readStoredDioceses } from '../src/utils/ordoDiocese.js';
import { ordoHoursRoute } from '../src/utils/ordoScreen.js';
import {
  VESTMENT_COLORS, contrastRatio, liturgicalVisual, visualOfDocument, visualStamp,
} from '../src/utils/liturgicalVisual.js';
import { getLiturgicalTheme } from '../src/constants/liturgical.js';
import { buildReadingReferences } from '../scripts/liturgy/build-reading-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const INDEX = JSON.parse(read('src/data/ordo/reading-references.json')).references;
const refs = (date, diocese = 'minsk-mohilev') => readingReferencesForDay(resolveRuntimeDay(date, { diocese }), INDEX);
const one = (date, id, diocese) => refs(date, diocese).find((item) => item.optionId === id);
const citations = (entry) => entry.documents.flatMap((doc) => doc.rows.map((row) => row.citation));

// ---------------------------------------------------------------------------
// Reading references (Ordo «Імша і чытанні»)
// ---------------------------------------------------------------------------

test('ordinary weekday: the day\'s citations', () => {
  const entry = one('2026-10-05', 'temporal:ordinary-w27-d2');
  assert.equal(entry.status, S.WEEKDAY);
  assert.deepEqual(citations(entry), ['Гал 1, 6–12', 'Пс 111 (110), 1–2. 7–8. 9 і 10c (Р.: 5b)', 'Лк 10, 25–37']);
});

test('Sunday: the cycle of the year (A in 2026, B in 2027)', () => {
  const a = one('2026-10-04', 'temporal:ordinary-w27-d1');
  assert.ok(a.documents.every((doc) => doc.year === 'A'));
  assert.equal(a.documents[0].rows.length, 4, 'two readings, psalm, Gospel');
  const b = one('2027-10-03', 'temporal:ordinary-w27-d1');
  assert.ok(b.documents.every((doc) => doc.year === 'B'));
});

test('feast and solemnity: their own readings', () => {
  assert.equal(one('2026-01-11', 'baptism-of-the-lord').status, S.PROPER);
  const all = one('2026-11-01', 'all-saints');
  assert.equal(all.status, S.PROPER);
  assert.ok(citations(all).length >= 4);
});

test('memorial: the weekday readings by default, its own ones «або»', () => {
  const therese = one('2026-10-01', 'sv-teresa-lisieux');
  assert.equal(therese.status, S.WEEKDAY);
  assert.ok(citations(therese).includes('Лк 10, 1–12'));
  assert.deepEqual(therese.alternatives[0].rows.map((row) => row.citation), ['Іс 66, 10–14с', 'Пс 131 (130), 1. 2–3', 'Мц 18, 1–5']);
});

test('optional memorial keeps the weekday default', () => {
  const bruno = one('2026-10-06', 'sv-bruno');
  assert.equal(bruno.status, S.WEEKDAY);
  assert.deepEqual(citations(bruno), citations(one('2026-10-06', 'temporal:ordinary-w27-d3')));
});

test('reference-only and missing are explicit, never silently replaced', () => {
  const reference = one('2026-08-14', 'sv-maximilian-kolbe', 'grodno');
  assert.equal(reference.status, S.REFERENCE_ONLY);
  assert.equal(reference.documents.length, 0);
  assert.ok(reference.reference);
  const missing = one('2026-07-02', 'our-lady-budslav', 'vitebsk');
  assert.equal(missing.status, S.MISSING);
});

test('the reference index is a projection of readings: citations only, no texts', () => {
  const [entry] = buildReadingReferences([{
    id: 'x', _date: '01.10', year: '2', title: 'T',
    reading1: { bible: 'Іс 66, 10–14с', text: 'Радуйцеся разам з Ерузалемам…' },
    gospel: { bible: 'Мц 18, 1–5', text: 'У той час вучні падышлі да Езуса…' },
  }, { id: 'empty', _date: '01.10', gospel: { bible: 'Лк 1, 1' } }]);
  assert.deepEqual(entry.citations, { reading1: 'Іс 66, 10–14с', gospel: 'Мц 18, 1–5' });
  assert.ok(!JSON.stringify(entry).includes('Радуйцеся'));
  assert.ok(INDEX.every((item) => !('text' in item)));
});

// ---------------------------------------------------------------------------
// Several dioceses
// ---------------------------------------------------------------------------

const option = (optionId, extra = {}) => ({ key: `k-${optionId}`, dayId: `${optionId}-doc`, order: 3, ordo: { optionId, rank: 'memoria' }, ...extra });

test('one diocese: the options as they are', () => {
  const list = unionDayOptions([{ diocese: 'vitebsk', dayOptions: [option('a')] }]);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].badges, []);
});

test('two dioceses: shared options merge, diocesan ones keep a badge, a different rank is its own row', () => {
  const list = unionDayOptions([
    { diocese: 'vitebsk', dayOptions: [option('shared'), option('only-vitebsk'), option('rank', { ordo: { optionId: 'rank', rank: 'memoria' } })] },
    { diocese: 'pinsk', dayOptions: [option('shared'), option('rank', { ordo: { optionId: 'rank', rank: 'festum' } })] },
  ], { primary: 'vitebsk' });
  const byId = (id) => list.filter((item) => item.ordo.optionId === id);
  assert.equal(byId('shared').length, 1);
  assert.deepEqual(byId('shared')[0].badges, []);
  assert.deepEqual(byId('only-vitebsk')[0].badges, ['Віцебск']);
  assert.equal(byId('rank').length, 2, 'same celebration, different rank');
  assert.equal(byId('rank').find((item) => item.ordo.rank === 'festum').contextDiocese, 'pinsk', 'opens in its diocese');
  assert.equal(new Set(list.map((item) => item.key)).size, list.length);
});

test('settings: one or several dioceses, never none; the old single setting migrates', () => {
  assert.deepEqual(normalizeOrdoDioceses(['vitebsk', 'pinsk', 'bad']), ['pinsk', 'vitebsk'], 'canonical order');
  assert.deepEqual(normalizeOrdoDioceses([], 'grodno'), ['grodno']);
  const store = new Map([['ordoDiocese', 'vitebsk']]);
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  globalThis.localStorage = storage;
  assert.deepEqual(readStoredDioceses(storage), ['vitebsk']);
  assert.equal(store.get('ordoDioceses'), '["vitebsk"]');
  delete globalThis.localStorage;
});

test('date picker: colours and options of every selected diocese', () => {
  // 1 May 2026: Pinsk cathedral dedication (feast, white) / St Joseph the Worker elsewhere.
  const both = pickerOptionsOf('2026-05-01', ['minsk-mohilev', 'pinsk']);
  assert.ok(both.some((item) => item.badges?.length), 'a diocesan option is marked');
  assert.ok(pickerColorsOf('2026-05-01', ['minsk-mohilev', 'pinsk']).length >= 1);
});

// ---------------------------------------------------------------------------
// One colour
// ---------------------------------------------------------------------------

test('the Ordo vestment colour decides; Marian blue is only a secondary accent', () => {
  const marian = liturgicalVisual({ color: 'albus', category: 'mary' });
  assert.equal(marian.vestment, 'albus');
  assert.equal(marian.label, 'Белы');
  assert.equal(marian.secondary, 'marian');
  assert.notEqual(marian.accent, marian.theme);
  const martyr = liturgicalVisual({ color: 'ruber', category: 'saint' });
  // A document stamped by the Ordo ignores its title heuristics.
  const day = { _feastName: 'Св. Тэрэзы ад Дзіцятка Езус, панны', _rank: 'memoria', ...visualStamp({ color: 'ruber', category: 'saint' }) };
  assert.equal(getLiturgicalTheme(day), martyr.accent);
  assert.equal(visualOfDocument({ _feastName: 'x' }), null, 'unstamped: heuristics fallback');
});

test('every liturgical accent stays visible on light and dark surfaces', () => {
  // Visible colour = the accent mixed as in main.scss (light: 82 % + black, dark: 62 % + white).
  const mix = (hex, weight, target) => {
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));
    const t = target === 'white' ? 255 : 0;
    return `#${c.map((v) => Math.round(v * weight + t * (1 - weight)).toString(16).padStart(2, '0')).join('')}`;
  };
  Object.entries(VESTMENT_COLORS).forEach(([name, { theme }]) => {
    assert.ok(contrastRatio(mix(theme.color, 0.82, 'black'), '#fdfcf9') >= 3, `${name} light`);
    assert.ok(contrastRatio(mix(theme.color, 0.62, 'white'), '#171917') >= 3, `${name} dark`);
  });
  assert.ok(contrastRatio(VESTMENT_COLORS.albus.ring, '#fdfcf9') >= 1.8, 'the white ring is drawn as visible gold');
});

// ---------------------------------------------------------------------------
// UI contracts
// ---------------------------------------------------------------------------

test('Ordo day: «Святкаванні дня», explicit vestment colour, actionable celebrations', () => {
  const day = read('src/components/ordo/OrdoDay.vue');
  assert.match(day, /Святкаванні дня/);
  assert.doesNotMatch(day, /Празднаванне дня/);
  assert.match(day, /Колер літургічнага адзення:/);
  assert.match(day, /<CelebrationActions :hours="hoursLink\(day\.primary\.id\)" :readings="readingsLink\(day\.primary\.id\)"/);
  assert.match(day, /data-test="readings-block"/);
  assert.match(read('src/components/ordo/CelebrationActions.vue'), /Літургія гадзін[\s\S]*Чытанні/);
});

test('Ordo readings rows wrap instead of overflowing the card', () => {
  const day = read('src/components/ordo/OrdoDay.vue');
  assert.match(day, /\.reading-row dd \{[^}]*min-width: 0[^}]*overflow-wrap: anywhere/);
  assert.match(day, /\.readings-block \{ min-width: 0/);
  assert.doesNotMatch(day, /white-space: nowrap/);
});

test('Ordo → Hours capsule: the viewed date, today on the month, diocese context kept', () => {
  assert.match(read('src/views/Ordo.vue'), /data-test="ordo-hours-shortcut"[\s\S]*Літургія/);
  assert.deepEqual(ordoHoursRoute({ date: '2026-09-28', filter: ['minsk-mohilev'], userDiocese: 'minsk-mohilev' }),
    { name: 'SelectedDay', params: { day: '2026-09-28' }, query: {} });
  assert.deepEqual(ordoHoursRoute({ date: '', filter: ['minsk-mohilev'], userDiocese: 'minsk-mohilev' }), { name: 'Today' });
  assert.deepEqual(ordoHoursRoute({ date: '2026-09-28', filter: ['pinsk'], userDiocese: 'minsk-mohilev' }).query, { diocese: 'pinsk' });
});

test('«Выбраць»: a date alone opens the main screen of that day (Hours and Readings)', () => {
  assert.deepEqual(pickerDateRoute('2026-10-06', 'hours', { today: '2026-10-05' }), { name: 'SelectedDay', params: { day: '2026-10-06' } });
  assert.deepEqual(pickerDateRoute('2026-10-05', 'hours', { today: '2026-10-05' }), { name: 'Today' });
  assert.deepEqual(pickerDateRoute('2026-10-06', 'readings', { today: '2026-10-05' }), { name: 'ReadingsByDate', params: { date: '2026-10-06' } });
  assert.deepEqual(pickerDateRoute('2026-10-06', 'readings', { today: '2026-10-05', diocese: 'pinsk', defaultDiocese: 'minsk-mohilev' }),
    { name: 'ReadingsByDate', params: { date: '2026-10-06' }, query: { diocese: 'pinsk' } });
});

test('two co-equal memorials stay two neutral alternatives', () => {
  const day = resolveRuntimeDay('2026-06-13', { diocese: 'minsk-mohilev' });
  assert.equal(day.primary.kind, 'temporal');
  assert.deepEqual(day.alternatives.map((item) => item.rankKind), ['optional-memorial', 'optional-memorial']);
  assert.deepEqual(day.alternatives.map((item) => item.role), ['alternative', 'alternative']);
  const titles = day.alternatives.map((item) => item.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'be')), 'stable neutral order');
});
