#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import {
  READING_SECTIONS,
  removeDuplicatedBiblePrefix,
  removeTrailingParserStub,
} from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const REPORT_PATH = path.resolve('reports/normalize-parsed-data-fields-report.json');
const SCALAR_FIELDS = Object.freeze({
  reading1: ['text'],
  reading2: ['text'],
  psalm: ['text', 'chorus', 'altChorus'],
  alleluia: ['verse'],
  gospel: ['text'],
});

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function preview(value) {
  if (value === null || value === undefined) return value;
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function cleanScalar(sectionName, section, field, value) {
  let result = removeTrailingParserStub(value);
  if (field === (sectionName === 'alleluia' ? 'verse' : 'text')) {
    result = removeDuplicatedBiblePrefix(result, section.bible);
  }
  return result;
}

function buildPatch(data) {
  const updates = {};
  const changes = [];

  for (const sectionName of READING_SECTIONS) {
    const section = data[sectionName];
    if (!section || typeof section !== 'object') continue;

    for (const field of SCALAR_FIELDS[sectionName]) {
      if (typeof section[field] !== 'string') continue;
      const cleaned = cleanScalar(sectionName, section, field, section[field]);
      if (same(cleaned, section[field])) continue;
      const fieldPath = `${sectionName}.${field}`;
      updates[fieldPath] = cleaned;
      changes.push({
        field: fieldPath,
        kind: cleaned === null
          ? 'remove-stub-value'
          : String(section[field]).trim().startsWith(String(section.bible ?? '').trim()) && section.bible
            ? 'remove-bible-prefix-or-stub'
            : 'remove-trailing-stub',
        beforeLength: section[field].length,
        afterLength: cleaned?.length ?? 0,
        before: preview(section[field]),
        after: preview(cleaned),
      });
    }

    if (Array.isArray(section.verses)) {
      const cleanedVerses = section.verses
        .map(removeTrailingParserStub)
        .filter((value) => value !== null && value !== undefined && String(value).trim());
      if (!same(cleanedVerses, section.verses)) {
        const fieldPath = `${sectionName}.verses`;
        updates[fieldPath] = cleanedVerses;
        changes.push({
          field: fieldPath,
          kind: 'remove-stub-verses',
          beforeLength: section.verses.length,
          afterLength: cleanedVerses.length,
          before: preview(section.verses),
          after: preview(cleanedVerses),
        });
      }
    }
  }

  return { updates, changes };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const snapshot = await db.collection('parsedData').get();
  const affected = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    const { updates, changes } = buildPatch(data);
    if (!changes.length) continue;
    affected.push({ id: document.id, data, updates, changes });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    stats: {
      scannedDocuments: snapshot.size,
      affectedDocuments: affected.length,
      fieldChanges: affected.reduce((sum, item) => sum + item.changes.length, 0),
      changesByKind: Object.fromEntries([...new Set(affected.flatMap((item) => item.changes.map((change) => change.kind)))]
        .map((kind) => [kind, affected.flatMap((item) => item.changes).filter((change) => change.kind === kind).length])),
      updatedDocuments: 0,
    },
    documents: affected.map(({ id, changes }) => ({ id, changes })),
  };

  if (APPLY && affected.length) {
    const backupPath = path.resolve('reports', 'backups', `parsedData-before-field-normalization-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: affected.map(({ id, data }) => ({ id, data })),
    }, null, 2)}\n`, 'utf8');
    report.backupPath = backupPath;

    for (let offset = 0; offset < affected.length; offset += 400) {
      const batch = db.batch();
      const chunk = affected.slice(offset, offset + 400);
      for (const item of chunk) batch.update(db.collection('parsedData').doc(item.id), item.updates);
      await batch.commit();
      report.stats.updatedDocuments += chunk.length;
    }
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.stats, null, 2));
  console.log(`Wrote ${REPORT_PATH}`);
  if (!APPLY) console.log('Dry run only. Pass --apply after reviewing the report.');
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData field normalization failed:', error);
  process.exitCode = 1;
});
