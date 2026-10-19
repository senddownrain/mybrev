import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFirebaseWebConfig } from '../scripts/lib/firebase-web-config.mjs';

const configured = Object.fromEntries(['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']
  .map((key) => [`VITE_FIREBASE_${key}`, 'configured']));

test('rejects missing client configuration before emitting a deployable bundle', () => {
  assert.throws(() => validateFirebaseWebConfig({}), /VITE_FIREBASE_PROJECT_ID/);
  for (const key of Object.keys(configured)) {
    assert.throws(() => validateFirebaseWebConfig({ ...configured, [key]: '  ' }), new RegExp(key));
  }
});

test('accepts the six configured fields without optional analytics or realtime database settings', () => {
  assert.doesNotThrow(() => validateFirebaseWebConfig(configured));
});
