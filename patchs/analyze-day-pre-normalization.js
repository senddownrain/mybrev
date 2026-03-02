#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DEFAULT_LOCAL_SOURCE = path.resolve(__dirname, 'liturgical-samples-fixed.json');
const serviceAccount = require('./serviceAccountKey.json');

const FIELD_GROUPS = {
  complete: [
    'compHymn',
    'compAnt1',
    'compAnt2',
    'compPs1',
    'compPs2',
    'compR',
    'compResp',
    'compAntS',
    'compPr',
    'compAntM',
  ],
  vespers: [
    'vesperHymn',
    'vesperAnt1',
    'vesperAnt2',
    'vesperAnt3',
    'vesperPs1',
    'vesperPs2',
    'vesperPs3',
    'vesperR',
    'vesperAntMag',
    'vesperInter',
    'vesperPr',
  ],
  sext2: [
    'sext2Hymn',
    'sext2Ant1',
    'sext2Ant2',
    'sext2Ant3',
    'sext2Ps1',
    'sext2Ps2',
    'sext2Ps3',
    'sext2R',
    'sext2Pr',
  ],
  laudes: [
    'laudesHymn',
    'laudesAnt1',
    'laudesAnt2',
    'laudesAnt3',
    'laudesPs1',
    'laudesPs2',
    'laudesPs3',
    'laudesR',
    'laudesAntBen',
    'laudesInter',
    'laudesPr',
  ],
  invitatorium: [
    'invitatoriumAnt',
    'invitatoriumPs1',
    'invitatoriumPs2',
    'invitatoriumPs3',
    'invitatoriumPs4',
    'invitatoriumPs5',
    'invitatoriumPs6',
  ],
};

const SINGLE_FIELDS = {
  laudesHymn: ['laudesHymn'],
  vesperHymn: ['vesperHymn'],
};

const PSALM_GROUPS = {
  vesperPsalms: ['vesperPs1', 'vesperPs2', 'vesperPs3'],
  laudesPsalms: ['laudesPs1', 'laudesPs2', 'laudesPs3'],
};

function normalize(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function buildSignature(day, fields) {
  return JSON.stringify(fields.map((field) => normalize(day[field])));
}

function collectGroupStats(days, fields) {
  const map = new Map();

  for (const day of days) {
    const signature = buildSignature(day, fields);
    if (!map.has(signature)) {
      map.set(signature, []);
    }
    map.get(signature).push(day);
  }

  const duplicateGroups = Array.from(map.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);

  const duplicateItemsCount = duplicateGroups.reduce((acc, group) => acc + group.length, 0);

  return {
    total: days.length,
    uniqueSignatures: map.size,
    duplicateGroups,
    duplicateItemsCount,
  };
}

function printStats(title, stats) {
  console.log(`\n=== ${title} ===`);
  console.log(`Одинаковых записей: ${stats.duplicateItemsCount} из ${stats.total}`);
  console.log(`Уникальных комбинаций: ${stats.uniqueSignatures}`);

  if (!stats.duplicateGroups.length) {
    console.log('Повторов не найдено.');
    return;
  }

  console.log('Размеры групп повторов (сколько записей в каждой одинаковой группе):');
  const groupSizes = stats.duplicateGroups.map((group) => group.length);
  const summary = groupSizes.reduce((acc, size) => {
    acc[size] = (acc[size] || 0) + 1;
    return acc;
  }, {});

  Object.keys(summary)
    .map(Number)
    .sort((a, b) => b - a)
    .forEach((size) => {
      console.log(`  - ${summary[size]} групп по ${size}`);
    });
}

function extractDaysFromSampleFile(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);

  const buckets = ['periodSamples', 'dateSamples', 'feastSamples'];
  const allDays = [];

  for (const bucketName of buckets) {
    const bucket = Array.isArray(data[bucketName]) ? data[bucketName] : [];
    for (const sample of bucket) {
      const days = Array.isArray(sample.days) ? sample.days : [];
      allDays.push(...days);
    }
  }

  const uniqueById = new Map();
  for (const day of allDays) {
    if (!day || typeof day !== 'object') {
      continue;
    }
    const key = day.id || `${normalize(day._date)}|${normalize(day._feast)}|${normalize(day._dayOfWeek)}`;
    if (!uniqueById.has(key)) {
      uniqueById.set(key, day);
    }
  }

  return {
    sourceLabel: `sample file: ${inputPath}`,
    allCount: allDays.length,
    uniqueDays: Array.from(uniqueById.values()),
  };
}

async function extractDaysFromFirestore() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const snap = await db.collection('days').get();
  const days = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return {
    sourceLabel: 'Firestore collection: days (full DB)',
    allCount: days.length,
    uniqueDays: days,
  };
}

function parseModeArg() {
  const arg = process.argv.find((x) => x.startsWith('--source='));
  if (!arg) return 'firestore';
  const mode = arg.split('=')[1];
  if (!['firestore', 'sample'].includes(mode)) {
    throw new Error('Неверный --source. Используйте --source=firestore или --source=sample');
  }
  return mode;
}

async function main() {
  const mode = parseModeArg();
  const source = mode === 'sample'
    ? extractDaysFromSampleFile(DEFAULT_LOCAL_SOURCE)
    : await extractDaysFromFirestore();

  console.log(`Источник: ${source.sourceLabel}`);
  console.log(`Всего day записей: ${source.allCount}`);
  console.log(`Уникальных day записей для анализа: ${source.uniqueDays.length}`);

  for (const [name, fields] of Object.entries(FIELD_GROUPS)) {
    const stats = collectGroupStats(source.uniqueDays, fields);
    printStats(name, stats);
  }

  for (const [name, fields] of Object.entries(SINGLE_FIELDS)) {
    const stats = collectGroupStats(source.uniqueDays, fields);
    printStats(`${name} (отдельно)`, stats);
  }

  for (const [name, fields] of Object.entries(PSALM_GROUPS)) {
    const stats = collectGroupStats(source.uniqueDays, fields);
    printStats(`${name} (группа псалмов)`, stats);
  }
}

main()
  .catch((error) => {
    console.error('Ошибка выполнения анализа:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });
