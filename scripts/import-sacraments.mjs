import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { resolveAdminRole } from '../src/utils/adminAccess.js';
import { createPrayerContentWriter } from '../src/utils/prayerContentWriter.mjs';
import { canonicalPrayerContent, CONTENT_CONTROL, prayerStoragePlan } from '../src/utils/prayerStoragePlan.mjs';
import { createCanonicalCatalogWriter } from './lib/access-sets-v2-writer.mjs';
import { CATALOG_PATHS, CATALOG_ROLLOUT } from './lib/access-sets-v2-storage-plan.mjs';
import { checkCreateOperations, digest, loadSacraments, prepareSacraments, publicInput, publicPath, simulateSacraments } from './lib/sacraments-import-plan.mjs';

const PROJECT = 'ibreviaryby';
const jsonFile = (file) => JSON.parse(readFileSync(file, 'utf8'));
const out = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const sourceSummary = (plan) => plan.importPlan;
const legacyDocuments = (collections) => new Map([...collections].flatMap(([name, rows]) => rows.map(({ id, ...row }) => [name + '/' + id, row])));

function appendCreates(content, edits) {
  for (const { kind, id, patch } of edits) content[kind].push({ ...patch, id });
}

function prepare(bundle, documents, approved) {
  const { edits, summary } = prepareSacraments(bundle, publicInput(documents));
  assert.deepEqual(summary, approved, 'Actual release scope differs from the reviewed plan');
  return { edits, summary, check: (operations) => checkCreateOperations(edits, operations) };
}

function verifyActor(role, uid) {
  assert.ok(resolveAdminRole(uid, role.data()), 'The configured operator needs an existing prayerbook administrator identity');
}

function checkMode(rollout, expected) {
  const mode = rollout.data()?.mode ?? 'legacy';
  assert.equal(mode, expected, 'Catalog rollout changed or is suspended');
  if (expected === 'legacy') assert.notEqual(rollout.data()?.legacyWritesFrozen, true, 'Legacy catalog writes are frozen');
}

function legacyWriter(db) {
  let reads = 0;
  const updateReads = (count) => { reads += count; };
  return {
    writer: createPrayerContentWriter({
      db,
      attempts: 1,
      transact: (_, update) => db.runTransaction(update, { maxAttempts: 1 }),
      fs: {
        doc: (_, path) => db.doc(path),
        collection: (_, name) => db.collection(name),
        getDocFromServer: async (ref) => { updateReads(1); return ref.get(); },
        getDocsFromServer: async (ref) => {
          const batch = await ref.limit(2504 - reads).get();
          updateReads(Math.max(1, batch.size));
          assert.ok(reads <= 2502, 'Legacy catalog scan limit reached');
          return batch;
        },
        serverTimestamp: FieldValue.serverTimestamp,
      },
    }),
    get reads() { return reads; },
  };
}

function legacySummary(prepared, operations, version) {
  const writeSet = operations.map(({ collection, id, data }) => ({ path: collection + '/' + id, before: null, after: data }));
  prepared.check(writeSet);
  return {
    version, planDigest: digest({ version, writeSet }), writes: writeSet.length,
    creates: writeSet.length, deletes: 0, extraWrites: Number(Boolean(writeSet.length)), importPlan: prepared.summary,
  };
}

async function runLegacy(db, uid, bundle, approved, preview) {
  const legacy = legacyWriter(db);
  if (!preview) {
    const { collections, version } = await legacy.writer.readState();
    const prepared = prepare(bundle, legacyDocuments(collections), approved);
    const content = canonicalPrayerContent(collections);
    appendCreates(content, prepared.edits);
    const summary = legacySummary(prepared, prayerStoragePlan(collections, content).operations, version);
    // Still-migrating V2 copies also reserve these IDs in legacy mode.
    const paths = prepared.edits.map(({ kind, id }) => CATALOG_PATHS[kind][2] + '/' + id);
    if (paths.length) {
      const docs = await db.getAll(...paths.map((path) => db.doc(path)));
      assert.ok(docs.every((doc) => !doc.exists), 'Reserved IDs found in the canonical copies');
    }
    return { ...summary, committedVersion: null, reads: legacy.reads + paths.length };
  }
  let prepared;
  let result;
  let extraReads = 0;
  const targetDocs = (kind, id) => [publicPath(kind, id), CATALOG_PATHS[kind][2] + '/' + id];
  await legacy.writer.mutate((content, { collections }) => {
    prepared = prepare(bundle, legacyDocuments(collections), approved);
    appendCreates(content, prepared.edits);
  }, {
    checkPlan(operations, version) {
      result = legacySummary(prepared, operations, version);
      assert.equal(version, preview.version, 'Catalog revision changed');
      assert.equal(result.planDigest, preview.planDigest, 'Legacy writer plan changed');
    },
    async read(transaction) {
      const paths = prepared.edits.flatMap(({ kind, id }) => targetDocs(kind, id));
      extraReads = 3 + paths.length; // role, rollout, control and point preconditions
      const [role, rollout, ...targets] = await transaction.getAll(
        db.doc('admins/' + uid), db.doc(CATALOG_ROLLOUT), ...paths.map((path) => db.doc(path)));
      verifyActor(role, uid);
      checkMode(rollout, 'legacy');
      assert.ok(targets.every((doc) => !doc.exists), 'A reserved ID appeared before commit');
    },
  });
  return { ...result, committedVersion: result.version + Number(Boolean(result.writes)), reads: legacy.reads + extraReads };
}

