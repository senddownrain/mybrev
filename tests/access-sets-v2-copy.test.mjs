import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { copyFirestore, wireJson } from '../scripts/lib/access-sets-v2-copy-firestore.mjs';
import {
  captureCopyState, checksum, JOURNAL, makeCopyBackup, planAccessSetsCopy, RECEIPTS, summarizeAccessSetsCopy,
} from '../scripts/lib/access-sets-v2-copy-plan.mjs';
import { runAccessSetsCopy } from '../scripts/lib/access-sets-v2-copy-run.mjs';
import { catalogContentHash } from '../scripts/lib/access-sets-v2-content-values.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'demo-access-s5';
const control = 'priestContentControl/state';
const rollout = 'priestContentControl/accessSetsV2';
const category = 'priestProtectedCategories/legacy-category';
const prayer = 'priestProtectedPrayers/legacy-prayer';
const targetCategory = 'protectedCategories/legacy-category';
const target = 'protectedPrayers/legacy-prayer';
const index = 'accessSetsV2/priest/prayers/legacy-prayer';
const categoryIndex = 'accessSetsV2/priest/categories/legacy-category';

test('offline CLI and adapter enforce the target boundary', () => {
  assert.throws(() => copyFirestore({ projectId, emulator: 'example.com:8089' }), { code: 'invalid-firestore-target' });
  assert.throws(() => copyFirestore({ projectId: 'example-live', emulator: '127.0.0.1:8089' }), { code: 'invalid-firestore-target' });
  const rejected = spawnSync(process.execPath, ['scripts/migrate-access-sets-v2-copy.mjs',
    'plan', '--snapshot', 'public/synthetic.json'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /^copy-snapshot-must-be-private$/m);
});

test('S5 copy migration on the Firestore emulator', { skip: !host }, async (t) => {
  const store = copyFirestore({ projectId, emulator: host });
  const app = initializeApp({ projectId }, 's5-test');
  const db = getFirestore(app);
  db.settings({ useBigInt: true });
  t.after(() => Promise.all([store.close(), deleteApp(app)]));
  const get = async (path) => (await store.get([path])).docs.get(path);
  const capture = () => captureCopyState(store);
  const reference = (name) => db.doc(store.relative(name));
  const makePlan = (backup) => planAccessSetsCopy(backup, reference);
  const backup = async () => makeCopyBackup(await capture());
  const seedTime = new Timestamp(1_700_000_000, 123_456_000);
  const planFromEmulator = async () => makePlan(await backup());
  const run = (plan, action, options) => runAccessSetsCopy(store, plan, { action, approvedDigest: plan.planDigest, ...options });
  const assertPresent = async (paths) => {
    for (const path of paths) assert.ok(await get(path), path);
  };
  const assertAbsent = async (paths) => {
    for (const path of paths) assert.equal(await get(path), null, path);
  };
  async function seed() {
    const url = 'http://' + host + '/emulator/v1/projects/' + projectId + '/databases/(default)/documents';
    const response = await fetch(url, { method: 'DELETE' });
    assert.ok(response.ok);
    await db.batch()
      .set(db.doc(control), { version: 0, lockUid: '', updatedAt: seedTime })
      .set(db.doc('accessSetsV2/priest'), { name: 'Synthetic set', status: 'active', updatedAt: seedTime })
      .set(db.doc(category), { name: 'Synthetic category', priestOnly: true })
      .set(db.doc(prayer), {
        title: 'Synthetic prayer', text: 'Synthetic text', categoryId: 'legacy-category', effectivePriestOnly: true,
        time: seedTime, location: new GeoPoint(53.9, 27.56), blob: Buffer.from([0, 1, 250]),
        ref: db.doc(category), int64: 9_223_372_036_854_775_807n, vector: FieldValue.vector([1, 2.5]),
        values: [null, false, { nested: ['a', 'b'], nan: NaN, negativeInfinity: -Infinity }],
      })
      .set(db.doc('prayers/public'), { title: 'Synthetic public' })
      .set(db.doc('priestDeviceGrants/synthetic'), { status: 'active' })
      .set(db.doc('priestAccess/settings'), { synthetic: true })
      .set(db.doc('accessActivationClaimsV2/synthetic'), { synthetic: true })
      .commit();
  }

  await t.test('exact wire types, deterministic dry-run, index parity and idempotent apply', async () => {
    await seed();
    const source = await get(prayer);
    await store.commit([store.put(prayer, {
      ...source.fields, integerOne: { integerValue: '1' }, doubleOne: { doubleValue: 1 }, signedZero: { doubleValue: -0 },
    }, source)]);
    const saved = await backup();
    const roundTrip = JSON.parse(wireJson(saved));
    const plan = makePlan(saved);
    assert.deepEqual(summarizeAccessSetsCopy(plan), summarizeAccessSetsCopy(makePlan(roundTrip)));
    assert.equal(plan.operations.length, 2);
    assert.equal(saved.data.collections.protectedPrayers.length, 0);
    assert.equal(saved.data.collections['accessSetsV2/priest/prayers'].length, 0);
    assert.equal(saved.data.controls[rollout], null);
    assert.ok(saved.data.collections.priestProtectedPrayers[0].createTime);
    assert.ok(saved.data.collections.priestProtectedPrayers[0].updateTime);
    assert.doesNotMatch(wireJson(saved), /priestDeviceGrants|accessActivationClaimsV2|priestAccess\/settings/);
    const untouched = [control, rollout, prayer, category, 'prayers/public', 'priestDeviceGrants/synthetic',
      'priestAccess/settings', 'accessActivationClaimsV2/synthetic'];
    const baseline = await Promise.all(untouched.map(get));

    const parent = 'backups';
    const file = parent + '/s5-test-' + randomUUID() + '.json';
    await mkdir(parent, { recursive: true });
    try {
      await writeFile(file, wireJson(saved), { flag: 'wx' });
      const args = ['scripts/migrate-access-sets-v2-copy.mjs', '--snapshot', file];
      const dryRun = spawnSync(process.execPath, args, { encoding: 'utf8',
        env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'invalid-unused-host' } });
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.deepEqual(JSON.parse(dryRun.stdout), summarizeAccessSetsCopy(plan));
      const noApproval = spawnSync(process.execPath, [...args, 'backup', '--project', 'example-live', '--database', '(default)'], {
        encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '' },
      });
      assert.match(noApproval.stderr, /^copy-production-approval-required$/m);
    } finally {
      await rm(file);
    }
    await assertAbsent([JOURNAL, index, target]);
    await assert.rejects(run(plan, 'apply', { approvedDigest: 'different' }), { code: 'copy-plan-approval-required' });
    assert.equal((await run(plan, 'apply')).phase, 'verified');
    assert.equal((await run(plan, 'verify')).applied, 2);
    const journal = await get(JOURNAL);
    assert.deepEqual(await run(plan, 'apply'), await run(plan, 'verify'));
    assert.deepEqual(await get(JOURNAL), journal);

    const canonical = await get(target);
    const legacy = await get(prayer);
    for (const [key, value] of Object.entries(legacy.fields)) assert.deepEqual(canonical.fields[key], value);
    assert.equal(canonical.fields.integerOne.integerValue, '1');
    assert.equal(canonical.fields.doubleOne.doubleValue, 1);
    assert.ok(Object.is(Number(canonical.fields.signedZero.doubleValue), -0));
    for (const path of [target, targetCategory]) {
      const doc = await get(path);
      assert.deepEqual(doc.fields.accessSets, { arrayValue: { values: [{ stringValue: 'priest' }] } });
      assert.deepEqual(doc.fields.effectiveAccessSets, doc.fields.accessSets);
      assert.equal(doc.fields.contentHash.stringValue, catalogContentHash((await db.doc(path).get()).data()));
    }
    assert.deepEqual((await get(index)).fields, {});
    assert.deepEqual((await get(categoryIndex)).fields, {});
    assert.deepEqual(await Promise.all(untouched.map(get)), baseline);
  });

  await t.test('backup CLI captures empty collections and paginates at one server read time', async () => {
    await seed();
    const page = db.batch();
    for (let i = 0; i < 205; i++) page.set(db.doc('prayers/page-' + String(i).padStart(3, '0')), {});
    await page.commit();
    const { readTime } = await store.get([control]);
    await db.doc('prayers/later').set({ title: 'Synthetic subsequent version' });
    assert.equal((await store.list('prayers', readTime)).length, 206);
    const file = 'backups/s5-test-' + randomUUID() + '.json';
    try {
      const args = ['scripts/migrate-access-sets-v2-copy.mjs', 'backup', '--snapshot', file,
        '--project', projectId, '--database', '(default)'];
      const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).counts.prayers, 207);
      const saved = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(saved.data.collections.protectedPrayers.length, 0);
      assert.equal(makePlan(saved).operations.length, 2);
    } finally {
      await rm(file, { force: true });
    }
  });

  await t.test('resumes after lost apply and restore replies, preserving an identical preimage', async () => {
    await seed();
    const initial = await planFromEmulator();
    await store.commit([store.put(target, initial.desired.get(target))]);
    const preexisting = await get(target);
    const plan = await planFromEmulator();
    await assert.rejects(run(plan, 'apply', { afterCommit: () => { throw Error('simulated lost response'); } }), /lost response/);
    assert.equal((await get(JOURNAL)).fields.applied.integerValue, '1');
    assert.equal((await capture()).receipts.length, 1);
    await assertPresent([categoryIndex, targetCategory]);
    await assertAbsent([index]);
    await assert.rejects(run(plan, 'verify'), { code: 'copy-not-finalized' });
    assert.equal((await run(plan, 'apply')).phase, 'verified');

    await assert.rejects(run(plan, 'restore', { afterCommit: () => { throw Error('simulated restore interruption'); } }), /interruption/);
    await assertAbsent([index]);
    await assertPresent([categoryIndex, targetCategory]);
    assert.equal((await run(plan, 'restore')).phase, 'restored');
    assert.equal((await run(plan, 'verify')).restored, 2);
    assert.deepEqual(await run(plan, 'restore'), await run(plan, 'verify'));
    assert.deepEqual(await get(target), preexisting);
    await assertPresent([category, prayer]);
    await assertAbsent([categoryIndex, targetCategory, index]);
    await assert.rejects(run(plan, 'apply'), { code: 'copy-already-restoring' });
  });

  await t.test('rejects incomplete backups, corrupt data, orphan indexes and destination conflicts', async () => {
    await seed();
    const full = await backup();
    const incomplete = structuredClone(full);
    delete incomplete.data.collections['accessSetsV2/priest/categories'];
    assert.throws(() => makePlan(incomplete), { code: 'copy-backup-checksum-mismatch' });
    incomplete.sha256 = checksum(incomplete.data);
    assert.throws(() => makePlan(incomplete), { code: 'incomplete-copy-backup' });
    await db.doc('accessSetsV2/deleted-set/prayers/orphan').set({});
    const orphan = await capture();
    assert.equal(orphan.collections['accessSetsV2/deleted-set/prayers'].length, 1);
    assert.throws(() => makePlan(makeCopyBackup(orphan)), { code: 'invalid-content-index' });
    await db.doc('accessSetsV2/deleted-set/prayers/orphan').delete();
    await db.doc(target).set({ text: 'Existing conflicting bytes' });
    await assert.rejects(planFromEmulator(), { code: 'copy-destination-conflict' });
    await db.doc(target).delete();
    await db.doc(prayer).update({ categoryId: 'missing' });
    await assert.rejects(planFromEmulator(), { code: 'unknown-prayer-category' });
    await db.doc(rollout).set({ mode: 'canonical' });
    await assert.rejects(planFromEmulator(), { code: 'copy-rollout-open' });
    await assertAbsent([JOURNAL, index, target]);
  });

  await t.test('refuses preflight and in-flight drift, rolls back rejected Firestore commits', async () => {
    await seed();
    const obsolete = await planFromEmulator();
    await db.doc(control).update({ version: 1 });
    await assert.rejects(run(obsolete, 'apply'), { code: 'copy-baseline-drift' });
    await assertAbsent([JOURNAL, target, targetCategory]);

    const plan = await planFromEmulator();
    const rejectingStore = {
      ...store,
      transact: (paths, writes) => store.transact(paths, (docs) => {
        const batch = writes(docs);
        if (paths.includes(category)) {
          // Force a server-side document precondition failure in the same commit.
          batch[1].currentDocument = { exists: true };
        }
        return batch;
      }),
    };
    await assert.rejects(runAccessSetsCopy(rejectingStore, plan, { action: 'apply', approvedDigest: plan.planDigest }),
      (error) => Number.isInteger(error.code));
    assert.equal((await get(JOURNAL)).fields.applied.integerValue, '0');
    await assertAbsent([categoryIndex, targetCategory, RECEIPTS + '/0']);
    await assert.rejects(run(plan, 'apply', { afterCommit: async ({ ordinal }) => {
      if (ordinal === 0) await db.doc(prayer).update({ text: 'Changed during copy' });
    } }), { code: 'copy-baseline-drift' });
    await assertAbsent([index, target, RECEIPTS + '/1']);
    assert.equal((await get(JOURNAL)).fields.applied.integerValue, '1');
  });

  await t.test('restores a partially applied run and refuses to delete a replaced canonical document', async () => {
    await seed();
    const partial = await planFromEmulator();
    await assert.rejects(run(partial, 'apply', { afterCommit: () => { throw Error('interrupted'); } }), /interrupted/);
    assert.equal((await run(partial, 'restore')).restored, 1);
    await assertAbsent([index, categoryIndex, target, targetCategory]);

    await seed();
    const plan = await planFromEmulator();
    await run(plan, 'apply');
    await db.doc(target).delete();
    await store.commit([store.put(target, plan.desired.get(target))]);
    await assert.rejects(run(plan, 'verify'), { code: 'copy-readback-drift' });
    await assert.rejects(run(plan, 'restore'), { code: 'copy-readback-drift' });
    await assertPresent([index, categoryIndex, target, targetCategory]);
  });
});
