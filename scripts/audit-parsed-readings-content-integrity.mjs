#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import {
  normalizeFeastCode,
  normalizeReadingCycle,
  readingSelector,
} from '../src/utils/parsedReadingsIdentity.js';

const OUTPUT = path.resolve('reports/parsed-readings-content-integrity-audit.json');
const VALID_YEARS = new Set(['A', 'B', 'C', '1', '2']);
const snapshotArgumentIndex = process.argv.indexOf('--snapshot');
const SNAPSHOT_DIRECTORY = snapshotArgumentIndex >= 0
  ? path.resolve(process.argv[snapshotArgumentIndex + 1])
  : path.resolve('backups/firestore-snapshot');

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

export function readingSectionNames(document) {
  return Object.keys(document ?? {}).filter((key) => /^reading\d+$/u.test(key))
    .sort((left, right) => Number(left.slice(7)) - Number(right.slice(7)));
}

export function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedLabel(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('be')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validTitle(sectionName, value) {
  const title = String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('be');
  if (sectionName === 'gospel') {
    return /^(?:\+?\s*(?:чытанне|пачатак|заканчэнне)\s+(?:[сc]вятога\s+)?евангелля\s+паводле|мука\s+пана.*\s+паводле)(?=\s|$)/u.test(title);
  }
  return /^(?:чытанне|пачатак|заканчэнне)(?=\s|$)/u.test(title);
}

function validateReadingSection(document, sectionName, issues) {
  const section = document[sectionName];
  if (!section || typeof section !== 'object') {
    issues.push({ section: sectionName, field: null, problem: 'missing-section' });
    return;
  }
  for (const field of ['text', 'comment', 'title', 'bible']) {
    if (!present(section[field])) {
      issues.push({ section: sectionName, field, problem: 'missing-required-field' });
    }
  }
  if (present(section.title) && !validTitle(sectionName, section.title)) {
    issues.push({
      section: sectionName,
      field: 'title',
      problem: 'non-lectionary-title',
      value: section.title,
      comment: section.comment ?? null,
    });
  }
}

function validatePsalm(document, issues) {
  const section = document.psalm;
  if (!section || typeof section !== 'object') {
    issues.push({ section: 'psalm', field: null, problem: 'missing-section' });
    return;
  }
  if (!present(section.bible)) issues.push({ section: 'psalm', field: 'bible', problem: 'missing-required-field' });
  if (!present(section.chorus)) issues.push({ section: 'psalm', field: 'chorus', problem: 'missing-required-field' });
  if (!Array.isArray(section.verses) || !section.verses.length
    || section.verses.some((item) => !present(item))) {
    issues.push({ section: 'psalm', field: 'verses', problem: 'missing-required-field' });
  }
  if (!hasOwn(section, 'altChorus')) {
    issues.push({ section: 'psalm', field: 'altChorus', problem: 'missing-nullable-field' });
  } else if (section.altChorus !== null && !present(section.altChorus)) {
    issues.push({ section: 'psalm', field: 'altChorus', problem: 'invalid-nullable-field' });
  }
  const firstVerse = Array.isArray(section.verses) ? section.verses[0] : null;
  if (/^\s*\d+[а-яёіўa-z]?\.\s/iu.test(section.chorus ?? '')
    && present(firstVerse) && !/^\s*\d+[а-яёіўa-z]?\.\s/iu.test(firstVerse)) {
    issues.push({ section: 'psalm', field: 'chorus', problem: 'swapped-psalm-chorus' });
  }
  if (present(section.chorus) && normalizedLabel(section.chorus) === normalizedLabel(firstVerse)) {
    issues.push({ section: 'psalm', field: 'verses', problem: 'duplicated-psalm-chorus-in-verses' });
  }
  if (!present(section.chorus) && /^\s*Рэфрэн:\s*\S/iu.test(firstVerse ?? '')) {
    issues.push({ section: 'psalm', field: 'verses', problem: 'embedded-psalm-chorus' });
  }
  if (!present(section.bible) && /^\s*Пс\s+\S/iu.test(firstVerse ?? '')) {
    issues.push({ section: 'psalm', field: 'verses', problem: 'embedded-psalm-bible' });
  }
  if (/Або:/iu.test(section.chorus ?? '')) {
    issues.push({ section: 'psalm', field: 'chorus', problem: 'embedded-alternate-psalm-chorus' });
  }
  if (Array.isArray(section.verses) && section.verses.some((item) => (
    /^(?:Год\s+[ІI1VХX]+|ПЕРШАЕ ЧЫТАННЕ|ДРУГОЕ ЧЫТАННЕ|РЭСПАНСАРЫЙНЫ ПСАЛЬМ|СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ|ЕВАНГЕЛЛЕ|Гэта слова Божае\.?|[аa]?РЭСПАНСАРЫЙНЫ ПСАЛЬМ|Рэфрэн:?\s*)$/iu.test(String(item ?? '').trim())
    || /Рэфрэн:?\s*[аa]?\s*$/iu.test(String(item ?? '').trim())
  ))) {
    issues.push({ section: 'psalm', field: 'verses', problem: 'parser-marker-in-psalm-verses' });
  }
}

function validateAlleluia(document, issues) {
  const section = document.alleluia;
  if (!section || typeof section !== 'object') {
    const vigilPsalm = String(document?._variant ?? '').toLowerCase() === 'vigil'
      && /^Аллелюя(?:,\s*аллелюя)*[.!]?$/iu.test(String(document?.psalm?.chorus ?? '').trim());
    if (vigilPsalm) return;
    issues.push({ section: 'alleluia', field: null, problem: 'missing-section' });
    return;
  }
  if (!present(section.verse)) issues.push({ section: 'alleluia', field: 'verse', problem: 'missing-required-field' });
  if (!hasOwn(section, 'bible')) {
    issues.push({ section: 'alleluia', field: 'bible', problem: 'missing-nullable-field' });
  } else if (section.bible !== null && !present(section.bible)) {
    issues.push({ section: 'alleluia', field: 'bible', problem: 'invalid-nullable-field' });
  }
  if (/^Хвала\s+Табе,\s+слова\s+Божае\.|Хвала\s+Табе,\s+слова\s+Божае\.?\s*$/iu.test(section.verse ?? '')) {
    issues.push({ section: 'alleluia', field: 'verse', problem: 'acclamation-wrapper-in-verse' });
  }
}

export function documentIssues(document) {
  const issues = [];
  validateReadingSection(document, 'reading1', issues);
  for (const sectionName of readingSectionNames(document).filter((name) => name !== 'reading1')) {
    if (document[sectionName] !== null) validateReadingSection(document, sectionName, issues);
  }
  validatePsalm(document, issues);
  validateAlleluia(document, issues);
  validateReadingSection(document, 'gospel', issues);

  if (!hasOwn(document, 'year')) {
    issues.push({ section: null, field: 'year', problem: 'missing-nullable-field' });
  } else if (document.year !== null && !VALID_YEARS.has(document.year)) {
    issues.push({ section: null, field: 'year', problem: 'invalid-year', value: document.year });
  }
  if (hasOwn(document, '_sourceCategory')) {
    issues.push({ section: null, field: '_sourceCategory', problem: 'obsolete-field' });
  }
  return issues;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function movableFeastAudit(documents) {
  const groups = new Map();
  for (const document of documents) {
    const feast = normalizeFeastCode(document._feast);
    if (!feast) continue;
    if (!groups.has(feast)) groups.set(feast, []);
    groups.get(feast).push(document);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([feast, documents]) => {
    const byYear = new Map();
    for (const document of documents) {
      const year = normalizeReadingCycle(document.year) || 'null';
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(document.id);
    }
    const duplicateCycles = Object.fromEntries([...byYear.entries()]
      .filter(([, ids]) => ids.length > 1));
    return {
      feast,
      documents: documents.map((item) => ({
        id: item.id,
        year: normalizeReadingCycle(item.year) || null,
        variant: item._variant ?? null,
        sourceUrl: item._sourceUrl ?? null,
      })),
      duplicateCycles,
    };
  });
}

function mixedCycleGroups(documents) {
  const groups = new Map();
  for (const document of documents) {
    const selector = readingSelector(document);
    if (!selector) continue;
    if (!groups.has(selector)) groups.set(selector, []);
    groups.get(selector).push(document);
  }
  return [...groups.entries()].map(([selector, items]) => {
    const cycles = [...new Set(items.map((item) => normalizeReadingCycle(item.year)).filter(Boolean))].sort();
    const unqualified = items.filter((item) => !normalizeReadingCycle(item.year) && !item._variant);
    return {
      selector,
      cycles,
      unqualified: unqualified.map((item) => item.id),
      variants: items.filter((item) => item._variant).map((item) => ({ id: item.id, variant: item._variant })),
      documents: items.map((item) => ({ id: item.id, year: normalizeReadingCycle(item.year) || null })),
    };
  }).filter((item) => item.cycles.length && item.unqualified.length);
}

async function main() {
  const snapshot = await openFirestoreSnapshot(SNAPSHOT_DIRECTORY);
  const documents = await snapshot.collection('readings');
  if (!documents) {
    throw new Error(`Snapshot does not contain readings: ${snapshot.root}`);
  }
  const documentReports = documents.map((document) => ({
    id: document.id,
    title: document.title ?? null,
    sourceUrl: document._sourceUrl ?? null,
    issues: documentIssues(document),
  })).filter((item) => item.issues.length);
  const allIssues = documentReports.flatMap((item) => item.issues);
  const movableFeasts = movableFeastAudit(documents);
  const duplicateMovableCycles = movableFeasts.filter((item) => Object.keys(item.duplicateCycles).length);
  const unqualifiedAlongsideCycles = mixedCycleGroups(documents);

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      documents: documents.length,
      documentsWithIssues: documentReports.length,
      issues: allIssues.length,
      issuesByProblem: countBy(allIssues, (item) => item.problem),
      issuesByField: countBy(allIssues, (item) => `${item.section ?? 'document'}.${item.field ?? 'section'}`),
      movableFeasts: movableFeasts.length,
      movableFeastsWithDuplicateCycles: duplicateMovableCycles.length,
      obsoleteSourceCategoryFields: documents.filter((item) => hasOwn(item, '_sourceCategory')).length,
      unqualifiedAlongsideCycleGroups: unqualifiedAlongsideCycles.length,
    },
    duplicateMovableCycles,
    movableFeasts,
    unqualifiedAlongsideCycles,
    documents: documentReports,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('readings content-integrity audit failed:', error);
    process.exitCode = 1;
  });
}
