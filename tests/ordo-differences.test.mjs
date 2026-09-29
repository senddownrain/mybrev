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
  const magdalene = entry('sv-mary-magdalene').differences.find((d) => d.mybrevDivergence);
  assert.equal(magdalene.type, 'BELARUS');
  assert.equal(entry('sv-mary-magdalene').mybrev.rank, 'memoria');
});

test('celebrations missing from MyBrev are listed with a scope guess', () => {
  const faustina = differences.missingInMyBrev.find((e) => e.mmdd === '10-05');
  assert.equal(faustina.type, 'UNIVERSAL');
  assert.ok(faustina.dioceses.length >= 3);
});

test('impediments of a particular year are YEAR_SPECIFIC, not conflicts', () => {
  const yearSpecific = differences.entries.flatMap((e) => e.differences).filter((d) => d.type === 'YEAR_SPECIFIC');
  assert.ok(yearSpecific.length > 20);
});
