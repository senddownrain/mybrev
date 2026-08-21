#!/usr/bin/env node
/**
 * Поўны аўдыт пакрыцця parsedData.
 * Для кожнага дакумента правярае кожную секцыю (reading1/2, psalm, alleluia, gospel):
 *   - ці ёсць сама секцыя
 *   - ці запоўнены text/verse/verses/chorus
 *   - ці ёсць bible ref
 *
 * Запуск: node scripts/audit-parseddata-coverage.mjs
 */
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const SECTIONS = ['reading1', 'reading2', 'psalm', 'alleluia', 'gospel'];

function hasText(sec) {
  if (!sec) return false;
  if (sec.text && sec.text.trim().length > 10) return true;
  if (sec.verse && sec.verse.trim().length > 5) return true;
  if (sec.verses && Array.isArray(sec.verses) && sec.verses.length > 0) return true;
  if (sec.chorus && sec.chorus.trim().length > 5) return true;
  return false;
}

function hasBible(sec) {
  return sec && typeof sec.bible === 'string' && sec.bible.trim().length > 0;
}

const snap = await db.collection('parsedData').get();
console.log(`Усяго дакументаў: ${snap.size}\n`);

const issues = [];
const stats = {
  total: snap.size,
  noSections: 0,
  missingText: 0,        // секцыя ёсць, але без тэксту
  missingBible: 0,       // секцыя ёсць, але bible = null
  complete: 0,
};

for (const doc of snap.docs) {
  const id = doc.id;
  const d = doc.data();

  const presentSections = SECTIONS.filter(s => d[s]);
  if (presentSections.length === 0) {
    issues.push({ id, type: 'no_sections', detail: 'Няма ніводнай секцыі' });
    stats.noSections++;
    continue;
  }

  const sectionIssues = [];
  for (const sec of presentSections) {
    const s = d[sec];
    const textOk = hasText(s);
    const bibleOk = hasBible(s);

    // reading2 і psalm без bible — гэта нармальна (psalm можа быць без bible)
    // alleluia без bible — патэнцыйная праблема
    // gospel без bible — дапускальна (некаторыя дні без рэферэнсу)

    if (!textOk) {
      sectionIssues.push({ sec, problem: 'no_text', bible: s.bible || null });
    } else if (!bibleOk && (sec === 'reading1' || sec === 'reading2' || sec === 'gospel' || sec === 'alleluia')) {
      sectionIssues.push({ sec, problem: 'no_bible', textLen: (s.text || s.verse || '').length });
    }
  }

  if (sectionIssues.length > 0) {
    const noText = sectionIssues.filter(i => i.problem === 'no_text');
    const noBible = sectionIssues.filter(i => i.problem === 'no_bible');
    issues.push({ id, type: noText.length > 0 ? 'missing_text' : 'missing_bible', sections: sectionIssues, presentSections });
    if (noText.length > 0) stats.missingText++;
    else stats.missingBible++;
  } else {
    stats.complete++;
  }
}

// Друкуем па групах
const noSec = issues.filter(i => i.type === 'no_sections');
const missTxt = issues.filter(i => i.type === 'missing_text');
const missBib = issues.filter(i => i.type === 'missing_bible');

console.log('══ Без секцый (не павінна быць пасля выдалення stubs) ══');
if (noSec.length === 0) console.log('  ✅ Такіх няма\n');
else noSec.forEach(i => console.log(`  ❌ ${i.id}: ${i.detail}`));

console.log(`\n══ Без тэксту ў якой-небудзь секцыі (${missTxt.length} дак.) ══`);
for (const item of missTxt) {
  const bad = item.sections.filter(s => s.problem === 'no_text').map(s => `${s.sec}(bible:${s.bible || 'null'})`).join(', ');
  console.log(`  ${item.id}: ${bad}`);
}

console.log(`\n══ Без bible ref у абавязковых секцыях (${missBib.length} дак.) ══`);
for (const item of missBib) {
  const bad = item.sections.map(s => `${s.sec}(${s.textLen}ch)`).join(', ');
  console.log(`  ${item.id}: ${bad}`);
}

console.log('\n═══════════════════════════════════');
console.log(`Поўнае пакрыццё:   ${stats.complete} / ${stats.total}`);
console.log(`Без тэксту:        ${stats.missingText}`);
console.log(`Без bible ref:     ${stats.missingBible}`);
console.log(`Без секцый:        ${stats.noSections}`);

await mkdir('reports', { recursive: true });
const outPath = 'reports/parseddata-coverage-audit.json';
await writeFile(outPath, JSON.stringify({ stats, issues }, null, 2));
console.log(`\nАдчот: ${outPath}`);
process.exit(0);
