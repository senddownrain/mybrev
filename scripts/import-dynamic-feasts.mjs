#!/usr/bin/env node
/**
 * Import dynamic feast readings for christthehighpriest and paulvi.
 * DRY RUN by default. Pass --apply to write.
 */

import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };

const apply = process.argv.includes('--apply');
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}\n`);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const col = db.collection('parsedData');

function r(bible) { return { bible, text: null }; }

const feasts = [
  {
    id: 'feast-christthehighpriest',
    _feast: 'christthehighpriest',
    title: 'Хрыстос Найвышэйшы Святар',
    _rank: 'festum',
    _place: '',
    reading1: r('Быц 22,9–18 або Гбр 10,4–10'),
    psalm:    r('Пс 40(39),7–8a.8b–9.10–11b.17'),
    reading2: null,
    alleluia: null,
    gospel:   r('Мц 26,36–42'),
  },
  {
    id: 'feast-paulvi',
    _feast: 'paulvi',
    title: 'Св. Паўла VI, папа',
    _rank: 'memoria',
    _place: '',
    reading1: r('1Кар 9,16–19.22–23'),
    psalm:    r('Пс 96(95),1–2a.2b–3.7–8a.10'),
    reading2: null,
    alleluia: null,
    gospel:   r('Мц 16,13–19'),
  },
];

for (const feast of feasts) {
  const { id, ...data } = feast;
  const existing = await col.doc(id).get();
  if (existing.exists) {
    console.log(`SKIP ${id} — already exists`);
    continue;
  }

  const doc = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));

  console.log(`${apply ? 'WRITE' : 'WOULD WRITE'} ${id}:`);
  console.log(`  title: ${doc.title}`);
  console.log(`  reading1: ${doc.reading1.bible}`);
  console.log(`  psalm:    ${doc.psalm.bible}`);
  console.log(`  gospel:   ${doc.gospel.bible}`);

  if (apply) {
    await col.doc(id).set(doc);
    console.log('  ✓ written');
  }
}

console.log('\nDone.');
await admin.app().delete();
process.exit(0);
