#!/usr/bin/env node
/**
 * Чытае старыя readings-дакументы з hash-ID і паказвае іх структуру.
 */
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const OLD_IDS = [
  '01.05-mm3ohd3d4904321c7ab1',
  '01.05-mm3ohd3da6aa15f52ef9',
  '04.09-mm3ohd3i8398cfa2dabc',
  '12.06-mm3ohd3f671b3620cc9e',
  '14.08-mm3ohd3h198a86ee9778',
  '14.08-mm3ohd3h35d2b0d3d854',
  '15.02-mm3ohd3cec20a7abb779',
  '18.09-mm3ohd3i3db2a4203ec1',
  '18.09-mm3ohd3i46d32b096568',
  '18.09-mm3ohd3ib161a029ce97',
  '26.08-mm3ohd3h1e28dbc4ac04',
  '26.08-mm3ohd3i1db836654548',
  '26.08-mm3ohd3i5b1a41514185',
  '26.10-mm3ohd3j8836643012a8',
];

// Таксама праверым feast-paulvi
const EXTRA = ['feast-paulvi', 'feast-paulvi-mm3ohd3', 'paulvi'];

const report = [];

for (const id of [...OLD_IDS, ...EXTRA]) {
  const snap = await db.collection('readings').doc(id).get();
  if (!snap.exists) {
    console.log(`${id}: адсутнічае`);
    continue;
  }
  const d = snap.data();
  console.log(`\n══ ${id} ══`);
  console.log('Ключы:', Object.keys(d).join(', '));

  // Паказваем усе палі
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined) { console.log(`  ${k}: null`); continue; }
    if (typeof v === 'string') {
      const preview = v.trim().slice(0, 150).replace(/\n/g, '↵');
      console.log(`  ${k} (${v.length}ch): "${preview}"`);
    } else if (Array.isArray(v)) {
      console.log(`  ${k}: [${v.length}] ${JSON.stringify(v[0])?.slice(0, 80) || ''}`);
    } else if (typeof v === 'object') {
      console.log(`  ${k}: {${Object.keys(v).join(', ')}}`);
      for (const [sk, sv] of Object.entries(v)) {
        if (typeof sv === 'string' && sv.trim().length > 0) {
          console.log(`    .${sk}: "${sv.trim().slice(0, 100)}"`);
        }
      }
    } else {
      console.log(`  ${k}: ${v}`);
    }
  }

  report.push({ id, data: d });
}

await mkdir('reports', { recursive: true });
await writeFile('reports/old-readings-inspect.json', JSON.stringify(report, null, 2));
console.log('\n\nАдчот: reports/old-readings-inspect.json');
process.exit(0);
