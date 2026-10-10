import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createPriestService } from '../functions/lib/priest-service.mjs';
import { parseCredential } from '../functions/lib/priest-crypto.mjs';

test('real Firestore transactions: parallel activation, rotation and revoke', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):/);
  const app = initializeApp({ projectId: 'demo-priest' }, 'priest-tests');
  try {
    const db = getFirestore(app);
    await db.doc('prayers/public').set({ title: 'Public', text: 'PUBLIC' });
    await db.doc('prayers/closed').set({ title: 'Closed', text: 'PRIVATE', tags: ['hidden'] });
    await db.doc('prayerCategories/closed').set({ name: 'Closed', tags: ['hidden'], priestOnly: true });
    const service = createPriestService(db);
    const first = await service.replaceCode({ generate: true }, 'admin');
    const input = { code: first.code, installationId: randomUUID(), client: 'Flutter' };
    const results = await Promise.allSettled([service.activate(input, 'test'), service.activate(input, 'test')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const grant = results.find((r) => r.status === 'fulfilled').value;
    const credential = parseCredential(grant.credential);
    assert.equal((await service.content(null)).prayers.length, 1);
    assert.equal((await service.content(credential)).prayers.length, 2);
    await service.replaceCode({ generate: true }, 'admin');
    assert.equal((await service.status(credential)).active, true);
    await assert.rejects(service.activate({ ...input, installationId: randomUUID() }, 'test'), { code: 'INVALID_CODE' });
    await service.updateDevice(grant.device.id, { revoke: true });
    await assert.rejects(service.content(credential), { code: 'ACCESS_REQUIRED' });
  } finally { await deleteApp(app); }
});
