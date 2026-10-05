import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOrdoData } from '../scripts/ordo/check.mjs';
import { alignDate } from '../scripts/ordo/lib/calendar.mjs';
import { loadFixedCatalog, resolveCelebration } from '../scripts/ordo/lib/identity.mjs';
import { daySelector, officeFlags } from '../scripts/ordo/lib/normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadFixedCatalog(ROOT);
const data = loadOrdoData();

function day(date, celebrations = []) {
  const liturgical = alignDate(date);
  return {
    date,
    liturgical,
    celebrations: celebrations.map((title) => ({
      role: 'primary',
      title,
      identity: resolveCelebration(title, liturgical, catalog, null),
    })),
  };
}

const select = (text, tags, date, celebrations) => daySelector({ text, tags }, day(date, celebrations), catalog).selector;

test('first Friday becomes a recurring selector, not twelve dates', () => {
  assert.deepEqual(select('Першая пятніца месяца.', ['first-friday'], '2026-03-06'), { type: 'nth-weekday-of-month', isoWeekday: 5, nth: 1 });
  // One canonical Belarus-level rule, not a Pinsk-2026 artifact.
  const note = data.notes.notes.find((n) => n.selector.type === 'nth-weekday-of-month' && n.selector.isoWeekday === 5 && n.scope.level === 'belarus');
  assert.ok(note, 'first Friday is a Belarus-level rule');
  assert.equal(note.provenance?.kind, 'app-normalization');
  assert.ok(note.provenance.observedIn.length >= 2, 'seen in several diocesan calendars');
  assert.ok(!data.notes.notes.some((n) => n !== note && /^(?:І|I|Першая) пятніца месяца\.?$/u.test(n.text.trim())), 'no bare diocesan copies');
});

test('a novena day is relative to its (movable) celebration', () => {
  assert.deepEqual(
    select('Трэці дзень навэны да Духа Святога.', ['novena'], '2026-05-17'),
    { type: 'relative', celebrationId: 'pentecost', offsetDays: -7 },
  );
  assert.deepEqual(
    select('Першы дзень Навэнны да Божай Міласэрнасці.', ['novena'], '2026-04-03'),
    { type: 'relative', celebrationId: 'divinemercy', offsetDays: -9 },
  );
  const novena = data.notes.notes.find((n) => n.selector.celebrationId === 'pentecost' && n.selector.throughOffsetDays === -1);
  assert.ok(novena, 'Pentecost novena collapses into one ranged note');
});

test('notes follow the celebration rather than the civil date', () => {
  assert.deepEqual(select('Благаслаўленне свечак.', ['blessing'], '2026-02-02', ['Свята Ахвяравання Пана']), { type: 'celebration', celebrationId: 'presentation-lord' });
  assert.deepEqual(select('Благ. крэйды, кадзіла і вады.', ['blessing'], '2027-01-06', ['Урачыстасць Аб’яўлення Пана']), { type: 'celebration', celebrationId: 'epiphany-lord' });
  assert.deepEqual(select('Благаслаўленне вянкоў і зёлак (Аг 1342).', ['blessing'], '2026-06-11', ['Успамін св. Барнабы, апостала']), { type: 'relative', celebrationId: 'corpuschristi', offsetDays: 7 });
});

test('Paschal-cycle days are relative to Easter', () => {
  assert.deepEqual(select('Дзень сціслага посту.', ['penance'], '2027-03-26'), { type: 'relative', celebrationId: 'eastersunday', offsetDays: -2 });
});

test('plain period days keep a period-day selector; year markers force exact-date', () => {
  assert.deepEqual(select('Наб. Божага слова.', ['devotion'], '2026-01-20'), { type: 'period-day', period: 'ordinary', week: 2, dayOfWeek: 3 });
  assert.deepEqual(select('Заканчэнне 2025 Юбілейнага года.', [], '2025-12-31'), { type: 'exact-date', date: '2025-12-31' });
});

test('repeated notes collapse to period selectors', () => {
  const lent = data.notes.notes.find((n) => n.selector.type === 'period' && n.selector.period === 'lent' && n.selector.dayOfWeek === 1);
  assert.ok(lent, 'a Lent-Sunday custom (e.g. "Песні жальбы") is generalized');
});

test('single examples are never promoted silently', () => {
  data.notes.notes.filter((n) => n.confidence === 'single-occurrence').forEach((n) => {
    assert.notEqual(n.classification, 'CONFIRMED_PERMANENT_RULE', n.id);
  });
});

test('office flags recognise I Vespers, Sunday Compline and optional memorials', () => {
  assert.deepEqual(officeFlags('Літургія гадзінаў з будня або з успаміну, 1-я Нешпары з ІІ нядзелі Адвэнту.'), {
    firstVespersOf: 'ІІ нядзелі Адвэнту', officeFrom: 'weekday', optionalMemorialAllowed: true,
  });
  assert.equal(officeFlags('ІІ Нешп. з урач. i ІІ Кампл. нядз.').compline, 'sunday');
  assert.equal(officeFlags('Камплета – як пасля 2-х Нешпараў на нядзелю.').compline, 'sunday');
});
