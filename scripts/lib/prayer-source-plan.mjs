import { createHash } from 'node:crypto';
import { hasLongSourceDetails, hasSourcePages, resolvePrayerSource } from '../../src/utils/prayerSource.mjs';

export const PRAYER_COLLECTIONS = ['prayers', 'priestProtectedPrayers', 'prayerDrafts'];
export const isPrayerCollection = (name) => /prayer/i.test(name.split('/').at(-1)) && !/categor|audit|control|manifest/i.test(name);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const planHash = ({ changes, coverage }) => hash({ changes, coverage });

/** All statuses and access levels, including historical draft statuses. No title/text mutations. */
export function buildShortSourcePlan(collections, { analysisSource = 'local', coverage = {} } = {}) {
  const changes = [], disputed = [], mapping = new Map();
  const counts = { total: 0, published: 0, drafts: 0, withPages: 0, longCorrected: 0, changedDocuments: 0 };
  for (const [collection, entries] of collections) {
    if (!isPrayerCollection(collection)) continue;
    for (const entry of entries) {
      const data = entry.data || entry;
      const id = entry.id;
      counts.total++;
      const draft = /draft/i.test(collection) || data.status && !['published', 'public'].includes(data.status) || data.published === false;
      counts[draft ? 'drafts' : 'published']++;
      const updates = {}, before = {};
      const fields = ['source', 'sourceBook'].filter((field) => Object.hasOwn(data, field));
      if (!fields.length) disputed.push({ collection, id, field: 'source', reason: 'missing', before: null });
      let withPages = false, longCorrected = false;
      for (const field of fields) {
        const old = data[field], result = resolvePrayerSource(old);
        withPages ||= hasSourcePages(old);
        const row = { before: old, after: result.value, status: result.status, ...(result.sourceId ? { sourceId: result.sourceId } : {}) };
        mapping.set(JSON.stringify([old, result.value]), row);
        if (result.status !== 'known') {
          disputed.push({ collection, id, field, reason: result.status, before: old });
        } else if (old !== result.value) {
          updates[field] = result.value; before[field] = old;
          longCorrected ||= hasLongSourceDetails(old);
        }
      }
      const knownSources = new Set(fields.map((field) => resolvePrayerSource(data[field])).filter((result) => result.status === 'known').map((result) => result.sourceId));
      if (knownSources.size > 1) {
        disputed.push({ collection, id, field: 'source/sourceBook', reason: 'conflicting-sources', before: Object.fromEntries(fields.map((field) => [field, data[field]])) });
        for (const field of Object.keys(updates)) { delete updates[field]; delete before[field]; }
        longCorrected = false;
      }
      if (withPages) counts.withPages++;
      if (longCorrected) counts.longCorrected++;
      if (Object.keys(updates).length) changes.push({ collection, id, before, updates, ...(entry.updateTime ? { updateTime: entry.updateTime } : {}) });
    }
  }
  counts.changedDocuments = changes.length;
  const plan = { schemaVersion: 1, analysisSource, coverage, counts, changes, disputed, disputedDocuments: new Set(disputed.map((row) => `${row.collection}/${row.id}`)).size, mapping: [...mapping.values()] };
  return { ...plan, planSha256: planHash(plan) };
}

/** REST update masks and update-time preconditions; never replace whole documents or timestamps. */
export function sourceWrites(plan, project, { rollback = false } = {}) {
  if (project !== 'ibreviaryby' || plan.planSha256 !== planHash(plan)) throw new Error('Wrong project or modified plan');
  return plan.changes.map((change) => {
    if (!isPrayerCollection(change.collection)) throw new Error('Only prayer collections may be patched');
    if (!change.updateTime || typeof change.updateTime !== 'string') throw new Error(`Missing REST updateTime: ${change.collection}/${change.id}`);
    const values = rollback ? change.before : change.updates;
    if (Object.keys(values).some((field) => !['source', 'sourceBook'].includes(field))) throw new Error('Only source fields may be written');
    return {
      update: { name: `projects/${project}/databases/(default)/documents/${change.collection}/${change.id}`, fields: Object.fromEntries(Object.entries(values).map(([field, value]) => [field, { stringValue: value }])) },
      updateMask: { fieldPaths: Object.keys(values) },
      currentDocument: { updateTime: change.updateTime },
    };
  });
}

export async function applySourcePlan(plan, { commit, saveJournal, readback }, { batchSize = 100, journal: previous } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Batch size must be 1..100');
  const writes = sourceWrites(plan, 'ibreviaryby');
  if (previous) rollbackSourcePlan(plan, previous); // validate acknowledged writes against this exact plan
  const journal = previous ? structuredClone(previous) : { planSha256: plan.planSha256, committed: [], verified: [] };
  const acknowledged = new Set(journal.committed.map((change) => `${change.collection}/${change.id}`));
  const pending = writes.map((write,index) => ({write,change:plan.changes[index]})).filter(({change}) => !acknowledged.has(`${change.collection}/${change.id}`));
  const verify = async (change) => {
    const actual = await readback(change);
    for (const [field, value] of Object.entries(change.updates)) if (actual[field] !== value) throw new Error('Readback mismatch');
    journal.verified.push(`${change.collection}/${change.id}`);
    delete journal.pendingReadback;
    await saveJournal(journal);
  };
  // The caller persists the complete immutable plan (including old values) before reaching here.
  await saveJournal(journal);
  if (journal.pendingReadback) await verify(journal.pendingReadback);
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const items = pending.slice(offset, offset + batchSize), slice = items.map(({write}) => write);
    const response = await commit(slice); // Deliberately no automatic retries, including HTTP 429.
    if (response.writeResults?.length !== slice.length) throw new Error('Incomplete commit response; reconcile before resuming');
    response.writeResults.forEach((result, index) => journal.committed.push({ ...items[index].change, updateTime: result.updateTime }));
    journal.pendingReadback = items[0].change;
    await saveJournal(journal);
    // One read per committed batch confirms the actual value; each write has an acknowledged updateTime.
    await verify(items[0].change);
  }
  return journal;
}

export function rollbackSourcePlan(plan, journal) {
  sourceWrites(plan, 'ibreviaryby');
  if (journal.planSha256 !== plan.planSha256) throw new Error('Journal/plan mismatch');
  const originals = new Map(plan.changes.map((change) => [`${change.collection}/${change.id}`, change]));
  const seen = new Set();
  const changes = journal.committed.map((change) => {
    const key = `${change.collection}/${change.id}`, original = originals.get(key);
    if (!original || seen.has(key) || JSON.stringify(original.before) !== JSON.stringify(change.before) || JSON.stringify(original.updates) !== JSON.stringify(change.updates)) throw new Error('Journal contains an unexpected change');
    seen.add(key);
    return { ...original, before: original.updates, updates: original.before, updateTime: change.updateTime };
  });
  const rollback = { ...plan, changes };
  rollback.planSha256 = planHash(rollback);
  return rollback;
}
