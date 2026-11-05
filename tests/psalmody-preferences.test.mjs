import test from 'node:test';
import assert from 'node:assert/strict';
import { LITURGICAL_HOURS, liturgicalHourRoute } from '../src/constants/liturgicalHours.js';
import { normalizePsalmodyMode, loadPsalmodyMode, PSALMODY_MODES } from '../src/utils/psalmodyDisplay.js';

test('new installs default to left-break and valid saved mode wins over legacy keys', () => {
  const storage = (values) => ({ getItem: key => values[key] ?? null });
  assert.equal(loadPsalmodyMode(storage({})), 'left-break');
  for (const mode of PSALMODY_MODES) {
    assert.equal(normalizePsalmodyMode(mode), mode);
    assert.equal(loadPsalmodyMode(storage({ psalmodyMode: mode, psalmVerseLayout: 'alignedLeft' })), mode);
  }
  for (const value of [null, undefined, '', 'obsolete']) assert.equal(normalizePsalmodyMode(value), 'left-break');
});

test('all legacy combinations migrate, including partially stored preferences', () => {
  for (const [layout, breaks, expected] of [
    ['alignedLeft', 'inline', 'left-break'],
    ['alignedLeft', 'breakAfterMarker', 'left-break-indent'],
    ['alternatingIndent', 'inline', 'alternating-stanzas'],
    ['alternatingIndent', 'breakAfterMarker', 'alternating-stanzas'],
    [null, 'inline', 'alternating-stanzas'],
    [null, 'breakAfterMarker', 'alternating-stanzas'],
    ['alignedLeft', null, 'left-break'],
    ['alternatingIndent', null, 'alternating-stanzas'],
    ['obsolete', 'obsolete', 'alternating-stanzas'],
  ]) {
    const values = { psalmVerseLayout: layout, psalmMarkerBreakMode: breaks, psalmodyMode: 'obsolete' };
    assert.equal(loadPsalmodyMode({ getItem: key => values[key] ?? null }), expected, JSON.stringify(values));
  }
});

test('every hour preserves date, selected day and diocesan context', () => {
  const route = { params: { day: '2026-01-01', id: 'alternative--common' }, query: { dayId: 'alternative', diocese: 'pinsk', firstVespersDayId: 'local-feast' } };
  for (const hour of LITURGICAL_HOURS) {
    const next = liturgicalHourRoute(route, hour.name);
    assert.deepEqual(next.params, route.params);
    assert.equal(next.query.dayId, 'alternative');
    assert.equal(next.query.diocese, 'pinsk');
    assert.equal(next.query.firstVespersDayId, hour.name === 'vesper' ? 'local-feast' : undefined);
  }
  assert.equal(route.query.firstVespersDayId, 'local-feast', 'route query is never mutated');
  assert.equal(liturgicalHourRoute(route, 'vesper', { firstVespersDayId: 'another-feast' }).query.firstVespersDayId, 'another-feast');
});
