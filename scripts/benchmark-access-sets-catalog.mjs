import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { initializeApp as initAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as serverFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite';
import { createAccessSetsV2Gateway } from '../src/services/accessSetsV2Gateway.mjs';
import { ACCESS_CATALOG_PAGE_SIZE, createAccessSetsCatalogSession } from '../src/services/accessSetsCatalogSession.mjs';
import { catalogContentHash } from './lib/access-sets-v2-content-values.mjs';

const projectId = 'demo-s4-catalog';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const loopback = /^(127\.0\.0\.1|localhost):\d+$/;
assert.match(firestoreHost || '', loopback);
assert.match(authHost || '', loopback);
assert.equal(process.env.GCLOUD_PROJECT, projectId);

const adminApp = initAdmin({ projectId }, 's4-read-benchmark-admin');
const db = serverFirestore(adminApp);
const apps = [];
const registry = ['marian', 'priest', 'retreat', 'study'];
const codeId = 'ABCDEFGHJKLMNPQR';
const onlyPriest = ['priest'];
const empty = { prayers: [], categories: [] };
const scenarios = [
  { name: 'legacy-priest', sets: onlyPriest, groups: [[onlyPriest, 21, 1]], legacy: true, expected: 114 },
  { name: 'marian', sets: ['marian'], groups: [[['marian'], 56, 11]], expected: 485 },
  { name: 'two-sets', sets: ['marian', 'priest'],
    groups: [[onlyPriest, 60, 9], [['marian'], 60, 9], [['marian', 'priest'], 40, 6]], expected: 1505 },
  { name: 'four-sets', sets: registry,
    groups: [...registry.map((set) => [[set], 50, 8]), [registry, 200, 28]], expected: 4415 },
];

async function actor(name) {
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://' + authHost, { disableWarnings: true });
  const { user } = await signInAnonymously(auth);
  const client = getFirestore(app);
  const [host, port] = firestoreHost.split(':');
  connectFirestoreEmulator(client, host, Number(port));
  return { uid: user.uid, gateway: createAccessSetsV2Gateway(client) };
}

async function writeRows(rows, remove = false) {
  for (let offset = 0; offset < rows.length; offset += 325) {
    const batch = db.batch();
    for (const [path, data] of rows.slice(offset, offset + 325)) {
      if (remove) batch.delete(db.doc(path));
      else batch.set(db.doc(path), data);
    }
    await batch.commit();
  }
}

function fixture(groups) {
  const rows = [];
  const memberships = new Map();
  for (const [group, [sets, prayers, categories]] of groups.entries()) {
    function add(kind, collection, id, payload) {
      rows.push([`${collection}/${id}`, { ...payload, accessSchemaVersion: 2, accessSets: sets,
        effectiveAccessSets: sets, contentHash: catalogContentHash(payload) }]);
      memberships.set(`${kind}/${id}`, sets);
      for (const set of sets) rows.push([`accessSetsV2/${set}/${kind}/${id}`, {}]);
    }
    for (let i = 0; i < categories; i++) {
      add('categories', 'protectedCategories', `g${group}-c${i}`, { name: 'Synthetic category ' + i });
    }
    for (let i = 0; i < prayers; i++) {
      add('prayers', 'protectedPrayers', `g${group}-p${i}`, { title: 'Synthetic prayer ' + i, text: 'Synthetic. '.repeat(100),
        categoryId: `g${group}-c${i % categories}` });
    }
  }
  return { rows, memberships };
}

function measureSession(reader, scenario, memberships) {
  let counts;
  let active = 0;
  const gateway = {
    async listIds(kind, set, page) {
      counts.pages++;
      counts.rulesEstimate += scenario.legacy ? 2 : set === 'priest' ? 5 : 4;
      const result = await reader.gateway.listIds(kind, set, page);
      counts.indexReads += Math.max(1, result.ids.length);
      return result;
    },
    async readContent(kind, id) {
      counts.gets++;
      counts.rulesEstimate += scenario.legacy ? 3 : memberships.get(`${kind}/${id}`).includes('priest') ? 6 : 5;
      active++;
      counts.peak = Math.max(counts.peak, active);
      try { return await reader.gateway.readContent(kind, id); }
      finally { active--; }
    },
  };
  const session = createAccessSetsCatalogSession({
    async confirm() {
      counts.confirmations++;
      const mode = await reader.gateway.readMode();
      const allowedSets = scenario.legacy ? onlyPriest : (await reader.gateway.readEntitlements(reader.uid)).allowedSets;
      return { mode, uid: reader.uid, allowedSets, gateway };
    },
  });
  return { session, async measure(read) {
    counts = { pages: 0, indexReads: 0, gets: 0, rulesEstimate: 0, peak: 0, confirmations: 0 };
    const start = performance.now();
    await read(session);
    return { ...counts, estimate: counts.indexReads + counts.gets + counts.rulesEstimate, ms: Math.round(performance.now() - start) };
  } };
}

try {
  const [legacy, v2] = await Promise.all([actor('benchmark-legacy'), actor('benchmark-v2')]);
  await writeRows([
    ...registry.map((set) => [`accessSetsV2/${set}`, { status: 'active' }]),
    ['priestContentControl/accessSetsV2', { mode: 'canonical' }],
    [`priestDeviceGrants/${legacy.uid}`, { uid: legacy.uid, status: 'active' }],
    [`accessDeviceGrantsV2/${v2.uid}`, { uid: v2.uid, status: 'active', codeId }],
    [`accessCodesV2/${codeId}`, { profileId: 'benchmark' }],
    [`accessCodesV2/${codeId}/client/profile`, { profileId: 'benchmark' }],
  ]);
  for (const scenario of scenarios) {
    const { rows, memberships } = fixture(scenario.groups);
    await writeRows([
      ...rows,
      ['accessProfilesV2/benchmark', { status: 'active', allowedSets: scenario.sets, revision: 1 }],
      ['accessProfilesV2/benchmark/client/entitlements', { allowedSets: scenario.sets, revision: 1 }],
    ]);
    const { session, measure } = measureSession(scenario.legacy ? legacy : v2, scenario, memberships);
    const direct = await measure(async (s) => assert.equal((await s.readPrayer('g0-p0', empty)).id, 'g0-p0'));
    assert.equal(direct.pages, 0);
    assert.equal(direct.gets, 2);
    session.invalidate();

    const full = await measure(async (s) => {
      const { content } = await s.catalog();
      assert.equal(content.prayers.length + content.categories.length, memberships.size);
    });
    assert.equal(full.gets, memberships.size);
    assert.equal(full.estimate, scenario.expected);
    assert.ok(full.peak <= 4);

    const warm = await measure(async (s) => {
      assert.ok(await s.catalog());
      assert.ok(await s.readPrayer('g0-p0', empty));
    });
    assert.equal(warm.estimate, 0);
    assert.equal(warm.confirmations, 0);
    console.log(JSON.stringify({ name: scenario.name, pageSize: ACCESS_CATALOG_PAGE_SIZE, direct, full, warm }));
    await writeRows(rows, true);
  }
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await db.terminate();
  await deleteAdmin(adminApp);
}
