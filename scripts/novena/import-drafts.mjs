#!/usr/bin/env node
/**
 * Generates novena drafts from local public prayers and imports them into
 * `novenaDrafts`. Never writes `novenaDefinitions`: publication is a decision
 * made in the admin panel.
 *
 *   npm run novena:import -- --prayers <json | assets/content | snapshot dir>
 *       dry-run, no Firestore; --existing <json array of drafts> to compare
 *   … --apply --service-account <file> --project <id>
 *       reads only the planned draft documents, writes create/update in one
 *       transaction and keeps the previous versions in reports/novena/.
 *
 * Manually edited drafts are never overwritten unless named with
 * --overwrite-manual <id> (repeatable).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { countPlan, generateDrafts, planImport, readPublicPrayers } from './lib.mjs';
import { NOVENA_DRAFTS_COLLECTION } from '../../src/utils/novena/document.mjs';

export function parseArgs(argv) {
  const options = { prayers: null, existing: null, apply: false, serviceAccount: null, project: null, overwriteManual: [] };
  const value = { '--prayers': 'prayers', '--existing': 'existing', '--service-account': 'serviceAccount', '--project': 'project' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--overwrite-manual') options.overwriteManual.push(argv[++index]);
    else if (Object.hasOwn(value, arg)) options[value[arg]] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.prayers) throw new Error('Pass --prayers <local source>.');
  if (options.apply && options.existing) throw new Error('--apply compares with Firestore only (no --existing).');
  if (options.apply && !(options.serviceAccount && options.project)) throw new Error('--apply needs --service-account and --project.');
  return options;
}

/** Re-plans inside the transaction, so a concurrent edit stays protected. */
export async function applyImport(db, drafts, { overwriteManual = [], backup = () => {} } = {}) {
  return db.runTransaction(async (transaction) => {
    const refs = drafts.map((draft) => db.collection(NOVENA_DRAFTS_COLLECTION).doc(draft.novenaId));
    const snapshots = await transaction.getAll(...refs);
    const existing = new Map(snapshots.filter((item) => item.exists).map((item) => [item.id, item.data()]));
    const plan = planImport(drafts, existing, { overwriteManual });
    const writes = plan.filter((item) => item.data);
    if (writes.length) backup(writes.map((item) => ({ id: item.id, previous: item.previous || null })));
    writes.forEach((item) => transaction.set(db.collection(NOVENA_DRAFTS_COLLECTION).doc(item.id), {
      ...item.data, updatedAt: new Date(), updatedBy: 'novena-import',
    }));
    return plan;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { prayers, version } = await readPublicPrayers(options.prayers);
  const { sources, excluded, drafts } = generateDrafts(prayers);
  const ready = drafts.filter((draft) => !draft.blockers.length).length;
  console.log(`public prayers ${prayers.size}${version ? `, contentVersion ${version}` : ''}`);
  console.log(`novenas ${sources}: ready ${ready}, blocked ${drafts.length - ready}, excluded ${excluded.length}`);

  let plan;
  if (options.apply) {
    const [{ default: admin }] = await Promise.all([import('firebase-admin')]);
    const serviceAccount = JSON.parse(fs.readFileSync(options.serviceAccount, 'utf8'));
    if (serviceAccount.project_id !== options.project) throw new Error('--project does not match the service account.');
    const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: options.project }, 'novena-import');
    try {
      const db = admin.firestore(app);
      db.settings({ preferRest: true });
      const backup = (items) => {
        const file = path.join('reports', 'novena', `rollback-${Date.now()}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ project: options.project, collection: NOVENA_DRAFTS_COLLECTION, items }, null, 1)}\n`);
        console.log(`previous versions: ${file}`);
      };
      plan = await applyImport(db, drafts, { overwriteManual: options.overwriteManual, backup });
    } finally {
      await app.delete();
    }
  } else {
    const rows = options.existing ? JSON.parse(fs.readFileSync(options.existing, 'utf8')) : [];
    plan = planImport(drafts, new Map(rows.map((row) => [row.novenaId, row])), options);
  }
  const counts = countPlan(plan);
  console.log(`${options.apply ? 'APPLIED' : 'DRY-RUN'}: create ${counts.create}, update ${counts.update}, no-op ${counts.noop}, protected ${counts.protected}`);
  plan.filter((item) => item.action === 'protected').forEach((item) => console.log(`  protected (edited by hand): ${item.id}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
