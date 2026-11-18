#!/usr/bin/env node
/**
 * Guarded, one-celebration liturgical-color correction.
 *
 * Offline: node scripts/ordo/patch-basilicas-color.mjs
 * Live preview: node scripts/ordo/patch-basilicas-color.mjs --service-account /private/key.json
 * Publish: node scripts/ordo/patch-basilicas-color.mjs --service-account /private/key.json --apply --confirm basilicas-white
 *
 * Two Firestore documents only, within one transaction:
 * liturgicalCelebrations/dedication-basilicas-peter-paul (color only),
 * liturgicalCalendarMeta/current (revision only).
 * Flutter manifest is a separate, guarded SAFE CONTENT PATCH.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CELEBRATION_ID = 'dedication-basilicas-peter-paul';
export const CONFIRMATION = 'basilicas-white';

export function guardCelebration(doc) {
  if (!doc || doc.rank !== 'memoria-ad-libitum' || doc.category !== 'dedication'
    || doc.dateRule?.type !== 'fixed' || doc.dateRule?.month !== 11 || doc.dateRule?.day !== 18
    || doc.daysRef?._date !== '18.11'
    || !doc.daysRef?.dayIds?.includes('18-11-dedication-basilicas-peter-paul')
    || !doc.title?.includes('пасвячэння рымскіх базылік')) {
    throw new Error('Unexpected Firestore celebration identity/rank/date/title; no writes permitted.');
  }
  if (doc.color !== 'ruber' && doc.color !== 'albus') {
    throw new Error('Unexpected liturgical color; refusing to overwrite.');
  }
  return doc.color === 'ruber' ? 'needs-correction' : 'already-correct';
}

export function guardMeta(doc) {
  if (!doc || !Number.isSafeInteger(doc.revision) || doc.revision < 1 || doc.schemaVersion !== 1) {
    throw new Error('Missing or invalid calendar revision; no writes permitted.');
  }
  return doc.revision;
}

export function sourceCheck(root = ROOT) {
  const definition = JSON.parse(fs.readFileSync(path.join(root, 'src/data/ordo/calendar-definitions.json'), 'utf8'));
  const doc = definition.celebrations.find((x) => x.id === CELEBRATION_ID);
  if (!doc || guardCelebration(doc) !== 'already-correct') {
    throw new Error('Canonical bundled calendar must specify white before publication.');
  }
  return { bundledRevision: definition.revision, id: CELEBRATION_ID, color: doc.color };
}

function argsOf(argv) {
  const opts = { apply: false, serviceAccount: null, confirm: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--service-account') opts.serviceAccount = argv[++i];
    else if (argv[i] === '--confirm') opts.confirm = argv[++i];
    else throw new Error('Unknown option: ' + argv[i]);
  }
  if (opts.apply && (!opts.serviceAccount || opts.confirm !== CONFIRMATION)) {
    throw new Error('Apply requires --service-account and --confirm ' + CONFIRMATION);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = argsOf(argv);
  const source = sourceCheck();
  console.log(JSON.stringify({ check: 'canonical-source', ...source, mode: opts.apply ? 'apply' : 'dry-run' }));
  if (!opts.serviceAccount) {
    console.log('No live Firestore read or write (no service-account supplied).');
    return { offline: true };
  }
  const key = JSON.parse(fs.readFileSync(path.resolve(opts.serviceAccount), 'utf8'));
  if (key.project_id !== 'ibreviaryby') throw new Error('Unexpected Firebase project; refusing access.');
  const { default: admin } = await import('firebase-admin');
  const app = admin.initializeApp({
    credential: admin.credential.cert(key),
    projectId: 'ibreviaryby',
  }, 'basilicas-white-' + Date.now());
  try {
    const db = admin.firestore(app);
    const docRef = db.collection('liturgicalCelebrations').doc(CELEBRATION_ID);
    const metaRef = db.collection('liturgicalCalendarMeta').doc('current');
    if (!opts.apply) {
      const [celebration, meta] = await Promise.all([docRef.get(), metaRef.get()]);
      const status = guardCelebration(celebration.exists ? celebration.data() : null);
      const revision = guardMeta(meta.exists ? meta.data() : null);
      if (revision < source.bundledRevision) throw new Error('Live revision is behind bundled source; no patch.');
      const plan = { status, calendarRevision: revision, nextRevision: status === 'needs-correction' ? revision + 1 : revision, writes: status === 'needs-correction' ? 2 : 0 };
      console.log(JSON.stringify(plan));
      return plan;
    }
    const result = await db.runTransaction(async (tx) => {
      const [celebration, meta] = await Promise.all([tx.get(docRef), tx.get(metaRef)]);
      const status = guardCelebration(celebration.exists ? celebration.data() : null);
      const revision = guardMeta(meta.exists ? meta.data() : null);
      if (revision < source.bundledRevision) throw new Error('Live revision is behind bundled source; no patch.');
      if (status === 'already-correct') return { status, revision, writes: 0 };
      // No other collection, text, calendar rule or document is touched.
      tx.update(docRef, { color: 'albus' });
      tx.update(metaRef, { revision: revision + 1 });
      return { status: 'corrected', previousRevision: revision, revision: revision + 1, writes: 2 };
    }, { maxAttempts: 3 });
    console.log(JSON.stringify(result));
    return result;
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
