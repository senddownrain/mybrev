#!/usr/bin/env node
/**
 * Удаляет из parsedData документы-заглушки без секций чтений.
 * Это fixed-* документы (метаданные праздников), которые попали в parsedData по ошибке.
 *
 * Dry-run: node scripts/fix-parsed-data-remove-stubs.mjs
 * Применить: node scripts/fix-parsed-data-remove-stubs.mjs --apply
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');

const APPLY = process.argv.includes('--apply');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const READING_SECTIONS = ['reading1', 'reading2', 'psalm', 'alleluia', 'gospel'];

function hasAnySections(d) {
  return READING_SECTIONS.some((s) => d[s] !== undefined && d[s] !== null);
}

async function main() {
  console.log(`Режим: ${APPLY ? '⚠️  ПРИМЕНЕНИЕ (удаление из Firestore)' : '🔍 DRY-RUN (только чтение)'}\n`);

  console.log('Загружаю parsedData...');
  const snap = await db.collection('parsedData').get();
  console.log(`Всего документов: ${snap.size}\n`);

  const toDelete = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (!hasAnySections(d)) {
      toDelete.push({
        id: doc.id,
        _date: d._date || null,
        _feast: d._feast || null,
        title: d.title || null,
        keys: Object.keys(d),
      });
    }
  }

  console.log(`Найдено заглушек для удаления: ${toDelete.length}`);
  console.log('\n--- Список (первые 20) ---');
  toDelete.slice(0, 20).forEach((x) =>
    console.log(`  ${x.id}  [${x._date || x._feast || '—'}]  "${x.title || ''}"`)
  );
  if (toDelete.length > 20) console.log(`  ... и ещё ${toDelete.length - 20}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершён. Для удаления запустите с флагом --apply');
    await saveReport(toDelete);
    process.exit(0);
  }

  // ── ПРИМЕНЕНИЕ ──
  console.log(`\n⚠️  Удаляю ${toDelete.length} документов...`);
  const BATCH_SIZE = 400;
  let done = 0;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    for (const x of chunk) {
      batch.delete(db.collection('parsedData').doc(x.id));
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  Удалено: ${done}/${toDelete.length}`);
  }

  console.log(`\n✅ Готово. Удалено ${done} документов.`);
  await saveReport(toDelete);
  process.exit(0);
}

async function saveReport(items) {
  await mkdir('reports', { recursive: true });
  const out = path.resolve('reports/fix-stubs-report.json');
  await writeFile(out, JSON.stringify(items, null, 2), 'utf-8');
  console.log(`Отчёт: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
