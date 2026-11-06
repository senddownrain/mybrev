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
