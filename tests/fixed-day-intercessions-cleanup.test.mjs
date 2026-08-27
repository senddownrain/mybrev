import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCleanupPlan,
  cleanupIntercessionHtml,
} from '../scripts/cleanup-fixed-day-intercessions.mjs';

test('removes the embedded heading and final Lord\'s Prayer', () => {
  const source = '<p style="text-align: justify;"><span style="color: #ff0000;">Просьбы</span><br />Уступ</p>\n<p>Прашэнне.</p>\n<p>Ойча наш.</p>';
  const result = cleanupIntercessionHtml(source);
  assert.equal(result.html, '<p style="text-align: justify;">Уступ</p>\n<p>Прашэнне.</p>');
  assert.equal(result.removedHeading, true);
  assert.equal(result.removedPaterNoster, true);
});

test('removes a final Russian Lord\'s Prayer without touching other occurrences', () => {
  const source = '<p>Ойча наш, выслухай нас.</p><p>Отче наш.</p>';
  const result = cleanupIntercessionHtml(source);
  assert.equal(result.html, '<p>Ойча наш, выслухай нас.</p>');
  assert.equal(result.removedHeading, false);
  assert.equal(result.removedPaterNoster, true);
});

test('removes a standalone first heading paragraph', () => {
  const source = '<p>Просьбы</p><p>Уступ.</p><p>Ойча наш.</p>';
  const result = cleanupIntercessionHtml(source);
  assert.equal(result.html, '<p>Уступ.</p>');
  assert.equal(result.removedHeading, true);
  assert.equal(result.removedPaterNoster, true);
});

test('does not remove a heading-like word outside the first paragraph prefix', () => {
  const source = '<p>Уступ</p><p><span>Просьбы</span> вернікаў.</p>';
  const result = cleanupIntercessionHtml(source);
  assert.equal(result.html, source);
  assert.equal(result.removedHeading, false);
  assert.equal(result.removedPaterNoster, false);
});

test('builds changes only for intercession fields', () => {
  const source = '<p><span>ПРОСЬБЫ</span><br>Уступ</p><p>Ойча наш</p>';
  const changes = buildCleanupPlan([{ id: '27-12-example', _date: '27.12', laudesInter: source, hymn: source }]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, 'laudesInter');
  assert.equal(changes[0].removedHeading, true);
  assert.equal(changes[0].removedPaterNoster, true);
});
