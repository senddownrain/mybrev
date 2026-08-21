#!/usr/bin/env node
/**
 * Import Christmas/Epiphany period lectionary readings into parsedData.
 * Source: Belarusian Catholic Lectionary (photos from priest), pages 103–143.
 *
 * Covers:
 *   _date-based docs: 31.12, 01.01, 02.01–05.01, 06.01, 07.01–12.01
 *   Dynamic feast:    feast-buptismofthelord (Year A / B / C)
 *
 * DRY RUN by default. Pass --apply to write to Firestore.
 */

import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };

const apply = process.argv.includes('--apply');
console.log(`Mode: ${apply ? 'APPLY (writing to Firestore)' : 'DRY RUN'}\n`);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const col = db.collection('parsedData');

function r(bible) {
  return { bible, text: null };
}

// ─── _date-based docs ─────────────────────────────────────────────────────────
// Lookup: parsedReadingsService queries where('_date', '==', 'DD.MM')
// Applies to: seasonal date exceptions (Dec 25–Jan 12) and their exclusions (Jan 1, Jan 6).

const dateDocs = [
  {
    id: 'christmas-29-12',
    _date: '29.12',
    reading1: r('1 Ян 2,3–11'),
    psalm:    r('Пс 96(95),1–2а.2b–3.5b–6 (Р.:11а)'),
    alleluia: r('Лк 2,32'),
    gospel:   r('Лк 2,22–35'),
  },
  {
    id: 'christmas-30-12',
    _date: '30.12',
    reading1: r('1 Ян 2,12–17'),
    psalm:    r('Пс 96(95),7–8а.8b–9.10 (Р.:11а)'),
    // alleluia: seasonal text without Bible citation — omitted
    gospel:   r('Лк 2,36–40'),
  },
  {
    id: 'christmas-31-12',
    _date: '31.12',
    title: 'Сёмы дзень Актавы Нараджэння Пана',
    reading1: r('1 Ян 2,18–21'),
    psalm:    r('Пс 96(95),1–2.11–12.13 (Р.:11а)'),
    alleluia: r('Ян 1,14а.12а'),
    gospel:   r('Ян 1,1–18'),
  },
  {
    id: 'christmas-01-01',
    _date: '01.01',
    title: 'Святой Багародзіцы Марыі',
    _rank: 'solemnitas',
    reading1: r('Лч 6,22–27'),
    psalm:    r('Пс 67(66),2–3.5.6і8 (Р.:2а)'),
    reading2: r('Гал 4,4–7'),
    alleluia: r('Гбр 1,1–2'),
    gospel:   r('Лк 2,16–21'),
  },
  {
    id: 'christmas-02-01',
    _date: '02.01',
    reading1: r('1 Ян 2,22–28'),
    psalm:    r('Пс 98(97),1.2–3ab.3cd–4 (Р.:3c)'),
    alleluia: r('Гбр 1,1–2'),
    gospel:   r('Ян 1,19–28'),
  },
  {
    id: 'christmas-03-01',
    _date: '03.01',
    reading1: r('1 Ян 2,29–3,6'),
    psalm:    r('Пс 98(97),1.3cd–4.5–6 (Р.:3c)'),
    alleluia: r('Ян 1,14а.12а'),
    gospel:   r('Ян 1,29–34'),
  },
  {
    id: 'christmas-04-01',
    _date: '04.01',
    reading1: r('1 Ян 3,7–10'),
    psalm:    r('Пс 98(97),1.7–8.9 (Р.:3c)'),
    alleluia: r('Гбр 1,1–2'),
    gospel:   r('Ян 1,35–42'),
  },
  {
    id: 'christmas-05-01',
    _date: '05.01',
    reading1: r('1 Ян 3,11–21'),
    psalm:    r('Пс 100(99),2.3.4.5 (Р.:2а)'),
    // alleluia: seasonal text without Bible citation — omitted
    gospel:   r('Ян 1,43–51'),
  },
  {
    id: 'christmas-06-01',
    _date: '06.01',
    title: 'Аб\'яўленне Пана',
    _rank: 'solemnitas',
    reading1: r('Іс 60,1–6'),
    psalm:    r('Пс 72(71),1–2.7–8.10–11.12–13 (Р.:пар.11)'),
    reading2: r('Эф 3,2–3а.5–6'),
    alleluia: r('Мц 2,2'),
    gospel:   r('Мц 2,1–12'),
  },
  {
    id: 'christmas-07-01',
    _date: '07.01',
    reading1: r('1 Ян 3,22–4,6'),
    psalm:    r('Пс 2,7–8.10–11 (Р.:8а)'),
    alleluia: r('пар. Мц 4,23'),
    gospel:   r('Мц 4,12–17.23–25'),
  },
  {
    id: 'christmas-08-01',
    _date: '08.01',
    reading1: r('1 Ян 4,7–10'),
    psalm:    r('Пс 72(71),1–2.3–4ab.7–8 (Р.:пар.11)'),
    alleluia: r('пар. 1 Цім 3,16'),
    gospel:   r('Мк 6,34–44'),
  },
  {
    id: 'christmas-09-01',
    _date: '09.01',
    reading1: r('1 Ян 4,11–18'),
    psalm:    r('Пс 72(71),1–2.10–11.12–13 (Р.:пар.11)'),
    alleluia: r('Лк 4,18'),
    gospel:   r('Лк 4,14–22а'),
  },
  {
    id: 'christmas-10-01',
    _date: '10.01',
    reading1: r('1 Ян 4,19–5,4'),
    psalm:    r('Пс 72(71),1–2.14і15bc.17 (Р.:пар.11)'),
    alleluia: r('пар. 1 Цім 3,16'),
    gospel:   r('Мк 6,45–52'),
  },
  {
    id: 'christmas-11-01',
    _date: '11.01',
    reading1: r('1 Ян 5,5–13'),
    psalm:    r('Пс 147,12–13.14–15.19–20 (Р.:12а)'),
    alleluia: r('пар. Мц 4,23'),
    gospel:   r('Лк 5,12–16'),
  },
  {
    id: 'christmas-12-01',
    _date: '12.01',
    reading1: r('1 Ян 5,14–21'),
    psalm:    r('Пс 149,1–2.3–4.5–6а і 9b (Р.:4а)'),
    alleluia: r('Мц 4,16'),
    gospel:   r('Ян 3,22–30'),
  },
];

