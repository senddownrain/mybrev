#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const AUDIT_PATH = path.resolve('reports/parsed-readings-database-audit.json');
const REPORT_PATH = path.resolve('reports/parsed-data-identity-migration-report.json');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function applyChangesToObject(source, changes) {
  const result = structuredClone(source);
  for (const [field, value] of Object.entries(changes)) {
    if (value && typeof value === 'object' && value.__op === 'delete') delete result[field];
    else result[field] = value;
  }
  return result;
}

function firestoreUpdates(changes) {
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [
    field,
    value && typeof value === 'object' && value.__op === 'delete'
      ? admin.firestore.FieldValue.delete()
      : value,
  ]));
}

async function main() {
  const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));
  const collisionIds = new Set(audit.idCollisions.flatMap((collision) => collision.sourceIds));
  const candidates = audit.migration.filter((item) =>
    item.toId && !collisionIds.has(item.fromId),
  );

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const collection = db.collection('parsedData');
  const sourceSnapshots = await Promise.all(candidates.map((item) => collection.doc(item.fromId).get()));
  const sourceById = new Map(sourceSnapshots.filter((item) => item.exists).map((item) => [item.id, item.data()]));
  const missingSources = candidates.filter((item) => !sourceById.has(item.fromId)).map((item) => item.fromId);

  const moves = candidates.filter((item) => item.fromId !== item.toId);
  const uniqueTargetIds = [...new Set(moves.map((item) => item.toId))];
  const targetSnapshots = await Promise.all(uniqueTargetIds.map((id) => collection.doc(id).get()));
  const existingTargets = targetSnapshots.filter((item) => item.exists).map((item) => item.id);
  const blockedTargets = new Set(existingTargets);

  const operations = candidates
    .filter((item) => sourceById.has(item.fromId))
    .map((item) => ({
      ...item,
      kind: item.fromId === item.toId ? 'metadata-only' : 'move',
      blocked: item.fromId !== item.toId && blockedTargets.has(item.toId),
    }));
  const executable = operations.filter((item) => !item.blocked);

  const report = {
    generatedAt: new Date().toISOString(),
    auditGeneratedAt: audit.generatedAt,
    mode: APPLY ? 'apply' : 'dry-run',
    stats: {
      auditDocuments: audit.counts.parsedDocuments,
      mappedMigrationCandidates: audit.migration.length,
      skippedCollisionDocuments: [...collisionIds].length,
      plannedOperations: operations.length,
      plannedMoves: operations.filter((item) => item.kind === 'move').length,
      plannedMetadataOnly: operations.filter((item) => item.kind === 'metadata-only').length,
      missingSources: missingSources.length,
      existingTargetConflicts: existingTargets.length,
      appliedOperations: 0,
    },
    missingSources,
    existingTargets,
    operations,
  };

  if (APPLY) {
    if (missingSources.length || existingTargets.length) {
      throw new Error('Preflight failed: missing sources or existing target IDs. Nothing was written.');
    }
    const backupPath = path.resolve('reports', 'backups', `parsedData-before-identity-migration-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: executable.map((item) => ({ id: item.fromId, data: sourceById.get(item.fromId) })),
    }, null, 2)}\n`, 'utf8');
    report.backupPath = backupPath;

    for (let offset = 0; offset < executable.length; offset += 200) {
      const batch = db.batch();
      const chunk = executable.slice(offset, offset + 200);
      for (const operation of chunk) {
        const sourceRef = collection.doc(operation.fromId);
        if (operation.kind === 'metadata-only') {
          batch.update(sourceRef, firestoreUpdates(operation.metadataChanges));
          continue;
        }
        const targetRef = collection.doc(operation.toId);
        batch.create(targetRef, applyChangesToObject(sourceById.get(operation.fromId), operation.metadataChanges));
        batch.delete(sourceRef);
      }
      await batch.commit();
      report.stats.appliedOperations += chunk.length;
    }
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.stats, null, 2));
  console.log(`Wrote ${REPORT_PATH}`);
  if (!APPLY) console.log('Dry run only. Collisions and ambiguous/unmapped documents were skipped.');
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData identity migration failed:', error);
  process.exitCode = 1;
});

