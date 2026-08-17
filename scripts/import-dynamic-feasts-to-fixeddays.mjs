import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_DIR = resolve(ROOT, 'outputs', 'dynamic-feasts-final');
const REPORT_PATH = resolve(ROOT, 'outputs', 'dynamic-feasts-final-import-report.json');
const COLLECTION = 'fixedDays';
const WRITE = process.argv.includes('--write');
const OVERWRITE = process.argv.includes('--overwrite');

async function loadDocuments() {
  const filenames = (await readdir(INPUT_DIR))
    .filter((filename) => /^feast-.+\.json$/.test(filename))
    .sort();
  const documents = [];

  for (const filename of filenames) {
    const id = filename.replace(/\.json$/, '');
    const payload = JSON.parse(await readFile(resolve(INPUT_DIR, filename), 'utf8'));
    if (payload._feast !== id) {
      throw new Error(`${filename}: _feast must equal document ID ${id}`);
    }
    documents.push({ id, filename, payload });
  }

  if (documents.length !== 13) {
    throw new Error(`Expected 13 feast JSON files, found ${documents.length}`);
  }
  const schema = Object.keys(documents[0].payload);
  for (const document of documents) {
    const keys = Object.keys(document.payload);
    if (JSON.stringify(keys) !== JSON.stringify(schema)) {
      throw new Error(`${document.filename}: schema differs from the other documents`);
    }
  }
  return { documents, schema };
}

async function main() {
  const { documents, schema } = await loadDocuments();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const refs = documents.map(({ id }) => db.collection(COLLECTION).doc(id));
  const before = await db.getAll(...refs);
  const existingIds = before.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id);

  if (WRITE && existingIds.length && !OVERWRITE) {
    throw new Error(
      `Refusing to overwrite existing ${COLLECTION} documents: ${existingIds.join(', ')}. `
      + 'Re-run with --overwrite only after reviewing them.',
    );
  }

  if (WRITE) {
    const batch = db.batch();
    documents.forEach(({ id, payload }) => {
      batch.set(db.collection(COLLECTION).doc(id), payload, { merge: false });
    });
    await batch.commit();
  }

  const after = WRITE ? await db.getAll(...refs) : before;
  const verification = documents.map(({ id, payload }, index) => {
    const snapshot = after[index];
    const stored = snapshot.exists ? snapshot.data() : null;
    return {
      id,
      existsBefore: before[index].exists,
      existsAfter: snapshot.exists,
      matchesLocal: stored !== null && JSON.stringify(stored) === JSON.stringify(payload),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    mode: WRITE ? 'write' : 'dry-run',
    overwrite: OVERWRITE,
    documentCount: documents.length,
    fieldsPerDocument: schema.length,
    existingIdsBefore: existingIds,
    verification,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report }, null, 2));

  if (WRITE && verification.some((item) => !item.existsAfter || !item.matchesLocal)) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
