import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, limit, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore/lite';
import { initializeApp as initAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { createAccessSetsV2Admin } from '../src/services/accessSetsV2Admin.mjs';
import { createAccessSetsV2Gateway } from '../src/services/accessSetsV2Gateway.mjs';
import { accessSetsV2CodeProof, parseAccessSetsV2Code } from '../src/utils/accessSetsV2Code.mjs';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = 'demo-rules';
const loopback = /^(127\.0\.0\.1|localhost):[0-9]+$/;
const deny = promise => assert.rejects(promise, { code: 'permission-denied' });
const device = { deviceName: 'Synthetic test device', client: 'Web', platform: 'test' };

async function readStatus(client, status) {
  assert.equal((await client.gateway.readGrant(client.uid))?.status, status);
}

test('Access Sets V2 authorization in local Auth and Firestore emulators', {
  skip: !firestoreHost || !authHost,
}, async t => {
  assert.match(firestoreHost, loopback, 'Firestore must be local');
  assert.match(authHost, loopback, 'Auth must be local');
  const [host, port] = firestoreHost.split(':');
  const apps = [];
  const seedApp = initAdmin({ projectId }, 'access-sets-v2-fixtures');
  const seed = adminFirestore(seedApp);
  t.after(async () => {
    await Promise.all(apps.map(app => deleteApp(app)));
    await deleteAdmin(seedApp);
  });

  async function client(anonymous = true) {
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, 'access-sets-client-' + apps.length);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://' + authHost, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, Number(port));
    const uid = anonymous ? (await signInAnonymously(auth)).user.uid : null;
    return { db, uid, gateway: createAccessSetsV2Gateway(db) };
  }

  const [guest, ordinary, oldPriest, priest, marian, combined, manager, editor, wrong, afterRotation] =
    await Promise.all([client(false), ...Array.from({ length: 9 }, () => client())]);
  await Promise.all([
    seed.doc('admins/' + manager.uid).set({ role: 'admin', accessSetsV2: true }),
    seed.doc('admins/' + editor.uid).set({ role: 'admin', priestAccess: true }),
    seed.doc('priestDeviceGrants/' + oldPriest.uid).set({ uid: oldPriest.uid, status: 'active' }),
  ]);
  const admin = createAccessSetsV2Admin(manager.db);
  const setMode = mode => seed.doc('priestContentControl/accessSetsV2').set({ mode });
  const get = (actor, path) => getDoc(doc(actor.db, path));
  const list = (actor, path) => getDocs(collection(actor.db, path));
  const readerPaths = ['protectedPrayers', 'protectedCategories'];

  await admin.saveSet('priest', { name: 'Synthetic Priest' });
  await admin.saveSet('marian', { name: 'Synthetic Marian' });
  for (const [id, allowedSets] of [['priest', ['priest']], ['marian', ['marian']], ['both', ['priest', 'marian']]]) {
    assert.equal(await admin.saveProfile(id, { name: id, status: 'active', allowedSets }), 1);
  }
  const priestCode = await admin.issueCode({ profileId: 'priest', prefix: 'PRST' });
  const marianCode = await admin.issueCode({ profileId: 'marian', prefix: 'MARI' });
  const combinedCode = await admin.issueCode({ profileId: 'both', prefix: 'BOTH' });

  const content = seed.batch();
  content.set(seed.doc('prayers/s1-public'), { text: 'Synthetic public prayer' });
  content.set(seed.doc('priestProtectedPrayers/s1-priest'), { text: 'Synthetic legacy prayer' });
  for (const [kind, path] of [['prayers', 'protectedPrayers'], ['categories', 'protectedCategories']]) {
    for (const [id, sets] of [['s1-priest', ['priest']], ['s1-marian', ['marian']], ['s1-multi', ['priest', 'marian']]]) {
      content.set(seed.doc(path + '/' + id), { title: 'Synthetic content', effectiveAccessSets: sets });
      for (const setId of sets) content.set(seed.doc('accessSetsV2/' + setId + '/' + kind + '/' + id), {});
    }
  }
  await content.commit();

  await t.test('default rollout uses legacy and requires explicit canonical mode for V2', async () => {
    assert.equal(await oldPriest.gateway.readMode(), 'legacy');
    assert.ok((await get(oldPriest, 'priestProtectedPrayers/s1-priest')).exists());
    await deny(get(oldPriest, 'protectedPrayers/s1-priest'));
    await assert.rejects(priest.gateway.activate(priest.uid, priestCode.code, device), { code: 'activation-denied' });
    assert.equal(await priest.gateway.readGrant(priest.uid), null);
    await setMode('canonical');
    assert.equal(await oldPriest.gateway.readMode(), 'canonical');
  });

  await t.test('ordinary users get the public collection and no protected collection, index or metadata', async () => {
    for (const actor of [guest, ordinary]) {
      assert.ok((await get(actor, 'prayers/s1-public')).exists());
      for (const path of readerPaths) {
        await deny(get(actor, path + '/s1-marian'));
        await deny(list(actor, path));
      }
      await deny(actor.gateway.listIds('prayers', 'marian'));
      await deny(list(actor, 'accessSetsV2'));
      await deny(get(actor, 'accessCodesV2/' + marianCode.codeId + '/client/profile'));
    }
    assert.equal(await ordinary.gateway.readEntitlements(ordinary.uid), null);
  });

  await t.test('legacy, V2 priest, V2 marian and multi-set profiles get only their canonical sets', async () => {
    for (const [actor, code] of [[priest, priestCode], [marian, marianCode], [combined, combinedCode]]) {
      assert.deepEqual(await actor.gateway.activate(actor.uid, code.code, device), { codeId: code.codeId });
      await readStatus(actor, 'active');
      assert.deepEqual(await actor.gateway.activate(actor.uid, code.code, device), { codeId: code.codeId });
    }
    assert.deepEqual((await priest.gateway.readEntitlements(priest.uid)).allowedSets, ['priest']);
    assert.deepEqual((await marian.gateway.readEntitlements(marian.uid)).allowedSets, ['marian']);
    assert.deepEqual((await combined.gateway.readEntitlements(combined.uid)).allowedSets, ['marian', 'priest']);
    assert.equal(await oldPriest.gateway.readEntitlements(oldPriest.uid), null);
    for (const path of readerPaths) {
      for (const actor of [oldPriest, priest, combined]) assert.ok((await get(actor, path + '/s1-priest')).exists());
      for (const actor of [marian, combined]) assert.ok((await get(actor, path + '/s1-marian')).exists());
      for (const actor of [oldPriest, priest, marian, combined]) assert.ok((await get(actor, path + '/s1-multi')).exists());
      await deny(get(marian, path + '/s1-priest'));
      await deny(get(oldPriest, path + '/s1-marian'));
      await deny(get(priest, path + '/s1-marian'));
      await deny(list(combined, path));
    }
    assert.deepEqual((await marian.gateway.listIds('prayers', 'marian')).ids, ['s1-marian', 's1-multi']);
    assert.deepEqual((await oldPriest.gateway.listIds('categories', 'priest')).ids, ['s1-multi', 's1-priest']);
    const firstPage = await combined.gateway.listIds('prayers', 'marian', { pageSize: 1 });
    assert.deepEqual(firstPage, { ids: ['s1-marian'], cursor: 's1-marian' });
    assert.deepEqual(await combined.gateway.listIds('prayers', 'marian', { after: firstPage.cursor }), {
      ids: ['s1-multi'], cursor: null,
    });
    assert.equal((await marian.gateway.readContent('prayers', 's1-marian')).id, 's1-marian');
    await deny(marian.gateway.listIds('prayers', 'priest'));
    await deny(list(marian, 'accessSetsV2/marian/prayers'));
    await deny(get(priest, 'priestProtectedPrayers/s1-priest'));

    await oldPriest.gateway.activate(oldPriest.uid, marianCode.code, device);
    assert.deepEqual((await oldPriest.gateway.readEntitlements(oldPriest.uid)).allowedSets, ['marian']);
    assert.ok((await get(oldPriest, 'protectedPrayers/s1-priest')).exists());
    assert.ok((await get(oldPriest, 'protectedPrayers/s1-marian')).exists());
    await oldPriest.gateway.revokeOwn(oldPriest.uid);
    await oldPriest.gateway.revokeOwn(oldPriest.uid);
    assert.ok((await get(oldPriest, 'priestProtectedPrayers/s1-priest')).exists());
    assert.ok((await get(oldPriest, 'protectedPrayers/s1-priest')).exists());
    await deny(get(oldPriest, 'protectedPrayers/s1-marian'));
  });

  await t.test('grants omit proof and clients cannot change their authoritative rights', async () => {
    const grant = await marian.gateway.readGrant(marian.uid);
    assert.deepEqual(Object.keys(grant).sort(), [
      'activatedAt', 'client', 'codeId', 'deviceName', 'label', 'lastActiveAt', 'platform', 'revokedAt', 'status', 'uid',
    ]);
    const grantRef = doc(marian.db, 'accessDeviceGrantsV2', marian.uid);
    await deny(updateDoc(grantRef, { codeId: combinedCode.codeId }));
    await deny(updateDoc(grantRef, { profileId: 'both', allowedSets: ['priest'] }));
    await deny(get(marian, 'accessProfilesV2/both/client/entitlements'));
    await deny(get(marian, 'accessDeviceGrantsV2/' + combined.uid));
    await deny(setDoc(doc(marian.db, 'accessSetsV2', 'priest'), { status: 'active' }));
    await deny(setDoc(doc(marian.db, 'admins', marian.uid), { accessSetsV2: true }));
    await deny(updateDoc(doc(marian.db, 'accessProfilesV2', 'marian'), { allowedSets: ['priest'] }));
    await deny(updateDoc(doc(marian.db, 'accessProfilesV2/marian/client/entitlements'), { allowedSets: ['priest'] }));
    await deny(get(marian, 'accessCodesV2/' + marianCode.codeId));
    await deny(get(marian, 'accessActivationClaimsV2/' + marian.uid));
    await deny(get(manager, 'accessActivationClaimsV2/' + marian.uid));
    await deny(list(manager, 'accessActivationClaimsV2'));
    for (const path of [
      'accessCodesV2/id/internal/item', 'accessProfilesV2/marian/internal/item',
      'accessDeviceGrantsV2/device/internal/item', 'accessSetsV2/marian/private/item',
      'accessActivationClaimsV2/device/internal/item', 'protectedPrayers/s1-marian/internal/item',
      'protectedCategories/s1-marian/internal/item',
    ]) {
      await deny(get(editor, path));
      await deny(setDoc(doc(editor.db, path), { synthetic: true }));
      await deny(get(manager, path));
    }
    await deny(get(editor, 'accessProfilesV2/marian'));
    await deny(get(editor, 'accessCodesV2/' + marianCode.codeId));
    await deny(setDoc(doc(editor.db, 'protectedPrayers', 's1-direct-write'), { effectiveAccessSets: ['marian'] }));
    await deny(setDoc(doc(manager.db, 'priestContentControl/accessSetsV2'), { mode: 'suspended' }));
    for (const path of ['prayers', 'prayerCategories', 'priestProtectedPrayers', 'priestProtectedCategories']) {
      const batch = writeBatch(editor.db);
      batch.set(doc(editor.db, 'priestContentControl/state'), {
        version: 1, lockUid: '', updatedAt: serverTimestamp(),
      });
      batch.set(doc(editor.db, path, 's1-private-guard'), {
        accessSchemaVersion: 2, effectiveAccessSets: ['marian'],
      });
      await deny(batch.commit());
    }
  });

  await t.test('registration requires a valid atomic pair and rejects mislabeled claims, invalid and disabled codes', async () => {
    const parsed = parseAccessSetsV2Code(marianCode.code);
    const claim = {
      uid: wrong.uid, codeId: parsed.codeId, activationProof: await accessSetsV2CodeProof(parsed.canonical),
      createdAt: serverTimestamp(),
    };
    const grant = {
      uid: wrong.uid, codeId: parsed.codeId, status: 'active', ...device, label: '',
      activatedAt: serverTimestamp(), lastActiveAt: serverTimestamp(), revokedAt: null,
    };
    const claimRef = doc(wrong.db, 'accessActivationClaimsV2', wrong.uid);
    const grantRef = doc(wrong.db, 'accessDeviceGrantsV2', wrong.uid);
    await deny(setDoc(claimRef, claim));
    await deny(setDoc(grantRef, grant));
    for (const patch of [
      { codeId: priestCode.codeId }, { profileId: 'both' }, { allowedSets: ['priest'] },
    ]) {
      const batch = writeBatch(wrong.db);
      batch.set(claimRef, claim);
      batch.set(grantRef, { ...grant, ...patch });
      await deny(batch.commit());
    }

    const incorrect = marianCode.code.slice(0, -1) + (marianCode.code.endsWith('A') ? 'B' : 'A');
    await assert.rejects(wrong.gateway.activate(wrong.uid, incorrect, device), { code: 'activation-denied' });
    const disabled = await admin.issueCode({ profileId: 'marian', prefix: 'MARI' });
    await admin.disableCode(disabled.codeId);
    await assert.rejects(wrong.gateway.activate(wrong.uid, disabled.code, device), { code: 'activation-denied' });
    assert.equal(await wrong.gateway.readGrant(wrong.uid), null);

    const rotated = await admin.issueCode({ profileId: 'marian', prefix: 'MARI', replacesCodeId: marianCode.codeId });
    await assert.rejects(afterRotation.gateway.activate(afterRotation.uid, marianCode.code, device), { code: 'activation-denied' });
    await afterRotation.gateway.activate(afterRotation.uid, rotated.code, device);
    assert.ok((await get(marian, 'protectedPrayers/s1-marian')).exists());
    assert.deepEqual((await marian.gateway.readEntitlements(marian.uid)).allowedSets, ['marian']);
  });

  await t.test('individual and profile revocation take effect on the next server read', async () => {
    await admin.revokeDevice(priest.uid);
    await readStatus(priest, 'revoked');
    await deny(get(priest, 'protectedPrayers/s1-priest'));
    await deny(updateDoc(doc(priest.db, 'accessDeviceGrantsV2', priest.uid), { status: 'active', revokedAt: null }));
    await combined.gateway.revokeOwn(combined.uid);
    await readStatus(combined, 'revoked');

    const newCombined = await client();
    await newCombined.gateway.activate(newCombined.uid, combinedCode.code, device);
    await admin.saveProfile('both', { name: 'both', status: 'active', allowedSets: ['marian'] }, 1);
    assert.deepEqual(await newCombined.gateway.readEntitlements(newCombined.uid), {
      profileId: 'both', allowedSets: ['marian'], revision: 2,
    });
    await deny(get(newCombined, 'protectedPrayers/s1-priest'));
    assert.ok((await get(newCombined, 'protectedPrayers/s1-marian')).exists());

    await admin.saveProfile('marian', { name: 'marian', status: 'disabled', allowedSets: ['marian'] }, 1);
    for (const actor of [marian, afterRotation]) {
      await deny(get(actor, 'protectedPrayers/s1-marian'));
      await deny(actor.gateway.readEntitlements(actor.uid));
      await deny(actor.gateway.listIds('prayers', 'marian'));
    }
    await admin.saveProfile('marian', { name: 'marian', status: 'active', allowedSets: ['marian'] }, 2);
    assert.ok((await get(marian, 'protectedPrayers/s1-marian')).exists());
    await admin.saveProfile('marian', { name: 'marian', status: 'revoked', allowedSets: [] }, 3);
    await deny(get(marian, 'protectedPrayers/s1-marian'));
    await deny(get(afterRotation, 'protectedPrayers/s1-marian'));
    await assert.rejects(admin.saveProfile('marian', { name: 'marian', status: 'active', allowedSets: ['marian'] }, 4), {
      code: 'profile-revoked',
    });
    assert.ok((await get(oldPriest, 'priestProtectedPrayers/s1-priest')).exists());
  });

  await t.test('canonical collection queries are reserved for staff and emergency suspension preserves legacy', async () => {
    const canonicalQuery = query(collection(oldPriest.db, 'protectedPrayers'), where('effectiveAccessSets', 'array-contains', 'priest'), limit(10));
    await deny(getDocs(canonicalQuery));
    assert.equal((await list(editor, 'protectedPrayers')).size, 3);
    await setMode('suspended');
    await deny(get(oldPriest, 'protectedPrayers/s1-priest'));
    assert.ok((await get(oldPriest, 'priestProtectedPrayers/s1-priest')).exists());
    assert.equal(await oldPriest.gateway.readMode(), 'suspended');
  });
});
