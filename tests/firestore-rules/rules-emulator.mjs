// Firestore rules check against the local emulator (needs Java 21):
//   npm run test:rules
// Seeds through the emulator owner token, then reads and writes as an
// anonymous visitor, a signed-in user and both kinds of administrator.

import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// `firebase emulators:exec` exports the emulator address.
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8089').split(':');
const P = 'demo-rules';
const base = `http://${HOST}:${PORT}/v1/projects/${P}/databases/(default)/documents`;
// Seed bypassing rules.
async function seed(path, fields) {
  const r = await fetch(`${base}/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(await r.text());
}
await seed('days/x', { a: { stringValue: '1' } });
await seed('admins/dbadmin', { email: { stringValue: 'a@b' } });
await seed('liturgicalTemplates/t', { a: { stringValue: '1' } });
await seed('prayers/hidden', { priestOnly: { booleanValue: true }, text: { stringValue: 'secret' } });
await seed('prayerCategories/hidden', { priestOnly: { booleanValue: true } });
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
const cases = [
  ['anon cannot read hidden prayer directly', () => getDoc(doc(anon.db, 'prayers/hidden')), false],
  ['anon cannot list prayers directly', () => getDocs(collection(anon.db, 'prayers')), false],
  ['user cannot list categories directly', () => getDocs(collection(user.db, 'prayerCategories')), false],
  ['admin can edit/read hidden prayers', () => getDoc(doc(dbAdmin.db, 'prayers/hidden')), true],
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
];
let failed = 0;
for (const [name, fn, allowed] of cases) {
  let ok;
  try { await fn(); ok = true; } catch (e) { ok = false; if (e.code !== 'permission-denied') console.log('  error', e.code, e.message); }
  const pass = ok === allowed; if (!pass) failed++;
  console.log(pass ? 'PASS' : 'FAIL', name, allowed ? '(allow)' : '(deny)');
}
for (const c of [anon, user, staticAdmin, dbAdmin]) await deleteApp(c.app);
process.exit(failed ? 1 : 0);
