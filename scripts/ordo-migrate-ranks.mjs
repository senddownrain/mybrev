#!/usr/bin/env node
/**
 * Align stored `_rank` of `days`/`readings` with the corrected Ordo layers and
 * retire obsolete `days` documents. Dry run by default.
 *
 *   node scripts/ordo-migrate-ranks.mjs                       # plan → reports/ordo-migration-plan.json
 *   node scripts/ordo-migrate-ranks.mjs --source <dir>        # snapshot or public cache directory
 *   node scripts/ordo-migrate-ranks.mjs --allow-delete        # plan deletes instead of `_obsolete` marks
 *   node scripts/ordo-migrate-ranks.mjs --apply --confirm ordo-migrate-ranks \
 *       [--service-account patchs/serviceAccountKey.json]     # write (precondition-checked)
 *
 * Only `writes` of the plan are applied; `reviews` are never written. Every
 * write re-reads the live document in a transaction and is skipped when its
 * `precondition` no longer matches. Deletes exist only with --allow-delete.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRankMigrationPlan, indexEvidence } from './lib/ordo-data-followups.mjs';
import { defaultSourceDirectory, loadAnalysisSource, loadEvidenceFiles } from './lib/ordo-analysis-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIRM_TOKEN = 'ordo-migrate-ranks';

export function parseArgs(argv, root = ROOT) {
  const options = {
    source: null,
    output: path.join(root, 'reports/ordo-migration-plan.json'),
    serviceAccount: path.join(root, 'patchs/serviceAccountKey.json'),
    apply: false,
    allowDelete: false,
    confirm: '',
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--apply') options.apply = true;
    else if (arg === '--allow-delete') options.allowDelete = true;
    else if (arg === '--source') options.source = path.resolve(value());
    else if (arg === '--output') options.output = path.resolve(value());
    else if (arg === '--service-account') options.serviceAccount = path.resolve(value());
    else if (arg === '--confirm') options.confirm = value();
    else throw new Error(`Unknown option: ${arg}`);
  }
  options.source = options.source || defaultSourceDirectory(root);
  return options;
}

/** firebase-admin adapter: precondition-checked writes in one transaction each. */
async function createAdminFirestore(serviceAccountPath, expectedProjectId) {
  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(serviceAccountPath, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
    throw new Error(`Service account project ${serviceAccount.project_id} does not match the analysis source ${expectedProjectId}.`);
  }
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, 'ordo-migrate-ranks');
  const db = admin.firestore(app);
  return {
    projectId: serviceAccount.project_id,
    async runPreconditioned(collection, id, precondition, operation) {
      const ref = db.collection(collection).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return 'missing';
        const data = snap.data();
        const drifted = Object.entries(precondition || {}).some(([field, expected]) => (data[field] ?? null) !== expected);
        if (drifted) return 'drifted';
        if (operation.type === 'delete') tx.delete(ref);
        else tx.update(ref, { ...operation.set, _ordoMigration: CONFIRM_TOKEN, _ordoMigratedAt: admin.firestore.FieldValue.serverTimestamp() });
        return operation.type === 'delete' ? 'deleted' : 'updated';
      });
    },
    close: () => app.delete(),
  };
}

/** Apply the `writes` of a plan through a Firestore adapter. */
export async function applyPlan(plan, firestore, { allowDelete = false } = {}) {
  const results = [];
  for (const item of plan.writes) {
    if (item.action === 'delete' && !allowDelete) {
      results.push({ collection: item.collection, documentId: item.documentId, status: 'skipped-delete-not-allowed' });
      continue;
    }
    const operation = item.action === 'delete' ? { type: 'delete' } : { type: 'update', set: item.set };
    const status = await firestore.runPreconditioned(item.collection, item.documentId, item.precondition, operation);
    results.push({ collection: item.collection, documentId: item.documentId, action: item.action, status });
  }
  const counts = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
  return { counts, results };
}

export async function run(argv, deps = {}) {
  const root = deps.root || ROOT;
  const options = parseArgs(argv, root);
  const log = deps.log || ((line) => console.log(line));
  const { days, readings, source } = await (deps.loadSource || loadAnalysisSource)(options.source);
  const evidenceIndex = indexEvidence((deps.loadEvidence || loadEvidenceFiles)(root));
  const plan = buildRankMigrationPlan({ days, readings, evidenceIndex, allowDelete: options.allowDelete, source });
  const write = deps.writeFile || writeFile;
  await (deps.mkdir || mkdir)(path.dirname(options.output), { recursive: true });
  await write(options.output, `${JSON.stringify(plan, null, 2)}\n`);
  log(JSON.stringify({ output: options.output, ...plan.summary, apply: options.apply }));
  if (!options.apply) {
    log('Dry run only: no Firestore reads or writes. Review the plan, then re-run with --apply --confirm ordo-migrate-ranks.');
    return { plan, applied: null };
  }
  if (options.confirm !== CONFIRM_TOKEN) throw new Error(`--apply requires --confirm ${CONFIRM_TOKEN}`);
  const firestore = await (deps.createFirestore || createAdminFirestore)(options.serviceAccount, source.projectId);
  try {
    const applied = await applyPlan(plan, firestore, { allowDelete: options.allowDelete });
    await write(options.output.replace(/\.json$/, '-result.json'), `${JSON.stringify({ projectId: firestore.projectId, ...applied }, null, 2)}\n`);
    log(JSON.stringify(applied.counts));
    return { plan, applied };
  } finally {
    await firestore.close?.();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
