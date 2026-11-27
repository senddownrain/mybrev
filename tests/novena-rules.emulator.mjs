// Firestore rules of the novena collections against the local emulator only:
//   npm run test:novena:rules
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, setLogLevel,
} from 'firebase/firestore';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
assert.ok(['127.0.0.1', 'localhost'].includes(HOST), 'Local Firestore Emulator required; live tests forbidden');
const PROJECT = 'demo-novena';
const base = `http://${HOST}:${PORT}/v1/projects/${PROJECT}/databases/(default)/documents`;
setLogLevel('silent');

const apps = [];
function client(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'x' }, `novena-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
  return db;
}
async function seed(path, fields) {
  const response = await fetch(`${base}/${path}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  assert.ok(response.ok, 'seed failed');
}

const definition = (extra = {}) => ({
  schemaVersion: 1, novenaId: 'n1', sourcePrayerId: 'n1', title: 'Навэнна', contentVersion: 1, durationDays: 1,
  status: 'published', trackerEnabled: true, template: [{ type: 'prayer', prayerId: 'n1' }], days: [{ number: 1, blocks: [] }],
  schedule: { enabled: true, extraDates: [], type: 'manual' }, ...extra,
});
const draft = (extra = {}) => definition({ status: 'draft', blockers: [], updatedAt: serverTimestamp(), updatedBy: 'editor', ...extra });
const denied = (promise) => assert.rejects(promise, { code: 'permission-denied' });
let anon;
let user;
let admin;

before(async () => {
  await seed('admins/editor', { role: { stringValue: 'admin' } });
  await seed('prayers/n1', { title: { stringValue: 'Навэнна' } });
  [anon, user, admin] = [client(), client('someone'), client('editor')];
});
after(() => Promise.all(apps.map((app) => deleteApp(app))));

test('only an administrator writes a published definition; everyone reads it', async () => {
  await denied(setDoc(doc(anon, 'novenaDefinitions/n1'), definition()));
  await denied(setDoc(doc(user, 'novenaDefinitions/n1'), definition()));
  await denied(setDoc(doc(admin, 'novenaDefinitions/n1'), definition({ status: 'draft' })));
  await denied(setDoc(doc(admin, 'novenaDefinitions/n1'), definition({ blockers: [] })));
  await denied(setDoc(doc(admin, 'novenaDefinitions/n2'), definition({ novenaId: 'n2', sourcePrayerId: 'n2' })));
  await denied(setDoc(doc(admin, 'novenaDefinitions/n1'), definition({ durationDays: 9 })));
  await setDoc(doc(admin, 'novenaDefinitions/n1'), definition());
  assert.equal((await getDoc(doc(anon, 'novenaDefinitions/n1'))).data().title, 'Навэнна');
  assert.equal((await getDocs(collection(anon, 'novenaDefinitions'))).size, 1);
  await denied(setDoc(doc(admin, 'novenaDefinitions/n1'), definition({ title: 'Без новай версіі' })));
  await setDoc(doc(admin, 'novenaDefinitions/n1'), definition({ title: 'Новая', contentVersion: 2 }));
  await denied(deleteDoc(doc(user, 'novenaDefinitions/n1')));
  await deleteDoc(doc(admin, 'novenaDefinitions/n1'));
});

test('drafts are closed to everyone but administrators and cannot be deleted', async () => {
  await denied(setDoc(doc(user, 'novenaDrafts/n1'), draft({ updatedBy: 'someone' })));
  await denied(setDoc(doc(admin, 'novenaDrafts/n1'), draft({ status: 'published' })));
  await denied(setDoc(doc(admin, 'novenaDrafts/n1'), draft({ extra: true })));
  await setDoc(doc(admin, 'novenaDrafts/n1'), draft());
  assert.equal((await getDocs(collection(admin, 'novenaDrafts'))).size, 1);
  await denied(getDoc(doc(anon, 'novenaDrafts/n1')));
  await denied(getDocs(collection(user, 'novenaDrafts')));
  await denied(deleteDoc(doc(admin, 'novenaDrafts/n1')));
});

test('no nested documents are exposed below the novena collections', async () => {
  await seed('novenaDefinitions/n1/private/x', { a: { stringValue: '1' } });
  await denied(getDoc(doc(anon, 'novenaDefinitions/n1/private/x')));
});
