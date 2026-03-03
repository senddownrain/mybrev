#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { parse } = require('node-html-parser');

const serviceAccount = require('./serviceAccountKey.json');

const OUTPUTS = {
  hymns: path.resolve(__dirname, 'hymns.json'),
  invitatoriums: path.resolve(__dirname, 'invitatoriums.json'),
  completoriums: path.resolve(__dirname, 'completoriums.json'),
  psalmTemplates: path.resolve(__dirname, 'psalmTemplates.json'),
};

const INVITATORIUM_FIELDS = [
  'invitatoriumPs1',
  'invitatoriumPs2',
  'invitatoriumPs3',
  'invitatoriumPs4',
  'invitatoriumPs5',
  'invitatoriumPs6',
];

const COMPLETORIUM_FIELDS = [
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
];

const PSALM_TEMPLATE_FIELDS = [
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'officeOfReadingsPs1',
  'officeOfReadingsPs2',
  'officeOfReadingsPs3',
];

function normalize(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function hasAnyContent(payload, fields) {
  return fields.some((field) => normalize(payload[field]) !== '');
}

function addUsage(target, day, options = {}) {
  const period = normalize(day._periodType);
  const feast = normalize(day._feastName);
  const date = normalize(day._date);
  const id = normalize(day.id);
  const dayOfWeek = normalize(day._dayOfWeek);

  if (period) target._usagePeriods.add(period);
  if (feast) target._usageFeasts.add(feast);
  if (date) target._usageDates.add(date);
  if (id) target._ids.add(id);
  if (options.includeDayOfWeek && dayOfWeek) target._usagedayOfWeek.add(dayOfWeek);
}

function finalizeCommon(target, options = {}) {
  target.usagePeriods = Array.from(target._usagePeriods).sort();
  target.usageFeasts = Array.from(target._usageFeasts).sort();
  target.usageDates = Array.from(target._usageDates).sort();
  target.ids = Array.from(target._ids).sort();

  delete target._usagePeriods;
  delete target._usageFeasts;
  delete target._usageDates;
  delete target._ids;

  if (options.includeDayOfWeek) {
    target.usagedayOfWeek = Array.from(target._usagedayOfWeek).sort((a, b) => Number(a) - Number(b));
    delete target._usagedayOfWeek;
  }

  return target;
}

function extractHymnTitle(htmlText) {
  const html = normalize(htmlText);
  if (!html) return '';

  return parse(html).text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)[0] || '';
}

function extractPsalmTitleFromLaudesPs1(htmlText) {
  const html = normalize(htmlText);
  if (!html) return 'Без названия';

  const lines = parse(html).text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);

  return lines.join(' / ') || 'Без названия';
}

function stableId(prefix, payload) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
  return `${prefix}_${hash}`;
}

function detectHymnFields(days) {
  const fields = new Set();
  for (const day of days) {
    Object.keys(day).forEach((key) => {
      if (key.endsWith('Hymn')) fields.add(key);
    });
  }
  return Array.from(fields).sort();
}

function buildHymns(days) {
  const hymnFields = detectHymnFields(days);
  const map = new Map();

  for (const day of days) {
    for (const oraField of hymnFields) {
      const hymn = normalize(day[oraField]);
      if (!hymn) continue;

      if (!map.has(hymn)) {
        map.set(hymn, {
          hymn,
          title: extractHymnTitle(hymn),
          oras: new Set(),
          _usagePeriods: new Set(),
          _usageFeasts: new Set(),
          _usageDates: new Set(),
          _ids: new Set(),
        });
      }

      const item = map.get(hymn);
      item.oras.add(oraField);
      addUsage(item, day);
    }
  }

  return Array.from(map.values())
    .map((item) => {
      item.oras = Array.from(item.oras).sort();
      return finalizeCommon(item);
    })
    .map((item) => ({ ...item, id: stableId('hymn', { hymn: item.hymn }) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

function buildGroupedByFields(days, fields, { idPrefix, includeValues = true, includeDayOfWeek = false }) {
  const map = new Map();

  for (const day of days) {
    if (!hasAnyContent(day, fields)) continue;

    const values = {};
    for (const field of fields) values[field] = normalize(day[field]);

    const signature = JSON.stringify(values);

    if (!map.has(signature)) {
      map.set(signature, {
        ...(includeValues ? values : {}),
        _usagePeriods: new Set(),
        _usageFeasts: new Set(),
        _usageDates: new Set(),
        _ids: new Set(),
        ...(includeDayOfWeek ? { _usagedayOfWeek: new Set() } : {}),
      });
    }

    addUsage(map.get(signature), day, { includeDayOfWeek });
  }

  return Array.from(map.values())
    .map((item) => finalizeCommon(item, { includeDayOfWeek }))
    .map((item) => ({ ...item, id: stableId(idPrefix, item) }))
    .sort((a, b) => b.ids.length - a.ids.length);
}

async function writeCollection(db, collectionName, records) {
  const batchSize = 400;

  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const batch = db.batch();

    for (const record of chunk) {
      const ref = db.collection(collectionName).doc(record.id);
      batch.set(ref, record, { merge: true });
    }

    await batch.commit();
  }
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const daysSnap = await db.collection('days').get();
  const days = daysSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const hymns = buildHymns(days);
  const invitatoriums = buildGroupedByFields(days, INVITATORIUM_FIELDS, { idPrefix: 'invitatorium' });
  const completoriums = buildGroupedByFields(days, COMPLETORIUM_FIELDS, {
    idPrefix: 'completorium',
    includeDayOfWeek: true,
  });
  const psalmTemplates = buildGroupedByFields(days, PSALM_TEMPLATE_FIELDS, {
    idPrefix: 'psalmTemplate',
    includeDayOfWeek: true,
  });

  fs.writeFileSync(OUTPUTS.hymns, JSON.stringify(hymns, null, 2), 'utf8');
  fs.writeFileSync(OUTPUTS.invitatoriums, JSON.stringify(invitatoriums, null, 2), 'utf8');
  fs.writeFileSync(OUTPUTS.completoriums, JSON.stringify(completoriums, null, 2), 'utf8');
  fs.writeFileSync(OUTPUTS.psalmTemplates, JSON.stringify(psalmTemplates, null, 2), 'utf8');

  await writeCollection(db, 'hymns', hymns);
  await writeCollection(db, 'invitatoriums', invitatoriums);
  await writeCollection(db, 'completoriums', completoriums);
  await writeCollection(db, 'psalmTemplates', psalmTemplates);

  const createdSummary = {
    sourceDays: days.length,
    created: {
      hymns: hymns.length,
      invitatoriums: invitatoriums.length,
      completoriums: completoriums.length,
      psalmTemplates: psalmTemplates.length,
    },
    files: OUTPUTS,
    collections: ['hymns', 'invitatoriums', 'completoriums', 'psalmTemplates'],
  };

  const buildGroupCountReport = (records, resolveTitle) => records
    .map((item, index) => ({
      group: resolveTitle(item, index),
      count: item.ids.length,
    }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group, 'ru'));

  const report = {
    summary: createdSummary,
    groupsCount: {
      hymns: buildGroupCountReport(hymns, (item) => item.title || 'Без названия'),
      invitatoriums: buildGroupCountReport(invitatoriums, (_, index) => `invitatorium_${index + 1}`),
      completoriums: buildGroupCountReport(completoriums, (item, index) => extractHymnTitle(item.compHymn) || `completorium_${index + 1}`),
      psalmTemplates: buildGroupCountReport(psalmTemplates, (item) => extractPsalmTitleFromLaudesPs1(item.laudesPs1)),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('Ошибка нормализации:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });
