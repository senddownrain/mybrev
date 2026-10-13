/**
 * Guards of the production change set (scripts/lectionary/lib/apply-wave.mjs),
 * tested against a fake Firestore: no network, no credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyWave, rollbackWave, updateFields, verifyBackup, readWave, encodeValue } from '../scripts/lectionary/lib/apply-wave.mjs';
import { documentHash, storedDocument } from '../scripts/content/lib/app-content.mjs';

class FakeTimestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toDate() { return new Date(this.seconds * 1000); }
  isEqual(other) { return other && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds; }
}
const DELETE = Symbol('delete');
const SERVER = Symbol('serverTimestamp');
const admin = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => SERVER }, Timestamp: FakeTimestamp } };

function fakeFirestore(initial, { failOn = null, tamperBeforeUpdate = null } = {}) {
  let clock = 1000;
  const docs = new Map(Object.entries(initial).map(([id, data]) => [id, { data: structuredCloneWithTimestamps(data), updateTime: new FakeTimestamp(clock += 1) }]));
  const writes = [];
  const ref = (id) => ({
    id,
    async get() {
      const row = docs.get(id);
      return row ? { exists: true, id, data: () => structuredCloneWithTimestamps(row.data), updateTime: row.updateTime } : { exists: false, id };
    },
    async update(payload, precondition) {
      if (failOn === id) throw new Error('simulated network drop');
      if (tamperBeforeUpdate === id) { docs.get(id).updateTime = new FakeTimestamp(clock += 1); }
      const row = docs.get(id);
      if (precondition?.lastUpdateTime && !row.updateTime.isEqual(precondition.lastUpdateTime)) throw new Error('FAILED_PRECONDITION: the document was modified');
      for (const [key, value] of Object.entries(payload)) {
        if (value === DELETE) delete row.data[key];
        else if (value === SERVER) row.data[key] = new FakeTimestamp(clock += 1);
        else row.data[key] = structuredCloneWithTimestamps(value);
      }
      row.updateTime = new FakeTimestamp(clock += 1);
      writes.push(id);
    },
  });
  return {
    docs, writes,
    collection: () => ({ doc: ref }),
    async runTransaction(fn) {
      return fn({
        get: (docRef) => docRef.get(),
        set: (docRef, data) => { docs.get(docRef.id).data = structuredCloneWithTimestamps(data); docs.get(docRef.id).updateTime = new FakeTimestamp(clock += 1); writes.push(`tx:${docRef.id}`); },
      });
    },
  };
}
function structuredCloneWithTimestamps(value) {
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.seconds, value.nanoseconds);
  if (Array.isArray(value)) return value.map(structuredCloneWithTimestamps);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredCloneWithTimestamps(item)]));
  return value;
}

const original = (n) => ({ title: `Reading ${n}`, _date: '01.01', parsedAt: new FakeTimestamp(5, 6), reading1: { bible: 'Быц 1, 1', text: `old ${n}` }, psalm: { bible: 'Пс 1', chorus: 'old' }, gospel: { bible: 'Мк 1', text: 'g' }, sequence: { text: 'seq' }, sectionsFound: ['reading1', 'gospel'], _sourceUrl: 'https://catholic.by/x' });
const reviewedAfter = (n) => { const { sequence: _gone, ...rest } = original(n); return { ...rest, reading1: { bible: 'Быц 1, 1', text: `NEW ${n}` }, alleluia: { verse: 'v' }, sectionsFound: ['reading1', 'alleluia', 'gospel'] }; };
const changeOf = (id, n) => ({
  id, before: original(n), after: reviewedAfter(n),
  beforeHash: documentHash(storedDocument(id, original(n))), afterHash: documentHash(storedDocument(id, reviewedAfter(n))),
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'apply-wave-'));
const setup = (count = 4, options) => {
  const ids = Array.from({ length: count }, (_, i) => `doc-${i + 1}`);
  const store = fakeFirestore({ ...Object.fromEntries(ids.map((id, i) => [id, original(i + 1)])), untouched: { title: 'not in the plan' } }, options);
  return { ids, store, changes: ids.map((id, i) => changeOf(id, i + 1)), dir: path.join(tmp(), 'backup') };
};

test('updateFields: only the differing top-level fields, deletions for absent ones, bookkeeping ignored', () => {
  const { set, remove } = updateFields(original(1), reviewedAfter(1));
  assert.deepEqual(Object.keys(set).sort(), ['alleluia', 'reading1', 'sectionsFound']);
  assert.deepEqual(remove, ['sequence']);
});

test('apply: backup first, only planned fields written, every document read back as the reviewed after-state', async () => {
  const { store, changes, dir } = setup();
  const result = await applyWave({ firestore: store, admin, changes, backupDir: dir, meta: { wave: 1 } });
  assert.equal(result.written, 4);
  assert.deepEqual(store.writes, ['doc-1', 'doc-2', 'doc-3', 'doc-4']);
  const live = store.docs.get('doc-2').data;
  assert.equal(live.reading1.text, 'NEW 2');
  assert.equal(live.title, 'Reading 2');
  assert.deepEqual(live._sourceUrl, 'https://catholic.by/x');
  assert.equal('sequence' in live, false);
  assert.ok(live.updatedAt instanceof FakeTimestamp);
  assert.equal(store.docs.get('untouched').data.title, 'not in the plan');
  assert.equal(store.docs.get('untouched').data.updatedAt, undefined);
  const check = verifyBackup(dir);
  assert.ok(check.ok, check.problems.join());
  assert.equal(check.manifest.count, 4);
  assert.ok(fs.existsSync(path.join(dir, 'AFTER.json')));
  assert.match(fs.readFileSync(path.join(dir, 'apply-log.jsonl'), 'utf8'), /"event":"verified"/);
});

test('apply: refuses to re-apply a wave that is fully applied (idempotent) and writes nothing', async () => {
  const { store, changes, dir } = setup();
  await applyWave({ firestore: store, admin, changes, backupDir: dir });
  const writes = store.writes.length;
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: path.join(tmp(), 'again') }), /already applied/);
  assert.equal(store.writes.length, writes);
});

test('apply: a document edited after the reviewed snapshot aborts the whole wave before the first write', async () => {
  const { store, changes, dir } = setup();
  store.docs.get('doc-3').data.reading1.text = 'edited by hand in production';
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: dir }), /doc-3: diverged/);
  assert.equal(store.writes.length, 0);
  assert.equal(fs.existsSync(dir), false, 'no backup directory for a refused wave');
});

test('apply: a missing document aborts before any write', async () => {
  const { store, changes, dir } = setup();
  store.docs.delete('doc-2');
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: dir }), /doc-2: missing/);
  assert.equal(store.writes.length, 0);
});

test('apply: the update-time precondition stops the wave when a document changes between the read and the write', async () => {
  const { store, changes, dir } = setup(4, { tamperBeforeUpdate: 'doc-2' });
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: dir }), /Write of doc-2 failed.*STOPPED after 1/);
  assert.deepEqual(store.writes, ['doc-1']);
  assert.equal(store.docs.get('doc-3').data.reading1.text, 'old 3');
});

test('apply: an error stops the wave (no further write) and is logged', async () => {
  const { store, changes, dir } = setup(5, { failOn: 'doc-3' });
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: dir }), /simulated network drop.*STOPPED after 2/);
  assert.deepEqual(store.writes, ['doc-1', 'doc-2']);
  assert.equal(store.docs.get('doc-4').data.reading1.text, 'old 4');
  assert.match(fs.readFileSync(path.join(dir, 'apply-log.jsonl'), 'utf8'), /"event":"error","id":"doc-3"/);
});

// minimal healthy refs over the shared documents map (the failure injection above is per fake instance)
function cleanRef(source, id) {
  let clock = 5000;
  return {
    id,
    async get() { const row = source.docs.get(id); return row ? { exists: true, id, data: () => structuredCloneWithTimestamps(row.data), updateTime: row.updateTime } : { exists: false, id }; },
    async update(payload, precondition) {
      const row = source.docs.get(id);
      if (!row.updateTime.isEqual(precondition.lastUpdateTime)) throw new Error('FAILED_PRECONDITION');
      for (const [key, value] of Object.entries(payload)) {
        if (value === DELETE) delete row.data[key]; else if (value === SERVER) row.data[key] = new FakeTimestamp(clock += 1); else row.data[key] = structuredCloneWithTimestamps(value);
      }
      row.updateTime = new FakeTimestamp(clock += 1);
      source.writes.push(id);
    },
  };
}

test('resume: finishes only the remaining documents, against the verified backup of the first run', async () => {
  const { store, changes, dir } = setup(5, { failOn: 'doc-4' });
  await assert.rejects(applyWave({ firestore: store, admin, changes, backupDir: dir }), /STOPPED after 3/);
  const resumed = { collection: () => ({ doc: (id) => cleanRef(store, id) }) };
  store.writes = [];
  await assert.rejects(applyWave({ firestore: resumed, admin, changes, backupDir: path.join(tmp(), 'other') }), /interrupted run/);
  const result = await applyWave({ firestore: resumed, admin, changes, backupDir: dir, resume: true });
  assert.equal(result.written, 2);
  assert.deepEqual(store.writes, ['doc-4', 'doc-5']);
  const rows = await readWave({ firestore: resumed, changes });
  assert.ok(rows.every((row) => row.state === 'applied'));
});

test('backup: sha256 manifest detects a tampered or truncated file', async () => {
  const { store, changes, dir } = setup(3);
  await applyWave({ firestore: store, admin, changes, backupDir: dir });
  assert.ok(verifyBackup(dir).ok);
  const file = path.join(dir, 'doc-2.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('old 2', 'old 9'));
  const check = verifyBackup(dir);
  assert.equal(check.ok, false);
  assert.match(check.problems.join(), /doc-2: file sha256 differs/);
  await assert.rejects(rollbackWave({ firestore: store, admin, backupDir: dir }), /not intact/);
});

test('backup: Firestore Timestamps survive the JSON round trip', () => {
  const encoded = encodeValue({ parsedAt: new FakeTimestamp(7, 9), nested: [{ when: new FakeTimestamp(1, 2) }] });
  assert.deepEqual(encoded, { parsedAt: { __firestoreType: 'timestamp', seconds: 7, nanoseconds: 9 }, nested: [{ when: { __firestoreType: 'timestamp', seconds: 1, nanoseconds: 2 } }] });
});

test('rollback: restores the exact original documents (Timestamps, removed fields); dry run changes nothing; refuses a diverged document', async () => {
  const { store, changes, dir } = setup(3);
  const before = new Map([...store.docs].map(([id, row]) => [id, JSON.stringify(encodeValue(row.data))]));
  await applyWave({ firestore: store, admin, changes, backupDir: dir });
  assert.notEqual(JSON.stringify(encodeValue(store.docs.get('doc-1').data)), before.get('doc-1'));
  const dry = await rollbackWave({ firestore: store, admin, backupDir: dir });
  assert.deepEqual({ ...dry }, { dryRun: true, documents: 3, toRestore: 3, alreadyOriginal: 0 });
  assert.equal(store.docs.get('doc-1').data.reading1.text, 'NEW 1');
  store.docs.get('doc-2').data.reading1.text = 'edited again';
  await assert.rejects(rollbackWave({ firestore: store, admin, backupDir: dir, apply: true }), /edited after the wave \(doc-2\)/);
  store.docs.get('doc-2').data.reading1.text = 'NEW 2';
  const done = await rollbackWave({ firestore: store, admin, backupDir: dir, apply: true });
  assert.equal(done.toRestore, 3);
  for (const id of ['doc-1', 'doc-2', 'doc-3']) assert.equal(JSON.stringify(encodeValue(store.docs.get(id).data)), before.get(id), `${id} restored exactly`);
  assert.equal(store.docs.get('doc-1').data.sequence.text, 'seq');
  assert.ok(store.docs.get('doc-1').data.parsedAt instanceof FakeTimestamp);
  // a second rollback has nothing to do
  const again = await rollbackWave({ firestore: store, admin, backupDir: dir, apply: true });
  assert.equal(again.toRestore, 0);
});