// ─── Dynamic feast: Feast of the Baptism of the Lord ─────────────────────────
// Feast code: 'buptismofthelord' (note: typo in codebase)
// Standard base readings are the same across all years.
// Gospel varies by liturgical year (A/B/C).

const baptismBase = {
  _feast: 'buptismofthelord',
  title: 'Хрост Пана',
  _rank: 'festum',
  _place: '',
  reading1: r('Іс 42,1–4.6–7'),
  psalm:    r('Пс 29(28),1а і 2.3ас–4.3b і 9b–10 (Р.:11b)'),
  reading2: r('Дз 10,34–38'),
  alleluia: r('пар. Мк 9,6'),
};

const baptismDocs = [
  {
    id: 'feast-buptismofthelord_A',
    ...baptismBase,
    year: 'A',
    gospel: r('Мц 3,13–17'),
  },
  {
    id: 'feast-buptismofthelord_B',
    ...baptismBase,
    year: 'B',
    gospel: r('Мк 1,7–11'),
  },
  {
    id: 'feast-buptismofthelord_C',
    ...baptismBase,
    year: 'C',
    gospel: r('Лк 3,15–16.21–22'),
  },
];

const allDocs = [...dateDocs, ...baptismDocs];

console.log(`Processing ${allDocs.length} docs...\n`);

for (const entry of allDocs) {
  const { id, ...data } = entry;

  const existing = await col.doc(id).get();
  if (existing.exists) {
    console.log(`  SKIP ${id} — already exists`);
    continue;
  }

  const doc = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));

  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'} ${id}:`);
  if (doc._date)  console.log(`    _date:   ${doc._date}`);
  if (doc._feast) console.log(`    _feast:  ${doc._feast}  year: ${doc.year ?? '(all)'}`);
  if (doc.title)  console.log(`    title:   ${doc.title}`);
  if (doc.reading1) console.log(`    reading1: ${doc.reading1.bible}`);
  if (doc.psalm)    console.log(`    psalm:    ${doc.psalm.bible}`);
  if (doc.reading2) console.log(`    reading2: ${doc.reading2.bible}`);
  if (doc.alleluia) console.log(`    alleluia: ${doc.alleluia.bible}`);
  if (doc.gospel)   console.log(`    gospel:   ${doc.gospel.bible}`);

  if (apply) {
    await col.doc(id).set(doc);
    console.log(`    ✓ written`);
  }
  console.log('');
}

console.log('Done.');
if (!apply) console.log('\nTo apply: node scripts/import-christmas-readings.mjs --apply');

await admin.app().delete();
process.exit(0);
