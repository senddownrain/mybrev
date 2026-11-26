import { catalogError } from '../../src/utils/accessSetsV2Policy.mjs';
import {
  captureCopyState, checksum, CONTROLS, JOURNAL, observedCopyDocuments, RECEIPTS, SETS,
  summarizeAccessSetsCopy, wireEqual,
} from './access-sets-v2-copy-plan.mjs';

const fail = (code) => { throw catalogError(code); };
const string = (value) => ({ stringValue: value });
const integer = (value) => ({ integerValue: String(value) });
const receiptPath = (ordinal) => RECEIPTS + '/' + ordinal;
const journalFields = (plan, phase, applied, restored) => ({
  planDigest: string(plan.planDigest), phase: string(phase), applied: integer(applied), restored: integer(restored),
});
const receiptFields = (plan, ordinal) => ({
  planDigest: string(plan.planDigest), operationDigest: string(checksum(plan.operations[ordinal])),
});
const beforeAt = (plan, path) => plan.before.get(path) ?? null;

function readProgress(plan, journal) {
  const phase = journal?.fields.phase?.stringValue ?? 'new';
  const applied = Number(journal?.fields.applied?.integerValue ?? 0);
  const restored = Number(journal?.fields.restored?.integerValue ?? 0);
  if (!journal) return { phase, applied, restored };
  if (!wireEqual(journal.fields, journalFields(plan, phase, applied, restored))
    || !Number.isSafeInteger(applied) || !Number.isSafeInteger(restored)
    || applied < 0 || applied > plan.operations.length || restored < 0 || restored > applied
    || !['copying', 'verified', 'restoring', 'restored'].includes(phase)
    || (['copying', 'verified'].includes(phase) && restored !== 0)
    || (phase === 'verified' && applied !== plan.operations.length)
    || (phase === 'restored' && restored !== applied)) fail('copy-journal-conflict');
  return { phase, applied, restored };
}

function checkBaseline(plan, path, actual) {
  if (!wireEqual(actual, beforeAt(plan, path))) fail('copy-baseline-drift');
}

function checkCreated(plan, path, actual, receipt) {
  // Both documents were created by one commit. Refuse a later write, even one
  // that changes the payload back to the planned bytes.
  if (!receipt || !actual || !wireEqual(actual.fields, plan.desired.get(path))
    || actual.createTime !== actual.updateTime || actual.createTime !== receipt.createTime) fail('copy-readback-drift');
}

async function inspect(store, plan) {
  if (store.database !== plan.database) fail('copy-target-mismatch');
  const snapshot = await captureCopyState(store);
  const { journal } = snapshot;
  const progress = readProgress(plan, journal);
  const observed = observedCopyDocuments(snapshot);
  const receipts = new Map(snapshot.receipts.map((doc) => [store.relative(doc.name), doc]));
  if (receipts.size !== progress.applied) fail('copy-receipt-conflict');
  for (let ordinal = 0; ordinal < progress.applied; ordinal++) {
    const receipt = receipts.get(receiptPath(ordinal));
    if (!receipt || !wireEqual(receipt.fields, receiptFields(plan, ordinal))
      || receipt.createTime !== receipt.updateTime) fail('copy-receipt-conflict');
    if (ordinal >= progress.applied - progress.restored) continue;
    for (const path of plan.operations[ordinal].creates) {
      checkCreated(plan, path, observed.get(path), receipt);
      observed.delete(path);
    }
  }
  for (const path of new Set([...observed.keys(), ...plan.before.keys()])) {
    checkBaseline(plan, path, observed.get(path) ?? null);
  }
  return { ...progress, journal };
}

