/**
 * Calendar definitions: the permanent calendar as declarative documents,
 * manual year overrides, structured ambiguities and the source selection
 * between the bundled snapshot and a Firestore publication.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateLiturgicalYear, resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import {
  getBundledCalendarDefinitions, getCalendarDefinitions, getDefinitionsEpoch, layersFromDefinitions,
  normalizeCalendarDefinitions, setCalendarDefinitions, validateCelebrationDefinition, validateDateRule,
  validateDioceseOverride,
} from '../src/utils/ordo/definitions.js';
import { applyLayers, buildCalendarLayers } from '../src/utils/ordo/layers.js';
import { buildCalendarDefinitionsSeed, buildSeedCalendarLayers, SEED_DIOCESES } from '../src/utils/ordo/seed.js';
import { validateYearOverride } from '../src/utils/ordo/yearOverrides.js';
import {
  automaticTransfers, previewYearOverride, storedYearOverrides, yearCollisions,
} from '../src/utils/ordo/overridePreview.js';
import { ambiguityYears, findAmbiguities } from '../src/utils/ordo/ambiguities.js';
import { ORDO_AMBIGUITIES } from '../src/data/ordo/ambiguities.js';
import { selectCalendarSource, selectNotesSource, sameDefinitions } from '../src/utils/ordoCalendarSource.js';
import { buildSnapshot } from '../scripts/ordo/build-calendar-definitions.mjs';

const reset = () => setCalendarDefinitions(null);
const ids = (day) => [day.primary, ...day.alternatives].map((item) => item.id);

test('the bundled snapshot is up to date with the seed sources', () => {
  const { text } = buildSnapshot();
  assert.equal(fs.readFileSync(new URL('../src/data/ordo/calendar-definitions.json', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), text);
});

test('the permanent calendar is rules, not 365 annual rows', () => {
  const definitions = getBundledCalendarDefinitions();
  assert.deepEqual(definitions.warnings, []);
  assert.ok(definitions.celebrations.length > 200 && definitions.celebrations.length < 300);
  definitions.celebrations.forEach((doc) => {
    assert.deepEqual(validateCelebrationDefinition(doc), [], doc.id);
    assert.ok(!JSON.stringify(doc.dateRule).match(/\d{4}-\d{2}-\d{2}/), `${doc.id} has a year date`);
  });
  definitions.dioceseOverrides.forEach((doc) => assert.deepEqual(validateDioceseOverride(doc), [], doc.id));
  const types = new Set(definitions.celebrations.map((doc) => doc.dateRule.type));
  assert.deepEqual([...types].sort(), ['fixed', 'movable', 'named']);
  assert.deepEqual(definitions.celebrations.find((doc) => doc.id === 'mary-mother-church').dateRule,
    { type: 'movable', anchor: 'pentecost', offsetDays: 1 });
  assert.deepEqual(definitions.celebrations.find((doc) => doc.id === 'holy-family').dateRule, { type: 'named', rule: 'holyFamily' });
  // Dioceses hold differences only.
  const universal = new Set(definitions.celebrations.map((doc) => doc.id));
  definitions.dioceseOverrides.filter((doc) => doc.action === 'add')
    .forEach((doc) => assert.ok(!universal.has(doc.celebrationId), `${doc.id} copies a general celebration`));
  definitions.dioceseOverrides.filter((doc) => doc.action === 'modify')
    .forEach((doc) => assert.ok(universal.has(doc.celebrationId), `${doc.id} modifies nothing`));
});

test('definitions reproduce the seed calendar for every diocese', () => {
  const comparable = ({ layerTrail: _t, inheritedFrom: _i, anchor: _a, source: _s, date, layer, ...rest }) => ({
    ...rest, layer, date: { offsetDays: 0, ...date },
  });
  ['', ...SEED_DIOCESES].forEach((diocese) => {
    const seed = buildSeedCalendarLayers({ country: 'BY', diocese }).celebrations;
    const built = buildCalendarLayers({ country: 'BY', diocese }).celebrations;
    assert.deepEqual([...built.keys()], [...seed.keys()], `order ${diocese}`);
    seed.forEach((expected, id) => {
      const actual = built.get(id);
      const a = comparable(actual);
      const e = comparable(expected);
      if (e.date.type !== 'movable') delete e.date.offsetDays;
      if (a.date.type !== 'movable') delete a.date.offsetDays;
      // A movable date is the same day expressed from a declarative anchor.
      if (e.date.type === 'movable') { delete e.date; delete a.date; }
      assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(e)), `${diocese}:${id}`);
    });
  });
});

test('date DSL is a white list; nothing from the database is executed', () => {
  assert.deepEqual(validateDateRule({ type: 'fixed', month: 2, day: 29 }), []);
  assert.ok(validateDateRule({ type: 'fixed', month: 2, day: 30 }).length);
  assert.ok(validateDateRule({ type: 'movable', anchor: 'constructor', offsetDays: 1 }).length);
  assert.ok(validateDateRule({ type: 'named', rule: '__proto__' }).length);
  assert.ok(validateDateRule({ type: 'js', code: 'new Date()' }).length);
  const normalized = normalizeCalendarDefinitions({
    celebrations: [
      { id: 'ok', title: 'T', scope: 'universal', rank: 'memoria', dateRule: { type: 'fixed', month: 1, day: 2 } },
      { id: 'bad', title: 'T', scope: 'universal', rank: 'memoria', dateRule: { type: 'movable', anchor: 'eval' } },
      { id: 'off', title: 'T', scope: 'universal', rank: 'memoria', dateRule: { type: 'fixed', month: 1, day: 3 }, enabled: false },
    ],
  });
  assert.deepEqual(normalized.celebrations.map((doc) => doc.id), ['ok']);
  assert.equal(normalized.warnings.length, 1);
});

test('a published Firestore revision replaces the active calendar; reset returns the snapshot', () => {
  const bundled = getBundledCalendarDefinitions();
  const epoch = getDefinitionsEpoch();
  const published = {
    revision: bundled.revision + 1,
    celebrations: [
      ...bundled.celebrations,
      {
        id: 'test-movable', title: 'Тэставае рухомае свята', scope: 'belarus', rank: 'festum', category: 'lord',
        color: 'albus', dateRule: { type: 'movable', anchor: 'pentecost', offsetDays: 2 }, order: 9999,
      },
    ],
    dioceseOverrides: [
      ...bundled.dioceseOverrides,
      { id: 'pinsk--test-movable', dioceseId: 'pinsk', celebrationId: 'test-movable', action: 'suppress' },
    ],
  };
  try {
    setCalendarDefinitions(published);
    assert.ok(getDefinitionsEpoch() > epoch);
    // Pentecost 2026 = 24 May → Tuesday 26 May; 2030 = 9 June → 11 June.
    assert.equal(resolveLiturgicalDate('2026-05-26', { diocese: 'minsk' }).primary.id, 'test-movable');
    assert.equal(resolveLiturgicalDate('2030-06-11', { diocese: 'vitebsk' }).primary.id, 'test-movable');
    const pinsk = resolveLiturgicalDate('2026-05-26', { diocese: 'pinsk' });
    assert.notEqual(pinsk.primary.id, 'test-movable');
    assert.ok(pinsk.suppressed.some((item) => item.id === 'test-movable'));
    // An empty publication never takes the calendar down.
    setCalendarDefinitions({ revision: 99, celebrations: [] });
    assert.equal(getCalendarDefinitions().celebrations.length, bundled.celebrations.length);
  } finally {
    reset();
  }
  assert.notEqual(resolveLiturgicalDate('2026-05-26', { diocese: 'minsk' }).primary.id, 'test-movable');
  assert.equal(layersFromDefinitions(getCalendarDefinitions(), { country: 'universal' }).base.appliedLayers.length, 1);
  assert.ok(applyLayers([]).celebrations instanceof Map);
});

test('source selection: exactly one calendar is active', () => {
  const bundled = { revision: 3 };
  assert.equal(selectCalendarSource({ bundled, cached: undefined }), 'bundled');
  assert.equal(selectCalendarSource({ bundled, cached: { revision: 3, celebrations: [{}] } }), 'bundled');
  assert.equal(selectCalendarSource({ bundled, cached: { revision: 4, celebrations: [] } }), 'bundled');
  assert.equal(selectCalendarSource({ bundled, cached: { revision: 4, celebrations: [{}] } }), 'firestore');
  assert.equal(selectNotesSource({ bundledRevision: 1, meta: { notesRevision: 1 } }), 'bundled');
  assert.equal(selectNotesSource({ bundledRevision: 1, meta: { notesRevision: 2 } }), 'firestore');
  const current = getCalendarDefinitions();
  assert.equal(sameDefinitions(current, { yearOverrides: current.yearOverrides }), true);
  assert.equal(sameDefinitions(current, { yearOverrides: [] }), false);
});

// ---------------------------------------------------------------------------
// Manual year overrides
// ---------------------------------------------------------------------------

test('one-year override for the whole of Belarus', () => {
  const override = {
    id: 'o1', year: 2028, scope: 'belarus', targetCelebrationId: 'sv-casimir', action: 'move',
    from: '2028-03-04', to: '2028-03-06', reason: 'тэст', enabled: true,
  };
  assert.deepEqual(validateYearOverride(override), []);
  try {
    setCalendarDefinitions({ yearOverrides: [override] });
    SEED_DIOCESES.forEach((diocese) => {
      const moved = resolveLiturgicalDate('2028-03-06', { diocese });
      assert.ok([moved.primary, ...moved.alternatives, ...moved.commemorations].some((item) => item.id === 'sv-casimir'), diocese);
      const original = resolveLiturgicalDate('2028-03-04', { diocese });
      assert.ok(![original.primary, ...original.alternatives, ...original.commemorations].some((item) => item.id === 'sv-casimir'), diocese);
    });
    // Another year is untouched: automatic resolution is never stored.
    assert.ok(resolveLiturgicalDate('2029-03-04', { diocese: 'minsk' }).candidates.some((item) => item.id === 'sv-casimir'));
    assert.equal(storedYearOverrides(2028).length, 1);
  } finally { reset(); }
});

test('one-year override for one diocese; a disabled override does nothing', () => {
  const override = {
    id: 'o2', year: 2028, scope: 'diocese', dioceseId: 'vitebsk', targetCelebrationId: 'sv-josaphat',
    action: 'changeRank', rank: 'memoria', reason: 'тэст', enabled: true,
  };
  const normal = resolveLiturgicalDate('2028-11-12', { diocese: 'vitebsk' }).primary;
  try {
    setCalendarDefinitions({ yearOverrides: [override] });
    const changed = resolveLiturgicalDate('2028-11-13', { diocese: 'vitebsk' });
    assert.ok(changed);
    const day = generateLiturgicalYear(2028, { diocese: 'vitebsk' }).find((item) => item.candidates.some((c) => c.id === 'sv-josaphat' && c.yearOverride));
    assert.ok(day, 'override is applied in Vitebsk');
    assert.ok(!generateLiturgicalYear(2028, { diocese: 'grodno' }).some((item) => item.candidates.some((c) => c.yearOverride)));
    setCalendarDefinitions({ yearOverrides: [{ ...override, enabled: false }] });
    assert.ok(!generateLiturgicalYear(2028, { diocese: 'vitebsk' }).some((item) => item.candidates.some((c) => c.yearOverride)));
    assert.equal(storedYearOverrides(2028).length, 1, 'a disabled override is still listed for the admin');
  } finally { reset(); }
  assert.equal(resolveLiturgicalDate('2028-11-12', { diocese: 'vitebsk' }).primary.id, normal.id);
});

test('override actions: suppress, add, changeColor; validation', () => {
  const base = { year: 2028, scope: 'belarus', reason: 'тэст' };
  const day = (date, overrides) => resolveLiturgicalDate(date, { diocese: 'minsk', dataYearOverrides: false, yearOverrides: overrides });
  const suppressed = day('2028-02-14', [{ ...base, action: 'suppress', targetCelebrationId: 'sv-cyril-methodius' }]);
  const before = day('2028-02-14', []);
  const target = before.candidates.find((item) => item.kind !== 'temporal');
  const gone = day('2028-02-14', [{ ...base, action: 'suppress', targetCelebrationId: target.id }]);
  assert.ok(gone.suppressed.some((item) => item.id === target.id && item.reason === 'suppressed-by-year-override'));
  assert.ok(suppressed);
  const added = day('2028-07-05', [{
    ...base, action: 'add', to: '2028-07-05',
    celebration: { id: 'extra-feast', title: 'Дадатковае свята', rank: 'festum', category: 'saint', color: 'ruber' },
  }]);
  assert.equal(added.primary.id, 'extra-feast');
  const colored = day('2028-02-14', [{ ...base, action: 'changeColor', targetCelebrationId: target.id, color: 'ruber' }]);
  assert.equal(colored.candidates.find((item) => item.id === target.id).color, 'ruber');

  assert.ok(validateYearOverride({ ...base, action: 'changeColor', targetCelebrationId: 'x', color: 'pink' }).length);
  assert.ok(validateYearOverride({ ...base, action: 'move', targetCelebrationId: 'x', to: '2029-01-01' }).length);
  assert.ok(validateYearOverride({ ...base, scope: 'diocese', action: 'suppress', targetCelebrationId: 'x' }).length);
  assert.ok(validateYearOverride({ ...base, scope: 'local', action: 'suppress', targetCelebrationId: 'x' }).length);
});

test('override preview: «было па разліку → стане»', () => {
  const preview = previewYearOverride({
    year: 2028, scope: 'diocese', dioceseId: 'pinsk', targetCelebrationId: 'sv-casimir', action: 'move',
    from: '2028-03-04', to: '2028-03-06', reason: 'тэст',
  });
  assert.deepEqual(preview.errors, []);
  assert.deepEqual([...new Set(preview.changes.map((item) => item.diocese))], ['pinsk']);
  assert.deepEqual(preview.changes.map((item) => item.date), ['2028-03-04', '2028-03-06']);
  const to = preview.changes.find((item) => item.date === '2028-03-06');
  const hasCasimir = (summary) => [summary.primary, ...summary.alternatives, ...summary.commemorations].some((item) => item.id === 'sv-casimir');
  assert.equal(hasCasimir(to.before), false);
  assert.equal(hasCasimir(to.after), true);
  // A Belarus-wide draft is previewed in all four dioceses.
  const wide = previewYearOverride({
    year: 2028, scope: 'belarus', targetCelebrationId: 'sv-casimir', action: 'suppress', reason: 'тэст',
  });
  assert.equal(new Set(wide.changes.map((item) => item.diocese)).size, 4);
  assert.ok(previewYearOverride({ year: 2028, scope: 'belarus', action: 'move' }).errors.length);
  // The preview never changes the active calendar.
  assert.equal(storedYearOverrides(2028).length, 0);
});

test('automatic transfers and collisions are computed, not stored', () => {
  const transfers = automaticTransfers(2027, { diocese: 'minsk' });
  assert.ok(transfers.some((item) => item.celebrationId === 'annunciation-lord' && item.to === '2027-04-05'));
  assert.ok(yearCollisions(2027, { diocese: 'minsk' }).length > 10);
  assert.ok(!getCalendarDefinitions().yearOverrides.some((item) => item.targetCelebrationId === 'annunciation-lord'));
});

// ---------------------------------------------------------------------------
// Structured ambiguities
// ---------------------------------------------------------------------------

test('open cases are structured and shown only for the years that hit them', () => {
  ORDO_AMBIGUITIES.forEach((item) => {
    assert.ok(['needs-review', 'provisional', 'decided'].includes(item.status), item.id);
    assert.ok(item.id && item.title && item.currentDecision && item.decisionLabel && item.note);
  });
  const doc = fs.readFileSync(new URL('../docs/ordo-engine-ambiguities.md', import.meta.url), 'utf8');
  ORDO_AMBIGUITIES.forEach((item) => assert.match(doc, new RegExp(`^${item.docItem}\\. `, 'm'), item.id));

  const of = (year, diocese = 'minsk') => findAmbiguities(year, { diocese }).map((item) => item.id);
  assert.ok(of(2035).includes('st-joseph-holy-week'));
  assert.ok(!of(2026).includes('st-joseph-holy-week'));
  assert.ok(of(2033).includes('coinciding-general-solemnities'));
  assert.ok(of(2031).includes('all-souls-on-sunday'));
  assert.ok(of(2026).includes('immaculate-heart-with-memorial'));
  assert.equal(ORDO_AMBIGUITIES.find((item) => item.id === 'christ-high-priest-collision').status, 'provisional');
  assert.ok(of(2027, 'pinsk').includes('diocesan-patron-impeded'));
  assert.deepEqual(ambiguityYears('st-joseph-holy-week', { from: 2026, to: 2046 }), [2035, 2046]);
  // Ambiguities never become overrides by themselves.
  assert.equal(getCalendarDefinitions().yearOverrides.length, buildCalendarDefinitionsSeed().yearOverrides.length);
  assert.ok(ids(resolveLiturgicalDate('2035-03-17', { diocese: 'minsk' })).includes('sv-joseph'));
});

// ---------------------------------------------------------------------------
// Date-based seasonal content is kept
// ---------------------------------------------------------------------------

test('Advent 17–24 December keeps its phase and date documents', () => {
  for (let day = 17; day <= 24; day += 1) {
    const resolved = resolveLiturgicalDate(`2026-12-${day}`, { diocese: 'minsk' });
    assert.equal(resolved.period, 'advent', `2026-12-${day}`);
    const temporal = resolved.candidates.find((item) => item.kind === 'temporal');
    assert.equal(temporal.daysRef.seasonalDateId, `advent-${day}-12`);
    assert.deepEqual(temporal.readingsRef, { _date: `${day}.12`, dateOnly: true });
    assert.equal(resolved.periodPhase, 'dec17-24');
  }
  assert.equal(resolveLiturgicalDate('2026-12-16', { diocese: 'minsk' }).candidates[0].daysRef.seasonalDateId, null);
});

test('Christmas: the season ends with the Baptism, the date documents reach 12 January', () => {
  // 2027: Baptism of the Lord on Sunday 10 January → Ordinary Time from the 11th.
  assert.equal(resolveLiturgicalDate('2027-01-10', { diocese: 'minsk' }).primary.id, 'baptism-of-the-lord');
  assert.equal(resolveLiturgicalDate('2027-01-11', { diocese: 'minsk' }).period, 'ordinary');
  const temporalOf = (iso) => resolveLiturgicalDate(iso, { diocese: 'minsk' }).candidates.find((item) => item.kind === 'temporal');
  assert.equal(temporalOf('2027-01-07').daysRef.seasonalDateId, 'christmas-07-01');
  assert.equal(temporalOf('2027-01-11').daysRef.seasonalDateId, null, 'outside the season the date document is not used');
  // 2029: Baptism on 7 January; 2030: on 13 January → 12 January is still Christmas time.
  assert.equal(resolveLiturgicalDate('2030-01-12', { diocese: 'minsk' }).period, 'christmas');
  assert.equal(temporalOf('2030-01-12').daysRef.seasonalDateId, 'christmas-12-01');
  assert.equal(temporalOf('2026-12-29').daysRef.seasonalDateId, 'christmas-29-12');
  // Boundary of the season ≠ storage key of the proper content.
  assert.equal(temporalOf('2026-12-25').daysRef.fixedDateOnly, true);
});
