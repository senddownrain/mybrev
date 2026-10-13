import { prayerPlanHash, portablePrayerValue, writePrayerPlanUpdates } from './prayer-normalization-plan.mjs';

const same = (a, b) => prayerPlanHash(a) === prayerPlanHash(b);
const valueAt = (data, update) => update.locale === null || update.locale === undefined ? data[update.field] : data.textVersions?.[update.locale];
const existsAt = (data, update) => update.locale === null || update.locale === undefined
  ? Object.hasOwn(data, update.field) : Object.hasOwn(data.textVersions || {}, update.locale);

/** The adapter is the only live boundary; tests exercise it with an in-memory implementation. */
export async function applyPrayerNormalization(documents, adapter, { planHash, batchSize = 10, persist, journal = null, restore = false } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 40) throw new Error('Batch size must be 1..40.');
  if (typeof persist !== 'function') throw new Error('A durable private journal/backup writer is required.');
  if (journal && journal.planHash !== planHash) throw new Error('Journal belongs to another plan/selection.');
  if (journal && (journal.schemaVersion !== 2 || journal.mode !== (restore ? 'restore' : 'apply')
    || !Array.isArray(journal.completed) || !Array.isArray(journal.inFlight)
    || journal.completed.some(id => !documents.some(document => document.id === id)))) throw new Error('Invalid journal schema, mode or completed IDs.');
  const before = await adapter.read(documents.map(document => document.id));
  if (journal) {
    if (journal.selectionHash !== prayerPlanHash(documents)) throw new Error('Journal selection was changed.');
    for (const id of journal.inFlight || []) {
      const document = documents.find(item => item.id === id);
      const current = before.find(item => item.id === id);
      if (!document || !current?.exists) throw new Error('Cannot reconcile interrupted batch.');
      const after = restore ? document.before : writePrayerPlanUpdates(document.before, document.updates);
      const original = restore ? writePrayerPlanUpdates(document.before, document.updates) : document.before;
      if (same(current.data, after)) {
        if (!journal.completed.includes(id)) journal.completed.push(id);
        (journal.writtenVersions ||= {})[id] = portablePrayerValue(current.updateTime);
      } else if (!same(current.data, original)) throw new Error('Interrupted batch has document drift.');
    }
    journal.inFlight = [];
  }
  const records = documents.map(document => {
    const current = before.find(snapshot => snapshot.id === document.id);
    if (!current?.exists) throw new Error('Preflight: document missing.');
    const completed = journal?.completed?.includes(document.id);
    if (!restore && !completed && document.snapshotUpdateTime && !same(document.snapshotUpdateTime, current.updateTime)) throw new Error('Preflight: document version changed since snapshot.');
    if (restore && !completed && document.restoreUpdateTime && !same(document.restoreUpdateTime, current.updateTime)) throw new Error('Restore refused: document was edited after the recorded write.');
    const expected = restore ? completed ? document.before : writePrayerPlanUpdates(document.before, document.updates) : completed
      ? writePrayerPlanUpdates(document.before, document.updates) : document.before;
    if (!same(current.data, expected)) throw new Error('Preflight: full document drift; no new writes performed.');
    return { ...document, updateTime: current.updateTime, baseline: portablePrayerValue(current.data), completed };
  });
  const state = journal || { schemaVersion: 2, planHash, selectionHash: prayerPlanHash(documents), startedAt: new Date().toISOString(), mode: restore ? 'restore' : 'apply', completed: [], inFlight: [], writtenVersions: {}, status: 'prepared', backup: records.map(record => ({ id: record.id, data: record.baseline })) };
  state.writtenVersions ||= {};
  // Already applied records must be supplied from the journal's selection, never reconstructed from a different plan.
  if (restore && state.mode !== 'restore') throw new Error('Use a separate restore journal.');
  const pending = records.filter(record => !record.completed);
  await persist(state);
  try {
    for (let index = 0; index < pending.length; index += batchSize) {
      const batch = pending.slice(index, index + batchSize);
      const patches = batch.map(record => ({ id: record.id, updateTime: record.updateTime,
        updates: record.updates.map(update => ({ ...update, value: restore ? update.before : update.after, remove: restore && update.beforeExists === false })) }));
      // Re-read each batch to refuse changes since preflight and close the race with updateTime preconditions.
      const current = await adapter.read(batch.map(record => record.id));
      for (const record of batch) {
        const snapshot = current.find(item => item.id === record.id);
        if (!snapshot?.exists || !same(snapshot.data, record.baseline) || !same(snapshot.updateTime, record.updateTime)) throw new Error('Document changed after preflight.');
        patches.find(item => item.id === record.id).updateTime = snapshot.updateTime;
      }
      state.inFlight = batch.map(record => record.id);
      state.status = 'committing';
      await persist(state);
      await adapter.commit(patches);
      const after = await adapter.read(batch.map(record => record.id));
      for (const record of batch) {
        const snapshot = after.find(item => item.id === record.id);
        const expected = writePrayerPlanUpdates(record.before, record.updates, restore);
        if (!snapshot?.exists || !same(snapshot.data, expected)) throw new Error('Post-write verification failed, including unrelated fields.');
        for (const update of record.updates) {
          const expectedExists = restore ? update.beforeExists !== false : true;
          if (existsAt(snapshot.data, update) !== expectedExists || (expectedExists && !same(valueAt(snapshot.data, update), restore ? update.before : update.after))) {
            throw new Error('Post-write text field verification failed.');
          }
        }
        state.writtenVersions[record.id] = portablePrayerValue(snapshot.updateTime);
      }
      state.completed.push(...batch.map(record => record.id));
      state.inFlight = [];
      state.status = 'partial';
      await persist(state);
    }
    state.status = 'verified';
    state.finishedAt = new Date().toISOString();
    await persist(state);
    return state;
  } catch (error) {
    state.status = 'failed';
    state.failure = error.message;
    await persist(state);
    throw error;
  }
}

export function firestorePrayerAdapter(db, admin) {
  return {
    async read(ids) {
      const result = [];
      for (let index = 0; index < ids.length; index += 40) {
        const snapshots = await db.getAll(...ids.slice(index, index + 40).map(id => db.collection('prayers').doc(id)));
        result.push(...snapshots.map(snapshot => ({ id: snapshot.id, exists: snapshot.exists, data: snapshot.exists ? portablePrayerValue(snapshot.data()) : null, updateTime: snapshot.updateTime })));
      }
      return result;
    },
    async commit(patches) {
      const batch = db.batch();
      for (const patch of patches) {
        const args = [];
        for (const update of patch.updates) {
          const fieldPath = update.locale === null || update.locale === undefined
            ? new admin.firestore.FieldPath(update.field) : new admin.firestore.FieldPath('textVersions', update.locale);
          args.push(fieldPath, update.remove ? admin.firestore.FieldValue.delete() : update.value);
        }
        batch.update(db.collection('prayers').doc(patch.id), ...args, { lastUpdateTime: patch.updateTime });
      }
      await batch.commit();
    },
  };
}
