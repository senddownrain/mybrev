#!/usr/bin/env node
/**
 * Builds the canonical mixed Belarusian Bible and syncs it to Firestore
 * collection `bible_bel`.
 *
 *   Old Testament (46 books, incl. deuterocanonical)
 *     → пераклад кс. Уладзіслава Чарняўскага MIC
 *       scripts/bible/bible_seed_bel_charniauski.json.gz
 *   New Testament (27 books)
 *     → Catholic.by (© Канферэнцыя Каталіцкіх Біскупаў у Беларусі, 2017)
 *       scripts/bible/bible_seed_bel_nt.json.gz  (scripts/bible/parse-bel-nt.py)
 *
 * Book ids, names and order are taken from the Chernyavski corpus, so the
 * Firestore document ids and the PWA catalogue stay unchanged. NT verses keep
 * explicit numbers ({num, text}) because Catholic.by omits text-critical
 * verses (Mt 17:21, Jn 5:4, …); OT verses stay plain strings.
 *
 * Document schema (unchanged): bible_bel/{bookId}
 *   { id, name, order, chapterCount, chapters: { "1": [verse, …], … } }
 *
 * Steps:
 *   1. build the mixed corpus and write scripts/bible/bible_seed_bel_mixed.json.gz
 *      (same shape as the Flutter assets/bible_seed_bel.json.gz)
 *   2. back up every current `bible_bel` document to backups/bible-bel/<timestamp>.json
 *   3. dry run: print which documents would change (OT must be unchanged)
 *   4. --apply: write only the changed documents (never deletes)
 *   5. --apply / --verify: read everything back and compare with the corpus
 *
 * Usage:
 *   node scripts/bible/upload-bible-bel-firestore.mjs --build-only   # seed only, no Firestore
 *   node scripts/bible/upload-bible-bel-firestore.mjs                # build + backup + dry run
 *   node scripts/bible/upload-bible-bel-firestore.mjs --apply        # … + write + verify
 *   node scripts/bible/upload-bible-bel-firestore.mjs --verify       # read back + verify only
 *   … --service-account /path/to/key.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import zlib from 'node:zlib';
import { firestoreErrorCode, isFirestoreQuotaError } from '../../src/utils/firestoreErrors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OT_SOURCE = path.join(ROOT, 'scripts/bible/bible_seed_bel_charniauski.json.gz');
const NT_SOURCE = path.join(ROOT, 'scripts/bible/bible_seed_bel_nt.json.gz');
const MIXED_OUT = path.join(ROOT, 'scripts/bible/bible_seed_bel_mixed.json.gz');
const BACKUP_DIR = path.join(ROOT, 'backups/bible-bel');
const DEFAULT_SA_KEY = path.join(ROOT, 'patchs/serviceAccountKey.json');
const COLLECTION = 'bible_bel';
const OT_COUNT = 46;
const NT_COUNT = 27;
const FIRST_NT_ID = 'mt';

function parseArgs(argv) {
  const opts = { apply: false, verify: false, buildOnly: false, serviceAccount: DEFAULT_SA_KEY };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--verify') opts.verify = true;
    else if (arg === '--build-only') opts.buildOnly = true;
    else if (arg === '--service-account') opts.serviceAccount = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/bible/upload-bible-bel-firestore.mjs [--build-only | --apply | --verify] [--service-account <key.json>]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

async function readSeed(file) {
  return JSON.parse(zlib.gunzipSync(await fs.readFile(file)).toString('utf8')).books;
}

// ── 1. Build ─────────────────────────────────────────────────────────────────
export async function buildMixedCorpus() {
  const charniauski = await readSeed(OT_SOURCE);
  const catholic = await readSeed(NT_SOURCE);
  const ntById = new Map(catholic.map((book) => [book.id, book]));
  if (ntById.size !== NT_COUNT) throw new Error(`Catholic.by NT has ${ntById.size} books, expected ${NT_COUNT}`);

  const sorted = [...charniauski].sort((a, b) => a.order - b.order);
  const firstNt = sorted.findIndex((book) => book.id === FIRST_NT_ID);
  if (firstNt !== OT_COUNT) throw new Error(`First NT book '${FIRST_NT_ID}' at index ${firstNt}, expected ${OT_COUNT}`);

  const books = sorted.map((book, index) => {
    const testament = index < OT_COUNT ? 'old' : 'new';
    if (testament === 'old') {
      if (ntById.has(book.id)) throw new Error(`OT book ${book.id} also present in the NT seed`);
      return { id: book.id, name: book.name, order: book.order, chapters: book.chapters };
    }
    const nt = ntById.get(book.id);
    if (!nt) throw new Error(`NT book ${book.id} missing from the Catholic.by seed`);
    if (nt.chapters.length !== book.chapters.length) {
      throw new Error(`${book.id}: Catholic.by has ${nt.chapters.length} chapters, catalogue has ${book.chapters.length}`);
    }
    nt.chapters.forEach((chapter, ci) => {
      if (!chapter.length) throw new Error(`${book.id} ${ci + 1}: empty chapter`);
      chapter.forEach((verse) => {
        if (!Number.isInteger(verse.num) || typeof verse.text !== 'string' || !verse.text.trim()) {
          throw new Error(`${book.id} ${ci + 1}: malformed verse ${JSON.stringify(verse)}`);
        }
      });
    });
    return {
      id: book.id,
      name: book.name,
      order: book.order,
      chapters: nt.chapters.map((chapter) => chapter.map(({ num, text }) => ({ num, text }))),
    };
  });

  if (books.length !== OT_COUNT + NT_COUNT) throw new Error(`Mixed corpus has ${books.length} books`);
  return books;
}

async function writeMixedSeed(books) {
  const json = JSON.stringify({ books });
  await fs.writeFile(MIXED_OUT, zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }));
  console.log(`Mixed seed: ${path.relative(ROOT, MIXED_OUT)} (${books.length} books: `
    + `${OT_COUNT} OT Chernyavski + ${NT_COUNT} NT Catholic.by)`);
}

function toDocument(book) {
  const chapters = {};
  book.chapters.forEach((verses, index) => { chapters[String(index + 1)] = verses; });
  return { id: book.id, name: book.name, order: book.order, chapterCount: book.chapters.length, chapters };
}

// ── Firestore helpers ────────────────────────────────────────────────────────
async function withRetry(label, fn, attempts = 6) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || isFirestoreQuotaError(err) || firestoreErrorCode(err) === 'permission-denied') throw err;
      const delay = 1000 * 2 ** (attempt - 1);
      console.warn(`  ! ${label} failed (${err.code ?? ''} ${err.message}); retry ${attempt}/${attempts - 1} in ${delay} ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function openFirestore(serviceAccount) {
  try {
    await fs.access(serviceAccount);
  } catch {
    console.error(`Service account key not found: ${serviceAccount}`);
    process.exit(1);
  }
  const { default: admin } = await import('firebase-admin');
  const key = JSON.parse(await fs.readFile(serviceAccount, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();
  db.settings({ preferRest: true });
  return db;
}

async function readCollection(db) {
  const snapshot = await withRetry(`read ${COLLECTION}`, () => db.collection(COLLECTION).get());
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
}

function comparable(data) {
  if (!data) return null;
  const { id, name, order, chapterCount, chapters } = data;
  return { id, name, order, chapterCount, chapters };
}

function describeChange(current, expected) {
  if (!current) return 'new document';
  const parts = [];
  for (const field of ['id', 'name', 'order', 'chapterCount']) {
    if (current[field] !== expected[field]) parts.push(`${field} ${JSON.stringify(current[field])} → ${JSON.stringify(expected[field])}`);
  }
  const changedChapters = Object.keys(expected.chapters)
    .filter((key) => !isDeepStrictEqual(current.chapters?.[key], expected.chapters[key])).length;
  if (changedChapters) parts.push(`${changedChapters}/${expected.chapterCount} chapters`);
  const extraFields = Object.keys(current).filter((key) => !(key in expected));
  if (extraFields.length) parts.push(`drops fields ${extraFields.join(',')}`);
  return parts.join('; ');
}

function verseText(verse) {
  return typeof verse === 'string' ? verse : verse?.text;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const books = await buildMixedCorpus();
  await writeMixedSeed(books);
  if (opts.buildOnly) return;

  const expected = new Map(books.map((book, index) => [book.id, { doc: toDocument(book), testament: index < OT_COUNT ? 'old' : 'new' }]));
  const db = await openFirestore(opts.serviceAccount);

  const current = await readCollection(db);
  if (!opts.verify) {
    // 2. Backup
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `${stamp}.json`);
    await fs.writeFile(backupFile, JSON.stringify({
      collection: COLLECTION,
      exportedAt: new Date().toISOString(),
      count: current.size,
      documents: Object.fromEntries(current),
    }));
    console.log(`Backup: ${path.relative(ROOT, backupFile)} (${current.size} documents)`);

    // 3. Dry run
    const changes = [];
    for (const [id, { doc, testament }] of expected) {
      const existing = current.get(id);
      if (!isDeepStrictEqual(comparable(existing), doc) || Object.keys(existing).length !== 5) {
        changes.push({ id, testament, doc, summary: describeChange(existing, doc), existing });
      }
    }
    const unknown = [...current.keys()].filter((id) => !expected.has(id));
    const otChanges = changes.filter((change) => change.testament === 'old');

    console.log(`\n${COLLECTION}: ${current.size} documents in Firestore, ${expected.size} in the mixed corpus`);
    console.log(`Documents to write: ${changes.length} (OT ${otChanges.length}, NT ${changes.length - otChanges.length})`);
    for (const change of changes) {
      const before = verseText(change.existing?.chapters?.['1']?.[0]) ?? '—';
      const after = verseText(change.doc.chapters['1'][0]);
      console.log(`  ${change.testament === 'old' ? 'OT' : 'NT'} ${change.id.padEnd(5)} ${change.summary}`);
      console.log(`        1:1 before: ${before.slice(0, 70)}`);
      console.log(`        1:1 after:  ${after.slice(0, 70)}`);
    }
    if (unknown.length) console.log(`Documents not in the corpus (left untouched): ${unknown.join(', ')}`);

    if (otChanges.length) {
      console.error(`\nRefusing to continue: Old Testament documents differ from the Chernyavski seed: ${otChanges.map((c) => c.id).join(', ')}`);
      process.exit(1);
    }
    if (!opts.apply) {
      console.log('\nDry run only. Re-run with --apply to write these documents.');
      return;
    }

    // 4. Apply
    console.log(`\n[APPLY] writing ${changes.length} documents…`);
    for (const change of changes) {
      await withRetry(`write ${change.id}`, () => db.collection(COLLECTION).doc(change.id).set(change.doc));
      console.log(`  ✓ ${change.id}`);
    }
  }

  // 5. Verify
  const after = await readCollection(db);
  const problems = [];
  for (const [id, { doc }] of expected) {
    const data = after.get(id);
    if (!data) problems.push(`${id}: missing`);
    else if (!isDeepStrictEqual(comparable(data), doc)) problems.push(`${id}: differs (${describeChange(data, doc)})`);
  }
  const old = [...expected.values()].filter((entry) => entry.testament === 'old').length;
  const nt = expected.size - old;
  console.log(`\nVerify: ${after.size} documents in ${COLLECTION}; expected ${expected.size} (${old} OT + ${nt} NT)`);
  if (after.size !== expected.size) problems.push(`document count ${after.size} ≠ ${expected.size}`);
  if (problems.length) {
    console.error(`Verification FAILED:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Verification OK: OT matches the Chernyavski seed, NT matches the Catholic.by seed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
