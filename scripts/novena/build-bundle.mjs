#!/usr/bin/env node
/**
 * Offline `novenaDefinitions` bundle in the app bundle format, from local
 * prayers only:
 *
 *   npm run novena:bundle -- --prayers <source> --out <dir>          empty (production in V1)
 *   npm run novena:bundle -- --prayers <source> --out <dir> --dev    every ready definition,
 *                                                                    marked published, for tests
 *
 * The published definitions, into the app's own content directory (only this
 * collection and its manifest entry change; no other collection is read):
 *
 *   npm run novena:bundle -- --published --service-account <file> --project <id> --merge <app>/assets/content
 *
 * A --dev bundle must never be shipped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { generateDrafts, readPublicPrayers } from './lib.mjs';
import { publicPrayerRows } from '../../src/utils/publicPrayerCatalog.mjs';
import { writeBundle } from '../content/build-app-bundle.mjs';
import { storedDocument } from '../content/lib/app-content.mjs';
import { NOVENA_COLLECTION, pickDefinition, publicNovenaRows } from '../../src/utils/novena/document.mjs';

export function devRows(prayers) {
  const rows = generateDrafts(prayers).drafts.filter((draft) => !draft.blockers.length)
    .map((draft) => storedDocument(draft.novenaId, { ...pickDefinition(draft), status: 'published', trackerEnabled: true }));
  const result = publicNovenaRows(rows, prayers);
  if (result.excluded.length) throw new Error(`Ready definitions failed the export filter: ${result.excluded.map((item) => item.id).join(', ')}`);
  return result.rows;
}

/** Replaces one collection of an app content directory with [built]. */
export function mergeIntoContent(built, content) {
  const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const target = read(content);
  const source = read(built);
  const entry = source.collections[NOVENA_COLLECTION];
  fs.copyFileSync(path.join(built, entry.file), path.join(content, entry.file));
  target.collections[NOVENA_COLLECTION] = entry;
  if (entry.contentVersion > target.contentVersion) {
    target.contentVersion = entry.contentVersion;
    target.contentDate = entry.contentDate;
  }
  fs.writeFileSync(path.join(content, 'manifest.json'), `${JSON.stringify(target, null, 2)}\n`);
  return entry;
}

/** Published definitions from Firestore, filtered like the app export. */
async function readPublished(account, project) {
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(fs.readFileSync(account, 'utf8'));
  if (serviceAccount.project_id !== project) throw new Error('--project does not match the service account.');
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: project }, 'novena-bundle');
  try {
    const db = admin.firestore(app);
    db.settings({ preferRest: true });
    const [definitions, categories] = await Promise.all([NOVENA_COLLECTION, 'prayerCategories'].map((name) => db.collection(name).get()));
    const rows = definitions.docs.map((doc) => storedDocument(doc.id, doc.data())).sort((a, b) => (a.id < b.id ? -1 : 1));
    const ids = [...new Set(rows.flatMap((row) => [row.sourcePrayerId,
      ...[...row.template, ...row.days.flatMap((day) => day.blocks)].map((block) => block.prayerId).filter(Boolean)]))];
    const found = await db.getAll(...ids.map((id) => db.collection('prayers').doc(id)));
    const { prayers } = publicPrayerRows({
      prayers: found.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id })),
      categories: categories.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      protectedPrayers: [], protectedCategories: [],
    });
    const result = publicNovenaRows(rows, prayers);
    console.log(`read ${definitions.size} definitions, ${found.length} prayers, ${categories.size} categories`);
    result.excluded.forEach((item) => console.warn(`left out ${item.id}: ${item.errors.join(', ')}`));
    return result.rows;
  } finally {
    await app.delete();
  }
}

async function publishedMain(argv, value) {
  const merge = value('--merge');
  if (!value('--service-account') || !value('--project') || !merge) {
    throw new Error('Usage: build-bundle.mjs --published --service-account <file> --project <id> --merge <assets/content>');
  }
  const rows = await readPublished(value('--service-account'), value('--project'));
  if (!rows.length) throw new Error('No published definitions: the bundle was not written.');
  const version = Date.now();
  const built = fs.mkdtempSync(path.join(os.tmpdir(), 'novena-bundle-'));
  try {
    writeBundle(new Map([[NOVENA_COLLECTION, rows]]), new Map([[NOVENA_COLLECTION, version]]), version, built, { project: (collections) => collections });
    const entry = mergeIntoContent(built, merge);
    console.log(`${NOVENA_COLLECTION}: ${entry.count} definitions, digest ${entry.digest} → ${merge}`);
  } finally {
    fs.rmSync(built, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  if (argv.includes('--published')) return publishedMain(argv, value);
  const source = value('--prayers');
  const out = value('--out');
  if (!source || !out) throw new Error('Usage: build-bundle.mjs --prayers <source> --out <dir> [--dev]');
  const { prayers, version } = await readPublicPrayers(source);
  if (!version) throw new Error('The prayer source carries no content version (use a bundle or snapshot directory).');
  const rows = argv.includes('--dev') ? devRows(prayers) : [];
  // `devRows` already applied the export filter against these prayers.
  writeBundle(new Map([[NOVENA_COLLECTION, rows]]), new Map([[NOVENA_COLLECTION, version]]), version, out, { project: (collections) => collections });
  console.log(`${NOVENA_COLLECTION}: ${rows.length} definitions → ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
