#!/usr/bin/env node
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SECTIONS = ['reading1', 'reading2', 'psalm', 'alleluia', 'gospel'];

function sectionSummary(d) {
  const result = {};
  for (const s of SECTIONS) {
    if (d[s] !== undefined && d[s] !== null) {
      result[s] = {
        bible: d[s].bible || null,
        hasText: !!(d[s].text && d[s].text.trim()),
        hasVerse: !!(d[s].verse && d[s].verse.trim()),
        hasVerses: !!(d[s].verses && d[s].verses.length),
        hasChorus: !!(d[s].chorus),
      };
    }
  }
  return result;
}

async function main() {
  console.log('Загружаю parsedData...');
  const snap = await db.collection('parsedData').get();
  console.log(`Всего: ${snap.size}`);

  const emptyTextDocs = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const hasSections = SECTIONS.some(s => d[s] !== undefined && d[s] !== null);
    if (!hasSections) continue; // skip stubs (already deleted)

    const allTextsEmpty = SECTIONS.every(s => {
      if (!d[s]) return true;
      const hasText = !!(d[s].text && d[s].text.trim());
      const hasVerse = !!(d[s].verse && d[s].verse.trim());
      const hasVerses = !!(d[s].verses && d[s].verses.length);
      return !hasText && !hasVerse && !hasVerses;
    });

    if (allTextsEmpty) {
      emptyTextDocs.push({
        id: doc.id,
        _date: d._date || null,
        _feast: d._feast || null,
        _dayName: d._dayName || null,
        title: d.title || null,
        sections: sectionSummary(d),
      });
    }
  }

  console.log(`Пустых текстов: ${emptyTextDocs.length}`);
  emptyTextDocs.forEach(d => {
    const refs = Object.entries(d.sections).map(([k, v]) => `${k}:${v.bible||'?'}`).join(', ');
    console.log(`  ${d.id} [${d._date||d._feast||'-'}] ${d.title||''} => ${refs}`);
  });

  await mkdir('reports', { recursive: true });
  await writeFile('reports/empty-text-docs.json', JSON.stringify(emptyTextDocs, null, 2), 'utf-8');
  console.log('\nОтчёт: reports/empty-text-docs.json');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
