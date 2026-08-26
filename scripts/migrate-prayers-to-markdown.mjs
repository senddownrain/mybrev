#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import {
  PRAYER_TEXT_FORMAT,
  PRAYER_TEXT_FORMAT_VERSION,
  toPrayerMarkdown,
  validatePrayerMarkdown,
} from '../src/utils/prayerMarkdown.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const REPORT_DIR = path.resolve('reports/prayer-markdown-migration');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item && typeof item.toDate === 'function') return item.toDate().toISOString();
    return item;
  }));
}

function convertText(value, format) {
  return typeof value === 'string' ? toPrayerMarkdown(value, format) : value;
}

function collectValidationErrors(value, field) {
  const lines = String(value).split('\n');
  return validatePrayerMarkdown(value).map((error) => ({
    field,
    ...error,
    context: lines.slice(Math.max(0, error.line - 3), error.line + 2).join('\n'),
  }));
}

function buildPatch(data) {
  const patch = {};
  const fields = [];
  const validationErrors = [];

  if (typeof data.text === 'string') {
    const converted = convertText(data.text, data.textFormat);
    if (converted !== data.text) {
      patch.text = converted;
      fields.push('text');
    }
    validationErrors.push(...collectValidationErrors(converted, 'text'));
  }

  if (data.textVersions && typeof data.textVersions === 'object') {
    const convertedVersions = {};
    let changed = false;
    Object.entries(data.textVersions).forEach(([locale, value]) => {
      const converted = convertText(value, data.textFormat);
      convertedVersions[locale] = converted;
      if (converted !== value) changed = true;
      if (typeof converted === 'string') {
        validationErrors.push(...collectValidationErrors(converted, `textVersions.${locale}`));
      }
    });
    if (changed) {
      patch.textVersions = convertedVersions;
      fields.push('textVersions');
    }
  }

  if (data.textFormat !== PRAYER_TEXT_FORMAT) {
    patch.textFormat = PRAYER_TEXT_FORMAT;
    fields.push('textFormat');
  }
  if (data.textFormatVersion !== PRAYER_TEXT_FORMAT_VERSION) {
    patch.textFormatVersion = PRAYER_TEXT_FORMAT_VERSION;
    fields.push('textFormatVersion');
  }

  return { patch, fields, validationErrors };
}

async function commitInBatches(db, changes) {
  for (let index = 0; index < changes.length; index += 400) {
    const batch = db.batch();
    changes.slice(index, index + 400).forEach(({ ref, patch }) => {
      batch.update(ref, { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const snapshot = await db.collection('prayers').get();
  const backup = snapshot.docs.map((document) => ({ id: document.id, ...serialize(document.data()) }));
  const changes = [];
  const reportRows = [];

  snapshot.docs.forEach((document) => {
    const data = document.data();
    const result = buildPatch(data);
    if (!result.fields.length) return;
    changes.push({ ref: document.ref, patch: result.patch });
    reportRows.push({
      id: document.id,
      title: data.title || data.titleVersions?.be || data.titleVersions?.ru || '',
      fields: result.fields,
      validationErrors: result.validationErrors,
    });
  });

  await mkdir(REPORT_DIR, { recursive: true });
  const runId = timestamp();
  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    totalDocuments: snapshot.size,
    changedDocuments: changes.length,
    documentsWithValidationErrors: reportRows.filter((row) => row.validationErrors.length).length,
    documents: reportRows,
  };
  await writeFile(path.join(REPORT_DIR, `${runId}-report.json`), `${JSON.stringify(report, null, 2)}\n`);

  if (APPLY) {
    await writeFile(path.join(REPORT_DIR, `${runId}-backup.json`), `${JSON.stringify(backup, null, 2)}\n`);
    if (report.documentsWithValidationErrors) {
      throw new Error('Migration cancelled: invalid rubric blocks found. Review the report first.');
    }
    await commitInBatches(db, changes);
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
