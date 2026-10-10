#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

export async function priestMigrationPlan(snapshotDirs) {
  const collections = new Map();
  for (const directory of snapshotDirs) {
    const snapshot = await openFirestoreSnapshot(directory);
    for (const name of ['prayers', 'prayerCategories']) {
      if (collections.has(name)) continue;
      const entries = await snapshot.collectionEntries(name);
      if (entries !== null) collections.set(name, entries);
    }
  }
  return {
    analysisSource: 'local-firestore-snapshot',
    missingCollections: ['prayers', 'prayerCategories'].filter((n) => !collections.has(n)),
    updates: [...collections].flatMap(([collection, docs]) => docs.filter((d) => d.data.priestOnly === undefined).map((d) => ({ collection, id: d.id, priestOnly: false }))),
    settings: { path: 'priestAccess/settings', defaults: { schemaVersion: 1, helpText: '' } },
    registry: ['priestDeviceGrants', 'priestInstallations', 'priestActivationAttempts'],
  };
}
async function main() {
  const args = process.argv.slice(2);
  const snapshots = [];
  let apply = false;
  let serviceAccount = 'patchs/serviceAccountKey.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--snapshot') snapshots.push(args[++i]);
    else if (args[i] === '--apply') apply = true;
    else if (args[i] === '--service-account') serviceAccount = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const plan = await priestMigrationPlan(snapshots.length ? snapshots : ['backups/firestore-snapshot']);
  await mkdir('reports/priest-access', { recursive: true });
  await writeFile('reports/priest-access/migration.json', JSON.stringify(plan, null, 2));
  console.log(`Local plan: ${plan.updates.length} missing flags; uncovered: ${plan.missingCollections.join(', ') || 'none'}. No credentials or prayer texts in report.`);
  if (!apply) return;
  if (plan.missingCollections.length) throw new Error('Apply refused: both prayer collections must be covered by local snapshots. No live reads performed.');
  const { default: admin } = await import('firebase-admin');
  const account = JSON.parse(await readFile(serviceAccount, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(account), projectId: account.project_id }, 'priest-migration');
  try {
    const db = admin.firestore(app);
    let changed = 0;
    // Transactional precondition: do not overwrite edits since snapshot.
    for (const update of plan.updates) {
      const applied = await db.runTransaction(async (tx) => {
        const ref = db.doc(`${update.collection}/${update.id}`);
        const current = await tx.get(ref);
        if (current.exists && current.data().priestOnly === undefined) { tx.update(ref, { priestOnly: false }); return true; }
        return false;
      });
      if (applied) changed++;
    }
    await db.runTransaction(async (tx) => {
      const ref = db.doc(plan.settings.path);
      if (!(await tx.get(ref)).exists) tx.create(ref, plan.settings.defaults);
    });
    console.log(`Applied ${changed} defaults. Registry is created lazily on activation. Existing flags, grants and code are preserved.`);
    console.log('Next: npm run content:manifest, then -- --apply only for SAFE CONTENT PATCH; a mass change requires content:app-release.');
  } finally { await app.delete(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
