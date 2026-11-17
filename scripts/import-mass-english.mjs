#!/usr/bin/env node

import { sourceForSave } from '../src/utils/prayerSource.mjs';
// Publishes the bundled English Order of Mass (MCFL.pdf) as the prayer document
// referenced by the Holy Mass ritual. Dry run by default; `--apply` creates the
// document only when it does not exist yet and never overwrites edits.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ritual = JSON.parse(await readFile(path.join(ROOT, 'src/data/mass/order-of-mass.ritual.json'), 'utf8'));
const variant = ritual.variants.find((item) => item.language === 'en');
const options = {
  output: path.join(ROOT, 'reports/mass-english-import-plan.json'),
  serviceAccount: path.join(ROOT, 'patchs/serviceAccountKey.json'),
  apply: false,
};
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--apply') options.apply = true;
  else if (['--output', '--service-account'].includes(arg)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[{ '--output': 'output', '--service-account': 'serviceAccount' }[arg]] = path.resolve(value);
  } else throw new Error(`Unknown option: ${arg}`);
}

async function main() {
  const text = (await readFile(path.join(ROOT, 'src/data/mass', variant.bundledText), 'utf8')).trim();
  const document = {
    title: variant.title,
    text,
    textFormat: 'mybrev-markdown',
    textFormatVersion: 1,
    tags: ['Святая Імша'],
    source: sourceForSave(variant.source),
  };
  const plan = { collection: 'prayers', documentId: variant.prayerId, policy: 'create-only-never-overwrite', document };
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ documentId: variant.prayerId, characters: text.length, output: options.output, apply: options.apply }));
  if (!options.apply) { console.log('Dry run only. No Firestore reads or writes.'); return; }

  const [{ default: admin }, credentials] = await Promise.all([import('firebase-admin'), readFile(options.serviceAccount, 'utf8')]);
  const serviceAccount = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    await admin.firestore(app).collection('prayers').doc(variant.prayerId).create({ ...document, createdAt: now, updatedAt: now });
    console.log(`Created prayers/${variant.prayerId}`);
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
    console.log(`prayers/${variant.prayerId} already exists; left unchanged.`);
  } finally { await app.delete(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
