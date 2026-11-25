import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { catalogError } from '../src/utils/accessSetsV2Policy.mjs';
import { copyFirestore, wireJson } from './lib/access-sets-v2-copy-firestore.mjs';
import { captureCopyState, makeCopyBackup, planAccessSetsCopy, summarizeAccessSetsCopy } from './lib/access-sets-v2-copy-plan.mjs';
import { runAccessSetsCopy } from './lib/access-sets-v2-copy-run.mjs';

const fail = (code) => { throw catalogError(code); };
const backupDir = fileURLToPath(new URL('../backups/', import.meta.url));
const databasePattern = /^projects\/([^/]+)\/databases\/([^/]+)$/;

async function privateSnapshot(file, creating) {
  const target = resolve(file);
  if (dirname(target) !== resolve(backupDir) || !/^[a-z0-9-]+\.json$/i.test(target.split(/[\\/]/).at(-1))) fail('copy-snapshot-must-be-private');
  if (creating) await mkdir(backupDir, { recursive: true, mode: 0o700 });
  if (await realpath(backupDir) !== resolve(backupDir)) fail('copy-snapshot-must-be-private');
  if (!creating && await realpath(target) !== target) fail('copy-snapshot-must-be-private');
  return target;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      snapshot: { type: 'string' },
      project: { type: 'string' },
      database: { type: 'string' },
      'approve-digest': { type: 'string' },
      'production-approval': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const [action = 'plan'] = positionals;
  if (values.help) {
    console.log('Usage: npm run db:access-sets-v2-copy -- [plan|backup|apply|verify|restore] --snapshot backups/NAME.json');
    console.log('Remote actions also require --project PROJECT and --database DATABASE. Apply and restore require --approve-digest PLAN_SHA256.');
    return;
  }
  if (positionals.length > 1 || !['plan', 'backup', 'apply', 'verify', 'restore'].includes(action)
    || !values.snapshot) fail('invalid-copy-arguments');
  const online = action !== 'plan';
  const { FIRESTORE_EMULATOR_HOST: emulator } = process.env;
  const file = await privateSnapshot(values.snapshot, action === 'backup');
  const backup = action === 'backup' ? null : JSON.parse(await readFile(file, 'utf8'));
  const match = backup && databasePattern.exec(backup.data?.database);
  if (backup && !match) fail('invalid-copy-backup');
  const projectId = online ? values.project : match[1];
  const databaseId = online ? values.database : match[2];
  if (!projectId || !databaseId) fail('copy-explicit-target-required');
  const database = 'projects/' + projectId + '/databases/' + databaseId;
  if (backup && backup.data.database !== database) fail('copy-target-mismatch');
  if (online && emulator && values['production-approval']) fail('copy-emulator-with-production-approval');

  // Admin references are constructed for S4 hashing only. All I/O is scoped
  // by the Firestore adapter. This matches Firestore Node SDK reference decoding.
  const app = backup && initializeApp({ projectId }, 'access-sets-s5-copy');
  let store;
  try {
    const db = app && getFirestore(app, databaseId);
    const plan = backup && planAccessSetsCopy(backup, (name) => {
      const match = /^projects\/[^/]+\/databases\/[^/]+\/documents\/(.+)$/.exec(name);
      if (!match) fail('invalid-wire-reference');
      return db.doc(match[1]);
    });
    if (!online) {
      console.log(JSON.stringify(summarizeAccessSetsCopy(plan), null, 2));
      return;
    }

    const approvedDigest = values['approve-digest'];
    if (['apply', 'restore'].includes(action) && approvedDigest !== plan.planDigest) fail('copy-plan-approval-required');
    if (!emulator) {
      const approvalFile = values['production-approval'];
      if (!approvalFile) fail('copy-production-approval-required');
      const approval = JSON.parse(await readFile(approvalFile, 'utf8'));
      if (approval.action !== action || approval.database !== database || approval.planDigest !== (plan?.planDigest ?? null)
        || typeof approval.change !== 'string' || !approval.change.trim()
        || typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) fail('copy-production-approval-mismatch');
      // The file records the separate owner decision. ADC/IAM provide actual authorization.
    }
    store = copyFirestore({ projectId, databaseId, emulator, productionAuthorized: !emulator });
    if (action === 'backup') {
      const snapshot = makeCopyBackup(await captureCopyState(store));
      await writeFile(file, wireJson(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ database, backupDigest: snapshot.sha256,
        counts: Object.fromEntries(Object.entries(snapshot.data.collections).map(([path, docs]) => [path, docs.length])) }, null, 2));
      return;
    }
    console.log(JSON.stringify(await runAccessSetsCopy(store, plan, { action, approvedDigest }), null, 2));
  } finally {
    await store?.close();
    if (app) await deleteApp(app);
  }
}

main().catch((error) => {
  // SDK and RPC messages can include protected paths or document data.
  const code = error?.message === error?.code && /^[a-z0-9-]+$/.test(error.code) ? error.code : 'copy-command-failed';
  console.error(typeof error?.code === 'number' ? 'firestore-grpc-' + error.code : code);
  process.exitCode = 1;
});
