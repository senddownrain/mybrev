import test from 'node:test';
import assert from 'node:assert/strict';
import { getYearPlan, resolveLiturgicalDate, validateYearOverride } from '../src/utils/ordo/index.js';

const transfersOf = (year, context = {}) => getYearPlan(year, { country: 'BY', ...context }).transfers
  .map(({ celebrationId, from, to }) => `${celebrationId}:${from}->${to}`);

test('Annunciation in Holy Week or the Easter octave → Monday after Divine Mercy Sunday', () => {
  assert.ok(transfersOf(2027).includes('annunciation-lord:2027-03-25->2027-04-05')); // Holy Thursday
  assert.ok(transfersOf(2024).includes('annunciation-lord:2024-03-25->2024-04-08')); // Holy Monday
  assert.ok(transfersOf(2016).includes('annunciation-lord:2016-03-25->2016-04-04')); // Good Friday
  assert.ok(transfersOf(2008).includes('annunciation-lord:2008-03-25->2008-03-31')); // Easter Tuesday
});

test('St Joseph: Sunday of Lent → Monday; Holy Week → Saturday before Palm Sunday', () => {
  assert.ok(transfersOf(2028).includes('sv-joseph:2028-03-19->2028-03-20'));
  assert.ok(transfersOf(2034).includes('sv-joseph:2034-03-19->2034-03-20'));
  assert.ok(transfersOf(2008).includes('sv-joseph:2008-03-19->2008-03-15'));
});

test('Immaculate Conception on a Sunday of Advent → Monday', () => {
  assert.ok(transfersOf(2024).includes('immaculate-conception:2024-12-08->2024-12-09'));
  assert.ok(transfersOf(2019).includes('immaculate-conception:2019-12-08->2019-12-09'));
  assert.deepEqual(transfersOf(2026).filter((item) => item.startsWith('immaculate')), []);
});

test('coinciding solemnities: the solemnity of the Lord keeps the day', () => {
  assert.ok(transfersOf(2022).includes('nativity-john-baptist:2022-06-24->2022-06-25'));
});

test('proper solemnity impeded by Pentecost moves only in its diocese', () => {
  assert.ok(transfersOf(2027, { diocese: 'pinsk' }).includes('sv-andrei-bobola:2027-05-16->2027-05-18'));
  assert.deepEqual(transfersOf(2027, { diocese: 'minsk' }).filter((item) => item.includes('bobola')), []);
});

test('feasts and memorials are never transferred', () => {
  const all = [2024, 2025, 2026, 2027, 2028, 2029, 2030].flatMap((year) => transfersOf(year, { diocese: 'grodno' }));
  const plan = getYearPlan(2026, { country: 'BY' });
  all.forEach((entry) => {
    const id = entry.split(':')[0];
    const celebration = [...plan.celebrations.values()].find((item) => item.id === id);
    if (celebration) assert.equal(celebration.rank, 'solemnitas', entry);
  });
});

test('year override: move, suppress, add and changeRank, in scope order', () => {
  const yearOverrides = [
    {
      year: 2028, scope: 'belarus', targetCelebrationId: 'sv-casimir', action: 'move', to: '2028-03-06', reason: 'test',
    },
    {
      year: 2028, scope: 'diocese', dioceseId: 'vitebsk', targetCelebrationId: 'sv-john-bosco', action: 'suppress',
    },
    {
      year: 2028,
      scope: 'universal',
      action: 'add',
      to: '2028-07-07',
      celebration: {
        id: 'jubilee-day', title: 'Дзень юбілею', rank: 'festum', category: 'lord', date: { type: 'exact' },
        daysRef: null, readingsRef: null,
      },
    },
    {
      year: 2028, scope: 'diocese', dioceseId: 'grodno', targetCelebrationId: 'sv-thomas-aquinas', action: 'changeRank', rank: 'festum',
    },
  ];
  const moved = resolveLiturgicalDate('2028-03-06', { yearOverrides });
  assert.ok(moved.commemorations.some((item) => item.id === 'sv-casimir' && item.movedFrom === '2028-03-04'));
  assert.ok(moved.appliedRules.some((rule) => rule.rule === 'year-override' && rule.action === 'move'));

  const vitebsk = resolveLiturgicalDate('2028-01-31', { diocese: 'vitebsk', yearOverrides });
  assert.equal(vitebsk.suppressed.find((item) => item.id === 'sv-john-bosco').reason, 'suppressed-by-year-override');
  const minsk = resolveLiturgicalDate('2028-01-31', { diocese: 'minsk', yearOverrides });
  assert.equal(minsk.primary.id, 'sv-john-bosco');

  const added = resolveLiturgicalDate('2028-07-07', { yearOverrides });
  assert.equal(added.primary.id, 'jubilee-day');

  assert.equal(resolveLiturgicalDate('2028-01-28', { diocese: 'grodno', yearOverrides }).primary.officeKind, 'feast');
  assert.equal(resolveLiturgicalDate('2028-01-28', { diocese: 'minsk', yearOverrides }).primary.officeKind, 'memorial');
  // Overrides are year specific.
  assert.equal(resolveLiturgicalDate('2030-01-28', { diocese: 'grodno', yearOverrides }).primary.officeKind, 'memorial');
});

test('validates YearOverride records', () => {
  assert.deepEqual(validateYearOverride({ year: 2028, scope: 'belarus', targetCelebrationId: 'x', action: 'suppress' }), []);
  assert.ok(validateYearOverride({ year: 2028, scope: 'diocese', targetCelebrationId: 'x', action: 'suppress' }).length);
  assert.ok(validateYearOverride({ year: 2028, scope: 'belarus', targetCelebrationId: 'x', action: 'move' }).length);
});
