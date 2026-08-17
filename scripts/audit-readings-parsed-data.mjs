#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const OUTPUT_PATH = path.resolve('reports/readings-parsed-cross-audit.json');

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

function canonicalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function selectorOf(data) {
  if (present(data._date)) return `date:${String(data._date).trim()}`;
  if (present(data._feast)) return `feast:${String(data._feast).trim().toLowerCase()}`;
  if (present(data._periodType)) {
    return `period:${String(data._periodType).trim().toLowerCase()}:w${canonicalNumber(data._periodWeekNumber) ?? ''}:d${canonicalNumber(data._dayOfWeek) ?? ''}`;
  }
  return null;
}

function groupBy(items, getKey) {
  const result = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
  }
  return result;
}

function compactReading(document) {
  const data = document.data();
  return {
    _id: document.id,
    selector: selectorOf(data),
    _date: data._date ?? null,
    _feast: data._feast ?? null,
    _periodType: data._periodType ?? null,
    _periodWeekNumber: data._periodWeekNumber ?? null,
    _dayOfWeek: data._dayOfWeek ?? null,
    title: data.title ?? null,
    hasText: typeof data.text === 'string' && data.text.trim().length > 0,
    textLength: typeof data.text === 'string' ? data.text.length : 0,
    hasGospelHeading: typeof data.text === 'string' && /ЕВАНГЕЛ|ЭВАНГЕЛ/u.test(data.text.toUpperCase()),
  };
}

function compactParsed(document) {
  const data = document.data();
  return {
    _id: document.id,
    _sourceId: data._sourceId ?? null,
    selector: selectorOf(data),
    year: data.year ?? null,
    hasBible: typeof data.gospel?.bible === 'string' && data.gospel.bible.trim().length > 0,
    hasGospelText: typeof data.gospel?.text === 'string' && data.gospel.text.trim().length > 0,
  };
}

function summarizeGroup(selector, readings, parsed) {
  const uniqueTitles = [...new Set(readings.map((item) => item.title).filter(Boolean))];
  return {
    selector,
    readingDocuments: readings.map((item) => item._id),
    parsedDocuments: parsed.map((item) => item._id),
    parsedSourceIds: [...new Set(parsed.map((item) => item._sourceId).filter(Boolean))],
    titles: uniqueTitles,
    readingDocumentsWithText: readings.filter((item) => item.hasText).length,
    readingDocumentsWithGospelHeading: readings.filter((item) => item.hasGospelHeading).length,
  };
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const [readingSnapshot, parsedSnapshot] = await Promise.all([
    db.collection('readings').get(),
    db.collection('parsedData').get(),
  ]);
  const readings = readingSnapshot.docs.map(compactReading);
  const parsed = parsedSnapshot.docs.map(compactParsed);
  const readingsBySelector = groupBy(readings.filter((item) => item.selector), (item) => item.selector);
  const parsedBySelector = groupBy(parsed.filter((item) => item.selector), (item) => item.selector);
  const allSelectors = [...new Set([...readingsBySelector.keys(), ...parsedBySelector.keys()])].sort();
  const groups = allSelectors.map((selector) => summarizeGroup(
    selector,
    readingsBySelector.get(selector) ?? [],
    parsedBySelector.get(selector) ?? [],
  ));
  const readingIds = new Set(readings.map((item) => item._id));

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      readingDocuments: readings.length,
      parsedDocuments: parsed.length,
      readingSelectors: readingsBySelector.size,
      parsedSelectors: parsedBySelector.size,
      selectorsInBoth: groups.filter((group) => group.readingDocuments.length && group.parsedDocuments.length).length,
      selectorsOnlyInReadings: groups.filter((group) => group.readingDocuments.length && !group.parsedDocuments.length).length,
      selectorsOnlyInParsedData: groups.filter((group) => !group.readingDocuments.length && group.parsedDocuments.length).length,
      parsedDocumentsLinkedBySourceId: parsed.filter((item) => item._sourceId && readingIds.has(item._sourceId)).length,
      readingDocumentsWithGospelHeading: readings.filter((item) => item.hasGospelHeading).length,
    },
    candidates: {
      readingsWithoutParsedData: groups.filter((group) => group.readingDocuments.length && !group.parsedDocuments.length),
      parsedDataWithoutReadings: groups.filter((group) => !group.readingDocuments.length && group.parsedDocuments.length),
      selectorsWithMultipleReadingTitles: groups.filter((group) => group.titles.length > 1),
      selectorsWithReadingTextButNoParsedData: groups.filter((group) =>
        group.readingDocumentsWithText > 0 && !group.parsedDocuments.length,
      ),
      parsedDocumentsWithUnknownSourceId: parsed
        .filter((item) => item._sourceId && !readingIds.has(item._sourceId))
        .map(({ _id, _sourceId, selector }) => ({ _id, _sourceId, selector })),
    },
    withoutSelector: {
      readings: readings.filter((item) => !item.selector).map((item) => item._id),
      parsedData: parsed.filter((item) => !item.selector).map((item) => item._id),
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(report.counts, null, 2));
}

main().catch((error) => {
  console.error('Cross-collection audit failed:', error);
  process.exitCode = 1;
});
