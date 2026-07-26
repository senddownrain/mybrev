import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFixedComparisonKey,
  buildFixedDayId,
  normalizeFixedDate,
  normalizeFixedFeast,
  normalizePlace,
  normalizePlaces,
  normalizeRank,
} from '../src/utils/fixedFeasts.js';

test('normalizes canonical fixed-day dimensions', () => {
  assert.equal(normalizeFixedDate('7.1'), '07.01');
  assert.equal(normalizeRank(''), 'memoria-ad-libitum');
  assert.equal(normalizeRank('Урачыстасць'), 'solemnitas');
  assert.equal(normalizePlace('Гродзенская дыяцэзія'), 'grodno');
  assert.deepEqual(
    normalizePlaces(['Мінска-Магілёўская архідыяцэзія', 'Пінская дыяцэзія']),
    ['minsk-mohilev', 'pinsk'],
  );
  assert.deepEqual(
    normalizePlaces('У Мінска-Магілёўскай архідыяцэзіі і Пінскай дыяцэзіі'),
    ['minsk-mohilev', 'pinsk'],
  );
});

test('builds comparison key only from date, rank, and place', () => {
  assert.equal(
    buildFixedComparisonKey({ date: '4.3', rank: 'Успамін', place: 'Віцебская дыяцэзія' }),
    '04.03|memoria|vitebsk',
  );
  assert.equal(
    buildFixedComparisonKey({
      date: '26.08',
      rank: 'Успамін',
      place: ['Пінская дыяцэзія', 'Гродзенская дыяцэзія'],
    }),
    '26.08|memoria|grodno,pinsk',
  );
});

test('builds unique fixed-day id with optional place and required slug', () => {
  assert.equal(
    buildFixedDayId({ _date: '20.01', _rank: 'memoria-ad-libitum' }, 'sv-sebastian'),
    '20.01-memoria-ad-libitum-sv-sebastian',
  );
  assert.equal(
    buildFixedDayId({
      _date: '26.08',
      _rank: 'memoria',
      _place: ['minsk-mohilev', 'pinsk', 'grodno'],
    }, 'our-lady-czestochowa'),
    '26.08-memoria-grodno-minsk-mohilev-pinsk-our-lady-czestochowa',
  );
  assert.equal(
    buildFixedDayId({ _date: '04.03', _rank: 'festum', _place: 'grodno' }, 'sv-casimir'),
    '04.03-festum-grodno-sv-casimir',
  );
});

test('migrates legacy feast metadata without losing content', () => {
  const normalized = normalizeFixedFeast({
    _date: '7.1',
    _rank: 'memoria-ad-libitum',
    _feastName: 'Св. Раймунда',
    feastComment: 'Каментар',
    _templates: ['pastors'],
    laudesPr: '<p>Малітва</p>',
  });
  assert.equal(normalized._title, 'Св. Раймунда');
  assert.equal(normalized.comment, 'Каментар');
  assert.equal(normalized.laudesPr, '<p>Малітва</p>');
  assert.ok(!('_feastName' in normalized));
  assert.ok(!('feastComment' in normalized));
});
