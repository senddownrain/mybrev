#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import moment from '../src/utils/moment-be.js';
import {
  calculateBaptismOfLordDate,
  calculateChristmasPeriodWeek,
} from '../src/utils/liturgicalCalendar.js';
import { calculatePsalterWeek } from '../src/utils/liturgicalPsalter.js';
import {
  getOrdinaryPsalterDayDocumentId,
  resolveChristmasDateAgainstPeriod,
  resolveDateDayAgainstPeriod,
  resolveDayAgainstPeriod,
} from '../src/utils/liturgicalDayResolution.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const INPUT_DIR = path.join(ROOT, 'docs', 'christmas-md');
const TEMPLATE_DIR = path.join(ROOT, 'patchs', 'feasts', 'common-texts');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'christmas-markdown-import-report.json');
const BACKUP_DIR = path.join(ROOT, 'reports', 'backups');
const DEFAULT_SNAPSHOT_DIR = path.join(ROOT, 'backups', 'firestore-snapshot');
const COLLECTION = 'fixedDays';
const WRITE_CHUNK_SIZE = 40;
const APPLY = process.argv.includes('--apply');
const ONLY_ID = process.argv.find((argument) => argument.startsWith('--id='))?.slice('--id='.length) || '';
const snapshotArgument = process.argv.find((argument) => argument.startsWith('--snapshot='));
const SNAPSHOT_DIR = snapshotArgument
  ? path.resolve(ROOT, snapshotArgument.slice('--snapshot='.length))
  : DEFAULT_SNAPSHOT_DIR;

const CONTENT_FIELDS = Object.freeze([
  'invitatoriumAnt',
  'officeOfReadingsHymn', 'officeOfReadingsAnt1', 'officeOfReadingsAnt2',
  'officeOfReadingsAnt3', 'officeOfReadingsPs1', 'officeOfReadingsPs2',
  'officeOfReadingsPs3', 'officeOfReadingsVers', 'officeOfReadingsR1',
  'officeOfReadingsR2', 'officeOfReadingsTeDeum', 'officeOfReadingsPr',
  'laudesHymn', 'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesPs1',
  'laudesPs2', 'laudesPs3', 'laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr',
  'sext1Hymn', 'sext1Ant1', 'sext1Ant2', 'sext1Ant3', 'sext1Ps1', 'sext1Ps2',
  'sext1Ps3', 'sext1R', 'sext1Pr',
  'sext2Hymn', 'sext2Ant1', 'sext2Ant2', 'sext2Ant3', 'sext2Ps1', 'sext2Ps2',
  'sext2Ps3', 'sext2R', 'sext2Pr',
  'sext3Hymn', 'sext3Ant1', 'sext3Ant2', 'sext3Ant3', 'sext3Ps1', 'sext3Ps2',
  'sext3Ps3', 'sext3R', 'sext3Pr',
  'vesperHymn', 'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1',
  'vesperPs2', 'vesperPs3', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr',
  'vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3', 'vesper1Ps1',
  'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1AntMag', 'vesper1Inter', 'vesper1Pr',
]);

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function normalizeTextLayout(value) {
  if (Array.isArray(value)) return value.map(normalizeTextLayout);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeTextLayout(item)]));
  }
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value;
}

