import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultInvitatoriumId } from '../src/utils/invitatorium.js';

const invitatoriums = [
  { id: 'psalm-100', title: 'Псальм 100 (99)' },
  { id: 'psalm-95', invitatoriumPs1: '<p>Псальм 95 (94)</p>' },
  { id: 'psalm-67', name: 'Псальм 67 (66)' },
];

test('Christmas defaults to Psalm 95 (94)', () => {
  assert.equal(getDefaultInvitatoriumId(invitatoriums, 'christmas'), 'psalm-95');
});

test('other periods preserve the first configured Invitatory Psalm', () => {
  assert.equal(getDefaultInvitatoriumId(invitatoriums, 'advent'), 'psalm-100');
});

test('Christmas falls back to the first option if Psalm 95 is unavailable', () => {
  assert.equal(getDefaultInvitatoriumId(invitatoriums.slice(0, 1), 'christmas'), 'psalm-100');
});
