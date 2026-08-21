#!/usr/bin/env node
/**
 * Import 6 missing diocesan memorials into parsedData.
 * Source: Common of Saints (Агульнае) from Roman Rite lectionary,
 * confirmed categories per saint type (martyrs / pastors / BVM / young religious / holy women).
 *
 * Missing dates: 15.02, 12.06, 26.08, 04.09, 18.09, 26.10
 * All are diocesan-only (no dedicated page on catholic.by).
 *
 * Run with --apply to write.
 */
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
if (!APPLY) console.log('[DRY RUN] pass --apply to write\n');

function r(bible) { return { bible, text: null }; }

const docs = [
  // 15.02 — Бл. Міхала Сапоцькі, прэзбітэра [Грода] — rank empty = optional
  // Common of Pastors (priests)
  {
    id: 'fixed-15.02',
    _date: '15.02',
    _rank: 'memoria-ad-libitum',
    _place: 'grodno',
    title: 'Бл. Міхала Сапоцькі, прэзбітэра',
    reading1: r('Сір 39, 6–10'),
    psalm:    r('Пс 37 (36), 3–4. 5–6. 23–24. 39–40 (Р.: 39a)'),
    gospel:   r('Ін 10, 11–16'),
  },

  // 12.06 — Бл. Генрыха Глябовіча і паплечнікаў, мучанікаў [Грода] — Успамін
  // Common of Several Martyrs
  {
    id: 'fixed-12.06',
    _date: '12.06',
    _rank: 'memoria',
    _place: 'grodno',
    title: 'Бл. Генрыха Глябовіча, прэзбітэра, і паплечнікаў, мучанікаў другой сусветнай вайны',
    reading1: r('Рым 8, 35. 37–39'),
    psalm:    r('Пс 34 (33), 2–3. 4–5. 6–7 (Р.: 18b)'),
    gospel:   r('Лк 9, 23–26'),
  },

  // 26.08 — Найсв. Панны Марыі Чэнстахоўскай — Успамін (3 дыяцэзіі)
  // Readings for Our Lady of Czestochowa (Polish/Belarusian particular calendar)
  {
    id: 'fixed-26.08-grodno',
    _date: '26.08',
    _rank: 'memoria',
    _place: 'grodno',
    title: 'Найсв. Панны Марыі Чэнстахоўскай',
    reading1: r('Ап 11, 19а; 12, 1–6а. 10аб'),
    psalm:    r('Пс 45 (44), 10bc. 11. 12аб. 16 (Р.: 10b)'),
    gospel:   r('Лк 1, 39–56'),
  },
  {
    id: 'fixed-26.08-minsk-mohilev',
    _date: '26.08',
    _rank: 'memoria',
    _place: 'minsk-mohilev',
    title: 'Найсв. Панны Марыі Чэнстахоўскай',
    reading1: r('Ап 11, 19а; 12, 1–6а. 10аб'),
    psalm:    r('Пс 45 (44), 10bc. 11. 12аб. 16 (Р.: 10b)'),
    gospel:   r('Лк 1, 39–56'),
  },
  {
    id: 'fixed-26.08-pinsk',
    _date: '26.08',
    _rank: 'memoria',
    _place: 'pinsk',
    title: 'Найсв. Панны Марыі Чэнстахоўскай',
    reading1: r('Ап 11, 19а; 12, 1–6а. 10аб'),
    psalm:    r('Пс 45 (44), 10bc. 11. 12аб. 16 (Р.: 10b)'),
    gospel:   r('Лк 1, 39–56'),
  },

  // 04.09 — Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц [Грода] — Успамін
  // Common of Several Martyrs (women religious)
  {
    id: 'fixed-04.09',
    _date: '04.09',
    _rank: 'memoria',
    _place: 'grodno',
    title: 'Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц',
    reading1: r('2 Мак 7, 1–2. 9–14'),
    psalm:    r('Пс 31 (30), 3cd–4. 5–6. 14. 15–16 (Р.: 6a)'),
    gospel:   r('Мц 25, 1–13'),
  },

  // 18.09 — Св. Станіслава Косткі, законніка — Успамін (3 дыяцэзіі)
  // Common of Holy Men (Religious / Young Saints)
  {
    id: 'fixed-18.09-grodno',
    _date: '18.09',
    _rank: 'memoria',
    _place: 'grodno',
    title: 'Св. Станіслава Косткі, законніка',
    reading1: r('Прм 4, 7–14'),
    psalm:    r('Пс 116 (115), 12–13. 14–15. 16–17 (Р.: 15)'),
    gospel:   r('Мц 18, 1–5'),
  },
  {
    id: 'fixed-18.09-minsk-mohilev',
    _date: '18.09',
    _rank: 'memoria',
    _place: 'minsk-mohilev',
    title: 'Св. Станіслава Косткі, законніка',
    reading1: r('Прм 4, 7–14'),
    psalm:    r('Пс 116 (115), 12–13. 14–15. 16–17 (Р.: 15)'),
    gospel:   r('Мц 18, 1–5'),
  },
  {
    id: 'fixed-18.09-pinsk',
    _date: '18.09',
    _rank: 'memoria',
    _place: 'pinsk',
    title: 'Св. Станіслава Косткі, законніка',
    reading1: r('Прм 4, 7–14'),
    psalm:    r('Пс 116 (115), 12–13. 14–15. 16–17 (Р.: 15)'),
    gospel:   r('Мц 18, 1–5'),
  },

  // 26.10 — Бл. Цэліны Бажэцкай [Грода] — rank empty = optional
  // Common of Holy Women (laywoman)
  {
    id: 'fixed-26.10',
    _date: '26.10',
    _rank: 'memoria-ad-libitum',
    _place: 'grodno',
    title: 'Бл. Цэліны Бажэцкай',
    reading1: r('Пр 31, 10–13. 19–20. 30–31'),
    psalm:    r('Пс 128 (127), 1–2. 3. 4–5 (Р.: 1)'),
    gospel:   r('Лк 10, 38–42'),
  },
];

console.log('=== Diocesan memorials to import ===');
for (const { id, ...data } of docs) {
  console.log(`\nSET ${id}:`);
  console.log(`  date=${data._date} rank=${data._rank} place=${data._place}`);
  console.log(`  title: ${data.title}`);
  console.log(`  r1: ${data.reading1.bible}`);
  console.log(`  psalm: ${data.psalm.bible}`);
  console.log(`  gospel: ${data.gospel.bible}`);
}
console.log(`\nTotal: ${docs.length} docs`);

if (APPLY) {
  const batch = db.batch();
  for (const { id, ...data } of docs) {
    batch.set(db.collection('parsedData').doc(id), data);
  }
  await batch.commit();
  console.log('\nDone.');
} else {
  console.log('\n[DRY RUN] nothing written.');
}
process.exit(0);
