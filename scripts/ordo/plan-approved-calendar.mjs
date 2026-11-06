#!/usr/bin/env node
/** Read-only plan from an existing local snapshot. No Firebase SDK and no --apply path. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { normalizeCalendarDefinitions, CALENDAR_SCHEMA_VERSION } from '../../src/utils/ordo/definitions.js';
import { buildTransferOverrideTargets } from '../../src/utils/ordo/transferOverrides.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clean = value => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !['importedAt', 'createdAt', 'updatedAt'].includes(key))
    .map(key => [key, clean(value[key])]));
};
export const calendarHash = value => createHash('sha256').update(JSON.stringify(clean(value))).digest('hex');

export async function planApprovedCalendar(snapshotPath) {
  const source = await openFirestoreSnapshot(snapshotPath);
  if (source.manifest.projectId !== 'ibreviaryby') throw new Error('Wrong snapshot project');
  const bundled = JSON.parse(await fs.readFile(path.join(root, 'src/data/ordo/calendar-definitions.json')));
  const normalized = normalizeCalendarDefinitions(bundled);
  if (normalized.warnings.length) throw new Error(normalized.warnings.join('\n'));
  const meta = await source.document('liturgicalCalendarMeta', 'current');
  if (!meta || meta.schemaVersion !== CALENDAR_SCHEMA_VERSION) throw new Error('Unsupported current schema');
  if (bundled.revision <= meta.revision) throw new Error('Bundled revision must be above the observed production revision');
  const operations = []; const collections = {}; const targetCollections = {};
  const auto = buildTransferOverrideTargets({ years: Array.from({ length: 11 }, (_, i) => 2025 + i) });
  const byKey = new Map(auto.map(item => [item.id, item]));
  for (const [collection, target] of [
    ['liturgicalCelebrations', bundled.celebrations],
    ['liturgicalDioceseOverrides', bundled.dioceseOverrides],
    ['liturgicalYearOverrides', bundled.yearOverrides],
  ]) {
    const entries = await source.collectionEntries(collection);
    if (!entries) throw new Error(`Snapshot lacks ${collection}`);
    const before = new Map(entries.map(item => [item.id, item]));
    const desired = new Map(target.map(item => {
      const { id, ...data } = item; return [id, data];
    }));
    for (const [id, item] of before) if (!desired.has(id)) {
      if (collection === 'liturgicalYearOverrides') {
        if (item.data.source !== 'auto-transfer') throw new Error(`Unexpected unreviewed manual document ${id}`);
        const computed = byKey.get(id);
        if (!computed) throw new Error(`Stale automatic transfer needs a decision: ${id}`);
        // Only re-materialize the computed date; keep its provenance/review policy.
        desired.set(id, { ...item.data, effectiveDate: computed.effectiveDate, computedDate: computed.computedDate,
          ...(Object.hasOwn(item.data, 'to') ? { to: computed.effectiveDate } : {}) });
      } else {
        // Retain IDs and all content/source references. Disable only obsolete assignments.
        desired.set(id, { ...item.data, enabled: false });
      }
    }
    const counts = { create: 0, update: 0, disable: 0, unchanged: 0, delete: 0, totalAfter: desired.size,
      enabledAfter: [...desired.values()].filter(item => item.enabled !== false).length };
    for (const [id, data] of desired) {
      const previous = before.get(id);
      const merged = { ...previous?.data, ...data };
      if (previous && calendarHash(previous.data) === calendarHash(merged)) { counts.unchanged++; continue; }
      const action = !previous ? 'create' : data.enabled === false && previous.data.enabled !== false ? 'disable' : 'update';
      counts[action]++;
      const fields = {};
      for (const key of new Set([...Object.keys(previous?.data || {}), ...Object.keys(merged)])) {
        if (JSON.stringify(clean(previous?.data[key])) !== JSON.stringify(clean(merged[key]))) {
          fields[key] = { ...(Object.hasOwn(previous?.data || {}, key) ? { before: clean(previous.data[key]) } : { beforeAbsent: true }), after: clean(merged[key]) };
        }
      }
      operations.push({ path: `${collection}/${id}`, action,
        precondition: previous ? { exists: true, updateTime: previous.updateTime, sha256: calendarHash(previous.data) } : { exists: false },
        fields });
    }
    targetCollections[collection] = [...desired.entries()].map(([id, data]) => ({ id, ...data }));
    collections[collection] = counts;
  }
  const targetMeta = { schemaVersion: CALENDAR_SCHEMA_VERSION, revision: bundled.revision,
    notesRevision: meta.notesRevision, sourceSha256: 'a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696',
    counts: { celebrations: collections.liturgicalCelebrations.totalAfter, dioceseOverrides: collections.liturgicalDioceseOverrides.totalAfter } };
  const metaEntry = (await source.collectionEntries('liturgicalCalendarMeta')).find(x => x.id === 'current');
  operations.push({ path: 'liturgicalCalendarMeta/current', action: 'publish-meta',
    precondition: { exists: true, updateTime: metaEntry.updateTime, sha256: calendarHash(metaEntry.data) },
    fields: { ...Object.fromEntries(Object.entries(targetMeta).map(([key, after]) => [key, { ...(Object.hasOwn(meta, key) ? { before: clean(meta[key]) } : { beforeAbsent: true }), after }])),
      publishedAt: { before: clean(meta.publishedAt), afterTransform: 'REQUEST_TIME' } } });
  return { plan: { mode: 'DRY_RUN_ONLY', projectId: source.manifest.projectId, database: '(default)',
    snapshotAt: source.manifest.exportedAt, snapshotMetaStable: source.manifest.metaBookendsStable,
    observedMeta: { schemaVersion: meta.schemaVersion, revision: meta.revision, notesRevision: meta.notesRevision },
    auditBaselineCommit: '9ecd0fdfd2e0230cfd1159476c11291893dd46bf', baseCommit: 'a8ca4b4e53600d10081388963daa62b20059b629',
    sourceSha256: targetMeta.sourceSha256, targetMeta, collections,
    operationCount: operations.length, operationsSha256: calendarHash(operations), operations,
    futurePublication: { requiresOwnerAcceptanceOfExactDiff: true, method: 'one atomic preconditioned batch, including metadata',
      recheckAllPreconditions: true, rejectAnyChangedHashOrUpdateTime: true, rejectIfAbove500Writes: true,
      noPrunedDeletes: true, notesBodiesUntouched: true, contentManifestNeedsSeparateDryRunAndApproval: true },
    rollback: { revision: bundled.revision + 1, method: 'reverse fields from this plan; newly created documents become disabled; commit atomically with a larger revision',
      notesRevision: meta.notesRevision },
    unresolved: [{ year: 2033, celebrationId: 'nativity-john-baptist', computedDate: '2033-06-25', status: 'needs-review',
      note: 'General-rule computation only. Neither 23 nor 25 June is claimed as a verified special universal decision for 2033.' }],
    untouchedCollections: ['days','readings','liturgicalTemplates','liturgicalProperTexts','liturgicalOrdoNotes','contentManifest','prayers','songs'],
    noFirestoreWrites: true, noDeploy: true }, targetCollections };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg, i) => i % 2 === 0 && !['--snapshot', '--out'].includes(arg)) || args.length !== 4) {
    throw new Error('Only --snapshot <local-directory> --out <json-file> supported. There is no --apply mode.');
  }
  const input = args[args.indexOf('--snapshot') + 1]; const out = args[args.indexOf('--out') + 1];
  const { plan } = await planApprovedCalendar(input);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ mode: plan.mode, operationCount: plan.operationCount, collections: plan.collections }, null, 2));
}
