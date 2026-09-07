import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPsalmBreakCleanupPlan,
  cleanupPsalmField,
} from '../scripts/cleanup-psalm-cadence-breaks.mjs';

test('cleans only breaks after dagger signs', () => {
  const source = '<p>першы †<br>другі *<br>трэці &dagger;</span><br />чацвёрты</p>';
  const cleaned = cleanupPsalmField(source);

  assert.equal(cleaned.removedBreaks, 2);
  assert.equal(cleaned.value, '<p>першы † другі *<br>трэці &dagger;</span> чацвёрты</p>');
});

test('plans only psalm fields and keeps report data content-free', () => {
  const plan = buildPsalmBreakCleanupPlan([{
    id: 'ordinary-w1-d1',
    laudesPs1: '<p>першы &#8224;<br />другі</p>',
    officeOfReadingsR1: '<p>не псальм †<br>працяг</p>',
    title: 'Дзень',
  }]);

  assert.equal(plan.length, 1);
  assert.equal(plan[0].fields.length, 1);
  assert.equal(plan[0].fields[0].field, 'laudesPs1');
  assert.equal(plan[0].fields[0].removedBreaks, 1);
  assert.equal('before' in plan[0].fields[0], false);
  assert.equal('after' in plan[0].fields[0], false);
});