async function readback(db, bundle, receipt) {
  const approved = sourceSummary(receipt);
  const refs = [...approved.placements.map(({ id }) => db.doc('prayers/' + id)),
    ...approved.categories.map(({ id }) => db.doc('prayerCategories/' + id))];
  const [control, rollout, ...docs] = await db.getAll(db.doc(CONTENT_CONTROL), db.doc(CATALOG_ROLLOUT), ...refs);
  checkMode(rollout, receipt.mode);
  assert.equal(Number(control.data()?.version ?? 0), receipt.committedVersion, 'Catalog revision changed before target readback');
  const input = publicInput(new Map(docs.filter((doc) => doc.exists).map((doc) => [doc.ref.path, doc.data()])));
  assert.equal(input.prayers.length, 24);
  assert.equal(input.categories.length, 8);
  const current = prepareSacraments(bundle, input);
  assert.equal(current.edits.length, 0);
  assert.deepEqual(current.summary.placements.map(({ id }) => id), approved.placements.map(({ id }) => id));
  return { verified: true, revision: receipt.committedVersion, reads: refs.length + 2, counts: current.summary.counts };
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['package', 'catalog', 'out', 'service-account', 'uid', 'operator-email', 'local-plan', 'preview', 'receipt', 'artifact'].map(
      (name) => [name, { type: 'string' }],
    )),
  });
  const [action] = positionals;
  assert.ok(positionals.length === 1 && ['local', 'preview', 'apply', 'readback'].includes(action));
  assert.ok(values.package && values.out, 'Pass --package and --out (a new report path)');
  const bundle = loadSacraments(values.package);
  if (action === 'local') {
    const { artifact, prepared } = simulateSacraments(bundle, jsonFile(values.catalog));
    out(values.out, prepared.summary);
    if (values.artifact) out(values.artifact, artifact);
    console.log(JSON.stringify(prepared.summary.counts));
    return;
  }
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST, 'Use the local command outside production');
  assert.ok(values['service-account'], 'Pass the approved operator credential path');
  const key = jsonFile(values['service-account']);
  assert.equal(key.project_id, PROJECT);
  const app = initializeApp({ projectId: PROJECT, credential: cert(key) });
  try {
    const db = getFirestore(app);
    db.settings({ preferRest: true });
    let result;
    if (action === 'readback') {
      result = await readback(db, bundle, jsonFile(values.receipt));
    } else {
      assert.ok(Boolean(values.uid) !== Boolean(values['operator-email']), 'Pass one verified operator identity');
      const uid = values.uid ?? (await getAuth(app).getUserByEmail(values['operator-email'])).uid;
      assert.ok(!uid.includes('/'));
      const approved = jsonFile(values['local-plan']);
      assert.equal(approved.payloadSha256, bundle.digest, 'Package digest differs from the reviewed input');
      const preview = action === 'apply' ? jsonFile(values.preview) : null;
      if (preview) assert.deepEqual(sourceSummary(preview), approved);
      const [rollout, role] = await db.getAll(db.doc(CATALOG_ROLLOUT), db.doc('admins/' + uid));
      verifyActor(role, uid);
      const mode = rollout.data()?.mode ?? 'legacy';
      if (preview) assert.equal(mode, preview.mode);
      if (mode === 'legacy') {
        checkMode(rollout, 'legacy');
        result = await runLegacy(db, uid, bundle, approved, preview);
      } else {
        checkMode(rollout, 'canonical');
        result = await createCanonicalCatalogWriter(db).importBatch(uid,
          preview ? { action: 'save', expectedVersion: preview.version, planDigest: preview.planDigest } : { action: 'preview' },
          ({ documents }) => prepare(bundle, documents, approved));
      }
      result = { ...result, mode, reads: result.reads + 2 };
    }
    out(values.out, result);
    const { importPlan: _targetPlan, ...status } = result;
    console.log(JSON.stringify(status));
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
