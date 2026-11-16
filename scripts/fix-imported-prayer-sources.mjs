#!/usr/bin/env node

import { sourceForSave } from '../src/utils/prayerSource.mjs';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildImportPlan,
  extractEmbeddedSource,
  SOURCES,
} from './import-prayer-markdown-collection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const DEFAULT_ARCHIVE = path.join(DOWNLOADS, 'malitvy_md_collection_full.zip');
const DEFAULT_MARIAN_SOURCE = path.join(DOWNLOADS, 'malitvy_ajcou_maryjanau.md');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'imported-prayer-sources-fix-report.json');
const COLLECTION = 'prayers';
const MARIAN_FILE = 'malitvy_ajcou_maryjanau.md';

function importedPrayerId(fileName) {
  return `import-${fileName.replace(/\.md$/, '').replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase();
}

export function legacyImportSources() {
  return new Map([
    ...SOURCES.map(([fileName]) => [importedPrayerId(fileName), fileName]),
    [importedPrayerId(MARIAN_FILE), MARIAN_FILE],
  ]);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    archive: DEFAULT_ARCHIVE,
    marianSource: DEFAULT_MARIAN_SOURCE,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
    report: DEFAULT_REPORT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--archive') options.archive = path.resolve(argv[++index]);
    else if (argument === '--marian-source') options.marianSource = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Replace imported Markdown filenames with embedded prayer source URLs.

Dry-run reads only the original local import files. Firestore is contacted only with --apply.

Usage: node scripts/fix-imported-prayer-sources.mjs [options]

Options:
  --archive <zip>          Original prayer collection ZIP
  --marian-source <file>   Separate Marian Fathers Markdown file
  --report <file>          JSON dry-run/apply report
  --apply                  Validate and update the 25 imported documents
  --service-account <file> Firebase service account used only with --apply`);
}

export function buildImportedSourceFixPlan(prayers) {
  const legacySources = legacyImportSources();
  return prayers.map((prayer) => ({
    id: prayer.id,
    title: prayer.title,
    legacySource: legacySources.get(prayer.id),
    source: prayer.source,
    text: prayer.text,
  }));
}

async function applyPlan(plan, serviceAccountPath) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(serviceAccountPath, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  const result = { applied: [], alreadyCorrect: [] };
  try {
    const db = admin.firestore();
    for (const change of plan) {
      const reference = db.collection(COLLECTION).doc(change.id);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error(`Imported prayer does not exist: ${change.id}`);
        const current = snapshot.data();
        const extracted = extractEmbeddedSource(current.text || '');
        if ((current.source || '') === change.source && !extracted.source) {
          result.alreadyCorrect.push(change.id);
          return;
        }
        if (current.source !== change.legacySource) {
          throw new Error(`Unexpected current source for ${change.id}: ${current.source ?? '<missing>'}`);
        }
        if (change.source && sourceForSave(extracted.source) !== change.source) {
          throw new Error(`Embedded source no longer matches the local import: ${change.id}`);
        }
        const updates = {
          source: sourceForSave(change.source) || admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (extracted.source) updates.text = extracted.text;
        transaction.update(reference, updates);
        result.applied.push(change.id);
      });
    }
    return result;
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const prayers = await buildImportPlan(options);
  const changes = buildImportedSourceFixPlan(prayers);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    analysisSource: 'original-local-import-files',
    collection: COLLECTION,
    scannedDocuments: changes.length,
    sourcesFound: changes.filter(({ source }) => source).length,
    sourcesMissing: changes.filter(({ source }) => !source).map(({ id }) => id),
    changes: changes.map(({ id, title, legacySource, source }) => ({ id, title, legacySource, source })),
  };
  if (options.apply) Object.assign(report, await applyPlan(changes, options.serviceAccount));
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath: options.report,
    scannedDocuments: report.scannedDocuments,
    sourcesFound: report.sourcesFound,
    sourcesMissing: report.sourcesMissing.length,
    applied: report.applied?.length ?? 0,
    alreadyCorrect: report.alreadyCorrect?.length ?? 0,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
