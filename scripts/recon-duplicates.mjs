#!/usr/bin/env node
/**
 * Recon: inspect duplicate parsedData docs for Dec 29, Jan 1, christthehighpriest
 * and the 11 readings-only dates to understand what cleanup is needed.
 */
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

function excerpt(obj, maxLen = 60) {
  if (!obj) return 'null';
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function printDoc(snap) {
  const d = snap.data();
  const gospel = d.gospel ? excerpt(d.gospel.bible || d.gospel.text) : '—';
  const r1 = d.reading1 ? excerpt(d.reading1.bible || d.reading1.text) : '—';
  console.log(`  [${snap.id}]`);
  console.log(`    _date=${d._date} _feast=${d._feast} year=${d.year} _rank=${d._rank}`);
  console.log(`    title=${d.title || '—'}`);
  console.log(`    reading1=${r1}`);
  console.log(`    gospel=${gospel}`);
}

console.log('\n=== Duplicates for 29.12 ===');
const dec29 = await db.collection('parsedData').where('_date', '==', '29.12').get();
for (const s of dec29.docs) printDoc(s);

console.log('\n=== Duplicates for 01.01 ===');
const jan1 = await db.collection('parsedData').where('_date', '==', '01.01').get();
for (const s of jan1.docs) printDoc(s);

console.log('\n=== christthehighpriest duplicates ===');
const chp = await db.collection('parsedData').where('_feast', '==', 'christthehighpriest').get();
for (const s of chp.docs) printDoc(s);

console.log('\n=== 30.12 docs ===');
const dec30 = await db.collection('parsedData').where('_date', '==', '30.12').get();
for (const s of dec30.docs) printDoc(s);

console.log('\n=== 06.01 docs ===');
const jan6 = await db.collection('parsedData').where('_date', '==', '06.01').get();
for (const s of jan6.docs) printDoc(s);

console.log('\nDone.');
process.exit(0);
