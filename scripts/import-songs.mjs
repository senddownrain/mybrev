#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { prepareSongs } from './lib/song-import.mjs';
import { TAGS_LIST } from '../src/constants/songTags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { input: path.join(ROOT, 'src/data/songs.json'), snapshot: path.join(ROOT, 'backups/firestore-snapshot'), output: path.join(ROOT, 'reports/songs-import-plan.json'), serviceAccount: path.join(ROOT, 'patchs/serviceAccountKey.json'), apply: false, syncCategories: false };
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--apply') options.apply = true;
  else if (arg === '--sync-categories') options.syncCategories = true;
  else if (['--input', '--snapshot', '--output', '--service-account'].includes(arg)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[{ '--input': 'input', '--snapshot': 'snapshot', '--output': 'output', '--service-account': 'serviceAccount' }[arg]] = path.resolve(value);
  } else throw new Error(`Unknown option: ${arg}`);
}

async function main() {
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const songs = prepareSongs(JSON.parse(await readFile(options.input, 'utf8')));
  const categories = options.syncCategories ? TAGS_LIST.filter((category) => songs.some((song) => song.tag.includes(category.id))) : [];
  const existing = await snapshot.collection('songs');
  const ids = new Set((existing || []).map((song) => song.id));
  const plan = { analysisSource: 'local-firestore-snapshot-and-supplied-song-export', snapshotVersion: snapshot.manifest.snapshotVersion, projectId: snapshot.manifest.projectId, targetCollection: 'songs', targetCoveredBySnapshot: existing !== null, policy: options.syncCategories ? 'create-missing-and-update-only-tag-and-source-on-existing' : 'create-only-never-overwrite', categories: categories.map((category) => ({ collection: 'songCategories', documentId: String(category.id), ...category })), songs: songs.map((song) => ({ ...song, action: ids.has(song.id) ? options.syncCategories ? 'update-tag-and-source' : 'skip-existing' : existing === null ? options.syncCategories ? 'create-if-missing-otherwise-update-tag-and-source' : 'create-if-missing' : 'create' })) };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ songs: songs.length, categories: plan.categories.length, categorizedSongs: songs.filter((song) => song.tag.length).length, targetCoveredBySnapshot: plan.targetCoveredBySnapshot, output: options.output, apply: options.apply }));
  if (!options.apply) { console.log('Dry run only. No live Firestore reads or writes.'); return; }
  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(options.serviceAccount, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  if (serviceAccount.project_id !== snapshot.manifest.projectId) throw new Error('Service account project does not match the snapshot project.');
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
  let created = 0;
  let skipped = 0;
  let updated = 0;
  try {
    if (options.syncCategories) {
      const batch = admin.firestore(app).batch();
      categories.forEach((category) => batch.set(admin.firestore(app).collection('songCategories').doc(String(category.id)), { ...category, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
      await batch.commit();
    }
    for (const { id, ...song } of songs) {
      try {
        await admin.firestore(app).collection('songs').doc(id).create({ ...song, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        created++;
      } catch (error) {
        if (error.code !== 6 && error.code !== 'already-exists') throw error;
        if (options.syncCategories) {
          await admin.firestore(app).collection('songs').doc(id).update({ tag: song.tag, source: song.source, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          updated++;
        } else skipped++;
      }
    }
    const result = { projectId: snapshot.manifest.projectId, created, updated, skipped, categories: plan.categories.length };
    await writeFile(options.output.replace(/\.json$/, '-result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await app.delete(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
