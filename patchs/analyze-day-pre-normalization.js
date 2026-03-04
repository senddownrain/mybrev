#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DEFAULT_LOCAL_SOURCE = path.resolve(__dirname, 'liturgical-samples-fixed.json');
const serviceAccount = require('./serviceAccountKey.json');

const ANALYSES = {
  invitatorium: [
    'invitatoriumAnt',
    'invitatoriumPs1',
    'invitatoriumPs2',
    'invitatoriumPs3',
    'invitatoriumPs4',
    'invitatoriumPs5',
    'invitatoriumPs6',
  ],
  laudesHymn: ['laudesHymn'],
  vesperHymn: ['vesperHymn'],
  vesperPsalms: ['vesperPs1', 'vesperPs2', 'vesperPs3'],
  laudesPsalms: ['laudesPs1', 'laudesPs2', 'laudesPs3'],
};

function normalize(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function buildSignatureAndValues(day, fields) {
  const values = {};
  for (const field of fields) {
    values[field] = normalize(day[field]);
  }
  return {
    signature: JSON.stringify(values),
    values,
  };
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
    if (!day || typeof day !== 'object') continue;
    const key = day.id || `${normalize(day._date)}|${normalize(day._feast)}|${normalize(day._dayOfWeek)}`;
    if (!uniqueById.has(key)) uniqueById.set(key, day);
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

function parseArgs() {
  const options = {
    source: 'firestore',
    out: './patchs/groups-and-uniques.json',
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--source=')) {
      options.source = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--out=')) {
      options.out = path.resolve(arg.split('=')[1]);
    }
  }

  if (!['firestore', 'sample'].includes(options.source)) {
    throw new Error('Неверный --source. Используйте --source=firestore или --source=sample');
  }

  return options;
}

function analyzeGroups(days, analyses) {
  const output = {};

  for (const [analysisName, fields] of Object.entries(analyses)) {
    const bySignature = new Map();

    for (const day of days) {
      const { signature, values } = buildSignatureAndValues(day, fields);
      if (!bySignature.has(signature)) {
        bySignature.set(signature, {
          values,
          ids: [],
        });
      }
      bySignature.get(signature).ids.push(day.id || null);
    }

    const allGroups = Array.from(bySignature.values())
      .map((item) => ({
        values: item.values,
        count: item.ids.length,
        ids: item.ids,
      }))
      .sort((a, b) => b.count - a.count);

    const repeatingGroups = allGroups.filter((g) => g.count > 1);
    const uniqueGroups = allGroups.filter((g) => g.count === 1);

    const repeatingRecords = repeatingGroups.reduce((acc, g) => acc + g.count, 0);
    const uniqueRecords = uniqueGroups.length;

    const byGroupSizeMap = new Map();
    for (const group of repeatingGroups) {
      const current = byGroupSizeMap.get(group.count) || 0;
      byGroupSizeMap.set(group.count, current + 1);
    }

    const byGroupSize = Array.from(byGroupSizeMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([size, groups]) => ({ size, groups }));

    output[analysisName] = {
      fields,
      totalRecords: days.length,
      repeating: {
        records: repeatingRecords,
        groups: repeatingGroups.length,
        byGroupSize,
        combinations: repeatingGroups,
      },
      unique: {
        records: uniqueRecords,
        groups: uniqueGroups.length,
        combinations: uniqueGroups,
      },
    };
  }

  return output;
}

async function main() {
  const options = parseArgs();

  const source = options.source === 'sample'
    ? extractDaysFromSampleFile(DEFAULT_LOCAL_SOURCE)
    : await extractDaysFromFirestore();

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      mode: options.source,
      label: source.sourceLabel,
      allRecords: source.allCount,
      analyzedRecords: source.uniqueDays.length,
    },
    analyses: analyzeGroups(source.uniqueDays, ANALYSES),
  };

  const json = JSON.stringify(report, null, 2);
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, json, 'utf8');
    console.log(`JSON отчет сохранен: ${options.out}`);
    return;
  }

  console.log(json);
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
