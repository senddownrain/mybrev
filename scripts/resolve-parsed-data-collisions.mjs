#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const DATABASE_AUDIT = path.resolve('reports/parsed-readings-database-audit.json');
const COLLISION_AUDIT = path.resolve('reports/parsed-data-collision-audit.json');
const OUTPUT = path.resolve('reports/parsed-data-collision-resolution-report.json');

const DISTINCT_VARIANTS = new Map([
  ['urachystasci-5023', { targetId: 'advent-24-12--christmas-vigil', _variant: 'christmas-vigil' }],
  ['bn-4565', { targetId: 'christmas-05-01--sunday', _variant: 'sunday', _calendarDayOfWeek: 1 }],
]);

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function applyMetadata(document, changes) {
  const result = structuredClone(document);
  delete result.id;
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (value && typeof value === 'object' && value.__op === 'delete') delete result[key];
    else result[key] = value;
  }
  return result;
}

function chooseWinner(variants) {
  return [...variants].sort((left, right) =>
    right.contentSectionCount - left.contentSectionCount
      || right.auditQualityScore - left.auditQualityScore
      || Number(Boolean(right.url)) - Number(Boolean(left.url))
      || right.contentLength - left.contentLength
      || left.id.localeCompare(right.id))[0];
}

function linkMetadata(sourceIds, migrationBySource) {
  const dayIds = [...new Set(sourceIds.flatMap((id) => migrationBySource.get(id)?.dayIds ?? []))].sort();
  if (dayIds.length === 1) return { _dayId: dayIds[0], _dayIds: { __op: 'delete' } };
  if (dayIds.length > 1) return { _dayIds: dayIds, _dayId: { __op: 'delete' } };
  return {};
}

async function main() {
  const [databaseAudit, collisionAudit] = await Promise.all([
    readFile(DATABASE_AUDIT, 'utf8').then(JSON.parse),
    readFile(COLLISION_AUDIT, 'utf8').then(JSON.parse),
  ]);
  const migrationBySource = new Map(databaseAudit.migration.map((item) => [item.fromId, item]));

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const collection = db.collection('parsedData');
  const sourceIds = [...new Set(collisionAudit.groups.flatMap((group) => group.variants.map((item) => item.id)))];
  const sourceSnapshots = await Promise.all(sourceIds.map((id) => collection.doc(id).get()));
  const documents = new Map(sourceSnapshots.filter((item) => item.exists)
    .map((item) => [item.id, { id: item.id, ...item.data() }]));
  const missingSources = sourceIds.filter((id) => !documents.has(id));
  if (missingSources.length) {
    throw new Error(`Preflight failed: ${missingSources.length} collision source document(s) are missing; regenerate both audits before retrying.`);
  }

  const operations = [];
  for (const group of collisionAudit.groups) {
    const semantic = group.variants.filter((item) => DISTINCT_VARIANTS.has(item.id));
    const duplicates = group.variants.filter((item) => !DISTINCT_VARIANTS.has(item.id));

    if (duplicates.length) {
      const winner = chooseWinner(duplicates);
      const migration = migrationBySource.get(winner.id);
      const changes = {
        ...(migration?.metadataChanges ?? {}),
        ...linkMetadata(duplicates.map((item) => item.id), migrationBySource),
      };
      operations.push({
        kind: 'deduplicate',
        targetId: group.targetId,
        winnerId: winner.id,
        sourceIds: duplicates.map((item) => item.id),
        data: applyMetadata(documents.get(winner.id), changes),
      });
    }

    for (const variant of semantic) {
      const definition = DISTINCT_VARIANTS.get(variant.id);
      const migration = migrationBySource.get(variant.id);
      operations.push({
        kind: 'preserve-variant',
        targetId: definition.targetId,
        winnerId: variant.id,
        sourceIds: [variant.id],
        data: applyMetadata(documents.get(variant.id), {
          ...(migration?.metadataChanges ?? {}),
          _variant: definition._variant,
          ...(definition._calendarDayOfWeek
            ? { _calendarDayOfWeek: definition._calendarDayOfWeek }
            : {}),
        }),
      });
    }
  }

  const targetSnapshots = await Promise.all(operations.map((item) => collection.doc(item.targetId).get()));
  const externalTargetConflicts = operations.filter((operation, index) => {
    const snapshot = targetSnapshots[index];
    return snapshot.exists && !operation.sourceIds.includes(snapshot.id);
  }).map((item) => item.targetId);
  const deletedSourceIds = [...new Set(operations.flatMap((item) => item.sourceIds)
    .filter((id) => !operations.some((operation) => operation.targetId === id)))];

  const report = {
    generatedAt: new Date().toISOString(),
    applyRequested: APPLY,
    counts: {
      groups: collisionAudit.groups.length,
      sourceDocuments: sourceIds.length,
      targetDocuments: operations.length,
      deduplicatedTargets: operations.filter((item) => item.kind === 'deduplicate').length,
      preservedVariantTargets: operations.filter((item) => item.kind === 'preserve-variant').length,
      sourceDocumentsDeletedAfterApply: deletedSourceIds.length,
      missingSources: missingSources.length,
      externalTargetConflicts: externalTargetConflicts.length,
      applied: 0,
    },
    missingSources,
    externalTargetConflicts,
    operations: operations.map(({ data, ...item }) => ({
      ...item,
      dayId: data._dayId ?? null,
      dayIds: data._dayIds ?? [],
      variant: data._variant ?? null,
    })),
  };

  if (APPLY) {
    if (missingSources.length || externalTargetConflicts.length) {
      throw new Error('Preflight failed; no writes were performed.');
    }
    const backupPath = path.resolve('reports', 'backups', `parsedData-before-collision-resolution-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: [...documents.values()],
    }, null, 2)}\n`, 'utf8');

    const batch = db.batch();
    for (const operation of operations) batch.set(collection.doc(operation.targetId), operation.data);
    for (const id of deletedSourceIds) batch.delete(collection.doc(id));
    await batch.commit();
    report.counts.applied = operations.length;
    report.backupPath = backupPath;
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
  if (!APPLY) console.log('Dry run only. Use --apply only after explicit review and approval.');
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData collision resolution failed:', error);
  process.exitCode = 1;
});
