import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore/lite';
import { initializeApp as initAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { createCanonicalCatalogWriter } from '../scripts/lib/access-sets-v2-writer.mjs';
import { assertCatalogParity, planCanonicalCatalog } from '../scripts/lib/access-sets-v2-storage-plan.mjs';
import { catalogContentHash } from '../scripts/lib/access-sets-v2-content-values.mjs';
import { createAccessSetsV2Gateway } from '../src/services/accessSetsV2Gateway.mjs';
import { createAccessSetsCatalogSession } from '../src/services/accessSetsCatalogSession.mjs';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = process.env.S8_TEST_PROJECT || 'demo-rules';
assert.match(projectId, /^demo-[a-z0-9-]+$/);
const loopback = /^(127\.0\.0\.1|localhost):[0-9]+$/;
const pathMode = 'priestContentControl/accessSetsV2';
const pathControl = 'priestContentControl/state';

test('S4 writer, mirror and reader use one real atomic Firestore commit', { skip: !firestoreHost || !authHost }, async (t) => {
  assert.match(firestoreHost, loopback);
  assert.match(authHost, loopback);
  const seedApp = initAdmin({ projectId }, 's4-writer-seed');
  const db = adminFirestore(seedApp);
  db.settings({ useBigInt: true });
  const apps = [];
  t.after(async () => {
    await Promise.all(apps.map((app) => deleteApp(app)));
    await deleteAdmin(seedApp);
  });
  async function actor(name) {
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, name);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://' + authHost, { disableWarnings: true });
    const uid = (await signInAnonymously(auth)).user.uid;
    const client = getFirestore(app);
    const [host, port] = firestoreHost.split(':');
    connectFirestoreEmulator(client, host, Number(port));
    return { uid, client, gateway: createAccessSetsV2Gateway(client) };
  }
  const [manager, legacyReader, v2Reader, deniedEditor] = await Promise.all(['manager', 'legacy', 'v2', 'editor'].map(actor));
  const mode = (value) => db.doc(pathMode).set({ mode: value });
  const sets = new Map([['priest', { status: 'active' }], ['marian', { status: 'active' }]]);
  const old = {
    title: 'Synthetic old prayer', text: '*Rubric*\n\nOld version', priestOnly: true, effectivePriestOnly: true,
    source: 'Synthetic old source', sourceBook: 'Old edition', startedAt: new Timestamp(13, 123_456_000),
    coordinates: new GeoPoint(53.9, 27.55), blob: Buffer.from([1, 2, 3]), reference: db.doc('prayers/synthetic-ref'),
    largeInteger: 9_007_199_254_740_993n,
  };
  const mirrorPath = 'priestProtectedPrayers/old';
  const canonicalPath = 'protectedPrayers/old';
  const indexPath = 'accessSetsV2/priest/prayers/old';
  const documents = new Map([[mirrorPath, old], [canonicalPath, {
    ...old, accessSchemaVersion: 2, accessSets: [], effectiveAccessSets: ['priest'], contentHash: catalogContentHash(old),
  }], [indexPath, {}]]);
  const seed = db.batch();
  for (const [path, data] of documents) seed.set(db.doc(path), data);
  for (const [id, data] of sets) seed.set(db.doc('accessSetsV2/' + id), data);
  seed.set(db.doc('admins/' + manager.uid), { role: 'admin' });
  seed.set(db.doc('priestDeviceGrants/' + legacyReader.uid), { uid: legacyReader.uid, status: 'active' });
  seed.set(db.doc('accessDeviceGrantsV2/' + v2Reader.uid), { uid: v2Reader.uid, status: 'active', codeId: 'ABCDEFGHJKLMNPQR' });
  seed.set(db.doc('accessCodesV2/ABCDEFGHJKLMNPQR'), { profileId: 's4-both' });
  seed.set(db.doc('accessProfilesV2/s4-both'), { status: 'active', allowedSets: ['marian', 'priest'] });
  seed.set(db.doc(pathControl), { version: 0, lockUid: '', updatedAt: Timestamp.now() });
  await seed.commit();
  const writer = createCanonicalCatalogWriter(db);
  const call = (data, uid = manager.uid, selected = writer) => selected.call({ auth: { uid }, data });
  const preview = (edits, uid) => call({ action: 'preview', edits }, uid);
  const saveRequest = (edits, review) => ({ action: 'save', edits, expectedVersion: review.version, planDigest: review.planDigest });
  const clientRead = (actor, path) => getDoc(doc(actor.client, path));
  const legacySet = (path, version) => {
    const batch = writeBatch(manager.client);
    batch.set(doc(manager.client, path), { title: 'Synthetic public', text: 'Public' });
    batch.set(doc(manager.client, pathControl), { version, lockUid: '', updatedAt: serverTimestamp() });
    return batch.commit();
  };
  const edits = [
    { kind: 'prayers', action: 'update', id: 'old', patch: { text: '*Rubric*\n\nNew version' } },
    { kind: 'prayers', action: 'create', id: 'new-marian', patch: { title: 'Synthetic marian', text: 'Synthetic', accessSets: ['marian'] } },
    { kind: 'prayers', action: 'create', id: 'new-mixed', patch: { title: 'Synthetic mixed', text: 'Synthetic', accessSets: ['marian', 'priest'] } },
  ];
  await assert.rejects(preview(edits), { code: 'canonical-writer-locked' });
  await legacySet('prayers/legacy-edit', 1);
  const legacyPublic = (await db.doc('prayers/legacy-edit').get()).data();
  documents.set('prayers/legacy-edit', legacyPublic);
  assert.ok((await clientRead(legacyReader, mirrorPath)).exists());
  await assert.rejects(clientRead(legacyReader, canonicalPath), { code: 'permission-denied' });

  // Emulator-only cutover of a synthetic, parity-verified fixture.
  assertCatalogParity({ sets, documents });
  await mode('canonical');
  await assert.rejects(legacySet('prayers/legacy-edit', 2), { code: 'permission-denied' });
  await assert.rejects(legacySet(mirrorPath, 2), { code: 'permission-denied' });
  await assert.rejects(preview(edits, deniedEditor.uid), { code: 'permission-denied' });
  await db.doc('admins/' + deniedEditor.uid).set({ role: null, accessSetsV2: true });
  await assert.rejects(preview(edits, deniedEditor.uid), { code: 'permission-denied' });
  await db.doc('admins/' + deniedEditor.uid).set({ name: 'Legacy admin fixture' });
  assert.equal((await preview(edits, deniedEditor.uid)).version, 1);
  await db.doc('admins/' + deniedEditor.uid).delete();
  await assert.rejects(preview(edits, deniedEditor.uid), { code: 'permission-denied' });
  await assert.rejects(writer.call({ data: { action: 'preview', edits } }), { code: 'unauthenticated' });
  const review = await preview(edits);
  const preimage = planCanonicalCatalog({ version: 1, sets, documents }, edits);
  assert.equal(review.planDigest, preimage.planDigest);
  assert.equal(review.writes, 7);
  assert.equal((await db.doc(pathControl).get()).data().version, 1n);

  const failingDb = Object.create(db);
  failingDb.runTransaction = (run, options) => db.runTransaction((tx) => {
    const set = tx.set.bind(tx);
    let staged = 0;
    tx.set = (...args) => {
      if (++staged === 3) throw new Error('synthetic interruption between staged writes');
      return set(...args);
    };
    return run(tx);
  }, options);
  // Keep references bound to the same Admin Firestore client.
  failingDb.doc = db.doc.bind(db);
  failingDb.collection = db.collection.bind(db);
  await assert.rejects(call(saveRequest(edits, review), manager.uid, createCanonicalCatalogWriter(failingDb)), /synthetic interruption/);
  assert.equal((await db.doc(mirrorPath).get()).data().text, old.text);
  assert.equal((await db.doc('protectedPrayers/new-marian').get()).exists, false);
  assert.equal((await db.doc(pathControl).get()).data().version, 1n);

  const concurrent = await Promise.allSettled([call(saveRequest(edits, review)), call(saveRequest(edits, review))]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  // The emulator can exhaust Firestore's transaction attempts under contention.
  // After the winning commit, a fresh request must still reject the stale review.
  const conflict = concurrent.find((result) => result.status === 'rejected').reason.code;
  assert.ok(['content-snapshot-drift', 10].includes(conflict));
  await assert.rejects(call(saveRequest(edits, review)), { code: 'content-snapshot-drift' });
  assert.deepEqual(await call({ action: 'verify', expectedVersion: 2, afterDigest: review.afterDigest }), { version: 2, parity: 'verified' });
  const mirror = (await db.doc(mirrorPath).get()).data();
  const canonical = (await db.doc(canonicalPath).get()).data();
  assert.equal(mirror.text, edits[0].patch.text);
  assert.equal(canonical.contentHash, catalogContentHash(mirror));
  assert.equal(mirror.startedAt.nanoseconds, old.startedAt.nanoseconds);
  assert.equal(mirror.coordinates.latitude, old.coordinates.latitude);
  assert.deepEqual(mirror.blob, old.blob);
  assert.equal(mirror.reference.path, old.reference.path);
  assert.equal(mirror.largeInteger, old.largeInteger);
  assert.equal(mirror.source, old.source);
  assert.equal(mirror.sourceBook, old.sourceBook);
  assert.deepEqual((await db.doc('accessSetsV2/marian/prayers/new-mixed').get()).data(), {});
  assert.equal((await db.doc('priestProtectedPrayers/new-mixed').get()).exists, false);
  assert.equal((await db.doc('priestProtectedPrayers/new-marian').get()).exists, false);
  assert.equal((await db.doc('prayers/new-marian').get()).exists, false);
  assert.ok((await clientRead(legacyReader, mirrorPath)).exists());
  await assert.rejects(clientRead(legacyReader, 'protectedPrayers/new-marian'), { code: 'permission-denied' });
  await assert.rejects(clientRead(v2Reader, mirrorPath), { code: 'permission-denied' });

  let lists = 0;
  let indexReads = 0;
  let canonicalGets = 0;
  let activeGets = 0;
  let peak = 0;
  const gateway = {
    async listIds(...args) {
      const page = await v2Reader.gateway.listIds(...args);
      lists++;
      indexReads += Math.max(1, page.ids.length);
      return page;
    },
    async readContent(...args) {
      canonicalGets++;
      activeGets++;
      peak = Math.max(peak, activeGets);
      try { return await v2Reader.gateway.readContent(...args); }
      finally { activeGets--; }
    },
  };
  const session = createAccessSetsCatalogSession({ pageSize: 2, confirm: async () => ({
    mode: 'canonical', uid: v2Reader.uid, allowedSets: ['priest', 'marian'], gateway,
  }) });
  const catalog = (await session.catalog()).content;
  assert.deepEqual(catalog.prayers.map((row) => row.id).sort(), ['new-marian', 'new-mixed', 'old']);
  assert.equal((await session.readPrayer('new-mixed', { prayers: [], categories: [] })).id, 'new-mixed');
  assert.deepEqual({ lists, indexReads, canonicalGets, peak }, { lists: 6, indexReads: 8, canonicalGets: 3, peak: 2 });
  t.diagnostic(`S4 synthetic server reads: ${lists} index queries, ${indexReads} index reads including empty queries, ${canonicalGets} distinct canonical gets, peak ${peak}`);

  await writer.restore(manager.uid, preimage);
  assert.equal((await db.doc(pathControl).get()).data().version, 3n);
  assert.equal((await db.doc(mirrorPath).get()).data().text, old.text);
  assert.equal((await db.doc('protectedPrayers/new-mixed').get()).exists, false);
  assert.equal((await db.doc('accessSetsV2/marian/prayers/new-mixed').get()).exists, false);

  const mirrorEdits = Array.from({ length: 133 }, (_, i) => ({
    kind: 'prayers', action: 'create', id: 'batch-' + i,
    patch: { title: 'Synthetic limit test', text: 'Synthetic', accessSets: ['priest'] },
  }));
  await assert.rejects(preview(mirrorEdits), { code: 'content-transaction-too-large' });
  const maxEdits = [...mirrorEdits.slice(0, 132), {
    kind: 'prayers', action: 'create', id: 'batch-marian',
    patch: { title: 'Synthetic limit test', text: 'Synthetic', accessSets: ['marian'] },
  }];
  const maxReview = await preview(maxEdits);
  assert.equal(maxReview.writes + maxReview.extraWrites, 400);
  await call(saveRequest(maxEdits, maxReview));
  assert.deepEqual(await call({ action: 'verify', expectedVersion: 4, afterDigest: maxReview.afterDigest }), { version: 4, parity: 'verified' });

  await mode('suspended');
  await assert.rejects(preview(edits), { code: 'canonical-writer-locked' });
  await assert.rejects(legacySet('prayers/legacy-edit', 5), { code: 'permission-denied' });
  await assert.rejects(clientRead(v2Reader, canonicalPath), { code: 'permission-denied' });
  assert.ok((await clientRead(legacyReader, mirrorPath)).exists());
  await mode('legacy');
  await legacySet('prayers/legacy-edit', 5);

  await mode('canonical');
  const comment = { title: 'Synthetic comment', content: '**Text**\n\n:::rubric\nDirection\n:::', sourceId: 'ojcha-nash-2022' };
  const categoryId = 'comment-leaf';
  const publicCategory = db.doc('prayerCategories/' + categoryId);
  const privateCategory = db.doc('protectedCategories/' + categoryId);
  const mirrorCategory = db.doc('priestProtectedCategories/' + categoryId);
  const editCategory = async (patch, action = 'update') => {
    const change = [{ kind: 'categories', action, id: categoryId, patch }];
    const version = await preview(change);
    await call(saveRequest(change, version));
    return version;
  };
  await editCategory({ name: 'Synthetic comment-only category', tags: [], prayerIds: [], comment }, 'create');
  assert.deepEqual((await publicCategory.get()).data().comment, comment);
  await editCategory({ order: 7 });
  assert.deepEqual((await publicCategory.get()).data().comment, comment, 'an unrelated patch preserves comment');
  await assert.rejects(editCategory({ comment: { ...comment, editorNote: 'synthetic' } }), { code: 'invalid-content-patch' });

  const move = await editCategory({ accessSets: ['priest'] });
  const [priest, legacy, publicAfter, index, audit] = await db.getAll(privateCategory, mirrorCategory, publicCategory,
    db.doc(`accessSetsV2/priest/categories/${categoryId}`),
    db.doc(`priestContentControl/accessSetsV2/catalogAudit/${move.version + 1}`));
  assert.equal(publicAfter.exists, false);
  assert.deepEqual(priest.data().comment, comment);
  assert.deepEqual(legacy.data().comment, comment);
  assert.equal(priest.data().contentHash, catalogContentHash(legacy.data()));
  assert.deepEqual(index.data(), {});
  for (const sibling of [legacy, index, audit]) assert.ok(priest.updateTime.isEqual(sibling.updateTime));

  await editCategory({ accessSets: ['marian', 'priest'] });
  assert.equal((await mirrorCategory.get()).exists, false);
  assert.deepEqual((await privateCategory.get()).data().comment, comment);
  await editCategory({ accessSets: ['marian'] });
  assert.deepEqual((await privateCategory.get()).data().effectiveAccessSets, ['marian']);
  assert.equal((await mirrorCategory.get()).exists, false);
  assert.equal((await publicCategory.get()).exists, false);
  await editCategory({ comment: null });
  assert.equal(Object.hasOwn((await privateCategory.get()).data(), 'comment'), false);
  assert.deepEqual((await privateCategory.get()).data().effectiveAccessSets, ['marian']);
  await editCategory({ accessSets: [], comment: { content: ' ' } });
  assert.equal((await privateCategory.get()).exists, false);
  assert.equal(Object.hasOwn((await publicCategory.get()).data(), 'comment'), false);
  assert.equal((await publicCategory.get()).data().order, 7n);
});