const guards = [...CONTROLS, SETS + '/priest'];
async function advance(store, plan, progress, phase, ordinal) {
  const op = plan.operations[ordinal];
  const copying = phase === 'copying' && op;
  const restoring = phase === 'restoring' && op;
  const nextApplied = progress.applied + Number(Boolean(copying));
  const nextRestored = progress.restored + Number(Boolean(restoring));
  return store.transact([JOURNAL, ...guards, ...(op ? [op.source, ...op.paths, receiptPath(ordinal)] : [])], (docs) => {
    const journal = docs.get(JOURNAL);
    const current = readProgress(plan, journal);
    if (current.phase !== progress.phase || current.applied !== progress.applied || current.restored !== progress.restored) {
      fail('copy-concurrent-run');
    }
    for (const path of guards) checkBaseline(plan, path, docs.get(path));
    const writes = [store.put(JOURNAL, journalFields(plan, phase, nextApplied, nextRestored), journal)];
    if (!op) return writes;

    checkBaseline(plan, op.source, docs.get(op.source));
    for (const path of op.paths.filter((path) => !op.creates.includes(path))) checkBaseline(plan, path, docs.get(path));
    const receipt = docs.get(receiptPath(ordinal));
    if (copying) {
      if (receipt) fail('copy-receipt-conflict');
      for (const path of op.creates) {
        checkBaseline(plan, path, docs.get(path));
        writes.push(store.put(path, plan.desired.get(path)));
      }
      writes.push(store.put(receiptPath(ordinal), receiptFields(plan, ordinal)));
    }
    if (restoring) {
      if (!receipt || !wireEqual(receipt.fields, receiptFields(plan, ordinal))
        || receipt.updateTime !== receipt.createTime) fail('copy-receipt-conflict');
      for (const path of op.creates) {
        const actual = docs.get(path);
        checkCreated(plan, path, actual, receipt);
        writes.push(store.remove(path, actual));
      }
    }
    return writes;
  });
}

function result(plan, progress) {
  return { ...summarizeAccessSetsCopy(plan), phase: progress.phase, applied: progress.applied, restored: progress.restored,
    parity: progress.phase === 'restored' ? 'baseline-verified' : 'verified' };
}

// The same approved snapshot and digest are used on every resume. A successful
// transaction owns its cursor, copies and receipt together even if the reply is lost.
export async function runAccessSetsCopy(store, plan, { action, approvedDigest, afterCommit } = {}) {
  if (!['apply', 'verify', 'restore'].includes(action)) fail('invalid-copy-action');
  if (action !== 'verify' && approvedDigest !== plan.planDigest) fail('copy-plan-approval-required');
  let progress = await inspect(store, plan);
  if (action === 'verify') {
    if (!['verified', 'restored'].includes(progress.phase)) fail('copy-not-finalized');
    return result(plan, progress);
  }
  if (action === 'apply') {
    if (progress.phase === 'verified') return result(plan, progress);
    if (['restoring', 'restored'].includes(progress.phase)) fail('copy-already-restoring');
    if (progress.phase === 'new') {
      await advance(store, plan, progress, 'copying');
      progress = { phase: 'copying', applied: 0, restored: 0 };
    }
    for (let ordinal = progress.applied; ordinal < plan.operations.length; ordinal++) {
      await advance(store, plan, progress, 'copying', ordinal);
      progress.applied++;
      await afterCommit?.({ action, ordinal });
    }
    progress = await inspect(store, plan);
    if (progress.phase !== 'copying' || progress.applied !== plan.operations.length) fail('copy-not-finalized');
    await advance(store, plan, progress, 'verified');
    return result(plan, { ...progress, phase: 'verified' });
  }

  if (progress.phase === 'new') fail('copy-journal-missing');
  if (progress.phase === 'restored') return result(plan, progress);
  if (progress.phase !== 'restoring') {
    await advance(store, plan, progress, 'restoring');
    progress.phase = 'restoring';
  }
  for (let ordinal = progress.applied - progress.restored - 1; ordinal >= 0; ordinal--) {
    await advance(store, plan, progress, 'restoring', ordinal);
    progress.restored++;
    await afterCommit?.({ action, ordinal });
  }
  progress = await inspect(store, plan);
  if (progress.phase !== 'restoring' || progress.restored !== progress.applied) fail('copy-not-finalized');
  await advance(store, plan, progress, 'restored');
  return result(plan, { ...progress, phase: 'restored' });
}
