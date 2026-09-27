import test from 'node:test';
import assert from 'node:assert/strict';
import { LITURGICAL_HOUR_TITLES, NEXT_LITURGICAL_HOUR } from '../src/constants/liturgicalHours.js';

test('the next-hour sequence follows the canonical office order', () => {
  assert.deepEqual(NEXT_LITURGICAL_HOUR, {
    morning: 'terz',
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

test('ambiguous invitatory and final compline have no automatic successor', () => {
  assert.equal(NEXT_LITURGICAL_HOUR.invitatorium, undefined);
  assert.equal(NEXT_LITURGICAL_HOUR.completorium, undefined);
});
