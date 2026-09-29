import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOrdoData } from '../scripts/ordo/check.mjs';

const { differences } = loadOrdoData();
const entry = (id) => differences.entries.find((e) => e.celebrationId === id);
const types = (id) => entry(id)?.differences.map((d) => d.type) || [];

test('aligns by celebration identity across sources of different years', () => {
  assert.equal(differences.coverage.grodno.from.slice(0, 4), '2026');
  assert.ok(differences.coverage.grodno.to >= '2027-12-31');
  const budslav = entry('our-lady-budslav');
  assert.equal(budslav.byDiocese['minsk-mohilev'].rank, 'solemnitas');
  assert.equal(budslav.byDiocese.vitebsk.rank, 'festum');
});

test('diocesan proper and cathedral dedications are DIOCESAN', () => {
  assert.ok(types('grodno-cathedral-dedication').includes('DIOCESAN'));
  assert.ok(types('vitebsk-cathedral-dedication').includes('DIOCESAN'));
  assert.ok(types('sv-andrei-bobola').includes('DIOCESAN'));
});

test('agreement of all sources against MyBrev is flagged as a MyBrev divergence', () => {
  // Stage 2 divergences fixed in fixedCalendar.js (Mary Magdalene feast, All Souls rank) are gone …
  ['sv-mary-magdalene', 'all-faithful-departed'].forEach((id) => {
    assert.ok(!(entry(id)?.differences || []).some((d) => d.mybrevDivergence), id);
  });
  // … while a celebration that no source prints is still reported against MyBrev.
  const eymard = entry('sv-peter-julian-eymard').differences.find((d) => d.mybrevDivergence);
  assert.equal(eymard.type, 'REAL_CONFLICT');
});

test('celebrations missing from MyBrev are listed with a scope guess', () => {
  // Faustina was missing in stage 2; it is now a universal optional memorial
  // that Grodno keeps as obligatory.
  assert.ok(!differences.missingInMyBrev.some((e) => e.mmdd === '10-05'));
  assert.ok(types('sv-faustina-kowalska').includes('DIOCESAN'));
  const barbara = differences.missingInMyBrev.find((e) => e.mmdd === '12-04');
  assert.equal(barbara.type, 'BELARUS');
  assert.ok(barbara.dioceses.length >= 2);
});

test('impediments of a particular year are YEAR_SPECIFIC, not conflicts', () => {
  const yearSpecific = differences.entries.flatMap((e) => e.differences).filter((d) => d.type === 'YEAR_SPECIFIC');
  assert.ok(yearSpecific.length > 20);
});
