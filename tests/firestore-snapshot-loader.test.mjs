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
    collectionPath: 'fixedDays',
    documents: [
      { id: 'one', data: { _date: '26.08', _dayIds: ['linked'] } },
      { id: 'two', data: { _date: '27.08' } },
    ],
  };
  await writeFile(path.join(directory, 'fixed-days.json'), JSON.stringify(collectionPayload));
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    exportedAt: '2026-08-26T00:00:00.000Z',
    totalDocuments: 2,
    collections: {
      fixedDays: { file: 'fixed-days.json', documentCount: 2 },
    },
  }));

  const snapshot = await openFirestoreSnapshot(directory);
  assert.deepEqual(snapshot.collectionPaths, ['fixedDays']);
  assert.equal((await snapshot.document('fixedDays', 'two'))._date, '27.08');
  assert.deepEqual(
    (await snapshot.query('fixedDays', [{ field: '_date', value: '26.08' }])).map(item => item.id),
    ['one'],
  );
  assert.deepEqual(
    (await snapshot.query('fixedDays', [
      { field: '_dayIds', op: 'array-contains', value: 'linked' },
    ])).map(item => item.id),
    ['one'],
  );
});
