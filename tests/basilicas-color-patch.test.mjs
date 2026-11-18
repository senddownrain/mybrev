import test from 'node:test';
import assert from 'node:assert/strict';
import { CELEBRATION_ID, guardCelebration, guardMeta, sourceCheck } from '../scripts/ordo/patch-basilicas-color.mjs';

test('source uses white and exact target', () => {
  assert.equal(sourceCheck().id, CELEBRATION_ID);
  assert.equal(sourceCheck().color, 'albus');
});

test('one-field patch accepts only the specified basilica dedication', () => {
  const doc = {
    title: 'Гадавіна пасвячэння рымскіх базылік св. апосталаў Пятра і Паўла',
    rank: 'memoria-ad-libitum', category: 'dedication', color: 'ruber',
    dateRule: { type: 'fixed', month: 11, day: 18 },
    daysRef: { _date: '18.11', dayIds: ['18-11-dedication-basilicas-peter-paul'] },
  };
  assert.equal(guardCelebration(doc), 'needs-correction');
  assert.equal(guardCelebration({ ...doc, color: 'albus' }), 'already-correct');
  assert.throws(() => guardCelebration({ ...doc, color: 'viridis' }));
  assert.throws(() => guardCelebration({ ...doc, dateRule: { ...doc.dateRule, day: 19 } }));
  assert.throws(() => guardCelebration({ ...doc, category: 'saint' }));
  assert.throws(() => guardCelebration(null));
});

test('revision must be an existing valid calendar publication', () => {
  assert.equal(guardMeta({ schemaVersion: 1, revision: 5 }), 5);
  assert.throws(() => guardMeta({ schemaVersion: 1, revision: 0 }));
  assert.throws(() => guardMeta(null));
});
