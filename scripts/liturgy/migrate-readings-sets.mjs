#!/usr/bin/env node
/**
 * Final readings phase: structured Mass reading sets (`massReadings`) from the
 * checked-in Catholic.by fixtures, with the flat legacy fields re-projected.
 *
 *   node scripts/liturgy/migrate-readings-sets.mjs                 # dry run on backups/firestore-snapshot
 *   node scripts/liturgy/migrate-readings-sets.mjs --snapshot <dir>
 *   node scripts/liturgy/migrate-readings-sets.mjs --projected <dir> # also write a snapshot copy with the plan applied (audits)
 *   node scripts/liturgy/migrate-readings-sets.mjs --apply         # live Firestore: backup, then write the planned documents
 *
 * A dry run never touches Firestore. `--apply` reads the live documents,
 * backs them up (backups/readings-sets/<stamp>/), refuses to run without a
 * dry-run plan (reports/liturgy/readings-sets/plan.json), aborts when a live
 * document differs from the one the plan was built on, and writes with an
 * update-time precondition. After an apply: `npm run content:manifest`
 * (docs/app-content-distribution.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LECTIONARY_PAGES } from './lib/lectionary-pages.mjs';
import { buildReadingsSetsMigration } from './lib/readings-sets-plan.mjs';
import { canonicalJson } from '../content/lib/app-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'catholicby');
const REPORT_DIR = path.join(ROOT, 'reports', 'liturgy', 'readings-sets');

export function loadFixturePages(dir = FIXTURES) {
  return Object.fromEntries(LECTIONARY_PAGES
    .filter((page) => fs.existsSync(path.join(dir, `${page.key}.html`)))
    .map((page) => [page.key, fs.readFileSync(path.join(dir, `${page.key}.html`), 'utf8')]));
}

const hashOf = (data) => (data ? createHash('sha256').update(canonicalJson(data)).digest('hex').slice(0, 16) : null);
// Firestore timestamps from the snapshot do not round-trip: compare content only.
const comparable = (data) => (data ? Object.fromEntries(Object.entries(data).filter(([key]) => !['updatedAt', 'parsedAt'].includes(key))) : null);

function parseArgs(argv) {
  const options = { apply: false, snapshot: path.join(ROOT, 'backups', 'firestore-snapshot'), projected: null, serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json') };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--snapshot') options.snapshot = path.resolve(argv[index += 1]);
    else if (arg === '--projected') options.projected = path.resolve(argv[index += 1]);
    else if (arg === '--service-account') options.serviceAccount = path.resolve(argv[index += 1]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function snapshotDocs(dir) {
  const { openFirestoreSnapshot } = await import('../lib/firestore-snapshot.mjs');
  const snapshot = await openFirestoreSnapshot(dir);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, snapshot.manifest.collections.readings.file), 'utf8'));
  return { docs: new Map(raw.documents.map((item) => [item.id, item.data])), label: `snapshot ${snapshot.manifest.exportedAt}`, raw, manifest: snapshot.manifest };
}

function renderPlan(plan) {
  const lines = [`# Readings: Mass reading sets — migration plan`, '', `Source: ${plan.source}. Generated ${plan.generatedAt}. Dry run: no Firestore writes.`, ''];
  lines.push('| Document | Action | Role | Changed fields | Citations after |', '|---|---|---|---|---|');
  for (const change of plan.changes) {
    lines.push(`| \`${change.id}\` | ${change.action} | ${change.role} | ${change.changedFields.join(', ')} | ${Object.values(change.citationsAfter).join('; ') || '—'} |`);
  }
  if (plan.warnings.length) lines.push('', '## Warnings', '', ...plan.warnings.map((item) => `- ${item}`));
  return `${lines.join('\n')}\n`;
}

async function applyPlan(plan, options) {
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(fs.readFileSync(options.serviceAccount, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, 'readings-sets');
  const collection = admin.firestore(app).collection('readings');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(ROOT, 'backups', 'readings-sets', stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  try {
    const live = [];
    for (const change of plan.changes) {
      const snapshot = await collection.doc(change.id).get();
      const data = snapshot.exists ? snapshot.data() : null;
      fs.writeFileSync(path.join(backupDir, `${change.id}.json`), `${JSON.stringify({ id: change.id, exists: snapshot.exists, data }, null, 1)}\n`);
      if (hashOf(comparable(JSON.parse(JSON.stringify(data)))) !== change.beforeHash) {
        throw new Error(`${change.id} changed since the dry run; run the dry run again on a fresh snapshot.`);
      }
      live.push({ change, snapshot });
    }
    for (const { change, snapshot } of live) {
      const data = { ...change.after, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (snapshot.exists) await collection.doc(change.id).set(data, { lastUpdateTime: snapshot.updateTime }).catch(async () => {
        // `set` has no precondition option in every SDK version: fall back to a transaction.
        await admin.firestore(app).runTransaction(async (tx) => {
          const fresh = await tx.get(collection.doc(change.id));
          if (!fresh.updateTime.isEqual(snapshot.updateTime)) throw new Error(`${change.id} changed during the apply`);
          tx.set(collection.doc(change.id), data);
        });
      });
      else await collection.doc(change.id).create(data);
      console.log(`written ${change.id}`);
    }
  } finally {
    await app.delete();
  }
  console.log(`Backup: ${backupDir}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const planFile = path.join(REPORT_DIR, 'plan.json');
  if (options.apply) {
    if (!fs.existsSync(planFile)) throw new Error('No dry-run plan: run without --apply first.');
    await applyPlan(JSON.parse(fs.readFileSync(planFile, 'utf8')), options);
    return;
  }
  const source = await snapshotDocs(options.snapshot);
  const migration = buildReadingsSetsMigration({ docs: source.docs, pages: loadFixturePages() });
  const plan = {
    generatedAt: new Date().toISOString(),
    source: source.label,
    changes: migration.changes.map((change) => ({ ...change, beforeHash: hashOf(comparable(change.before)) })),
    warnings: migration.warnings,
  };
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 1)}\n`);
  fs.writeFileSync(path.join(REPORT_DIR, 'plan.md'), renderPlan(plan));
  fs.writeFileSync(path.join(ROOT, 'reports', 'liturgy', 'readings-parser-coverage.json'), `${JSON.stringify({ generatedAt: plan.generatedAt, pages: migration.pages, celebrations: migration.coverage }, null, 1)}\n`);
  if (options.projected) {
    // A copy of the snapshot with the plan applied (read-only audits of the result).
    fs.mkdirSync(options.projected, { recursive: true });
    const byId = new Map(source.raw.documents.map((item) => [item.id, item]));
    migration.changes.forEach((change) => byId.set(change.id, { id: change.id, data: change.after }));
    const payload = JSON.stringify({ ...source.raw, documents: [...byId.values()] });
    const file = 'readings-projected.json';
    fs.writeFileSync(path.join(options.projected, file), payload);
    for (const [name, descriptor] of Object.entries(source.manifest.collections)) {
      if (name !== 'readings') fs.copyFileSync(path.join(options.snapshot, descriptor.file), path.join(options.projected, descriptor.file));
    }
    const manifest = { ...source.manifest, collections: { ...source.manifest.collections, readings: { file, documentCount: byId.size, bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex') } } };
    fs.writeFileSync(path.join(options.projected, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  }
  const counts = migration.changes.reduce((acc, change) => ({ ...acc, [change.action]: (acc[change.action] || 0) + 1 }), {});
  console.log(JSON.stringify({ source: source.label, ...counts, warnings: migration.warnings.length, plan: path.relative(ROOT, planFile) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
