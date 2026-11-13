import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFromQuery, feedbackLink } from '../src/utils/feedbackContext.js';

test('context keeps only whitelisted safe values', () => {
  assert.equal(contextFromQuery({}), null);
  assert.equal(contextFromQuery({ ctx_kind: 'evil', ctx_id: '<x>' }), null);
  const c = contextFromQuery({ ctx_kind: 'prayer', ctx_id: 'abc-1', ctx_date: '2026-11-06', token: 'secret', ctx_title: ' Ойча наш ' }, { diocese: 'minsk_mahilou', path: '/prayers/abc-1?token=1#x' });
  assert.deepEqual(c, { kind: 'prayer', id: 'abc-1', date: '2026-11-06', title: 'Ойча наш', diocese: 'minsk_mahilou', lang: 'be', path: '/prayers/abc-1' });
  assert.ok(!JSON.stringify(c).includes('secret'));
});
test('feedbackLink carries only context keys', () => {
  assert.deepEqual(feedbackLink({ kind: 'prayer', id: 'a', title: 'T' }), { name: 'Feedback', query: { ctx_kind: 'prayer', ctx_id: 'a', ctx_title: 'T' } });
});

test('feedbackLocationForRoute gives automatic context for materials only', async () => {
  const { feedbackLocationForRoute: loc } = await import('../src/utils/feedbackContext.js');
  assert.deepEqual(loc({ name: 'PrayerView', params: { id: 'abc-1' } }), { name: 'Feedback', query: { ctx_kind: 'prayer', ctx_id: 'abc-1' } });
  assert.deepEqual(loc({ name: 'SongView', params: { id: 's1' } }).query, { ctx_kind: 'song', ctx_id: 's1' });
  assert.deepEqual(loc({ name: 'laudes', params: { day: '2026-11-13', id: 'd1' } }).query, { ctx_kind: 'hour', ctx_id: 'd1', ctx_date: '2026-11-13', ctx_hour: 'lauds' });
  assert.deepEqual(loc({ name: 'oras', params: { day: '2026-11-13', id: 'd1' } }).query, { ctx_kind: 'day', ctx_id: 'd1', ctx_date: '2026-11-13' });
  assert.deepEqual(loc({ name: 'ReadingsByDate', params: { date: '2026-11-13' } }).query, { ctx_kind: 'reading', ctx_date: '2026-11-13' });
  assert.deepEqual(loc({ name: 'Bible', params: { language: 'ru', bookId: 'jn', chapter: '3' } }).query, { ctx_kind: 'bible', ctx_id: 'ru-jn-3' });
  assert.deepEqual(loc({ name: 'CompendiumQuestion', params: { number: '12' } }).query, { ctx_kind: 'compendium', ctx_id: '12' });
  for (const name of ['Home', 'Settings', 'About', 'Feedback', 'PrayersList', 'Songs', 'Compendium', 'Ordo', 'AdminDayEditor', 'login']) {
    assert.equal(loc({ name, params: {} }), null, name);
  }
  assert.equal(loc({ name: 'Bible', params: {} }), null);
  assert.equal(loc({ name: 'PrayerView', params: { id: '<x>' } }).query.ctx_id, undefined);
});
