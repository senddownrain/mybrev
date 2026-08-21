#!/usr/bin/env node
/**
 * Фіксуе alleluia.bible для дакументаў, дзе bible ref ёсць на catholic.by,
 * але не быў захаваны пры першапачатковым імпарце.
 *
 * Dry-run:   node scripts/fix-alleluia-bible-from-source.mjs
 * Прымяніць: node scripts/fix-alleluia-bible-from-source.mjs --apply
 */
import { createRequire } from 'node:module';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';
const { load } = require('cheerio');

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ' : '🔍 DRY-RUN'}\n`);

// Загружаем аўдыт-справаздачу для спісу кандыдатаў
const auditRaw = await readFile('reports/parseddata-coverage-audit.json', 'utf-8');
const { issues } = JSON.parse(auditRaw);
const candidates = issues.filter(i =>
  i.type === 'missing_bible' &&
  i.sections.some(s => s.sec === 'alleluia')
);
console.log(`Кандыдатаў (alleluia без bible): ${candidates.length}\n`);

function extractAlleluiaBible(articleHtml) {
  const alleluiaIdx = articleHtml.indexOf('СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ');
  if (alleluiaIdx < 0) return null;
  const gospelIdx = articleHtml.indexOf('ЕВАНГЕЛЛЕ', alleluiaIdx + 30);
  const sec = articleHtml.slice(alleluiaIdx, gospelIdx > alleluiaIdx ? gospelIdx : alleluiaIdx + 3000);

  // bible знаходзіцца ў <div align="right"> унутры секцыі
  for (const m of sec.matchAll(/<div[^>]*align=["']?right["']?[^>]*>([\s\S]*?)<\/div>/gi)) {
    const txt = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (txt) return txt;
  }
  return null;
}

// Кэш URL → bible, каб не запытваць адну URL двойчы
const urlCache = new Map();
const DELAY_MS = 300;

const report = [];
let updated = 0;
let skipped = 0;
let errors = 0;

for (const item of candidates) {
  const docSnap = await db.collection('parsedData').doc(item.id).get();
  if (!docSnap.exists) {
    console.log(`⚠️  ${item.id}: дакумент не знойдзены`);
    skipped++;
    continue;
  }
  const d = docSnap.data();
  if (!d._sourceUrl) {
    skipped++;
    report.push({ id: item.id, result: 'no_url' });
    continue;
  }

  const url = d._sourceUrl;
  let bible;

  try {
    if (!urlCache.has(url)) {
      await new Promise(r => setTimeout(r, DELAY_MS));
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const $ = load(html);
      const articleHtml = $('div.article').first().html() || '';
      urlCache.set(url, articleHtml);
    }
    bible = extractAlleluiaBible(urlCache.get(url));
  } catch (e) {
    console.error(`❌ ${item.id}: памылка загрузкі — ${e.message}`);
    errors++;
    report.push({ id: item.id, url, result: 'fetch_error', error: e.message });
    continue;
  }

  if (!bible) {
    skipped++;
    report.push({ id: item.id, url, result: 'no_bible_on_page' });
    continue;
  }

  console.log(`${APPLY ? '✅' : '🔍'} ${item.id}: alleluia.bible = "${bible}"`);
  report.push({ id: item.id, url, result: 'found', bible });

  if (APPLY) {
    try {
      await db.collection('parsedData').doc(item.id).update({ 'alleluia.bible': bible });
      updated++;
    } catch (e) {
      console.error(`❌ ${item.id}: памылка запісу — ${e.message}`);
      errors++;
    }
  }
}

console.log('\n═══════════════════════════════════');
console.log(`Знойдзена bible:   ${report.filter(r => r.result === 'found').length}`);
console.log(`Без bible на стар: ${report.filter(r => r.result === 'no_bible_on_page').length}`);
console.log(`Без URL:           ${report.filter(r => r.result === 'no_url').length}`);
console.log(`Абноўлена:         ${updated}`);
console.log(`Памылак:           ${errors}`);

await mkdir('reports', { recursive: true });
const outPath = 'reports/fix-alleluia-bible-report.json';
await writeFile(outPath, JSON.stringify({ stats: { updated, skipped, errors }, report }, null, 2));
console.log(`Адчот: ${outPath}`);

if (!APPLY) {
  const found = report.filter(r => r.result === 'found').length;
  console.log(`\n✅ Dry-run завершаны. Знойдзена ${found} bible refs.`);
  console.log('Для прымянення: node scripts/fix-alleluia-bible-from-source.mjs --apply');
}
process.exit(0);
