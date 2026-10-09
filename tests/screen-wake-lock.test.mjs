import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { createScreenWakeLock } from '../src/utils/screenWakeLock.js';

function fixture(request) {
  const document = new globalThis.EventTarget();
  document.visibilityState = 'visible';
  const locks = [];
  const errors = [];
  let requests = 0;
  const makeLock = () => {
    const lock = new globalThis.EventTarget();
    lock.released = false;
    lock.release = async () => { lock.released = true; lock.dispatchEvent(new globalThis.Event('release')); };
    locks.push(lock);
    return lock;
  };
  const navigator = { wakeLock: { request: async (type) => {
    assert.equal(type, 'screen');
    requests += 1;
    return request ? request(makeLock) : makeLock();
  } } };
  const controller = createScreenWakeLock({ navigator, document, onError: (error) => errors.push(error) });
  const visibility = (state) => { document.visibilityState = state; document.dispatchEvent(new globalThis.Event('visibilitychange')); };
  return { controller, document, navigator, locks, errors, visibility, requests: () => requests };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('enabling requests one lock; disabling releases it and stops automatic resume', async () => {
  const f = fixture();
  await f.controller.setEnabled(true);
  await f.controller.setEnabled(true);
  assert.equal(f.requests(), 1);
  await f.controller.setEnabled(false);
  assert.equal(f.locks[0].released, true);
  f.visibility('visible');
  await tick();
  assert.equal(f.requests(), 1);
  await f.controller.dispose();
});

test('the enabled lock is reacquired on returning to a visible tab', async () => {
  const f = fixture();
  await f.controller.setEnabled(true);
  f.visibility('hidden');
  await f.locks[0].release();
  assert.equal(f.requests(), 1);
  f.visibility('visible');
  await tick();
  assert.equal(f.requests(), 2);
  assert.equal(f.locks[1].released, false);
  await f.controller.dispose();
});

test('initially hidden documents request only after becoming visible', async () => {
  const f = fixture();
  f.visibility('hidden');
  await f.controller.setEnabled(true);
  assert.equal(f.requests(), 0);
  f.visibility('visible');
  await tick();
  assert.equal(f.requests(), 1);
  await f.controller.dispose();
});

test('an in-flight request is deduplicated and released if switched off', async () => {
  let resolve;
  const f = fixture((makeLock) => new Promise((done) => { resolve = () => done(makeLock()); }));
  const pending = f.controller.setEnabled(true);
  f.document.dispatchEvent(new globalThis.Event('pointerdown'));
  await f.controller.setEnabled(false);
  assert.equal(f.requests(), 1);
  resolve();
  await pending;
  assert.equal(f.locks[0].released, true);
  await f.controller.dispose();
});

test('a refused request can retry on a gesture without losing the preference', async () => {
  let fail = true;
  const f = fixture((makeLock) => { if (fail) throw new Error('document inactive'); return makeLock(); });
  await f.controller.setEnabled(true);
  assert.equal(f.errors.length, 1);
  fail = false;
  f.document.dispatchEvent(new globalThis.Event('pointerdown'));
  await tick();
  assert.equal(f.requests(), 2);
  assert.equal(f.locks[0].released, false);
  await f.controller.dispose();
});

test('unsupported browsers do not crash or make a request', async () => {
  const f = fixture();
  delete f.navigator.wakeLock;
  await f.controller.setEnabled(true);
  f.document.dispatchEvent(new globalThis.Event('pointerdown'));
  await tick();
  assert.equal(f.requests(), 0);
  assert.deepEqual(f.errors, []);
  await f.controller.dispose();
});
