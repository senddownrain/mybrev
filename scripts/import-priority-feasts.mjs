#!/usr/bin/env node
/**
 * Import priority fixed feast readings into parsedData collection.
 * Readings sourced from catholic.by.
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

// ─── Helper to build a reading field ──────────────────────────────────────
function r(bible) {
  return { bible, text: null };
}

// ─── Feast readings collected from catholic.by ────────────────────────────
// Format: { id, _date, title, _rank, _place, reading1, psalm, reading2, alleluia, gospel }
// _place: '' = all dioceses; otherwise comma-separated diocese codes from liturgical.js
// _rank values: 'solemnitas', 'festum', 'memoria', 'memoria-ad-libitum'

const feasts = [
  {
    id: 'fixed-04.03',
    _date: '04.03',
    title: 'Св. Казімір',
    _rank: 'memoria',           // успамін у агульным; свята ў Гродна
    _rankPlace: { festum: 'grodno' },
    _place: '',
    reading1: r('Флп 3,8–14'),
    psalm:    r('Пс 15(14),2–3ab.3c–4ab.5'),
    reading2: null,
    alleluia: null,
    gospel:   r('Ян 15,9–17'),
  },
  {
    id: 'fixed-16.03',
    _date: '16.03',
    title: 'Гадавіна пасвячэння катэдральнага касцёла',
    _rank: 'festum',
    _place: 'minsk-mohilev',
    reading1: r('Нм 8,2–4а.5–6.8–10'),
    psalm:    r('Пс 119(118),129–130.132–133.135.144'),
    reading2: r('Эф 2,19–22'),
    alleluia: null,
    gospel:   r('Мц 16,13–19'),
  },
  {
    id: 'fixed-01.05',
    _date: '01.05',
    title: 'Св. Юзаф Работнік',
    _rank: 'festum',
    _place: '',
    reading1: r('Быц 1,26–2,3 або Клс 3,14–15.17.23–24'),
    psalm:    r('Пс 90(89),2.3–4.12–13.14і16'),
    reading2: null,
    alleluia: null,
    gospel:   r('Мц 13,54–58'),
  },
  {
    id: 'fixed-16.05',
    _date: '16.05',
    title: 'Св. Андрэй Бабаля, святар і мучанік, апякун Беларусі',
    _rank: 'solemnitas',
    _place: '',
    reading1: r('Ап 12,10–12а або 1Кар 1,10–13.17–18'),
    psalm:    r('Пс 34(33),2–3.4–5.6–7.8–9'),
    reading2: null,
    alleluia: null,
    gospel:   r('Ян 17,20–26'),
  },
  {
    id: 'fixed-09.08',
    _date: '09.08',
    title: 'Св. Тэрэза Бэнэдыкта ад Крыжа (Эдыта Штайн), панна і мучаніца, апякунка Еўропы',
    _rank: 'festum',
    _place: '',
    reading1: r('Ос 2,16b.17b.21–22'),
    psalm:    r('Пс 45(44),11–12.14–15.16–17'),
    reading2: null,
    alleluia: null,
    gospel:   r('Мц 25,1–13'),
  },
  {
    id: 'fixed-14.08',
    _date: '14.08',
    title: 'Св. Максімільян Марыя Кольбэ, прэзбітэр і мучанік',
    _rank: 'memoria',
    _place: '',
    reading1: r('2 Цім 2,22b–26'),
    psalm:    r('Пс 37(36),3–4.5–6.30–31'),
    reading2: null,
    alleluia: null,
    gospel:   r('Ян 17,20–26'),
  },
  {
    id: 'fixed-10.10',
    _date: '10.10',
    title: 'Гадавіна пасвячэння катэдральнага касцёла',
    _rank: 'festum',
    _place: 'vitebsk',
    // Same readings as any cathedral dedication anniversary (common)
    reading1: r('Нм 8,2–4а.5–6.8–10'),
    psalm:    r('Пс 119(118),129–130.132–133.135.144'),
    reading2: r('Эф 2,19–22'),
    alleluia: null,
    gospel:   r('Мц 16,13–19'),
  },
  {
    id: 'fixed-16.11',
    _date: '16.11',
    title: 'Найсв. Панна Марыя, Маці Міласэрнасці (Маці Божая Вастрабрамская)',
    _rank: 'memoria',           // успамін у агульным; урачыстасць у Гродна
    _rankPlace: { solemnitas: 'grodno' },
    _place: '',
    reading1: r('Эф 1,3–6.11–12'),
    psalm:    r('Лк 1,46–47.48–49.50–51.52–53.54–55'),
    reading2: null,
    alleluia: null,
    gospel:   r('Лк 1,39–47'),
  },
  {
    id: 'fixed-04.12',
    _date: '04.12',
    title: 'Гадавіна пасвячэння катэдральнага касцёла',
    _rank: 'festum',
    _place: 'grodno',
    // Same readings as any cathedral dedication anniversary (common)
    reading1: r('Нм 8,2–4а.5–6.8–10'),
    psalm:    r('Пс 119(118),129–130.132–133.135.144'),
    reading2: r('Эф 2,19–22'),
    alleluia: null,
    gospel:   r('Мц 16,13–19'),
  },
];

// ─── Also include christthehighpriest and paul VI (dynamic feasts already in parsedData?) ──
// These are dynamic feasts — stored by _feast code, not _date.
// Check: do they already exist?
const dynamicCheck = ['christthehighpriest', 'paulvi'];

// ─── Main ─────────────────────────────────────────────────────────────────

console.log(`Processing ${feasts.length} fixed feast entries...\n`);

for (const feast of feasts) {
  const { id, _rankPlace, ...data } = feast;

  // Check if already exists
  const existing = await col.doc(id).get();
  if (existing.exists) {
    console.log(`  SKIP ${id} — already exists`);
    continue;
  }

  // Build doc (omit null fields)
  const doc = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) doc[k] = v;
  }
  // Store _rankPlace metadata if applicable
  if (_rankPlace) doc._rankPlace = _rankPlace;

  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'} ${id}:`);
  console.log(`    title: ${doc.title}`);
  console.log(`    _date: ${doc._date}  _rank: ${doc._rank}  _place: ${doc._place || '(all)'}`);
  if (doc.reading1) console.log(`    reading1: ${doc.reading1.bible}`);
  if (doc.psalm)    console.log(`    psalm:    ${doc.psalm.bible}`);
  if (doc.reading2) console.log(`    reading2: ${doc.reading2.bible}`);
  if (doc.gospel)   console.log(`    gospel:   ${doc.gospel.bible}`);

  if (apply) {
    await col.doc(id).set(doc);
    console.log(`    ✓ written`);
  }
  console.log('');
}

// Check dynamic feasts
console.log('\n=== Checking dynamic feast docs ===');
for (const code of dynamicCheck) {
  const snap = await col.doc(`feast-${code}`).get();
  console.log(`  feast-${code}: ${snap.exists ? `✓ exists` : '✗ missing'}`);
  if (snap.exists) {
    const d = snap.data();
    console.log(`    gospel: ${d.gospel?.bible || '(none)'}`);
  }
}

console.log('\nDone.');
if (!apply) console.log('\nTo apply: node scripts/import-priority-feasts.mjs --apply');

await admin.app().delete();
process.exit(0);
