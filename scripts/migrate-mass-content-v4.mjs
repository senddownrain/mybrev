#!/usr/bin/env node
// Holy Mass V4: audits and migrates the three Mass prayer documents
// (prayers/eMmCtxwyJ75ogmL5rwye, prayers/zdro66KYVuQ9p2KbqizD,
// prayers/order-of-mass-en) to the unified structure.
//
//   node scripts/migrate-mass-content-v4.mjs            # dry run: reads, backup, report, zero writes
//   node scripts/migrate-mass-content-v4.mjs --apply    # writes what the last dry run planned
//
// Options:
//   --snapshot <dir>          plan from a local Firestore snapshot instead of live reads (dry run only)
//   --service-account <file>  default patchs/serviceAccountKey.json (never printed or copied)
//   --backup-dir <dir>        default backups/mass-v4
//   --report-dir <dir>        default reports/mass-v4
//
// `--apply` updates only those documents and only their displayed text fields
// (plus `updatedAt`), refuses to run without a dry-run plan, skips documents
// that already have the planned text and aborts before the first write when a
// document changed since the dry run. Rules: docs/holy-mass.md.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASS_V4_COLLECTION, renderMassMigrationReport, runMassMigration } from './lib/mass-content-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv, root = ROOT) {
  const options = {
    apply: false,
    snapshot: null,
    serviceAccount: path.join(root, 'patchs/serviceAccountKey.json'),
    backupDir: path.join(root, 'backups/mass-v4'),
    reportDir: path.join(root, 'reports/mass-v4'),
  };
  const names = { '--snapshot': 'snapshot', '--service-account': 'serviceAccount', '--backup-dir': 'backupDir', '--report-dir': 'reportDir' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (names[arg]) {
      const value = argv[index += 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[names[arg]] = path.resolve(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.apply && options.snapshot) throw new Error('--apply always reads live Firestore; do not combine it with --snapshot.');
  return options;
}

/** JSON-safe copy of Firestore data (timestamps, references, bytes). */
export function encodeFirestoreValue(value) {
  if (Array.isArray(value)) return value.map(encodeFirestoreValue);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' && ('seconds' in value || '_seconds' in value)) {
    return { __firestoreType: 'timestamp', seconds: value.seconds ?? value._seconds, nanoseconds: value.nanoseconds ?? value._nanoseconds };
  }
  if (value instanceof Date) return { __firestoreType: 'date', iso: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __firestoreType: 'bytes', base64: value.toString('base64') };
  if (typeof value.path === 'string' && typeof value.firestore === 'object') return { __firestoreType: 'reference', path: value.path };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item)]));
}

async function createAdminFirestore(serviceAccountPath) {
  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(serviceAccountPath, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, 'mass-content-v4');
  const collection = admin.firestore(app).collection(MASS_V4_COLLECTION);
  const updateTimes = new Map();
  return {
    source: `firestore:${serviceAccount.project_id}`,
    async get(id) {
      const snapshot = await collection.doc(id).get();
      if (!snapshot.exists) return { exists: false };
      updateTimes.set(id, snapshot.updateTime);
      return { exists: true, data: snapshot.data(), updateTime: snapshot.updateTime.toDate().toISOString() };
    },
    // The precondition makes Firestore itself reject a concurrent edit.
    update: (id, fields) => collection.doc(id).update(
      { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { lastUpdateTime: updateTimes.get(id) },
    ),
    close: () => app.delete(),
  };
}

async function createSnapshotFirestore(snapshotDirectory) {
  const { openFirestoreSnapshot } = await import('./lib/firestore-snapshot.mjs');
  const snapshot = await openFirestoreSnapshot(snapshotDirectory);
  return {
    source: `snapshot:${snapshotDirectory}`,
    async get(id) {
      const document = await snapshot.document(MASS_V4_COLLECTION, id);
      if (!document) return { exists: false };
      const { id: _id, ...data } = document;
      return { exists: true, data, updateTime: null };
    },
    update() { throw new Error('A snapshot source is read-only.'); },
    close: async () => {},
  };
}

const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

export async function run(argv, deps = {}) {
  const options = parseArgs(argv, deps.root || ROOT);
  const log = deps.log || ((line) => console.log(line));
  const generatedAt = deps.now || new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const planFile = path.join(options.reportDir, 'plan.json');
  const firestore = deps.firestore
    || (options.snapshot ? await createSnapshotFirestore(options.snapshot) : await createAdminFirestore(options.serviceAccount));

  try {
    const backupDirectory = path.join(options.backupDir, stamp);
    const outcome = await runMassMigration({
      firestore,
      apply: options.apply,
      previousPlan: options.apply ? await readJson(planFile) : null,
      generatedAt,
      async backup(documents) {
        await mkdir(backupDirectory, { recursive: true });
        for (const document of documents) {
          const payload = {
            collection: MASS_V4_COLLECTION,
            id: document.id,
            source: firestore.source || 'firestore',
            readAt: generatedAt,
            exists: document.exists,
            updateTime: document.updateTime,
            data: document.exists ? encodeFirestoreValue(document.data) : null,
          };
          await writeFile(path.join(backupDirectory, `${document.id}.json`), `${JSON.stringify(payload, null, 2)}\n`);
        }
      },
    });

    await mkdir(options.reportDir, { recursive: true });
    const report = renderMassMigrationReport(outcome);
    if (options.apply) {
      await writeFile(path.join(options.reportDir, `apply-${stamp}.json`), `${JSON.stringify({ ...outcome.plan, results: outcome.results }, null, 2)}\n`);
      await writeFile(path.join(options.reportDir, `apply-${stamp}.md`), report);
    } else {
      await writeFile(planFile, `${JSON.stringify({ ...outcome.plan, source: firestore.source || 'firestore', backup: backupDirectory }, null, 2)}\n`);
      await writeFile(path.join(options.reportDir, 'report.md'), report);
      // Full before/after texts for review, tests and a local rendering check.
      for (const document of outcome.documents) {
        for (const [fieldPath, texts] of Object.entries(document.texts)) {
          const base = path.join(options.reportDir, `${document.id}.${fieldPath}`);
          await writeFile(`${base}.before.md`, texts.before);
          await writeFile(`${base}.after.md`, texts.after);
        }
      }
    }

    log(JSON.stringify({
      mode: outcome.plan.mode,
      backup: backupDirectory,
      report: options.reportDir,
      writes: outcome.writes.length,
      documents: outcome.results,
    }));
    if (!options.apply) log('Dry run only: no Firestore writes. Review reports/mass-v4/report.md, then re-run with --apply.');
    return outcome;
  } finally {
    await firestore.close?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
