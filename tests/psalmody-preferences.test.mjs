import test from 'node:test';
import assert from 'node:assert/strict';
import { LITURGICAL_HOURS, liturgicalHourRoute } from '../src/constants/liturgicalHours.js';
import { normalizePsalmVerseLayout, normalizePsalmMarkerBreakMode } from '../src/utils/psalmodyDisplay.js';

test('missing and obsolete psalm preferences retain the current appearance', () => {
  for (const value of [null, undefined, '', 'obsolete']) {
    assert.equal(normalizePsalmVerseLayout(value), 'alternatingIndent');
    assert.equal(normalizePsalmMarkerBreakMode(value), 'inline');
  }
  assert.equal(normalizePsalmVerseLayout('alignedLeft'), 'alignedLeft');
  assert.equal(normalizePsalmMarkerBreakMode('breakAfterMarker'), 'breakAfterMarker');
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
