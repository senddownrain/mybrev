import test from 'node:test';
import assert from 'node:assert/strict';
import { LITURGICAL_HOUR_TITLES, NEXT_LITURGICAL_HOUR, liturgicalHourRoute } from '../src/constants/liturgicalHours.js';

test('footer buttons follow the explicitly agreed sequence for both starting hours', () => {
  assert.deepEqual(NEXT_LITURGICAL_HOUR, {
    invitatorium: 'laudes',
    lectionis: 'laudes',
    laudes: 'terz',
    terz: 'sext',
    sext: 'non',
    non: 'vesper',
    vesper: 'completorium',
  });
  for (const next of Object.values(NEXT_LITURGICAL_HOUR)) {
    assert.ok(LITURGICAL_HOUR_TITLES[next]);
  }
});

test('combined morning Office and Compline have no footer button', () => {
  assert.equal(NEXT_LITURGICAL_HOUR.morning, undefined);
  assert.equal(NEXT_LITURGICAL_HOUR.completorium, undefined);
  assert.equal(NEXT_LITURGICAL_HOUR.oras, undefined);
});

test('next-hour route preserves date, text variant, diocese and unrelated query parameters', () => {
  const route = {
    params: { day: '2026-11-18', id: 'selected-office-variant' },
    query: { diocese: 'vitebsk', view: 'period', lang: 'be', firstVespersDayId: 'old' },
  };
  assert.deepEqual(liturgicalHourRoute(route, 'laudes'), {
    name: 'laudes',
    params: { day: '2026-11-18', id: 'selected-office-variant' },
    query: { diocese: 'vitebsk', view: 'period', lang: 'be' },
  });
  assert.deepEqual(liturgicalHourRoute(route, 'completorium'), {
    name: 'completorium',
    params: { day: '2026-11-18', id: 'selected-office-variant' },
    query: { diocese: 'vitebsk', view: 'period', lang: 'be' },
  });
});
