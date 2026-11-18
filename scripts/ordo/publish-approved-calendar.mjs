#!/usr/bin/env node
/** Sealed PR #201 publisher. Dry-run by default. Exactly one guarded atomic transaction. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { calendarHash } from './plan-approved-calendar.mjs';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { createApprovedRest, encodeFirestoreValue, RELEASE_COLLECTIONS, RELEASE_PROJECT } from './lib/approved-calendar-rest.mjs';

export const APPROVED_OPERATIONS_HASH = 'bc21ba7e9f7d4dc5f210bf1fee67247cd3cbe9a602788ce92d5ed862a2753238';
export const APPROVED_BASELINE_HASH = 'c95e86a8fb40a96d8a331e9260f74393873061a6c7f8d7f38e562e3a0571f614';
export const SOURCE_HASH = 'a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696';
const countsBefore = { liturgicalCalendarMeta: 1, liturgicalCelebrations: 241, liturgicalDioceseOverrides: 75, liturgicalYearOverrides: 15 };
const countsAfter = { liturgicalCalendarMeta: 1, liturgicalCelebrations: 242, liturgicalDioceseOverrides: 77, liturgicalYearOverrides: 15 };
const fieldsAllowed = new Set('action category celebrationId color computedDate contentStatus counts dateRule daysRef defaultTemplate dioceseId effectiveDate enabled fallbackDaysRefs notesRevision order originalDate properKind publishedAt rank readingsRef revision rules schemaVersion scope source sourceSha256 status templates title to validFrom'.split(' '));
const resourceRoot = `projects/${RELEASE_PROJECT}/databases/(default)/documents/`;
const own = (value, key) => Object.hasOwn(value, key);
const exactJson = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(exactJson)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, exactJson(value[key])])) : value;
export const exactHash = value => createHash('sha256').update(JSON.stringify(exactJson(value))).digest('hex');
const clone = value => structuredClone(value);
const fail = message => { throw Error(message); };

export function validateSealedPlan(plan) {
  if (plan.projectId !== RELEASE_PROJECT || plan.database !== '(default)') fail('Wrong project/database');
  if (plan.observedMeta.schemaVersion !== 1 || plan.observedMeta.revision !== 3 || plan.observedMeta.notesRevision !== 6 || plan.observedMeta.properTextsRevision !== 6 || plan.observedMeta.templatesRevision !== 4) fail('Wrong starting metadata');
  if (plan.targetMeta.schemaVersion !== 1 || plan.targetMeta.revision !== 4 || plan.targetMeta.notesRevision !== 6 || plan.targetMeta.sourceSha256 !== SOURCE_HASH || plan.targetMeta.properTextsRevision !== 6 || plan.targetMeta.templatesRevision !== 4) fail('Wrong target metadata');
  if (plan.operations.length !== 71 || plan.operationCount !== 71) fail('Wrong operation count');
  const actions = {};
  const paths = new Set();
  for (const op of plan.operations) {
    const [collection, id, extra] = op.path.split('/');
    if (op.path === 'liturgicalDioceseOverrides/grodno--our-lady-trakai') fail('Independently corrected Trakai must remain untouched');
    if (!RELEASE_COLLECTIONS.includes(collection) || !id || extra || (collection === 'liturgicalCalendarMeta' && id !== 'current')) fail('Forbidden collection/document');
    if (paths.has(op.path)) fail('Duplicate operation'); paths.add(op.path);
    if (!['create', 'update', 'disable', 'publish-meta'].includes(op.action)) fail('Forbidden action');
    if (op.action === 'create' ? op.precondition.exists !== false : !op.precondition.updateTime || !op.precondition.sha256) fail('Missing strict precondition');
    if (op.action === 'publish-meta' && op.path !== 'liturgicalCalendarMeta/current') fail('Wrong publication barrier');
    for (const [key, change] of Object.entries(op.fields)) {
      if (!fieldsAllowed.has(key)) fail('Forbidden field');
      if (!own(change, 'after') && !(op.path === 'liturgicalCalendarMeta/current' && key === 'publishedAt' && change.afterTransform === 'REQUEST_TIME')) fail('Unapproved field transform');
    }
    actions[op.action] = (actions[op.action] || 0) + 1;
  }
  if (JSON.stringify(actions) !== JSON.stringify({ update: 25, create: 3, disable: 42, 'publish-meta': 1 })
    && !(actions.create === 3 && actions.update === 25 && actions.disable === 42 && actions['publish-meta'] === 1)) fail('Wrong action counts');
  if (calendarHash(plan.operations) !== APPROVED_OPERATIONS_HASH || exactHash(plan.operations) !== APPROVED_OPERATIONS_HASH || plan.operationsSha256 !== APPROVED_OPERATIONS_HASH) fail('Approved plan checksum mismatch');
  return actions;
}

export async function stateFromSnapshot(directory) {
  const source = await openFirestoreSnapshot(directory);
  if (source.manifest.projectId !== RELEASE_PROJECT) fail('Snapshot project mismatch');
  const collections = {};
  for (const name of RELEASE_COLLECTIONS) {
    collections[name] = await source.collectionEntries(name);
    if (!collections[name]) fail(`Snapshot missing ${name}`);
  }
  return { projectId: source.manifest.projectId, collections, capturedAt: source.manifest.exportedAt };
}
const indexOf = state => new Map(RELEASE_COLLECTIONS.flatMap(c => state.collections[c].map(d => [`${c}/${d.id}`, d])));
export const baselineFingerprint = state => exactHash([...indexOf(state)].map(([key, d]) => ({ path: key, hash: exactHash(d.data), updateTime: d.updateTime })).sort((a, b) => a.path.localeCompare(b.path)));
const metaOf = state => state.collections.liturgicalCalendarMeta.find(d => d.id === 'current')?.data;

export function verifyBefore(plan, baseline, current) {
  validateSealedPlan(plan);
  if (current.projectId !== RELEASE_PROJECT || baseline.projectId !== RELEASE_PROJECT) fail('State project mismatch');
  if (baselineFingerprint(baseline) !== APPROVED_BASELINE_HASH) fail('Approved full baseline fingerprint mismatch');
  const meta = metaOf(current);
  if (meta?.schemaVersion !== 1 || meta.revision !== 3 || meta.notesRevision !== 6 || meta.properTextsRevision !== 6 || meta.templatesRevision !== 4) fail('Already applied or changed production revision/schema/notes');
  const mismatches = [];
  for (const c of RELEASE_COLLECTIONS) {
    if (baseline.collections[c]?.length !== countsBefore[c] || current.collections[c]?.length !== countsBefore[c]) mismatches.push({ collection: c, reason: 'COUNT_CHANGED', expected: countsBefore[c], actual: current.collections[c]?.length });
  }
  const before = indexOf(baseline); const live = indexOf(current);
  for (const key of new Set([...before.keys(), ...live.keys()])) {
    const a = before.get(key); const b = live.get(key);
    if (!a || !b || a.updateTime !== b.updateTime || calendarHash(a.data) !== calendarHash(b.data) || exactHash(a.data) !== exactHash(b.data)) {
      mismatches.push({ path: key, reason: !a ? 'UNEXPECTED_DOCUMENT' : !b ? 'MISSING_DOCUMENT' : 'HASH_OR_UPDATE_TIME_CHANGED',
        expectedHash: a ? calendarHash(a.data) : null, actualHash: b ? calendarHash(b.data) : null,
        expectedUpdateTime: a?.updateTime || null, actualUpdateTime: b?.updateTime || null });
    }
  }
  for (const op of plan.operations) {
    const doc = live.get(op.path);
    if (op.action === 'create') { if (doc) mismatches.push({ path: op.path, reason: 'CREATE_ALREADY_EXISTS' }); continue; }
    if (!doc || doc.updateTime !== op.precondition.updateTime || calendarHash(doc.data) !== op.precondition.sha256) mismatches.push({ path: op.path, reason: 'PLAN_PRECONDITION_MISMATCH' });
    if (!doc) continue;
    for (const [field, change] of Object.entries(op.fields)) {
      if (change.beforeAbsent ? own(doc.data, field) : !own(doc.data, field) || calendarHash(doc.data[field]) !== calendarHash(change.before)) mismatches.push({ path: op.path, field, reason: 'BEFORE_FIELD_MISMATCH' });
    }
  }
  return mismatches;
}

export function buildForwardWrites(plan) {
  validateSealedPlan(plan);
  return plan.operations.map(op => {
    const fields = Object.fromEntries(Object.entries(op.fields).filter(([, v]) => own(v, 'after')).map(([k, v]) => [k, encodeFirestoreValue(v.after)]));
    return { update: { name: resourceRoot + op.path, fields },
      ...(op.action === 'create' ? {} : { updateMask: { fieldPaths: Object.keys(fields) } }),
      currentDocument: op.action === 'create' ? { exists: false } : { updateTime: op.precondition.updateTime },
      ...(op.action === 'publish-meta' ? { updateTransforms: [{ fieldPath: 'publishedAt', setToServerValue: 'REQUEST_TIME' }] } : {}) };
  });
}

export function rollbackBlueprint(plan, baseline) {
  validateSealedPlan(plan);
  const before = indexOf(baseline);
  return { mode: 'ROLLBACK_BLUEPRINT_NOT_APPLIED', projectId: RELEASE_PROJECT, fromRevision: 4, toRevision: 5, notesRevision: 6, properTextsRevision: 6, templatesRevision: 4,
    requiresFreshReadbackPreconditionsAndSeparateDecision: true, operations: plan.operations.map(op => ({ path: op.path,
      action: op.action === 'create' ? 'disable-created' : op.action === 'publish-meta' ? 'publish-rollback-meta' : 'restore-fields',
      fields: op.action === 'create' ? { enabled: { after: false } } : Object.fromEntries(Object.entries(op.fields).map(([field]) => [field,
        op.action === 'publish-meta' && field === 'revision' ? { after: 5 }
          : op.action === 'publish-meta' && field === 'publishedAt' ? { afterTransform: 'REQUEST_TIME' }
            : own(before.get(op.path).data, field) ? { after: before.get(op.path).data[field] } : { afterAbsent: true }])) })) };
}

export function expectedAfter(plan, beforeState, timestamp) {
  const state = clone(beforeState); const byPath = indexOf(state);
  for (const op of plan.operations) {
    let doc = byPath.get(op.path);
    if (!doc) { const [c, id] = op.path.split('/'); doc = { id, data: {} }; state.collections[c].push(doc); }
    for (const [key, change] of Object.entries(op.fields)) doc.data[key] = own(change, 'after') ? clone(change.after) : new Date(timestamp);
  }
  return state;
}

export function verifyAfter(plan, beforeState, current, result) {
  if (!result || result.writeResults?.length !== 71 || !result.commitTime) fail('Incomplete/unknown commit response; reconcile read-only');
  const timestamp = result.writeResults.at(-1).transformResults?.[0]?.timestampValue;
  if (!timestamp) fail('Missing metadata server timestamp');
  const expected = indexOf(expectedAfter(plan, beforeState, timestamp)); const actual = indexOf(current);
  const changed = new Map(plan.operations.map((op, i) => [op.path, result.writeResults[i].updateTime]));
  const errors = [];
  for (const c of RELEASE_COLLECTIONS) if (current.collections[c]?.length !== countsAfter[c]) errors.push(`${c}:count`);
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const a = expected.get(key); const b = actual.get(key);
    if (!a || !b || calendarHash(a.data) !== calendarHash(b.data) || exactHash(a.data) !== exactHash(b.data) || b.updateTime !== (changed.get(key) || a.updateTime)) errors.push(key);
  }
  const meta = metaOf(current);
  if (meta?.revision !== 4 || meta.schemaVersion !== 1 || meta.notesRevision !== 6 || meta.sourceSha256 !== SOURCE_HASH || meta.properTextsRevision !== 6 || meta.templatesRevision !== 4) errors.push('metadata');
  const enabled = c => current.collections[c].filter(d => d.data.enabled !== false).length;
  if (enabled('liturgicalCelebrations') !== 242 || enabled('liturgicalDioceseOverrides') !== 39 || enabled('liturgicalYearOverrides') !== 11) errors.push('enabled counts');
  if (errors.length) fail(`POST_COMMIT_VERIFICATION_FAILED: ${errors.join(', ')}`);
  return { mode: 'PUBLISHED_AND_VERIFIED', projectId: RELEASE_PROJECT, revision: 4, schemaVersion: 1, notesRevision: 6, properTextsRevision: 6, templatesRevision: 4,
    sourceSha256: SOURCE_HASH, operationsSha256: APPROVED_OPERATIONS_HASH, commitTime: result.commitTime,
    counts: countsAfter, enabled: { liturgicalCelebrations: 242, liturgicalDioceseOverrides: 39, liturgicalYearOverrides: 11 },
    operations: plan.operations.map((op, i) => ({ path: op.path, action: op.action, result: 'VERIFIED', updateTime: result.writeResults[i].updateTime,
      beforeHash: op.precondition.sha256 || null, afterHash: calendarHash(actual.get(op.path).data) })),
    deletes: 0, outsideScopeWrites: 0 };
}

export async function applyApprovedPlan({ plan, baseline, transport, recordAttempt }) {
  validateSealedPlan(plan);
  const transaction = await transport.begin();
  let committing = false;
  try {
    const before = await transport.capture({ transaction });
    const mismatches = verifyBefore(plan, baseline, before);
    if (mismatches.length) fail(`PRECONDITIONS_CHANGED: ${JSON.stringify(mismatches)}`);
    const writes = buildForwardWrites(plan);
    await recordAttempt({ state: 'COMMIT_ATTEMPT_STARTED', operationsSha256: APPROVED_OPERATIONS_HASH, writeCount: writes.length, at: new Date().toISOString() });
    committing = true;
    const result = await transport.commit(writes, transaction); // Exactly once; never retry a write RPC.
    const after = await transport.capture();
    return { manifest: verifyAfter(plan, before, after, result), before, after, result };
  } catch (error) {
    if (!committing) await transport.release(transaction).catch(() => {}); // Releases an uncommitted transaction, never a data rollback.
    throw error;
  }
}

async function privateJson(file, value, exclusive = false) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
}
async function main(args) {
  const flags = new Set(['--live', '--apply', '--december']); const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (flags.has(args[i])) opts[args[i]] = true;
    else if (['--plan', '--baseline', '--out', '--confirm-hash'].includes(args[i])) opts[args[i]] = args[++i];
    else fail('Unknown option; only --plan, --baseline, --out, --live, --apply, --confirm-hash supported');
  }
  if (!opts['--plan'] || !opts['--baseline'] || !opts['--out']) fail('Plan, private baseline and private output required');
  if (opts['--december']) {
    const {runDecember}=await import('./lib/approved-calendar-december.mjs');
    return runDecember(opts,path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
  }
  if (opts['--apply'] && (!opts['--live'] || opts['--confirm-hash'] !== APPROVED_OPERATIONS_HASH)) fail('Explicit live apply and exact confirmation hash required');
  const out = path.resolve(opts['--out']);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (out === repo || out.startsWith(`${repo}/`)) fail('Private output cannot be in a published/tracked artifact directory');
  const plan = JSON.parse(await fs.readFile(opts['--plan'], 'utf8')); validateSealedPlan(plan);
  const baseline = await stateFromSnapshot(opts['--baseline']);
  const rollback = rollbackBlueprint(plan, baseline);
  await privateJson(path.join(out, 'ROLLBACK_BLUEPRINT.private.json'), rollback);
  if (!opts['--live']) {
    const errors = verifyBefore(plan, baseline, baseline); if (errors.length) fail(JSON.stringify(errors));
    await privateJson(path.join(out, 'DRY_RUN.json'), { mode: 'LOCAL_DRY_RUN', operationCount: buildForwardWrites(plan).length, checksum: APPROVED_OPERATIONS_HASH, errors });
    console.log('LOCAL_DRY_RUN PASS: 71 writes, sealed checksum, no network, no writes'); return;
  }
  const transport = createApprovedRest({ allowCommit: Boolean(opts['--apply']) });
  try {
    if (!opts['--apply']) {
      const current = await transport.capture(); await privateJson(path.join(out, 'PRESTATE.private.json'), current);
      const mismatches = verifyBefore(plan, baseline, current);
      await privateJson(path.join(out, 'PREFLIGHT.json'), { mode: 'READ_ONLY_PREFLIGHT', matched: mismatches.length === 0, mismatches, requests: transport.ledger });
      if (mismatches.length) fail(`Production differs: ${JSON.stringify(mismatches)}`);
      console.log('READ_ONLY_PREFLIGHT PASS: all IDs, hashes, updateTimes, metadata and 71 preconditions match'); return;
    }
    const attemptFile = path.join(out, 'APPLY_ATTEMPT.private.json');
    try { await fs.access(attemptFile); fail('Previous apply attempt exists; reconcile read-only, never retry blindly'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const published = await applyApprovedPlan({ plan, baseline, transport, recordAttempt: value => privateJson(attemptFile, value, true) });
    await privateJson(path.join(out, 'POSTSTATE.private.json'), published.after);
    await privateJson(path.join(out, 'COMMIT_RESPONSE.private.json'), published.result);
    await privateJson(path.join(out, 'PUBLICATION_MANIFEST.json'), published.manifest);
    const afterIndex = indexOf(published.after);
    const boundRollback = { ...rollback, mode: 'BOUND_ROLLBACK_NOT_APPLIED', preconditions: Object.fromEntries([...afterIndex].map(([key, d]) => [key, { updateTime: d.updateTime, sha256: calendarHash(d.data) }])) };
    await privateJson(path.join(out, 'BOUND_ROLLBACK.private.json'), boundRollback);
    console.log('PUBLISHED_AND_VERIFIED: revision 4; 71 operations; no deletes; notesRevision 6');
  } finally { await privateJson(path.join(out, 'REQUEST_LEDGER.json'), transport.ledger); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
