#!/usr/bin/env node
/**
 * Audit fixed calendar dates missing from parsedData.
 * For each date in fixedCalendar.js not yet in parsedData:
 *   1. Finds corresponding docs in `readings` collection
 *   2. Inspects text format and extracts bible references
 *   3. Classifies migration difficulty
 *   4. Outputs a report: reports/fixed-dates-migration-plan.json
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };
import { fixedCalendar } from '../src/constants/fixedCalendar.js';

const OUTPUT = path.resolve('reports/fixed-dates-migration-plan.json');

// ─── Rank mapping fixedCalendar → canonical _rank ─────────────────────────
const RANK_MAP = {
  'Урачыстасць': 'solemnitas',
  'Свята':       'festum',
  'Успамін':     'memoria',
  '':            'memoria-ad-libitum',
};

// ─── parsedData IDs already present (from local export) ───────────────────
import parsedDataDump from '../reports/parsed-data.json' with { type: 'json' };
const parsedDates = new Set(
  parsedDataDump
    .filter(d => d._date)
    .map(d => d._date)
);

// ─── Seasonal date exceptions (handled separately, not via fixedCalendar) ──
function isSeasonalException(dateStr) {
  const [dd, mm] = dateStr.split('.').map(Number);
  const isAdventException = mm === 12 && dd >= 17 && dd <= 24;
  const isChristmasException = (mm === 12 && dd >= 25) || (mm === 1 && dd <= 12);
  return isAdventException || isChristmasException;
}

// ─── Bible reference extractor ─────────────────────────────────────────────
// Extracts refs like "Ер 26, 11–16", "Пс 69, 15–16", "Мц 14, 1–12" etc.
// from HTML text
function extractBibleRefs(html) {
  if (!html) return [];
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  // Match patterns like "Кн X, Y–Z" or "Мц 5, 13–19" etc.
  const pattern = /([А-ЯЁІЎ][а-яёіў]{1,5}(?:\s[А-ЯЁІЎ][а-яёіў]{1,10})?)\s+(\d+(?:,\s*\d+)?(?:[,–\-]\s*\d+)*)/g;
  const refs = [];
  let m;
  while ((m = pattern.exec(plain)) !== null) {
    refs.push(`${m[1]} ${m[2]}`.trim());
  }
  return [...new Set(refs)].slice(0, 10);
}

// ─── Guess if reading is feast-specific or period reading ─────────────────
// Period readings typically have no _date set or have _periodType set
// Feast readings have _date set and no _periodType
function classifyReading(doc) {
  if (doc._periodType) return 'period'; // should not happen for date-based but check
  if (doc._feast)      return 'feast';
  if (doc._date)       return 'fixed';
  return 'unknown';
}

// ─── Detect text format ───────────────────────────────────────────────────
function detectFormat(text) {
  if (!text) return 'empty';
  if (text.includes('альбо') || text.includes('Альбо')) return 'multi-option';
  if (/<h[1-6]/i.test(text)) return 'html-structured';
  if (/<p/i.test(text)) return 'html-paragraph';
  return 'plain';
}

// ─── Main ─────────────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const readingsCol = db.collection('readings');

// Build target: dates in fixedCalendar not in parsedData, grouped by date
const calendarByDate = new Map();
for (const entry of fixedCalendar) {
  if (!calendarByDate.has(entry.date)) calendarByDate.set(entry.date, []);
  calendarByDate.get(entry.date).push(entry);
}

const missingDates = [];
for (const [date, entries] of calendarByDate) {
  if (!parsedDates.has(date) && !isSeasonalException(date)) {
    missingDates.push({ date, entries });
  }
}

console.log(`Dates in fixedCalendar:      ${calendarByDate.size}`);
console.log(`Already in parsedData:        ${[...calendarByDate.keys()].filter(d => parsedDates.has(d)).length}`);
console.log(`Missing (non-seasonal):       ${missingDates.length}`);
console.log('Fetching from readings...\n');

// Fetch ALL readings with _date set in one query, then filter locally
console.log('Fetching all date-based readings from Firestore...');
const allDateReadingsSnap = await readingsCol.where('_date', '!=', null).get();
const allDateDocs = {};
allDateReadingsSnap.docs.forEach(d => {
  const doc = { id: d.id, ...d.data() };
  const date = doc._date;
  if (!allDateDocs[date]) allDateDocs[date] = [];
  allDateDocs[date].push(doc);
});
console.log(`Fetched ${allDateReadingsSnap.size} date-based readings for ${Object.keys(allDateDocs).length} dates.\n`);

const results = [];

for (const { date, entries } of missingDates) {
  const docs = allDateDocs[date] || [];

  const readingEntries = docs.map(doc => {
    const type = classifyReading(doc);
    const format = detectFormat(doc.text || doc.content || '');
    const bibleRefs = extractBibleRefs(doc.text || doc.content || '');
    return {
      id: doc.id,
      title: doc.title || doc._title || '',
      type,
      format,
      bibleRefs,
      hasText: !!(doc.text || doc.content),
      hasBibleRefs: bibleRefs.length > 0,
    };
  });

  const hasFeastReading = readingEntries.some(r => r.type === 'fixed' && r.hasText);
  const hasRefs = readingEntries.some(r => r.hasBibleRefs);

  const order = ['Урачыстасць', 'Свята', 'Успамін', ''];
  const topRank = entries
    .map(e => e.rank)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? '';

  let difficulty;
  if (hasFeastReading && hasRefs) difficulty = 'auto';
  else if (hasFeastReading)      difficulty = 'manual-refs';
  else                           difficulty = 'needs-source';

  results.push({
    date,
    rank: topRank,
    _rank: RANK_MAP[topRank] ?? 'memoria-ad-libitum',
    dioceses: entries.filter(e => e.place).map(e => e.place),
    celebrations: entries.map(e => ({ title: e.title, rank: e.rank, place: e.place })),
    readingsInOldCollection: readingEntries,
    difficulty,
    action: difficulty === 'auto' ? 'migrate-from-readings'
          : difficulty === 'manual-refs' ? 'check-and-migrate'
          : 'fetch-from-catholic-by',
  });
}

// Summary
const byDifficulty = {
  auto:          results.filter(r => r.difficulty === 'auto').length,
  'manual-refs': results.filter(r => r.difficulty === 'manual-refs').length,
  'needs-source':results.filter(r => r.difficulty === 'needs-source').length,
};
const byRank = {};
results.forEach(r => { byRank[r.rank || '(пусты)'] = (byRank[r.rank || '(пусты)'] || 0) + 1; });

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    missingFromParsedData: results.length,
    byDifficulty,
    byRank,
  },
  entries: results,
};

await writeFile(OUTPUT, JSON.stringify(report, null, 2), 'utf8');

console.log('\n=== Summary ===');
console.log(`Total missing:          ${results.length}`);
console.log(`  auto (can migrate):   ${byDifficulty.auto}`);
console.log(`  manual-refs:          ${byDifficulty['manual-refs']}`);
console.log(`  needs-source:         ${byDifficulty['needs-source']}`);
console.log('\nBy rank:');
Object.entries(byRank).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
console.log(`\nReport saved: ${OUTPUT}`);

await admin.app().delete();
process.exit(0);
