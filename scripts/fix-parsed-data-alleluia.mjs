#!/usr/bin/env node
/**
 * Исправляет alleluia.bible=null в parsedData:
 *   - Находит документы где ссылка склеена в verse
 *   - Разделяет: bible = ссылка, verse = текст
 *
 * Dry-run (по умолчанию):
 *   node scripts/fix-parsed-data-alleluia.mjs
 *
 * Применить:
 *   node scripts/fix-parsed-data-alleluia.mjs --apply
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

// Библейская ссылка в начале строки.
// Включает кириллические суффиксы стихов: а, б, в (напр. 14а, 12б)
// Примеры: "Лк 3, 4. 6", "Пс 85 (84), 8", "Ян 1, 14а. 12а", "пар. Пс 95 (94), 8ab"
const BIBLE_REF_RE = /^(?:пар\.\s*)?[А-ЯA-Z][а-яa-z]{0,4}\.?\s+\d+(?:\s*\(\d+\))?,\s*[\d\s,.\-–abcABCабвАБВ]+/;

function present(v) {
  return v !== undefined && v !== null && v !== '';
}

function alleluiaHasMixedRef(alleluia) {
  if (present(alleluia?.bible)) return false;
  const verse = String(alleluia?.verse || '');
  return BIBLE_REF_RE.test(verse);
}

function splitVerse(verse) {
  const v = String(verse || '').trim();
  const match = v.match(BIBLE_REF_RE);
  if (!match) return { bible: null, verse: v };
  // Убираем лишние знаки пунктуации в конце ссылки
  const bible = match[0].trimEnd().replace(/[\s,.\-–]+$/, '').trim();
  const verse_text = v.slice(match[0].length).replace(/^[\s,.\-–]+/, '').trim();
  return { bible, verse: verse_text };
}

async function main() {
  console.log(`Режим: ${APPLY ? '⚠️  ПРИМЕНЕНИЕ (запись в Firestore)' : '🔍 DRY-RUN (только чтение)'}\n`);

  console.log('Загружаю parsedData...');
  const snap = await db.collection('parsedData').get();
  console.log(`Всего документов: ${snap.size}\n`);

  const fixes = [];
  const skipped = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.alleluia) continue;
    if (!alleluiaHasMixedRef(d.alleluia)) continue;

    const split = splitVerse(d.alleluia.verse);

    // Проверка качества сплита
    if (!split.bible || !split.verse) {
      skipped.push({ id: doc.id, verse: d.alleluia.verse, reason: 'не удалось разделить' });
      continue;
    }

    fixes.push({
      id: doc.id,
      selector: d._date
        ? `date:${d._date}`
        : d._feast
          ? `feast:${d._feast}`
          : `period:${d._periodType}:w${d._periodWeekNumber}:d${d._dayOfWeek}:${d.year || '*'}`,
      old_verse: d.alleluia.verse,
      new_bible: split.bible,
      new_verse: split.verse,
    });
  }

  console.log(`Найдено для исправления: ${fixes.length}`);
  console.log(`Пропущено (не удалось разделить): ${skipped.length}`);

  if (skipped.length > 0) {
    console.log('\n--- Пропущенные ---');
    skipped.forEach((s) => console.log(`  ${s.id}: ${s.reason}\n    verse: "${s.verse?.slice(0, 80)}"`));
  }

  console.log('\n--- Примеры исправлений (первые 10) ---');
  fixes.slice(0, 10).forEach((f) => {
    console.log(`\n  ${f.id} [${f.selector}]`);
    console.log(`    было:   verse="${f.old_verse?.slice(0, 70)}"`);
    console.log(`    → bible="${f.new_bible}"`);
    console.log(`    → verse="${f.new_verse?.slice(0, 60)}"`);
  });

  if (!APPLY) {
    console.log(`\n✅ Dry-run завершён. Для применения запустите с флагом --apply`);
    await saveReport(fixes, skipped);
    process.exit(0);
  }

  // ── ПРИМЕНЕНИЕ ──
  console.log(`\n⚠️  Начинаю запись ${fixes.length} документов...`);
  const BATCH_SIZE = 400;
  let done = 0;
  for (let i = 0; i < fixes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = fixes.slice(i, i + BATCH_SIZE);
    for (const f of chunk) {
      const ref = db.collection('parsedData').doc(f.id);
      batch.update(ref, {
        'alleluia.bible': f.new_bible,
        'alleluia.verse': f.new_verse,
      });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  Записано: ${done}/${fixes.length}`);
  }

  console.log(`\n✅ Готово. Обновлено ${done} документов.`);
  await saveReport(fixes, skipped);
  process.exit(0);
}

async function saveReport(fixes, skipped) {
  await mkdir('reports', { recursive: true });
  const out = path.resolve('reports/fix-alleluia-report.json');
  await writeFile(out, JSON.stringify({ fixes, skipped }, null, 2), 'utf-8');
  console.log(`Отчёт: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
