#!/usr/bin/env node
// Plan (default) or apply the Compendium Firestore import.
//
//   node scripts/import-compendium.mjs            # dry run: local plan only, no Firestore access
//   node scripts/import-compendium.mjs --apply    # final write phase (run separately, after review)
//
// Layout: `compendium/{unitId}` (~27 chapter-like documents, ordered question
// arrays) + `compendiumMeta/current` written LAST, so clients only see a new
// contentVersion after all units exist. See docs/compendium.md.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { validateCompendiumDataset } from '../src/utils/compendiumData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  input: path.join(ROOT, 'src/data/compendium/compendium.json'),
  snapshot: path.join(ROOT, 'backups/firestore-snapshot'),
  output: path.join(ROOT, 'reports/compendium-import-plan.json'),
  serviceAccount: path.join(ROOT, 'patchs/serviceAccountKey.json'),
  apply: false,
  prune: false,
};
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--apply') options.apply = true;
  else if (arg === '--prune') options.prune = true;
  else if (['--input', '--snapshot', '--output', '--service-account'].includes(arg)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[{ '--input': 'input', '--snapshot': 'snapshot', '--output': 'output', '--service-account': 'serviceAccount' }[arg]] = path.resolve(value);
  } else throw new Error(`Unknown option: ${arg}`);
}

const COLLECTION = 'compendium';
const META_COLLECTION = 'compendiumMeta';
const META_DOCUMENT = 'current';
const MAX_DOCUMENT_BYTES = 900 * 1024; // Firestore limit is 1 MiB per document.

/** Firestore documents derived from the canonical dataset. */
export function compendiumDocuments(dataset) {
  const units = dataset.units.map((unit) => ({ id: unit.id, data: unit }));
  const meta = { ...dataset.meta, parts: dataset.parts };
  return { units, meta };
}

async function openSnapshot() {
  try { return await openFirestoreSnapshot(options.snapshot); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function main() {
  const dataset = JSON.parse(await readFile(options.input, 'utf8'));
  const errors = validateCompendiumDataset(dataset);
  if (errors.length) throw new Error(`Dataset is invalid:\n- ${errors.join('\n- ')}`);
  const { units, meta } = compendiumDocuments(dataset);
  for (const unit of units) {
    const bytes = Buffer.byteLength(JSON.stringify(unit.data));
    if (bytes > MAX_DOCUMENT_BYTES) throw new Error(`${unit.id} is too large for one Firestore document (${bytes} bytes).`);
  }

  const snapshot = await openSnapshot();
  const existingUnits = snapshot ? await snapshot.collection(COLLECTION) : null;
  const existingMeta = snapshot ? await snapshot.document(META_COLLECTION, META_DOCUMENT) : null;
  const existingIds = new Set((existingUnits || []).map((unit) => unit.id));
  const stale = (existingUnits || []).map((unit) => unit.id).filter((id) => !meta.unitIds.includes(id));
  const plan = {
    analysisSource: snapshot ? 'local-firestore-snapshot' : 'no-local-snapshot',
    snapshotVersion: snapshot?.manifest.snapshotVersion ?? null,
    projectId: snapshot?.manifest.projectId ?? null,
    targetCoveredBySnapshot: existingUnits !== null,
    currentRemoteContentVersion: existingMeta?.contentVersion ?? null,
    contentVersion: meta.contentVersion,
    checksum: meta.checksum,
    questionCount: meta.questionCount,
    policy: 'overwrite-units-then-meta; stale units deleted only with --prune',
    units: units.map((unit) => ({
      collection: COLLECTION,
      documentId: unit.id,
      questions: unit.data.questions.length,
      range: `${unit.data.firstQuestion}-${unit.data.lastQuestion}`,
      bytes: Buffer.byteLength(JSON.stringify(unit.data)),
      action: existingUnits === null ? 'set' : existingIds.has(unit.id) ? 'overwrite' : 'create',
    })),
    meta: { collection: META_COLLECTION, documentId: META_DOCUMENT, action: 'set-last' },
    staleUnits: stale.map((id) => ({ collection: COLLECTION, documentId: id, action: options.prune ? 'delete' : 'keep' })),
  };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ units: units.length, questions: meta.questionCount, contentVersion: meta.contentVersion, targetCoveredBySnapshot: plan.targetCoveredBySnapshot, output: options.output, apply: options.apply }));
  if (!options.apply) { console.log('Dry run only. No live Firestore reads or writes.'); return; }

  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(options.serviceAccount, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  if (snapshot && serviceAccount.project_id !== snapshot.manifest.projectId) throw new Error('Service account project does not match the snapshot project.');
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
  try {
    const firestore = admin.firestore(app);
    const batch = firestore.batch();
    const importedAt = admin.firestore.FieldValue.serverTimestamp();
    units.forEach((unit) => batch.set(firestore.collection(COLLECTION).doc(unit.id), { ...unit.data, importedAt }));
    if (options.prune) stale.forEach((id) => batch.delete(firestore.collection(COLLECTION).doc(id)));
    await batch.commit();
    await firestore.collection(META_COLLECTION).doc(META_DOCUMENT).set({ ...meta, importedAt });
    const result = { projectId: serviceAccount.project_id, written: units.length, pruned: options.prune ? stale.length : 0, contentVersion: meta.contentVersion };
    await writeFile(options.output.replace(/\.json$/, '-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } finally { await app.delete(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
