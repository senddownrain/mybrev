#!/usr/bin/env node
/**
 * Fix Holy Family dynamic feast lookup.
 *
 * Problem: old `feast-holyfamily` doc has _feast='holyfamily', year=null,
 * gospel=Лк 2,41–52 (Year C only). The service finds it first for ALL years.
 *
 * Fix:
 * 1. Delete old feast-holyfamily (year=null)
 * 2. Create feast-holyfamily_A with _feast='holyfamily', year='A'
 * 3. Update feast-holyfamily_B to add _feast='holyfamily'
 * 4. Update feast-holyfamily_C to add _feast='holyfamily'
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

// Year A data (same as sviaty-4994_A but with _feast set)
const YEAR_A = {
  _date: '29.12',
  _feast: 'holyfamily',
  _rank: 'festum',
  year: 'A',
  title: "Нядзеля ў актаве Нараджэння Пана. Свята Святой Сям'і: Езуса, Марыі і Юзафа",
  reading1: r('Сір 3, 2–6. 12–14'),
  psalm:    r('Пс 128 (127), 1–2. 3. 4–5 (Р.: пар. 1)'),
  reading2: r('Клс 3, 12–21'),
  alleluia: r('Клс 3, 15а. 16а'),
  gospel:   r('Мц 2, 13–15. 19–23'),
};

console.log('DELETE feast-holyfamily (old year=null doc)');
console.log('CREATE feast-holyfamily_A: year=A gospel=Мц 2, 13–15. 19–23 _feast=holyfamily');
console.log('UPDATE feast-holyfamily_B: add _feast=holyfamily');
console.log('UPDATE feast-holyfamily_C: add _feast=holyfamily');

if (APPLY) {
  const batch = db.batch();
  batch.delete(db.collection('parsedData').doc('feast-holyfamily'));
  batch.set(db.collection('parsedData').doc('feast-holyfamily_A'), YEAR_A);
  batch.update(db.collection('parsedData').doc('feast-holyfamily_B'), { _feast: 'holyfamily' });
  batch.update(db.collection('parsedData').doc('feast-holyfamily_C'), { _feast: 'holyfamily' });
  await batch.commit();
  console.log('\nDone.');
} else {
  console.log('\n[DRY RUN] nothing written.');
}
process.exit(0);
