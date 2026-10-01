#!/usr/bin/env node
// Latin Mass V4.1. Dry run by default; --apply requires the reviewed dry-run plan.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFirestoreValue } from './migrate-mass-content-v4.mjs';
import { diffLines } from './lib/mass-content-v4.mjs';
import {
  LATIN_MASS_FIELDS, LATIN_MASS_ID, LATIN_MASS_SERVICE_REPLACEMENTS,
  planLatinMassV41,
} from './lib/mass-content-v4-1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv, root = ROOT) {
  const options = {
    apply: false,
    snapshot: null,
    serviceAccount: path.join(root, 'patchs/serviceAccountKey.json'),
    backupDir: path.join(root, 'backups/mass-v4-1'),
    reportDir: path.join(root, 'reports/mass-v4-1'),
  };
  const names = { '--snapshot': 'snapshot', '--service-account': 'serviceAccount', '--backup-dir': 'backupDir', '--report-dir': 'reportDir' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (names[arg]) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[names[arg]] = path.resolve(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.apply && options.snapshot) throw new Error('--apply must read live Firestore.');
  return options;
}

async function createLiveSource(serviceAccountPath) {
  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(serviceAccountPath, 'utf8')]);
  const account = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(account), projectId: account.project_id }, 'mass-latin-v4-1');
  const reference = admin.firestore(app).doc(`prayers/${LATIN_MASS_ID}`);
  let lastUpdateTime;
  return {
    source: `firestore:${account.project_id}`,
    async get() {
      const snapshot = await reference.get();
      if (!snapshot.exists) return { exists: false };
      lastUpdateTime = snapshot.updateTime;
      return { exists: true, data: snapshot.data(), updateTime: snapshot.updateTime.toDate().toISOString() };
    },
    update: (fields) => reference.update(
      { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { lastUpdateTime },
    ),
    close: () => app.delete(),
  };
}

async function createSnapshotSource(directory) {
  const { openFirestoreSnapshot } = await import('./lib/firestore-snapshot.mjs');
  const snapshot = await openFirestoreSnapshot(directory);
  return {
    source: `snapshot:${directory}`,
    async get() {
      const document = await snapshot.document('prayers', LATIN_MASS_ID);
      if (!document) return { exists: false };
      const { id: _id, ...data } = document;
      return { exists: true, data, updateTime: null };
    },
    update() { throw new Error('Snapshot source is read-only.'); },
    close: async () => {},
  };
}

