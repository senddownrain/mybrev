#!/usr/bin/env node
/**
 * Аудит коллекции parsedData:
 *  - alleluia: bible=null, ссылка склеена в verse
 *  - psalm: нет ни chorus/verses, ни text
 *  - gospel: нет text
 *  - reading1/reading2: нет text
 *  - документы без секций вообще
 *
 * Запуск:
 *   node scripts/audit-parsed-data-fields.mjs
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Паттерн для библейской ссылки в начале строки:
// "Ян 15, 9b." / "Мц 22, 1" / "пар. Пс 95 (94), 8ab" / "Сір 15, 1-6"
const BIBLE_REF_RE = /^(?:пар\.\s*)?[А-ЯA-Z][а-яa-z]{0,4}\.?\s+\d+(?:\s*\(\d+\))?,\s*[\d\s,.\-–abcABC]+/;

function present(v) {
  return v !== undefined && v !== null && v !== '';
}

function hasVerses(psalm) {
  return Array.isArray(psalm?.verses) && psalm.verses.length > 0;
}

function alleluiaRefMixed(alleluia) {
  // bible=null, но в verse похоже на "ссылка + текст"
  if (present(alleluia?.bible)) return false;
  const verse = String(alleluia?.verse || '');
  return BIBLE_REF_RE.test(verse);
}

function splitAlleluiaVerse(verse) {
  const v = String(verse || '');
  const match = v.match(BIBLE_REF_RE);
  if (!match) return { bible: null, verse: v };
  const ref = match[0].trim();
  const rest = v.slice(ref.length).replace(/^[\s,.\-–]+/, '').trim();
  return { bible: ref, verse: rest };
}

async function main() {
  console.log('Загружаю parsedData...');
  const snap = await db.collection('parsedData').get();
  console.log(`Всего документов: ${snap.size}`);

  const issues = {
    alleluiaRefMixed: [],      // bible=null, ссылка в verse
    alleluiaEmpty: [],         // нет ни bible, ни verse, ни text
    psalmEmpty: [],            // нет chorus/verses и нет text
    gospelNoText: [],          // нет text
    reading1NoText: [],        // нет text
    reading2NoText: [],        // нет text
    noSections: [],            // вообще нет секций
  };

  const SECTIONS = ['reading1', 'reading2', 'psalm', 'alleluia', 'gospel'];

  for (const doc of snap.docs) {
    const d = doc.data();
    const id = doc.id;
    const selector = d._date
      ? `date:${d._date}`
      : d._feast
        ? `feast:${d._feast}`
        : d._periodType
          ? `period:${d._periodType}:w${d._periodWeekNumber}:d${d._dayOfWeek}:${d.year || '*'}`
          : 'unknown';

    const meta = { id, selector, title: d.title || null };

    const hasSomeSection = SECTIONS.some((s) => present(d[s]));
    if (!hasSomeSection) {
      issues.noSections.push(meta);
      continue;
    }

    // alleluia
    if (d.alleluia) {
      if (alleluiaRefMixed(d.alleluia)) {
        const split = splitAlleluiaVerse(d.alleluia.verse);
        issues.alleluiaRefMixed.push({
          ...meta,
          current_verse: d.alleluia.verse,
          proposed_bible: split.bible,
          proposed_verse: split.verse,
        });
      } else if (!present(d.alleluia.bible) && !present(d.alleluia.verse) && !present(d.alleluia.text)) {
        issues.alleluiaEmpty.push(meta);
      }
    }

    // psalm
    if (d.psalm) {
      const hasPsalmContent = present(d.psalm.chorus) || hasVerses(d.psalm) || present(d.psalm.text);
      if (!hasPsalmContent) {
        issues.psalmEmpty.push({ ...meta, psalm_keys: Object.keys(d.psalm) });
      }
    }

    // gospel
    if (d.gospel && !present(d.gospel.text)) {
      issues.gospelNoText.push({ ...meta, gospel_keys: Object.keys(d.gospel) });
    }

    // reading1
    if (d.reading1 && !present(d.reading1.text)) {
      issues.reading1NoText.push({ ...meta, keys: Object.keys(d.reading1) });
    }

    // reading2
    if (d.reading2 && !present(d.reading2.text)) {
      issues.reading2NoText.push({ ...meta, keys: Object.keys(d.reading2) });
    }
  }

  // Итог
  console.log('\n===== РЕЗУЛЬТАТ АУДИТА =====');
  console.log(`alleluiaRefMixed (bible=null, ссылка в verse): ${issues.alleluiaRefMixed.length}`);
  console.log(`alleluiaEmpty (совсем пустая алилуя):          ${issues.alleluiaEmpty.length}`);
  console.log(`psalmEmpty (нет текста псалма):                ${issues.psalmEmpty.length}`);
  console.log(`gospelNoText (евангелие без text):             ${issues.gospelNoText.length}`);
  console.log(`reading1NoText (1 чытанне без text):           ${issues.reading1NoText.length}`);
  console.log(`reading2NoText (2 чытанне без text):           ${issues.reading2NoText.length}`);
  console.log(`noSections (нет секций вообще):                ${issues.noSections.length}`);

  // Примеры alleluiaRefMixed
  if (issues.alleluiaRefMixed.length > 0) {
    console.log('\n--- Примеры alleluiaRefMixed (первые 5) ---');
    issues.alleluiaRefMixed.slice(0, 5).forEach((item) => {
      console.log(`  ${item.id} [${item.selector}]`);
      console.log(`    verse сейчас:   "${item.current_verse?.slice(0, 80)}..."`);
      console.log(`    → bible будет:  "${item.proposed_bible}"`);
      console.log(`    → verse будет:  "${item.proposed_verse?.slice(0, 60)}..."`);
    });
  }

  // Сохранить полный отчёт
  await mkdir('reports', { recursive: true });
  const outPath = path.resolve('reports/parsed-data-audit.json');
  await writeFile(outPath, JSON.stringify(issues, null, 2), 'utf-8');
  console.log(`\nПолный отчёт сохранён: ${outPath}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
