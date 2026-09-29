import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIOCESES,
  loadOrdoData,
  validateDifferences,
  validateEvidence,
  validateNotes,
} from '../scripts/ordo/check.mjs';

const data = loadOrdoData();

test('every diocese has an evidence file from its own adapter', () => {
  const adapters = Object.fromEntries(DIOCESES.map((d) => [d, data.evidence[d].source.adapter]));
  assert.deepEqual(adapters, {
    'minsk-mohilev': 'minsk-paragraph-styles',
    vitebsk: 'vitebsk-state-machine',
    pinsk: 'pinsk-day-bands',
    grodno: 'grodno-day-blocks',
  });
});

test('adapters cover a full liturgical year of contiguous days', () => {
  DIOCESES.forEach((diocese) => {
    const days = data.evidence[diocese].days.filter((day) => !day.preview);
    assert.ok(days.length >= 360, `${diocese}: ${days.length} days`);
    const first = Date.parse(`${days[0].date}T00:00:00Z`);
    const last = Date.parse(`${days.at(-1).date}T00:00:00Z`);
    assert.equal((last - first) / 86_400_000 + 1, days.length, `${diocese} has gaps`);
  });
  assert.equal(data.unresolved.missingDays.length, 0);
});

test('every extracted item carries provenance and a classification', () => {
  DIOCESES.forEach((diocese) => assert.deepEqual(validateEvidence(data.evidence[diocese]), []));
  assert.deepEqual(validateNotes(data.notes, data.evidence), []);
  assert.deepEqual(validateDifferences(data.differences), []);
});

test('PDF evidence is coordinate-aware, DOCX evidence is paragraph-based', () => {
  const pinskDay = data.evidence.pinsk.days.find((day) => day.date === '2026-01-17');
  assert.equal(pinskDay.celebrations[0].evidence.page, 29);
  assert.equal(pinskDay.celebrations[0].evidence.bbox.length, 4);
  const minskDay = data.evidence['minsk-mohilev'].days.find((day) => day.date === '2025-12-03');
  assert.ok(Number.isInteger(minskDay.evidence.paragraph));
});

test('alignment uses liturgical identity, not only the civil date', () => {
  const grodnoEaster = data.evidence.grodno.days.find((day) => day.date === '2027-03-28');
  assert.deepEqual(grodnoEaster.liturgical.dynamic, ['eastersunday']);
  const vitebskAdvent = data.evidence.vitebsk.days.find((day) => day.date === '2025-12-20');
  assert.equal(vitebskAdvent.liturgical.periodPhase, 'dec17-24');
  assert.equal(vitebskAdvent.liturgical.seasonalDateId, 'advent-20-12');
});

test('celebrations map to MyBrev identities', () => {
  const find = (diocese, date) => data.evidence[diocese].days.find((day) => day.date === date);
  assert.equal(find('minsk-mohilev', '2026-02-02').celebrations[0].identity.id, 'presentation-lord');
  assert.equal(find('pinsk', '2026-06-04').celebrations[0].identity.id, 'corpuschristi');
  assert.equal(find('grodno', '2027-03-19').celebrations[0].identity.id, 'sv-joseph');
  assert.equal(find('vitebsk', '2026-03-29').celebrations[0].identity.kind, 'dynamic');
});

test('Office descriptors keep the published rubrics as oracle flags', () => {
  const minskSaturday = data.evidence['minsk-mohilev'].days.find((day) => day.date === '2025-12-06');
  assert.ok(minskSaturday.office.flags.firstVespersOf);
  assert.equal(minskSaturday.office.flags.optionalMemorialAllowed, true);
  const grodnoSolemnity = data.evidence.grodno.days.find((day) => day.date === '2027-03-19');
  assert.equal(grodnoSolemnity.office.flags.secondVespers, true);
  assert.equal(grodnoSolemnity.office.flags.compline, 'sunday');
});
