#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection('readings').get();
const ids = snap.docs.map(d => d.id).sort();
console.log('Усяго ў readings:', ids.length);

const keywords = ['paul','josef','joseph','stella','baboli','sopoc','borzec','czestoch','01.05','04.09','12.06','14.08','15.02','18.09','26.08','26.10'];
const hits = ids.filter(id => keywords.some(kw => id.toLowerCase().includes(kw)));
console.log('\nПадазроныя IDs:', hits.length);
hits.forEach(id => console.log(' ', id));

const fixed = ids.filter(id => id.startsWith('fixed-'));
const feast = ids.filter(id => id.startsWith('feast-'));
console.log('\nfixed- IDs:', fixed.length);
fixed.forEach(id => console.log(' ', id));
console.log('\nfeast- IDs:', feast.length);
feast.forEach(id => console.log(' ', id));

process.exit(0);