function textLayoutEqual(left, right) {
  return equal(normalizeTextLayout(left), normalizeTextLayout(right));
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function isReference(value, name) {
  if (typeof value !== 'string') return false;
  return value.trim().replace(/^\[|\]$/g, '').trim().toLowerCase() === name;
}

function isMissing(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function isConcrete(value) {
  return !isMissing(value) && !isReference(value, 'from-day') && !isReference(value, 'from-template');
}

function parseLooseArray(raw, filename, field) {
  const body = raw.slice(1, -1).trim();
  if (!body) return [];
  const values = body.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  if (!values.length) throw new Error(`${filename}:${field}: invalid array ${raw}`);
  return values;
}

function parseTextValue(raw, filename, field) {
  const value = raw.trim();
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  // Dotted liturgical dates such as 01.01 are strings, not decimal numbers.
  if (/^-?\d+$/.test(value)) return Number(value);
  if ((value.startsWith('[') && value.endsWith(']'))
    || (value.startsWith('{') && value.endsWith('}'))
    || (value.startsWith('"') && value.endsWith('"'))) {
    try {
      return JSON.parse(value);
    } catch (error) {
      if (value.startsWith('[') && value.endsWith(']')) return parseLooseArray(value, filename, field);
      throw new Error(`${filename}:${field}: invalid JSON (${error.message})`);
    }
  }
  return value;
}

function parseMarkdown(filename, markdown) {
  const payload = {};
  const fieldPattern = /^## ([^\r\n]+)\r?\n\r?\n```([^\r\n]*)\r?\n([\s\S]*?)\r?\n```/gm;
  for (const match of markdown.matchAll(fieldPattern)) {
    const [, field, language, raw] = match;
    if (hasOwn(payload, field)) throw new Error(`${filename}: duplicate field ${field}`);
    payload[field] = language.trim().toLowerCase() === 'html'
      ? raw.trim()
      : parseTextValue(raw, filename, field);
  }
  const id = String(payload.id || '').trim();
  if (!id) throw new Error(`${filename}: missing id`);
  if (id.includes('/')) throw new Error(`${filename}: id cannot contain /`);
  if (path.basename(filename, '.md') !== id) throw new Error(`${filename}: filename must equal id ${id}`);
  if (hasOwn(payload, '_templates') && !Array.isArray(payload._templates)) {
    throw new Error(`${filename}: _templates must be an array`);
  }
  // `id` is an export/review aid. Firestore already owns the document ID and
  // existing fixedDays payloads do not duplicate it as a stored field.
  delete payload.id;
  return { id, filename, payload };
}

async function loadMarkdownDocuments() {
  const filenames = (await fs.readdir(INPUT_DIR)).filter((name) => name.endsWith('.md')).sort();
  const documents = [];
  const ids = new Set();
  for (const filename of filenames) {
    const document = parseMarkdown(filename, await fs.readFile(path.join(INPUT_DIR, filename), 'utf8'));
    if (ONLY_ID && document.id !== ONLY_ID) continue;
    if (ids.has(document.id)) throw new Error(`Duplicate markdown id: ${document.id}`);
    ids.add(document.id);
    documents.push(document);
  }
  if (ONLY_ID && !documents.length) throw new Error(`Markdown document not found: ${ONLY_ID}`);
  return documents;
}

async function loadTemplates() {
  const result = new Map();
  const filenames = (await fs.readdir(TEMPLATE_DIR)).filter((name) => name.endsWith('.json'));
  for (const filename of filenames) {
    result.set(path.basename(filename, '.json'), JSON.parse(
      await fs.readFile(path.join(TEMPLATE_DIR, filename), 'utf8'),
    ));
  }
  return result;
}

function fixedDateSourceId(document) {
  const date = String(document.payload._date || '');
  if (!/^\d{2}\.\d{2}$/.test(date) || document.id.startsWith('christmas-')) return '';
  const [day, month] = date.split('.');
  return `christmas-${day}-${month}`;
}

function resolveTemplateFields(document, templates, provenance) {
  const references = document.payload._templates || [];
  for (const field of CONTENT_FIELDS) {
    if (!isReference(document.payload[field], 'from-template')) continue;
    const source = references
      .map((templateId) => ({ templateId, template: templates.get(templateId) }))
      .find(({ template }) => template && isConcrete(template[field]));
    if (!source) {
      throw new Error(`${document.filename}:${field}: no value in templates [${references.join(', ')}]`);
    }
    document.payload[field] = source.template[field];
    provenance.push({ id: document.id, field, source: `template:${source.templateId}` });
  }
}

function resolveFixedDateFields(document, documentsById, snapshotById, provenance) {
  const sourceId = fixedDateSourceId(document);
  if (!sourceId) return;
  const source = documentsById.get(sourceId)?.payload || snapshotById.get(sourceId);
  if (!source) throw new Error(`${document.filename}: missing date source ${sourceId}`);

  for (const field of CONTENT_FIELDS) {
    const current = document.payload[field];
    if (!isMissing(current) && !isReference(current, 'from-day')) continue;
    if (!isConcrete(source[field])) continue;
    document.payload[field] = source[field];
    provenance.push({ id: document.id, field, source: sourceId });
  }
}

function changedFields(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((field) => !textLayoutEqual(before?.[field], after?.[field]))
    .sort();
}

function preserveSnapshotLayout(before, after) {
  if (!before) return;
  Object.keys(after).forEach((field) => {
    if (hasOwn(before, field) && textLayoutEqual(before[field], after[field])) {
      after[field] = before[field];
    }
  });
}

function runtimeReferences(document) {
  return CONTENT_FIELDS.filter((field) => isReference(document.payload[field], 'from-day'));
}

function emptyContentFields(document) {
  return CONTENT_FIELDS.filter((field) => isMissing(document.payload[field]));
}

function storedDocument(id, documentsById, snapshotById) {
  const payload = documentsById.get(id)?.payload || snapshotById.get(id);
  return payload ? { id, ...payload } : null;
}

function isAllowedEmpty(field, documentId) {
  if (/^sext[123]Ant[23]$/.test(field)) return true;
  if (field === 'officeOfReadingsTeDeum') return true;
  if (field.startsWith('vesper1') && documentId !== 'christmas-w2-d1') return true;
  return false;
}

function coverageGaps(document) {
  return CONTENT_FIELDS.filter((field) => (
    (isMissing(document[field]) || isReference(document[field], 'from-day'))
      && !isAllowedEmpty(field, document.id)
  ));
}

function auditCompiledCoverage(documents, documentsById, snapshotById) {
  const fixedByDate = new Map();
  documents.forEach((document) => {
    const date = String(document.payload._date || '');
    if (!/^\d{2}\.\d{2}$/.test(date) || document.id.startsWith('christmas-')) return;
    const group = fixedByDate.get(date) || [];
    group.push(document);
    fixedByDate.set(date, group);
  });

  const gaps = [];
  let scenarios = 0;
  for (let christmasYear = 2020; christmasYear <= 2047; christmasYear += 1) {
    const baptism = calculateBaptismOfLordDate(christmasYear + 1);
    const finalDate = moment.min(baptism, moment(`${christmasYear + 1}-01-12`, 'YYYY-MM-DD'));
    for (let date = moment(`${christmasYear}-12-25`, 'YYYY-MM-DD');
      date.isSameOrBefore(finalDate, 'day'); date.add(1, 'day')) {
      const dayOfWeek = date.isoWeekday() === 7 ? 1 : date.isoWeekday() + 1;
      const psalterWeek = calculatePsalterWeek({
        date,
        periodType: 'christmas',
        periodWeek: calculateChristmasPeriodWeek(date),
      });
      const fallbackId = `advent-w${psalterWeek}-d${dayOfWeek}`;
      const ordinaryId = getOrdinaryPsalterDayDocumentId(psalterWeek, dayOfWeek);
      const fallback = resolveDayAgainstPeriod(
        storedDocument(fallbackId, documentsById, snapshotById),
        storedDocument(ordinaryId, documentsById, snapshotById),
        { fillMissing: true },
      );
      if (!fallback) throw new Error(`Coverage audit: missing ${fallbackId}`);

      const dateToken = date.format('DD.MM');
      const dateId = `christmas-${date.format('DD-MM')}`;
      const dateDocument = storedDocument(dateId, documentsById, snapshotById);
      const isSecondSunday = dayOfWeek === 1 && calculateChristmasPeriodWeek(date) === 2;
      if (dateDocument) {
        const main = isSecondSunday
          ? resolveChristmasDateAgainstPeriod(
            dateDocument, storedDocument('christmas-w2-d1', documentsById, snapshotById),
          )
          : resolveDateDayAgainstPeriod(dateDocument, fallback);
        const missing = coverageGaps(main);
        scenarios += 1;
        if (missing.length) gaps.push({ date: date.format('YYYY-MM-DD'), id: main.id, fields: missing });
      }

      (fixedByDate.get(dateToken) || []).forEach((fixed) => {
        const resolved = resolveDateDayAgainstPeriod({ id: fixed.id, ...fixed.payload }, fallback);
        const missing = coverageGaps(resolved);
        scenarios += 1;
        if (missing.length) gaps.push({ date: date.format('YYYY-MM-DD'), id: fixed.id, fields: missing });
      });
    }
  }
  return { years: '2020-2047', scenarios, gaps };
}

function backupName() {
  return `fixedDays-before-christmas-markdown-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function getSnapshots(db, ids) {
  const result = [];
  for (const group of chunks(ids, WRITE_CHUNK_SIZE)) {
    result.push(...await db.getAll(...group.map((id) => db.collection(COLLECTION).doc(id))));
  }
  return result;
}

async function writeDocuments(db, documents) {
  for (const group of chunks(documents, WRITE_CHUNK_SIZE)) {
    const batch = db.batch();
    group.forEach(({ id, payload }) => batch.set(db.collection(COLLECTION).doc(id), payload, { merge: false }));
    await batch.commit();
  }
}

async function main() {
  const snapshot = await openFirestoreSnapshot(SNAPSHOT_DIR);
  const snapshotDocuments = await snapshot.collection(COLLECTION);
  if (!snapshotDocuments) throw new Error(`Snapshot does not contain ${COLLECTION}`);
  const snapshotById = new Map(snapshotDocuments.map(({ id, ...data }) => [id, data]));
  const [documents, templates] = await Promise.all([loadMarkdownDocuments(), loadTemplates()]);
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const provenance = [];

  documents.forEach((document) => resolveTemplateFields(document, templates, provenance));
  documents.forEach((document) => resolveFixedDateFields(
    document, documentsById, snapshotById, provenance,
  ));

  for (const document of documents) {
    const unresolvedTemplates = CONTENT_FIELDS.filter((field) => (
      isReference(document.payload[field], 'from-template')
    ));
    if (unresolvedTemplates.length) {
      throw new Error(`${document.filename}: unresolved from-template: ${unresolvedTemplates.join(', ')}`);
    }
    preserveSnapshotLayout(snapshotById.get(document.id), document.payload);
    const bytes = Buffer.byteLength(JSON.stringify(document.payload), 'utf8');
    if (bytes >= 1_000_000) throw new Error(`${document.filename}: exceeds Firestore 1 MB limit`);
    document.bytes = bytes;
    document.changedFields = changedFields(snapshotById.get(document.id), document.payload);
  }

  const writeDocumentsList = documents.filter((document) => document.changedFields.length);
  const coverage = auditCompiledCoverage(documents, documentsById, snapshotById);
  if (coverage.gaps.length) {
    const preview = coverage.gaps.slice(0, 10)
      .map(({ date, id, fields }) => `${date}:${id} [${fields.join(', ')}]`)
      .join('; ');
    throw new Error(`Compiled Christmas coverage has ${coverage.gaps.length} gaps: ${preview}`);
  }
  const reportBase = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    analysisSource: 'local-firestore-snapshot',
    snapshot: {
      directory: snapshot.root,
      version: snapshot.manifest.snapshotVersion,
      exportedAt: snapshot.manifest.exportedAt,
    },
    collection: COLLECTION,
    coverage,
    markdownDocuments: documents.length,
    writeIds: writeDocumentsList.map(({ id }) => id),
    unchangedIds: documents.filter((document) => !document.changedFields.length).map(({ id }) => id),
    changes: writeDocumentsList.map((document) => ({
      id: document.id,
      filename: document.filename,
      changedFields: document.changedFields,
      bytes: document.bytes,
    })),
    materializedFields: provenance,
    runtimeFromDay: documents.map((document) => ({
      id: document.id,
      fields: runtimeReferences(document),
    })).filter(({ fields }) => fields.length),
    emptyContent: documents.map((document) => ({
      id: document.id,
      fields: emptyContentFields(document),
    })).filter(({ fields }) => fields.length),
  };

  if (!APPLY) {
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(reportBase, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reportPath: REPORT_PATH, ...reportBase }, null, 2));
    return;
  }

  const serviceAccount = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  try {
    const db = admin.firestore();
    const current = await getSnapshots(db, writeDocumentsList.map(({ id }) => id));
    const driftedIds = current.flatMap((currentDocument) => {
      const expected = snapshotById.get(currentDocument.id);
      if (!expected) return currentDocument.exists ? [currentDocument.id] : [];
      return currentDocument.exists && equal(currentDocument.data(), expected)
        ? []
        : [currentDocument.id];
    });
    if (driftedIds.length) {
      throw new Error(`Snapshot is stale for planned IDs: ${driftedIds.join(', ')}`);
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, backupName());
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      collection: COLLECTION,
      documents: writeDocumentsList
        .filter(({ id }) => snapshotById.has(id))
        .map(({ id }) => ({ id, data: snapshotById.get(id) })),
    }, null, 2)}\n`, 'utf8');

    await writeDocuments(db, writeDocumentsList);
    const after = await getSnapshots(db, writeDocumentsList.map(({ id }) => id));
    const failures = after.flatMap((currentDocument, index) => (
      currentDocument.exists && equal(currentDocument.data(), writeDocumentsList[index].payload)
        ? []
        : [writeDocumentsList[index].id]
    ));
    if (failures.length) throw new Error(`Post-write verification failed: ${failures.join(', ')}`);

    const report = {
      ...reportBase,
      backupPath,
      writtenDocuments: writeDocumentsList.length,
      verifiedDocuments: after.length,
      verification: 'passed',
    };
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report }, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
