#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_PATH = path.join(ROOT, 'patchs', 'feasts', 'common-texts', 'office-for-dead.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const COLLECTION = 'fixedDays';
const DOCUMENT_ID = 'office-for-dead';
const APPLY = process.argv.includes('--apply');
const CREATE_ONLY = process.argv.includes('--create');
const UPDATE_ONLY = process.argv.includes('--update');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

const [source, serviceAccount] = await Promise.all([
  fs.readFile(SOURCE_PATH, 'utf8').then(JSON.parse),
  fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8').then(JSON.parse),
]);

const payload = {
  _id: DOCUMENT_ID,
  _kind: DOCUMENT_ID,
  _theme: 'requiem',
  _readingsFromDay: true,
  _feastName: 'Афіцый за памерлых',
  _title: 'Афіцый за памерлых',
  ...source,
};

const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
if (bytes >= 1_000_000) throw new Error(`Document exceeds Firestore limit: ${bytes} bytes`);

const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
try {
  const ref = admin.firestore().collection(COLLECTION).doc(DOCUMENT_ID);
  const before = CREATE_ONLY || UPDATE_ONLY ? null : await ref.get();
  if (before?.exists && before.data()?._kind !== DOCUMENT_ID) {
    throw new Error(`Refusing to overwrite unrelated ${COLLECTION}/${DOCUMENT_ID}`);
  }
  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    document: `${COLLECTION}/${DOCUMENT_ID}`,
    source: path.relative(ROOT, SOURCE_PATH),
    bytes,
    fields: Object.keys(payload).length,
    existed: before ? before.exists : 'not-read',
  };

  if (APPLY) {
    if (CREATE_ONLY) {
      await ref.create(payload);
      summary.verification = 'server-acknowledged-create';
    } else if (UPDATE_ONLY) {
      await ref.update(payload);
      summary.verification = 'server-acknowledged-update';
    } else {
      await ref.set(payload, { merge: false });
      const after = await ref.get();
      if (!after.exists || !equal(after.data(), payload)) {
        throw new Error('Post-write verification failed');
      }
      summary.verification = 'passed';
    }
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await app.delete();
}
