import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { catalogContentHash } from '../scripts/lib/access-sets-v2-content-values.mjs';

const mode = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = 'demo-s4-catalog';
const loopback = /^(127\.0\.0\.1|localhost):\d+$/;
const staged = '../reports/access-sets-v2-s4/callable-source/functions-catalog/index.mjs';

test('catalog callable boundary and real Auth/Firestore transactions', { skip: !mode || !authHost }, async (t) => {
  assert.match(mode, loopback);
  assert.match(authHost, loopback);
  process.env.GCLOUD_PROJECT = projectId;
  const { canonicalCatalog } = await import(staged);

  const runtime = canonicalCatalog.__endpoint;
  assert.equal(runtime.minInstances, 0);
  assert.equal(runtime.maxInstances, 2);
  assert.equal(runtime.concurrency, 1);
  assert.equal(runtime.serviceAccountEmail, 'mybrev-catalog-writer@ibreviaryby.iam.gserviceaccount.com');

  const app = initializeAdmin({ projectId }, 'catalog-callable-test-admin');
  const db = getFirestore(app);
  const auth = adminAuth(app);
  const clientApps = [];
  t.after(async () => {
    await Promise.all(clientApps.map((client) => deleteApp(client)));
    await db.terminate();
    await deleteAdmin(app);
  });

  async function signIn(role, anonymous = false) {
    const name = 'callable-' + clientApps.length;
    const client = initializeApp({ projectId, apiKey: 'demo-key' }, name);
    clientApps.push(client);
    const clientAuth = getAuth(client);
    connectAuthEmulator(clientAuth, 'http://' + authHost, { disableWarnings: true });
    const email = name + '@example.test';
    const password = 'Synthetic-password-only';
    if (!anonymous) await auth.createUser({ email, password });
    const { user } = anonymous ? await signInAnonymously(clientAuth) : await signInWithEmailAndPassword(clientAuth, email, password);
    if (role) await db.doc('admins/' + user.uid).set(role);
    const token = await user.getIdToken();
    return { uid: user.uid, token, claims: await auth.verifyIdToken(token) };
  }
  const [editor, ordinary, anon] = await Promise.all([
    // Each client app name is allocated synchronously before the first await.
    signIn({ role: 'admin', accessSetsV2: true }),
    signIn({ role: 'admin' }),
    signIn({ role: 'superadmin' }, true),
  ]);

  const body = { title: 'Synthetic approved catalog row', text: 'Synthetic original' };
  const batch = db.batch();
  for (const [path, payload] of [
    ['accessSetsV2/marian', { status: 'active' }],
    ['priestContentControl/accessSetsV2', { mode: 'legacy' }],
    ['priestContentControl/state', { version: 0, lockUid: '' }],
    ['protectedPrayers/fixture', { ...body, accessSchemaVersion: 2, accessSets: ['marian'],
      effectiveAccessSets: ['marian'], contentHash: catalogContentHash(body) }],
    ['accessSetsV2/marian/prayers/fixture', {}],
  ]) batch.set(db.doc(path), payload);
  await batch.commit();

  const config = JSON.parse(readFileSync(new URL('../firebase.s4-catalog.json', import.meta.url), 'utf8'));
  const callableUrl = `http://127.0.0.1:${config.emulators.functions.port}/${projectId}/europe-west1/canonicalCatalog`;
  // The Functions Emulator decodes the subject into request.app.appId. A
  // production callable verifies App Check's signature and token claims.
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const attestation = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'synthetic-app' })}.local-only`;
  async function invoke(actor, data, appCheck = attestation) {
    const response = await fetch(callableUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(actor && { authorization: 'Bearer ' + actor.token }),
        ...(appCheck && { 'X-Firebase-AppCheck': appCheck }),
      },
      body: JSON.stringify({ data }),
    });
    const reply = await response.json();
    if (response.ok) return reply.result;
    const code = reply.error.status.toLowerCase().replaceAll('_', '-');
    throw Object.assign(new Error(reply.error.message), { code, status: response.status });
  }
  const edits = [{ kind: 'prayers', action: 'update', id: 'fixture', patch: { text: 'Synthetic edited' } }];
  const previewRequest = { action: 'preview', edits };
  await assert.rejects(invoke(undefined, previewRequest), { code: 'unauthenticated', message: 'editor-auth-required' });
  await assert.rejects(invoke(editor, previewRequest, null), { code: 'unauthenticated', status: 401 });
  await assert.rejects(invoke(editor, previewRequest, 'synthetic-invalid-attestation'), { code: 'unauthenticated', status: 401 });
  await assert.rejects(invoke(anon, previewRequest), { code: 'unauthenticated', message: 'editor-auth-required' });
  await assert.rejects(invoke(ordinary, previewRequest), { code: 'permission-denied' });
  await assert.rejects(invoke(editor, { action: 'restore' }), { code: 'invalid-argument' });
  await assert.rejects(invoke(editor, previewRequest), { code: 'failed-precondition', message: 'canonical-writer-locked' });

  await db.doc('priestContentControl/accessSetsV2').update({ mode: 'canonical' });
  const preview = await invoke(editor, previewRequest);
  assert.equal(preview.writes, 1);
  assert.equal(preview.committedVersion, null);
  assert.equal((await db.doc('protectedPrayers/fixture').get()).data().text, body.text);
  const save = { action: 'save', edits, expectedVersion: preview.version, planDigest: preview.planDigest };
  const receipt = await invoke(editor, save);
  assert.equal(receipt.committedVersion, 1);
  assert.deepEqual(await invoke(editor, { action: 'verify', expectedVersion: 1, afterDigest: preview.afterDigest }),
    { version: 1, parity: 'verified' });
  await assert.rejects(invoke(editor, save), { code: 'aborted', message: 'content-snapshot-drift' });
  const raw = (await db.doc('protectedPrayers/fixture').get()).data();
  assert.equal(raw.text, edits[0].patch.text);
  assert.equal(raw.contentHash, catalogContentHash(raw));
  assert.equal((await db.doc('priestProtectedPrayers/fixture').get()).exists, false);

  await auth.updateUser(editor.uid, { disabled: true });
  await assert.rejects(invoke(editor, previewRequest), { code: 'unauthenticated', message: 'editor-session-invalid' });
  await auth.updateUser(editor.uid, { disabled: false });
  const revoked = await signIn({ role: 'admin', accessSetsV2: true });
  // Auth compares whole seconds. Revoke at a later second than auth_time.
  const waitMs = (revoked.claims.auth_time + 1) * 1000 - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs + 25));
  await auth.revokeRefreshTokens(revoked.uid);
  await assert.rejects(invoke(revoked, previewRequest), { code: 'unauthenticated', message: 'editor-session-invalid' });
  await db.doc('admins/' + editor.uid).delete();
  await assert.rejects(invoke(editor, previewRequest), { code: 'permission-denied' });
});
