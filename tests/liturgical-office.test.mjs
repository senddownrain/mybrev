import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowTeDeum,
  usesSundayCompletorium,
} from '../src/utils/liturgicalOffice.js';

test('Sunday Compline is reserved for solemnities, not ordinary feasts', () => {
  assert.equal(usesSundayCompletorium({ _rank: 'solemnitas' }), true);
  assert.equal(usesSundayCompletorium({ _rank: 'solemnity' }), true);
  assert.equal(usesSundayCompletorium({ _rank: 'festum' }), false);
  assert.equal(usesSundayCompletorium({ _rank: 'feast' }), false);
  assert.equal(usesSundayCompletorium({ _rank: 'memoria' }), false);
  assert.equal(usesSundayCompletorium({ _kind: 'office-for-dead' }), true);
});

test('Te Deum follows rank and Sunday season rules', () => {
  assert.equal(shouldShowTeDeum({ _rank: 'solemnitas', _periodType: 'lent' }), true);
  assert.equal(shouldShowTeDeum({ _rank: 'festum', _periodType: 'lent' }), true);
  assert.equal(shouldShowTeDeum({ _rank: 'memoria', _dayOfWeek: 1 }), false);
  assert.equal(shouldShowTeDeum({ _dayOfWeek: 1, _periodType: 'ordinary' }), true);
  assert.equal(shouldShowTeDeum({ _dayOfWeek: '1', _periodType: 'easter' }), true);
  assert.equal(shouldShowTeDeum({ _dayOfWeek: 1, _periodType: 'lent' }), false);
  assert.equal(shouldShowTeDeum({ _dayOfWeek: 1, _periodType: 'holyweek' }), false);
  assert.equal(shouldShowTeDeum({ _dayOfWeek: 3, _periodType: 'ordinary' }), false);
  assert.equal(shouldShowTeDeum({ _kind: 'office-for-dead', _rank: 'solemnitas' }), false);
});
