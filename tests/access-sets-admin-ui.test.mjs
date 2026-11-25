import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, profileImpact, profileInput } from '../src/components/admin/accessSets/model.mjs';

const draft = { id: 'synthetic', name: 'Synthetic profile', status: 'active', allowedSets: ['marian'] };

test('profile allows independent sets and an explicit empty profile; bad IDs and duplicates fail', () => {
  assert.equal(profileInput(draft), null);
  assert.equal(profileInput({ ...draft, allowedSets: [] }), null);
  assert.equal(profileInput({ ...draft, allowedSets: ['marian', 'priest', 'capuchin'] }), null);
  assert.equal(profileInput({ ...draft, id: 'Invalid-ID' }), 'invalid-profile');
  assert.equal(profileInput({ ...draft, id: 'marian\n' }), 'invalid-profile');
  assert.equal(profileInput({ ...draft, id: null }), 'invalid-profile');
  assert.equal(profileInput({ ...draft, allowedSets: ['marian', 'marian'] }), 'invalid-sets');
  assert.equal(profileInput({ ...draft, allowedSets: ['marian!priest'] }), 'invalid-set');
});

test('dry run describes effective change for devices on the profile without adding implicit sets', () => {
  assert.deepEqual(profileImpact(null, draft), {
    before: [], after: ['marian'], added: ['marian'], removed: [],
  });
  assert.deepEqual(profileImpact(draft, { ...draft, allowedSets: ['priest'] }), {
    before: ['marian'], after: ['priest'], added: ['priest'], removed: ['marian'],
  });
  for (const status of ['disabled', 'revoked']) {
    assert.deepEqual(profileImpact(draft, { ...draft, status }), {
      before: ['marian'], after: [], added: [], removed: ['marian'],
    });
  }
});

test('administrative errors translate stable codes without displaying raw payloads', () => {
  const fallback = errorMessage('unknown');
  assert.equal(errorMessage('toString'), fallback);
  assert.equal(errorMessage('raw error containing sensitive fields'), fallback);
  assert.notEqual(errorMessage('permission-denied'), fallback);
  assert.notEqual(errorMessage('resource-exhausted'), fallback);
  assert.notEqual(errorMessage('unavailable'), fallback);
});
