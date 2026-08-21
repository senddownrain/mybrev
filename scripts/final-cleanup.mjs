#!/usr/bin/env node
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const batch = db.batch();

// Delete wrong christthehighpriest doc (verified on catholic.by: correct one is sviaty-5021)
// sviaty-5021: Гбр 10,11-18 + Мк 14,22-25 ✓
// feast-christthehighpriest: Быц 22/Гбр 10,4-10 + Мц 26,36-42 ✗
batch.delete(db.collection('parsedData').doc('feast-christthehighpriest'));

await batch.commit();
console.log('Done: deleted feast-christthehighpriest');

// Now fetch audit stats
const snap = await db.collection('parsedData').get();
const docs = snap.docs.map(d => d.data());

const byType = {
  date: docs.filter(d => d._date && !d._feast).length,
  feast: docs.filter(d => d._feast).length,
  period: docs.filter(d => d._periodType && !d._date && !d._feast).length,
};
const withGospel = docs.filter(d => d.gospel?.bible || d.gospel?.text).length;
const withBible = docs.filter(d => d.reading1?.bible).length;
const total = docs.length;

console.log('\n=== parsedData audit ===');
console.log(`Total docs: ${total}`);
console.log(`By date (_date): ${byType.date}`);
console.log(`By feast (_feast): ${byType.feast}`);
console.log(`By period: ${byType.period}`);
console.log(`With gospel bible ref: ${withGospel}`);
console.log(`With reading1 bible ref: ${withBible}`);

// Christmas/Epiphany coverage
const christmasDates = ['25.12','26.12','27.12','28.12','29.12','30.12','31.12',
  '01.01','02.01','03.01','04.01','05.01','06.01','07.01','08.01','09.01','10.01','11.01','12.01'];
console.log('\n=== Christmas/Epiphany period coverage ===');
for (const d of christmasDates) {
  const matches = docs.filter(doc => doc._date === d);
  const titles = matches.map(m => m.title || '(без назвы)').join(' | ');
  console.log(`${d}: ${matches.length} doc(s) — ${titles}`);
}

process.exit(0);
