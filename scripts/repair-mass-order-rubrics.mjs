#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import {
  PRAYER_TEXT_FORMAT,
  PRAYER_TEXT_FORMAT_VERSION,
  htmlToPrayerMarkdown,
  validatePrayerMarkdown,
} from '../src/utils/prayerMarkdown.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const MASS_ORDER_IDS = new Set(['eMmCtxwyJ75ogmL5rwye', 'zdro66KYVuQ9p2KbqizD']);
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

async function findOriginalBackup() {
  const names = (await readdir(REPORT_DIR))
    .filter((name) => name.endsWith('-backup.json'))
    .sort()
    .reverse();

  for (const name of names) {
    const contents = JSON.parse(await readFile(path.join(REPORT_DIR, name), 'utf8'));
    if (contents.some((item) => MASS_ORDER_IDS.has(item.id) && /<em\b/i.test(item.text || item.textVersions?.be || ''))) {
      return { name, contents };
    }
  }
  throw new Error('No pre-migration HTML backup found for the Mass orders.');
}

function convertDocument(original) {
  const patch = {
    textFormat: PRAYER_TEXT_FORMAT,
    textFormatVersion: PRAYER_TEXT_FORMAT_VERSION,
  };
  const errors = [];

  if (typeof original.text === 'string') {
    patch.text = htmlToPrayerMarkdown(original.text, { emphasisAsRubric: true });
    errors.push(...validatePrayerMarkdown(patch.text).map((error) => ({ field: 'text', ...error })));
  }
  if (original.textVersions && typeof original.textVersions === 'object') {
    patch.textVersions = Object.fromEntries(Object.entries(original.textVersions).map(([locale, value]) => {
      const converted = typeof value === 'string'
        ? htmlToPrayerMarkdown(value, { emphasisAsRubric: true })
        : value;
      if (typeof converted === 'string') {
        errors.push(...validatePrayerMarkdown(converted).map((error) => ({ field: `textVersions.${locale}`, ...error })));
      }
      return [locale, converted];
    }));
  }

  const values = [patch.text, ...Object.values(patch.textVersions || {})].filter((value) => typeof value === 'string');
  return {
    patch,
    errors,
    rubricBlocks: values.reduce((sum, value) => sum + (value.match(/^:::rubric$/gm) || []).length, 0),
  };
}

async function main() {
  const source = await findOriginalBackup();
  const originals = source.contents.filter((item) => MASS_ORDER_IDS.has(item.id));
  const converted = originals.map((original) => ({ id: original.id, title: original.title || original.titleVersions?.be || '', ...convertDocument(original) }));
  const errors = converted.flatMap((item) => item.errors.map((error) => ({ id: item.id, ...error })));
  if (errors.length) throw new Error(`Repair cancelled: ${errors.length} Markdown validation errors.`);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const current = [];
  for (const item of converted) {
    const snapshot = await db.collection('prayers').doc(item.id).get();
    if (!snapshot.exists) throw new Error(`Prayer ${item.id} no longer exists.`);
    current.push({ id: snapshot.id, ...serialize(snapshot.data()) });
  }

  const runId = timestamp();
  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    sourceBackup: source.name,
    documents: converted.map(({ id, title, rubricBlocks }) => ({ id, title, rubricBlocks })),
  };
  await writeFile(path.join(REPORT_DIR, `${runId}-mass-rubrics-report.json`), `${JSON.stringify(report, null, 2)}\n`);

  if (APPLY) {
    await writeFile(path.join(REPORT_DIR, `${runId}-mass-rubrics-backup.json`), `${JSON.stringify(current, null, 2)}\n`);
    const batch = db.batch();
    converted.forEach(({ id, patch }) => batch.update(db.collection('prayers').doc(id), {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    await batch.commit();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
