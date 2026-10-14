import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openFirestoreSnapshot } from '../scripts/lib/firestore-snapshot.mjs';

test('local snapshot supports collection, document, and filtered reads', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mybrev-snapshot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const collectionPayload = {
    schemaVersion: 1,
    collectionPath: 'days',
    documents: [
      { id: 'one', data: { _date: '26.08', _dayIds: ['linked'] } },
      { id: 'two', data: { _date: '27.08' }, updateTime: { __firestoreType: 'timestamp', seconds: 1787700000, nanoseconds: 123000000 } },
    ],
  };
  await writeFile(path.join(directory, 'fixed-days.json'), JSON.stringify(collectionPayload));
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-08-26T00:00:00.000Z',
    totalDocuments: 2,
    collections: {
      days: { file: 'fixed-days.json', documentCount: 2 },
    },
  }));

  const snapshot = await openFirestoreSnapshot(directory);
  assert.deepEqual(snapshot.collectionPaths, ['days']);
  assert.deepEqual((await snapshot.collectionEntries('days'))[0], {
    id: 'one',
    data: { _date: '26.08', _dayIds: ['linked'] },
  });
  assert.equal((await snapshot.document('days', 'two'))._date, '27.08');
  const versioned = (await snapshot.collectionEntries('days'))[1];
  assert.equal(versioned.updateTime.seconds, 1787700000);
  assert.equal(versioned.updateTime.nanoseconds, 123000000);
  assert.deepEqual((await snapshot.collection('days'))[1], { id: 'two', _date: '27.08' });
  assert.deepEqual(
    (await snapshot.query('days', [{ field: '_date', value: '26.08' }])).map(item => item.id),
    ['one'],
  );
  assert.deepEqual(
    (await snapshot.query('days', [
      { field: '_dayIds', op: 'array-contains', value: 'linked' },
    ])).map(item => item.id),
    ['one'],
  );
});
