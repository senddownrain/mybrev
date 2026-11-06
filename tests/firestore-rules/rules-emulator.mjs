// Firestore rules check against the local emulator (needs Java 21):
//   npm run test:rules
// Seeds through the emulator owner token, then reads and writes as an
// anonymous visitor, a signed-in user and both kinds of administrator.

import { initializeApp, deleteApp } from 'firebase/app';
import assert from 'node:assert/strict';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// `firebase emulators:exec` exports the emulator address.
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8089').split(':');
assert.ok(['127.0.0.1', 'localhost'].includes(HOST), 'Local Firestore Emulator required; live tests forbidden');
const P = 'demo-rules';
const base = `http://${HOST}:${PORT}/v1/projects/${P}/databases/(default)/documents`;
// Seed bypassing rules.
async function seed(path, fields) {
  const r = await fetch(`${base}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(await r.text());
}
await seed('admins/plainadmin', { email: { stringValue: 'p@b' }, role: { stringValue: 'admin' } });
await seed('admins/priestadmin', { role: { stringValue: 'admin' }, priestAccess: { booleanValue: true } });
await seed('admins/superadmin', { role: { stringValue: 'superadmin' } });
await seed('admins/weirdrole', { role: { stringValue: 'superAdmin' }, priestAccess: { booleanValue: true } });
await seed('admins/7mszX2IiXHgjWxj0ZE5vEqdkmoD2', { role: { stringValue: 'superadmin' } });
await seed('days/x', { a: { stringValue: '1' } });
await seed('admins/dbadmin', { email: { stringValue: 'a@b' } });
await seed('liturgicalTemplates/t', { a: { stringValue: '1' } });
await seed('priestProtectedPrayers/hidden', { priestOnly: { booleanValue: true }, text: { stringValue: 'secret' } });
await seed('priestProtectedCategories/hidden', { priestOnly: { booleanValue: true } });
await seed('priestAccess/settings', { codeHash: { stringValue: 'private' } });
await seed('priestDeviceGrants/device', { secretHash: { stringValue: 'private' } });
let n = 0;
function client(uid) {
  const app = initializeApp({ projectId: P, apiKey: 'x' }, `c${n++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
  return { app, db };
}
const anon = client(null), user = client('someone'), staticAdmin = client('64MeSP56IWVotVFG7bu8YKeLis12'), dbAdmin = client('dbadmin');
const plainAdmin = client('plainadmin'), priestAdmin = client('priestadmin'), superAdmin = client('superadmin'), weird = client('weirdrole');
const legacySuper = client('7mszX2IiXHgjWxj0ZE5vEqdkmoD2');
const grants = (c) => () => getDocs(collection(c.db, 'priestDeviceGrants'));
const cases = [
  ['anon cannot read hidden prayer directly', () => getDoc(doc(anon.db, 'priestProtectedPrayers/hidden')), false],
  ['legacy anonymous public prayer query', () => getDocs(collection(anon.db, 'prayers')), true],
  ['legacy public category query', () => getDocs(collection(user.db, 'prayerCategories')), true],
  ['admin can edit/read hidden prayers', () => getDoc(doc(dbAdmin.db, 'priestProtectedPrayers/hidden')), true],
  ['anon cannot read activation hash', () => getDoc(doc(anon.db, 'priestAccess/settings')), false],
  ['admin cannot read credential hashes via client', () => getDoc(doc(dbAdmin.db, 'priestDeviceGrants/device')), false],
  ['admin cannot bypass grant API writes', () => setDoc(doc(dbAdmin.db, 'priestDeviceGrants/device'), { status: 'active' }), false],
  ['anon cannot list installations', () => getDocs(collection(anon.db, 'priestInstallations')), false],
  ['anon reads days', () => getDoc(doc(anon.db, 'days/x')), true],
  ['anon lists templates', () => getDocs(collection(anon.db, 'liturgicalTemplates')), true],
  ['anon writes days', () => setDoc(doc(anon.db, 'days/x'), { a: 2 }), false],
  ['anon creates prayer', () => setDoc(doc(anon.db, 'prayers/p'), { a: 2 }), false],
  ['user writes prayer', () => setDoc(doc(user.db, 'prayers/p'), { a: 2 }), false],
  ['static admin writes days', () => setDoc(doc(staticAdmin.db, 'days/x'), { a: 3 }, { merge: true }), true],
  ['db admin creates song', () => setDoc(doc(dbAdmin.db, 'songs/s'), { a: 1 }), true],
  ['db admin deletes song', () => deleteDoc(doc(dbAdmin.db, 'songs/s')), true],
  ['anon reads admins', () => getDoc(doc(anon.db, 'admins/dbadmin')), false],
  ['user reads other admin entry', () => getDoc(doc(user.db, 'admins/dbadmin')), false],
  ['non-admin reads own (missing) entry', () => getDoc(doc(user.db, 'admins/someone')), true],
  ['admin reads own entry', () => getDoc(doc(dbAdmin.db, 'admins/dbadmin')), true],
  ['anon lists admins', () => getDocs(collection(anon.db, 'admins')), false],
  ['admin writes admins', () => setDoc(doc(staticAdmin.db, 'admins/new'), { a: 1 }), false],
  // Roles: no client may create, promote, change or delete admins/{uid}.
  ['legacy admin doc (no role) still edits content', () => setDoc(doc(dbAdmin.db, 'days/x'), { a: 4 }, { merge: true }), true],
  ['role admin edits content', () => setDoc(doc(plainAdmin.db, 'days/x'), { a: 5 }, { merge: true }), true],
  ['role superadmin edits content', () => setDoc(doc(superAdmin.db, 'days/x'), { a: 6 }, { merge: true }), true],
  ['unknown role gets no content write', () => setDoc(doc(weird.db, 'days/x'), { a: 7 }, { merge: true }), false],
  ['unknown role gets no priest access', grants(weird), false],
  ['admin without priestAccess cannot list grants', grants(plainAdmin), false],
  ['legacy admin doc without priestAccess cannot list grants', grants(dbAdmin), false],
  ['admin with priestAccess lists grants', grants(priestAdmin), true],
  ['superadmin lists grants', grants(superAdmin), true],
  ['legacy uid lists grants', grants(staticAdmin), true],
  ['legacy uid with superadmin doc lists grants', grants(legacySuper), true],
  ['admin cannot self-promote', () => setDoc(doc(plainAdmin.db, 'admins/plainadmin'), { role: 'superadmin' }, { merge: true }), false],
  ['legacy admin doc cannot self-promote', () => setDoc(doc(dbAdmin.db, 'admins/dbadmin'), { role: 'superadmin' }, { merge: true }), false],
  ['superadmin cannot create admin', () => setDoc(doc(superAdmin.db, 'admins/newone'), { role: 'admin' }), false],
  ['superadmin cannot update own role', () => setDoc(doc(superAdmin.db, 'admins/superadmin'), { role: 'admin' }, { merge: true }), false],
  ['superadmin cannot delete admin', () => deleteDoc(doc(superAdmin.db, 'admins/plainadmin')), false],
  ['legacy uid with superadmin doc cannot write admins', () => setDoc(doc(legacySuper.db, 'admins/legacy2'), { role: 'superadmin' }), false],
  ['legacy uid cannot delete admins', () => deleteDoc(doc(staticAdmin.db, 'admins/plainadmin')), false],
  ['non-admin cannot create own admin doc', () => setDoc(doc(user.db, 'admins/someone'), { role: 'superadmin' }), false],
  ['admin cannot read other admin entry', () => getDoc(doc(plainAdmin.db, 'admins/superadmin')), false],
  ['superadmin reads own role', () => getDoc(doc(superAdmin.db, 'admins/superadmin')), true],
  ['catch-all subpath cannot write admins', () => setDoc(doc(superAdmin.db, 'admins/superadmin/extra/x'), { a: 1 }), false],
];
let failed = 0;
for (const [name, fn, allowed] of cases) {
  let ok;
  try { await fn(); ok = true; } catch (e) { ok = false; if (e.code !== 'permission-denied') console.log('  error', e.code, e.message); }
  const pass = ok === allowed; if (!pass) failed++;
  console.log(pass ? 'PASS' : 'FAIL', name, allowed ? '(allow)' : '(deny)');
}
for (const c of [anon, user, staticAdmin, dbAdmin, plainAdmin, priestAdmin, superAdmin, weird, legacySuper]) await deleteApp(c.app);
process.exit(failed ? 1 : 0);
