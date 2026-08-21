#!/usr/bin/env node
/**
 * Cleanup:
 * 1. Delete old superseded Christmas/Epiphany parsedData docs (replaced by christmas-* imports)
 * 2. Add missing titles to christmas-* docs
 *
 * Run with --apply to write, otherwise dry-run.
 */
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
if (!APPLY) console.log('[DRY RUN] pass --apply to write\n');
else console.log('[APPLY] Writing to Firestore...\n');

// ── 1. Delete old superseded docs ────────────────────────────────────────────
// These are old-format docs with identical readings to our christmas-* imports.
// Keeping them causes ReadingsView to show duplicate cards for Dec 29/30, Jan 1, Jan 6.
const TO_DELETE = [
  'bn-4561',         // Dec 29 "пяты дзень у актаве" — same readings as christmas-29-12
  'bn-4562',         // Dec 30 "шосты дзень у актаве" — same readings as christmas-30-12
  'urachystasci-5025', // Jan 1 "восьмы дзень у актаве" — same as christmas-01-01
  'urachystasci-5026', // Jan 6 Epiphany old doc — same as christmas-06-01
];

for (const id of TO_DELETE) {
  const ref = db.collection('parsedData').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`SKIP (not found): ${id}`);
    continue;
  }
  const d = snap.data();
  console.log(`DELETE ${id}: _date=${d._date} title="${d.title || '—'}"`);
  if (APPLY) await ref.delete();
}

// ── 2. Add titles to christmas-* docs that have title=undefined ───────────────
const TITLES = {
  'christmas-29-12': 'Пяты дзень у актаве Нараджэння Пана',
  'christmas-30-12': 'Шосты дзень у актаве Нараджэння Пана',
  'christmas-31-12': 'Сёмы дзень у актаве Нараджэння Пана',
  'christmas-02-01': 'Другі дзень у актаве Нараджэння Пана',
  'christmas-03-01': 'Трэці дзень у актаве Нараджэння Пана',
  'christmas-04-01': 'Чацвёрты дзень у актаве Нараджэння Пана',
  'christmas-05-01': 'Пяты дзень у актаве Нараджэння Пана',
  'christmas-07-01': '7 студзеня — будзень у Калядным часе',
  'christmas-08-01': '8 студзеня — будзень у Калядным часе',
  'christmas-09-01': '9 студзеня — будзень у Калядным часе',
  'christmas-10-01': '10 студзеня — будзень у Калядным часе',
  'christmas-11-01': '11 студзеня — будзень у Калядным часе',
  'christmas-12-01': '12 студзеня — будзень у Калядным часе',
};

for (const [id, title] of Object.entries(TITLES)) {
  const ref = db.collection('parsedData').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`SKIP (not found): ${id}`);
    continue;
  }
  const current = snap.data().title;
  if (current) {
    console.log(`SKIP (already has title): ${id} = "${current}"`);
    continue;
  }
  console.log(`SET TITLE ${id}: "${title}"`);
  if (APPLY) await ref.update({ title });
}

console.log('\nDone.');
process.exit(0);