async function readPlan(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const stripTexts = ({ texts: _texts, ...document }) => document;

function renderReport({ plan, document, result }) {
  const lines = [
    '# Latin Mass V4.1 — Belarusian service text', '',
    `- Generated: ${plan.generatedAt}`,
    `- Mode: **${plan.mode}**${plan.mode === 'dry-run' ? ' (no Firestore writes)' : ''}`,
    `- Document: \`prayers/${LATIN_MASS_ID}\``,
    `- Status: ${result.status}`,
    `- updateTime at read: \`${document.updateTime}\``, '',
    '| Russian service phrase | Belarusian replacement | Occurrences per text field |',
    '|---|---|---:|',
  ];
  LATIN_MASS_SERVICE_REPLACEMENTS.forEach(([before, after]) => {
    lines.push(`| ${before} | ${after} | ${document.fields[0].counts[before]} |`);
  });
  lines.push('', '| Field | Change | SHA-256 before → after |', '|---|---|---|');
  document.fields.forEach((field) => {
    lines.push(`| \`${field.path}\` | ${field.changed ? 'yes' : 'no'} | \`${field.beforeSha256.slice(0, 12)}\` → \`${field.afterSha256.slice(0, 12)}\` |`);
  });
  const changed = document.fields.find((field) => field.changed);
  if (changed) {
    const { before, after } = document.texts[changed.path];
    lines.push('', `## Diff (${changed.path}; other fields have identical text)`, '', '```diff', diffLines(before, after), '```');
  }
  return `${lines.join('\n')}\n`;
}

function plannedWrite(current, previousPlan) {
  if (previousPlan?.schema !== 'mass-latin-rubrics-v4-1-plan/1'
      || previousPlan.mode !== 'dry-run'
      || !previousPlan.source?.startsWith('firestore:')
      || previousPlan.document?.id !== LATIN_MASS_ID) {
    throw new Error('No valid live dry-run plan found. Run and review a dry run first.');
  }
  const previous = previousPlan.document;
  if (previousPlan.source !== current.source) throw new Error('Dry-run project differs from live Firestore.');
  const samePaths = JSON.stringify(previous.fields.map((field) => field.path)) === JSON.stringify(LATIN_MASS_FIELDS)
    && JSON.stringify(current.document.fields.map((field) => field.path)) === JSON.stringify(LATIN_MASS_FIELDS);
  if (!samePaths) throw new Error('Latin Mass text fields differ from the reviewed plan.');
  const alreadyApplied = current.document.fields.every((field, index) => field.beforeSha256 === previous.fields[index].afterSha256);
  if (alreadyApplied) return { status: 'already-applied', fields: null };
  const untouched = current.document.updateTime === previous.updateTime
    && current.document.fields.every((field, index) => field.beforeSha256 === previous.fields[index].beforeSha256
      && field.afterSha256 === previous.fields[index].afterSha256);
  if (!untouched) throw new Error('Latin Mass changed since dry run. Nothing was written; review a fresh dry run.');
  const fields = Object.fromEntries(current.document.fields.filter((field) => field.changed)
    .map((field) => [field.path, current.document.texts[field.path].after]));
  return Object.keys(fields).length ? { status: 'updated', fields } : { status: 'unchanged', fields: null };
}

export async function run(argv, deps = {}) {
  const options = parseArgs(argv, deps.root || ROOT);
  const generatedAt = deps.now || new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const source = deps.source || (options.snapshot
    ? await createSnapshotSource(options.snapshot)
    : await createLiveSource(options.serviceAccount));
  const backupDirectory = path.join(options.backupDir, stamp);
  const planFile = path.join(options.reportDir, 'plan.json');
  try {
    const snapshot = await source.get();
    // Save the untouched full document before any planning or possible write.
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(path.join(backupDirectory, `${LATIN_MASS_ID}.json`), `${JSON.stringify({
      collection: 'prayers', id: LATIN_MASS_ID, source: source.source,
      readAt: generatedAt, exists: Boolean(snapshot?.exists), updateTime: snapshot?.updateTime || null,
      data: snapshot?.exists ? encodeFirestoreValue(snapshot.data) : null,
    }, null, 2)}\n`);
    const document = planLatinMassV41(snapshot);
    const current = { source: source.source, document };
    const plan = {
      schema: 'mass-latin-rubrics-v4-1-plan/1', generatedAt,
      mode: options.apply ? 'apply' : 'dry-run', source: source.source,
      backup: backupDirectory, document: stripTexts(document),
    };
    let result;
    if (options.apply) {
      const write = plannedWrite(current, await readPlan(planFile));
      if (write.fields) await source.update(write.fields);
      result = { status: write.status, fields: write.fields ? Object.keys(write.fields) : [] };
    } else result = { status: document.status === 'update' ? 'would-update' : 'unchanged', fields: [] };
    await mkdir(options.reportDir, { recursive: true });
    const report = renderReport({ plan, document, result });
    if (options.apply) {
      await writeFile(path.join(options.reportDir, `apply-${stamp}.json`), `${JSON.stringify({ ...plan, result }, null, 2)}\n`);
      await writeFile(path.join(options.reportDir, `apply-${stamp}.md`), report);
    } else {
      await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`);
      await writeFile(path.join(options.reportDir, 'report.md'), report);
      for (const [fieldPath, texts] of Object.entries(document.texts)) {
        const base = path.join(options.reportDir, `${LATIN_MASS_ID}.${fieldPath}`);
        await writeFile(`${base}.before.md`, texts.before);
        await writeFile(`${base}.after.md`, texts.after);
      }
    }
    (deps.log || console.log)(JSON.stringify({ mode: plan.mode, backup: backupDirectory, report: options.reportDir,
      writes: result.status === 'updated' ? 1 : 0, document: { id: LATIN_MASS_ID, ...result } }));
    return { plan, document, result };
  } finally { await source.close?.(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
