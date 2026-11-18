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

test('request id: identical retry keeps it, an edited message gets a new one', async () => {
  const { attemptRequestId, resetAttempt } = await import('../src/utils/feedbackContext.js');
  let n = 0; const gen = () => `id-${++n}`;
  const st = { id: '', key: '' };
  const a = attemptRequestId(st, { body: 'one', category: 'text_error' }, gen);
  assert.equal(attemptRequestId(st, { body: 'one', category: 'text_error' }, gen), a, 'same payload: same id');
  const b = attemptRequestId(st, { body: 'one edited', category: 'text_error' }, gen);
  assert.notEqual(b, a, 'edited text: new id');
  assert.notEqual(attemptRequestId(st, { body: 'one edited', category: 'other' }, gen), b, 'changed category: new id');
  resetAttempt(st);
  assert.notEqual(attemptRequestId(st, { body: 'one edited', category: 'other' }, gen), b, 'after success: next message is fresh');
});

test('context summary is human readable and Ordo/path are carried', async () => {
  const { contextSummary, feedbackLocationForRoute: loc, contextFromQuery } = await import('../src/utils/feedbackContext.js');
  assert.equal(contextSummary({ kind: 'hour', date: '2026-11-13', hour: 'lauds' }), 'Літургія гадзінаў · 2026-11-13 · Ютрань');
  assert.equal(contextSummary({ kind: 'prayer', title: 'Ойча наш' }), 'Малітва · Ойча наш');
  assert.equal(contextSummary({ id: 'x1' }), 'ID: x1');
  assert.equal(contextSummary(null), '');
  assert.deepEqual(loc({ name: 'OrdoByDate', params: { date: '2026-11-13' }, path: '/ordo/2026-11-13' }).query, { ctx_kind: 'day', ctx_date: '2026-11-13', ctx_path: '/ordo/2026-11-13' });
  assert.equal(loc({ name: 'Ordo', params: {} }), null);
  assert.equal(contextFromQuery({ ctx_kind: 'prayer', ctx_id: 'a', ctx_path: '/prayer/a' }).path, '/prayer/a');
  assert.equal(contextFromQuery({ ctx_kind: 'prayer', ctx_id: 'a', ctx_path: 'https://evil.example/' }).path, undefined);
});
