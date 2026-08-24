#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import {
  READING_SECTIONS,
  hasReadingDocumentContent,
  readingSelector,
} from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const OUTPUT = path.resolve('reports/prune-empty-parsed-data-report.json');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function compact(document) {
  return {
    id: document.id,
    title: document.title ?? null,
    selector: readingSelector(document),
    rank: document._rank ?? null,
    place: document._place ?? null,
    bibleReferences: Object.fromEntries(READING_SECTIONS
      .map((section) => [section, String(document?.[section]?.bible ?? '').trim()])
      .filter(([, bible]) => bible)),
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const collection = db.collection('parsedData');
  const snapshot = await collection.get();
  const documents = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const empty = documents.filter((document) => !hasReadingDocumentContent(document));

  const report = {
    generatedAt: new Date().toISOString(),
    applyRequested: APPLY,
    counts: {
      scanned: documents.length,
      usable: documents.length - empty.length,
      emptyPlaceholders: empty.length,
      deleted: 0,
    },
    documents: empty.map(compact),
  };

  if (APPLY && empty.length) {
    const backupPath = path.resolve('reports', 'backups', `parsedData-empty-placeholders-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: empty,
    }, null, 2)}\n`, 'utf8');
    const batch = db.batch();
    for (const document of empty) batch.delete(collection.doc(document.id));
    await batch.commit();
    report.counts.deleted = empty.length;
    report.backupPath = backupPath;
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
  if (!APPLY) console.log('Dry run only. Empty documents remain in Firestore.');
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData empty-placeholder pruning failed:', error);
  process.exitCode = 1;
});
