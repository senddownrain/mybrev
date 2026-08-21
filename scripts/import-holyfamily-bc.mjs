#!/usr/bin/env node
/**
 * Import Holy Family feast docs for years B and C.
 * Year A already exists as sviaty-4994_A (_date=29.12, year=A).
 * These new docs use the same _date=29.12 approach.
 *
 * Also update sviaty-4994_A to add psalm, reading2, alleluia (currently missing).
 *
 * Run with --apply to write.
 */
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
if (!APPLY) console.log('[DRY RUN] pass --apply to write\n');

function r(bible) { return { bible, text: null }; }

const BASE = {
  _date: '29.12',
  _feast: null,
  _rank: 'festum',
  title: 'Нядзеля ў актаве Нараджэння Пана. Свята Святой Сям\'і: Езуса, Марыі і Юзафа',
  reading1: r('Сір 3, 2–6. 12–14'),
  psalm:    r('Пс 128 (127), 1–2. 3. 4–5 (Р.: пар. 1)'),
  reading2: r('Клс 3, 12–21'),
  alleluia: r('Клс 3, 15а. 16а'),
};

const docs = [
  {
    id: 'feast-holyfamily_B',
    ...BASE,
    year: 'B',
    gospel: r('Лк 2, 22–40'),
  },
  {
    id: 'feast-holyfamily_C',
    ...BASE,
    year: 'C',
    gospel: r('Лк 2, 41–52'),
  },
];

// Also fix sviaty-4994_A — add psalm/reading2/alleluia if missing
const UPDATE_A = {
  psalm:    r('Пс 128 (127), 1–2. 3. 4–5 (Р.: пар. 1)'),
  reading2: r('Клс 3, 12–21'),
  alleluia: r('Клс 3, 15а. 16а'),
  _rank: 'festum',
};

const batch = db.batch();

for (const { id, ...data } of docs) {
  console.log(`WRITE ${id}: year=${data.year} gospel=${data.gospel.bible}`);
  if (APPLY) batch.set(db.collection('parsedData').doc(id), data);
}

console.log(`UPDATE sviaty-4994_A: add psalm, reading2, alleluia, _rank`);
if (APPLY) batch.update(db.collection('parsedData').doc('sviaty-4994_A'), UPDATE_A);

if (APPLY) {
  await batch.commit();
  console.log('\nDone.');
} else {
  console.log('\n[DRY RUN] nothing written.');
}
process.exit(0);
