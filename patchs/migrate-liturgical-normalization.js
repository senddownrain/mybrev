#!/usr/bin/env node
/**
 * Нормализация полей в коллекциях days/readings:
 *  - _date -> DD.MM
 *  - _periodWeekNumber/_dayOfWeek -> number
 *  - _feast -> каноническое значение из FEAST_NAME_MAP
 *  - удаление cycle из readings
 *
 * Запуск:
 *   node patchs/migrate-liturgical-normalization.js            # dry-run
 *   node patchs/migrate-liturgical-normalization.js --write    # запись в базу
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.resolve(__dirname, './serviceAccountKey.json'));

const FEAST_NAME_MAP = {
  holyFamily: 'holyfamily',
  baptismOfLord: 'buptismofthelord',
  holyTrinity: 'trinity',
  christKing: 'christking',
  sacredHeartOfJesus: 'heartofjesus',
  immaculateHeartOfMary: 'heartofmary',
  christTheHighPriest: 'christthehighpriest',
  ashWednesday: 'ash',
  easterSunday: 'eastersunday',
  pentecost: 'pentecost',
  palmSunday: 'palmsunday',
  palmsSnday: 'palmsunday',
  corpusChristi: 'corpuschristi',
  ascension: 'ascension',
};

const writeMode = process.argv.includes('--write');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();

  const m1 = str.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m1) {
    const d = String(Number(m1[1])).padStart(2, '0');
    const m = String(Number(m1[2])).padStart(2, '0');
    return `${d}.${m}`;
  }

  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    return `${m2[3]}.${m2[2]}`;
  }

  return str;
}

function normalizeInt(value) {
  if (value === null || value === undefined || value === '') return value;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : value;
}

function feastNormalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]/gi, '');
}

const FEAST_CANONICAL_VALUES = Object.values(FEAST_NAME_MAP);
const FEAST_LOOKUP = new Map();
for (const [k, v] of Object.entries(FEAST_NAME_MAP)) {
  FEAST_LOOKUP.set(feastNormalizeKey(k), v);
  FEAST_LOOKUP.set(feastNormalizeKey(v), v);
}

function normalizeFeast(value) {
  if (!value) return null;
  const key = feastNormalizeKey(value);
  if (FEAST_LOOKUP.has(key)) return FEAST_LOOKUP.get(key);

  const lowered = String(value).trim().toLowerCase();
  const byContains = FEAST_CANONICAL_VALUES.find((x) => key.includes(feastNormalizeKey(x)) || feastNormalizeKey(x).includes(key));
  return byContains || lowered;
}

async function migrateCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  let changed = 0;
  let untouched = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};

    if (data._date) {
      const v = normalizeDate(data._date);
      if (v !== data._date) patch._date = v;
    }

    if (data._periodWeekNumber !== undefined && data._periodWeekNumber !== null) {
      const v = normalizeInt(data._periodWeekNumber);
      if (v !== data._periodWeekNumber) patch._periodWeekNumber = v;
    }

    if (data._dayOfWeek !== undefined && data._dayOfWeek !== null) {
      const v = normalizeInt(data._dayOfWeek);
      if (v !== data._dayOfWeek) patch._dayOfWeek = v;
    }

    if (data._feast) {
      const v = normalizeFeast(data._feast);
      if (v !== data._feast) patch._feast = v;
    }

    if (collectionName === 'readings' && data.cycle !== undefined) {
      patch.cycle = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(patch).length > 0) {
      changed++;
      if (writeMode) {
        batch.update(doc.ref, patch);
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      console.log(`[${collectionName}] ${doc.id}`, patch);
    } else {
      untouched++;
    }
  }

  if (writeMode && ops > 0) {
    await batch.commit();
  }

  console.log(`\n[${collectionName}] total=${snap.size}, changed=${changed}, untouched=${untouched}, mode=${writeMode ? 'WRITE' : 'DRY-RUN'}`);
}

(async () => {
  try {
    await migrateCollection('days');
    await migrateCollection('readings');
    console.log('\nDone.');
    process.exit(0);
  } catch (e) {
    console.error('Migration error:', e);
    process.exit(1);
  }
})();
