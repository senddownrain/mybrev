#!/usr/bin/env node
/**
 * Uploads the Russian Synodal Bible to Firestore collection `bible_ru`.
 *
 * Source: scripts/bible/bible_seed_ru.json.gz (run convert-ru-synodal.py first)
 * Data model: one document per book → bible_ru/{bookId}
 *   { id, name, order, chapterCount, chapters: {"1": [str, ...], "2": [...]} }
 *
 * Dry-run by default. Pass --apply to write. Pass --force to overwrite existing.
 *
 * Usage:
 *   node scripts/bible/upload-bible-ru-firestore.mjs
 *   node scripts/bible/upload-bible-ru-firestore.mjs --apply
 *   node scripts/bible/upload-bible-ru-firestore.mjs --apply --force
 *   node scripts/bible/upload-bible-ru-firestore.mjs --apply --service-account /path/to/key.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzip = promisify(zlib.gunzip);

const ROOT            = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE  = path.join(ROOT, 'scripts/bible/bible_seed_ru.json.gz');
const DEFAULT_SA_KEY  = path.join(ROOT, 'patchs/serviceAccountKey.json');
const COLLECTION      = 'bible_ru';

function parseArgs(argv) {
  const opts = { apply: false, force: false, source: DEFAULT_SOURCE, serviceAccount: DEFAULT_SA_KEY };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply')                 opts.apply = true;
    else if (arg === '--force')            opts.force = true;
    else if (arg === '--source')           opts.source = path.resolve(argv[++i]);
    else if (arg === '--service-account')  opts.serviceAccount = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown argument: ${arg}`); process.exit(1); }
  }
  return opts;
}

function printHelp() {
  console.log(`
Upload Russian Synodal Bible to Firestore collection '${COLLECTION}'.

Run python3 scripts/bible/convert-ru-synodal.py first to generate the source file.

Usage: node scripts/bible/upload-bible-ru-firestore.mjs [options]

Options:
  --apply                  Write to Firestore (dry-run without this flag)
  --force                  Overwrite existing documents (default: skip)
  --source <file>          JSON.gz source  (default: scripts/bible/bible_seed_ru.json.gz)
  --service-account <file> Firebase service account key  (default: patchs/serviceAccountKey.json)
`.trim());
}

async function loadBooks(sourcePath) {
  const raw = await fs.readFile(sourcePath);
  const jsonBuf = sourcePath.endsWith('.gz') ? await gunzip(raw) : raw;
  return JSON.parse(jsonBuf.toString('utf8')).books;
}

function dryRun(books) {
  console.log(`\n[DRY RUN] Would write ${books.length} documents to '${COLLECTION}':\n`);
  for (const book of books) {
    const verseCount = book.chapters.reduce((s, ch) => s + ch.length, 0);
    console.log(`  ${COLLECTION}/${book.id.padEnd(5)}  "${book.name}"  →  ${book.chapters.length} chapters, ${verseCount} verses`);
  }
  console.log(`\nRun with --apply to write to Firestore.`);
}

// Firestore doesn't allow nested arrays → convert chapters array-of-arrays to map
function chaptersToMap(chapters) {
  const map = {};
  chapters.forEach((verses, i) => { map[String(i + 1)] = verses; });
  return map;
}

async function apply(books, opts) {
  const [{ default: admin }] = await Promise.all([import('firebase-admin')]);
  const saKey = JSON.parse(await fs.readFile(opts.serviceAccount, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(saKey) });
  const db = admin.firestore();

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const book of books) {
    const ref = db.collection(COLLECTION).doc(book.id);
    try {
      const payload = {
        id:           book.id,
        name:         book.name,
        order:        book.order,
        chapterCount: book.chapters.length,
        chapters:     chaptersToMap(book.chapters),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      };
      if (opts.force) {
        await ref.set(payload);
        updated++;
        console.log(`  ✓ updated  ${book.id.padEnd(5)}  (${book.chapters.length} ch)`);
      } else {
        await ref.create({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        created++;
        console.log(`  ✓ created  ${book.id.padEnd(5)}  (${book.chapters.length} ch)`);
      }
    } catch (err) {
      if (!opts.force && err.code === 6) {
        skipped++;
        console.log(`  – skipped  ${book.id.padEnd(5)}  (already exists)`);
      } else {
        errors.push({ id: book.id, err: err.message });
        console.error(`  ✗ error    ${book.id}  ${err.message}`);
      }
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length > 0) process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Source: ${opts.source}`);
  const books = await loadBooks(opts.source);
  const totalVerses = books.reduce((s, b) => s + b.chapters.reduce((ss, ch) => ss + ch.length, 0), 0);
  console.log(`Loaded: ${books.length} books, ${totalVerses} verses total`);

  if (!opts.apply) { dryRun(books); return; }

  try { await fs.access(opts.serviceAccount); } catch {
    console.error(`\nService account key not found: ${opts.serviceAccount}`);
    process.exit(1);
  }

  console.log(`\n[APPLY] Writing to Firestore collection '${COLLECTION}'...\n`);
  await apply(books, opts);
}

main().catch(err => { console.error(err); process.exit(1); });
