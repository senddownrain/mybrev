#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTION = 'prayers';
const DEFAULT_SNAPSHOT = path.join(ROOT, 'backups', 'firestore-snapshot-prayers');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'prayer-sources-migration-report.json');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');

function parseArgs(argv) {
  const options = {
    apply: false,
    snapshot: DEFAULT_SNAPSHOT,
    report: DEFAULT_REPORT,
    serviceAccount: DEFAULT_SERVICE_ACCOUNT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Move explicit source notes out of prayer text and into the source field.

Dry-run uses only a local Firestore snapshot. Firestore is contacted only with --apply.

Usage: node scripts/migrate-prayer-sources.mjs [options]

Options:
  --snapshot <dir>         Local snapshot containing the prayers collection
  --report <file>          JSON dry-run/apply report
  --apply                  Verify current documents and write planned changes
  --service-account <file> Firebase service account used only with --apply`);
}

function stripMarkdownWrapper(value) {
  let result = value.trim();
  for (const wrapper of ['**', '__', '_', '*']) {
    if (result.startsWith(wrapper) && result.endsWith(wrapper) && result.length > wrapper.length * 2) {
      result = result.slice(wrapper.length, -wrapper.length).trim();
      break;
    }
  }
  return result;
}

function parseSourceBlock(block) {
  const flattened = stripMarkdownWrapper(block.replace(/\r?\n/g, ' ').replace(/\s+/g, ' '));
  const match = /^(?:крыніц(?:а|ы)|источник(?:и)?|sources?|тэкст\s+паводле|текст\s+по|паводле|по\s+материалам|па\s+матэрыялах|узята\s+з|взято\s+из)\s*[:—–-]\s*(.+)$/iu.exec(flattened);
  if (!match) return null;
  return match[1].trim().replace(/[.\s]+$/u, '').trim();
}

export function extractPrayerSource(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) return { text: markdown, source: '', changed: false };
  const normalized = markdown.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/u);
  const candidates = blocks
    .map((block, index) => ({ index, source: parseSourceBlock(block) }))
    .filter(({ index, source }) => source && (index < 3 || index >= blocks.length - 3));
  if (candidates.length !== 1) return { text: markdown, source: '', changed: false };

  const [{ index, source }] = candidates;
  return {
    text: blocks.filter((_, blockIndex) => blockIndex !== index).join('\n\n').trim(),
    source,
    changed: true,
  };
}

export function extractPrayerTitleSource(title) {
  if (typeof title !== 'string' || !title.trim()) return { title, source: '', changed: false };
  const match = /^(.*?)\s+\(((?:св\.?|свят(?:ы|ая|ой)|складзен(?:ая|ы|ае)|составлен(?:а|о|ы|ная))[^()]*)\)\s*$/iu.exec(title);
  if (!match) return { title, source: '', changed: false };
  return { title: match[1].trim(), source: match[2].trim(), changed: true };
}

function getPath(object, fieldPath) {
  return fieldPath.split('.').reduce((value, key) => value?.[key], object);
}

function setPath(object, fieldPath, value) {
  const keys = fieldPath.split('.');
  let target = object;
  keys.slice(0, -1).forEach((key) => {
    target[key] ||= {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

function firestoreUpdates(updates) {
  const result = { source: updates.source };
  for (const versionField of ['textVersions', 'titleVersions']) {
    Object.entries(updates[versionField] || {}).forEach(([locale, value]) => {
      result[`${versionField}.${locale}`] = value;
    });
  }
  for (const plainField of ['text', 'title']) {
    if (typeof updates[plainField] === 'string') result[plainField] = updates[plainField];
  }
  return result;
}

function prayerContentFields(document) {
  return [
    ...(typeof document.text === 'string' ? ['text'] : []),
    ...Object.keys(document.textVersions || {}).map((locale) => `textVersions.${locale}`),
  ];
}

function prayerTitleFields(document) {
  return [
    ...(typeof document.title === 'string' ? ['title'] : []),
    ...Object.keys(document.titleVersions || {}).map((locale) => `titleVersions.${locale}`),
  ];
}

export function buildPrayerSourcePlan(documents) {
  const changes = [];
  const ambiguous = [];

  for (const document of documents) {
    const extractedText = prayerContentFields(document)
      .map((field) => ({ field, before: getPath(document, field) }))
      .map(({ field, before }) => ({ field, before, ...extractPrayerSource(before) }))
      .filter(({ changed }) => changed);
    const extractedTitles = prayerTitleFields(document)
      .map((field) => ({ field, before: getPath(document, field) }))
      .map(({ field, before }) => ({ field, before, ...extractPrayerTitleSource(before) }))
      .filter(({ changed }) => changed);
    const extracted = [
      ...extractedText.map((item) => ({ ...item, after: item.text })),
      ...extractedTitles.map((item) => ({ ...item, after: item.title })),
    ];
    if (!extracted.length) continue;

    const sources = [...new Set(extracted.map(({ source }) => source))];
    const existingSource = typeof document.source === 'string' ? document.source.trim() : '';
    if (sources.length !== 1 || (existingSource && existingSource !== sources[0])) {
      ambiguous.push({
        id: document.id,
        existingSource,
        extractedSources: sources,
        fields: extracted.map(({ field }) => field),
      });
      continue;
    }

    const updates = { source: existingSource || sources[0] };
    extracted.forEach(({ field, after }) => setPath(updates, field, after));
    changes.push({
      id: document.id,
      title: document.title || document.titleVersions?.be || document.titleVersions?.ru || '',
      expected: {
        source: document.source,
        ...Object.fromEntries(extracted.map(({ field, before }) => [field, before])),
      },
      updates,
    });
  }

  return { changes, ambiguous };
}

async function applyPlan(plan, serviceAccountPath) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(serviceAccountPath, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  const applied = [];
  try {
    const db = admin.firestore();
    for (const change of plan.changes) {
      const reference = db.collection(COLLECTION).doc(change.id);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error(`Prayer no longer exists: ${change.id}`);
        const current = snapshot.data();
        for (const [field, expected] of Object.entries(change.expected)) {
          if (getPath(current, field) !== expected) {
            throw new Error(`Prayer changed after snapshot: ${change.id} (${field})`);
          }
        }
        transaction.update(reference, {
          ...firestoreUpdates(change.updates),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      applied.push(change.id);
    }
    return applied;
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const documents = await snapshot.collection(COLLECTION);
  if (!documents) throw new Error(`Snapshot does not contain collection: ${COLLECTION}`);
  const plan = buildPrayerSourcePlan(documents);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    analysisSource: path.resolve(options.snapshot),
    snapshotVersion: snapshot.manifest.snapshotVersion,
    collection: COLLECTION,
    scannedDocuments: documents.length,
    plannedChanges: plan.changes.length,
    ambiguousDocuments: plan.ambiguous,
    changes: plan.changes,
  };
  if (options.apply) report.applied = await applyPlan(plan, options.serviceAccount);
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath: options.report,
    scannedDocuments: report.scannedDocuments,
    plannedChanges: report.plannedChanges,
    ambiguousDocuments: report.ambiguousDocuments.length,
    applied: report.applied?.length ?? 0,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
