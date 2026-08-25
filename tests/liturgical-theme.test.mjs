import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLiturgicalCelebrationPriority,
  getLiturgicalCelebrationThemeKey,
  getLiturgicalTheme,
} from '../src/constants/liturgical.js';

test('solemnities and feasts have display priority over regular days', () => {
  assert.equal(getLiturgicalCelebrationPriority({ _rank: 'solemnitas' }), 0);
  assert.equal(getLiturgicalCelebrationPriority({ _feastType: 'Свята' }), 1);
  assert.equal(getLiturgicalCelebrationPriority({ _periodType: 'ordinary' }), 2);
});

test('celebration themes follow rank and red exceptions', () => {
  assert.equal(getLiturgicalCelebrationThemeKey({ _rank: 'solemnitas' }), 'gold');
  assert.equal(getLiturgicalCelebrationThemeKey({ _rank: 'festum' }), 'white');
  assert.equal(getLiturgicalCelebrationThemeKey({
    _rank: 'festum',
    _feastName: 'Св. Стэфана, першамучаніка',
  }), 'red');
  assert.equal(getLiturgicalCelebrationThemeKey({
    _rank: 'festum',
    _feastName: 'Святых апосталаў Пятра і Паўла',
  }), 'red');
  assert.equal(getLiturgicalCelebrationThemeKey({
    _rank: 'solemnitas',
    _feast: 'feast-pentecost',
  }), 'red');
  assert.equal(getLiturgicalCelebrationThemeKey({
    _rank: 'solemnitas',
    _feast: 'feast-heartofjesus',
  }), 'red');
});

test('regular days keep their period theme', () => {
  assert.equal(getLiturgicalTheme({ _periodType: 'ordinary' }).color, '#4d8a5b');
});
