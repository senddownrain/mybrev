#!/usr/bin/env node
/**
 * Выпраўляе рэфы reading1/reading2/psalm/alleluia для feast-holyfamily_B і feast-holyfamily_C.
 * Евангелле (gospel) ужо правільнае — не чапаем.
 * Тэксты (text) пустыя — пакідаем null.
 *
 * Dry-run:  node scripts/fix-holyfamily-bc.mjs
 * Прымяніць: node scripts/fix-holyfamily-bc.mjs --apply
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

// Правільныя рэфы згодна з catholic.by/3/liturgy/lectionary/sviaty/4994
const FIXES = {
  'feast-holyfamily_B': {
    reading1: { bible: 'Быц 15, 1-6; 21, 1-3', text: null },
    reading2: { bible: 'Гбр 11, 8. 11–12. 17–19', text: null },
    psalm:    { bible: 'Пс 105 (104), 1b–2. 3–4. 5–6. 8–9', text: null, chorus: null, verses: null },
    alleluia: { bible: 'Гбр 1, 1–2', verse: null },
    // gospel: Лк 2, 22.39–40 — ужо правільнае, не чапаем
  },
  'feast-holyfamily_C': {
    reading1: { bible: '1 Сам 1, 20–22. 24–28', text: null },
    reading2: { bible: '1 Ян 3, 1–2. 21–24', text: null },
    psalm:    { bible: 'Пс 84 (83), 2–3. 5–6. 9–10', text: null, chorus: null, verses: null },
    alleluia: { bible: 'Дз 16, 14b', verse: null },
    // gospel: Лк 2, 41–52 — ужо правільнае, не чапаем
  },
};

async function main() {
  console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ (запіс у Firestore)' : '🔍 DRY-RUN (толькі чытанне)'}\n`);

  const report = [];

  for (const [docId, sections] of Object.entries(FIXES)) {
    const ref = db.collection('parsedData').doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.error(`❌ Дакумент ${docId} не знойдзены!`);
      continue;
    }

    const current = snap.data();
    console.log(`\n── ${docId} ──`);

    const updatePayload = {};
    const changes = [];

    for (const [section, newFields] of Object.entries(sections)) {
      const old = current[section] || {};
      for (const [field, newVal] of Object.entries(newFields)) {
        const oldVal = old[field] ?? null;
        if (oldVal !== newVal) {
          console.log(`  ${section}.${field}:`);
          console.log(`    было:  ${JSON.stringify(oldVal)}`);
          console.log(`    стане: ${JSON.stringify(newVal)}`);
          updatePayload[`${section}.${field}`] = newVal;
          changes.push({ section, field, from: oldVal, to: newVal });
        }
      }
    }
    // Показваем gospel (не мяняем)
    if (current.gospel?.bible) {
      console.log(`  gospel.bible: ${current.gospel.bible} (захоўваем)`);
    }

    report.push({ id: docId, changes });

    if (APPLY && changes.length > 0) {
      await ref.update(updatePayload);
      console.log(`  ✅ Абноўлена`);
    }
  }

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/fix-holyfamily-bc-report.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nАдчот: ${outPath}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершаны. Для прымянення: node scripts/fix-holyfamily-bc.mjs --apply');
  } else {
    console.log('\n✅ Гатова. Дакументы абноўлены ў Firestore.');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
