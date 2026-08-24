#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import {
  READING_SECTIONS,
  canonicalizeLegacyReadingMetadata,
  normalizeFeastCode,
  normalizeReadingCycle,
  readingSelector,
  removeDuplicatedBiblePrefix,
  removeTrailingParserStub,
} from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const OUTPUT = path.resolve('reports/parsed-readings-content-integrity-audit.json');
const VALID_YEARS = new Set(['A', 'B', 'C', '1', '2']);
const FROM_BACKUPS = process.argv.includes('--from-backups');
const FIELD_BACKUP = path.resolve('reports/backups/parsedData-before-field-normalization-2026-08-24T16-09-38-998Z.json');
const COLLISION_BACKUP = path.resolve('reports/backups/parsedData-before-collision-resolution-2026-08-24T16-16-03-353Z.json');
const COLLISION_REPORT = path.resolve('reports/parsed-data-collision-resolution-report.json');
const IDENTITY_BACKUP = path.resolve('reports/backups/parsedData-before-identity-migration-2026-08-24T16-19-52-518Z.json');
const CATALOG = path.resolve('reports/parsed-data-catalog.json');
let locallyMissingDocuments = 0;

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

function normalizeContentFields(document) {
  const result = structuredClone(document);
  const sectionNames = [...new Set([...READING_SECTIONS, ...readingSectionNames(result)])];
  for (const sectionName of sectionNames) {
    const section = result[sectionName];
    if (!section || typeof section !== 'object') continue;
    for (const [field, value] of Object.entries(section)) {
      if (Array.isArray(value)) {
        section[field] = value.map(removeTrailingParserStub).filter((item) => item !== null);
      } else if (typeof value === 'string') {
        let cleaned = removeTrailingParserStub(value);
        if (field === (sectionName === 'alleluia' ? 'verse' : 'text')) {
          cleaned = removeDuplicatedBiblePrefix(cleaned, section.bible);
        }
        section[field] = cleaned;
      }
    }
  }
  return result;
}

function normalizedLabel(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('be')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function placeKey(value) {
  return (Array.isArray(value) ? value : [value]).filter(Boolean).map(String).sort().join(',');
}

function selectorKey(document) {
  if (document._date) return `date:${document._date}`;
  if (document._feast) return `feast:${normalizeFeastCode(document._feast)}`;
  return `period:${document._periodType ?? ''}:${document._periodWeekNumber ?? ''}:${document._dayOfWeek ?? ''}`;
}

function catalogMatchScore(document, candidate) {
  if (normalizeReadingCycle(document.year) !== normalizeReadingCycle(candidate.year)) return -1;
  if (selectorKey(document) !== selectorKey(candidate)) return -1;
  let score = 0;
  if (document._sourceUrl && candidate._sourceUrl === document._sourceUrl) score += 100;
  if (normalizedLabel(document.title) === normalizedLabel(candidate.title)) score += 20;
  if (document._rank && document._rank === candidate._rank) score += 5;
  if (placeKey(document._place) === placeKey(candidate._place)) score += 5;
  return score;
}

function applyCatalogIds(documents, catalog) {
  const readings = catalog.flatMap((item) => item.readings ?? []);
  return documents.map((document) => {
    const matches = readings.map((candidate) => ({
      candidate,
      score: catalogMatchScore(document, candidate),
    })).filter((item) => item.score >= 20)
      .sort((left, right) => right.score - left.score);
    if (!matches.length || (matches[1] && matches[1].score === matches[0].score)) return document;
    return { ...document, id: matches[0].candidate._id };
  });
}

export async function loadReconstructedDocuments() {
  const [fieldBackup, collisionBackup, collisionReport, identityBackup, catalog] = await Promise.all([
    readFile(FIELD_BACKUP, 'utf8').then(JSON.parse),
    readFile(COLLISION_BACKUP, 'utf8').then(JSON.parse),
    readFile(COLLISION_REPORT, 'utf8').then(JSON.parse),
    readFile(IDENTITY_BACKUP, 'utf8').then(JSON.parse),
    readFile(CATALOG, 'utf8').then(JSON.parse),
  ]);
  const collisionSources = new Map(collisionBackup.documents.map((item) => [item.id, item]));
  const collisionTargets = [];
  for (const operation of collisionReport.operations) {
    const winner = collisionSources.get(operation.winnerId);
    if (!winner) throw new Error(`Collision backup is missing winner ${operation.winnerId}`);
    const data = { ...structuredClone(winner), id: operation.targetId };
    if (operation.dayId) {
      data._dayId = operation.dayId;
      delete data._dayIds;
    } else if (operation.dayIds?.length) {
      data._dayIds = operation.dayIds;
      delete data._dayId;
    }
    if (operation.variant) data._variant = operation.variant;
    collisionTargets.push(data);
  }

  const canonicalIdentityDocuments = identityBackup.documents.map((item) => ({
    id: item.id,
    ...canonicalizeLegacyReadingMetadata(item.data),
  }));
  const mappedIdentityDocuments = applyCatalogIds(canonicalIdentityDocuments, catalog);
  const documents = new Map(mappedIdentityDocuments.map((item) => [item.id, item]));
  if (documents.size !== identityBackup.documents.length) {
    throw new Error('Catalog matching produced duplicate IDs for identity-backup documents');
  }

  const fieldCandidates = fieldBackup.documents.map((item) => ({
    id: item.id,
    ...canonicalizeLegacyReadingMetadata(normalizeContentFields(item.data)),
  }));
  const candidatePool = [...collisionTargets, ...fieldCandidates];
  const catalogReadings = catalog.flatMap((item) => item.readings ?? []);
  const missingCatalogReadings = catalogReadings.filter((item) => !documents.has(item._id));
  let partialReconstructions = 0;
  for (const catalogReading of missingCatalogReadings) {
    const candidates = candidatePool.map((candidate) => ({
      candidate,
      score: (candidate.id === catalogReading._id ? 1000 : 0)
        + catalogMatchScore(candidate, catalogReading),
    })).filter((item) => item.score >= 20)
      .sort((left, right) => right.score - left.score);
    if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0].score)) {
      documents.set(catalogReading._id, {
        ...catalogReading,
        id: catalogReading._id,
        _localReconstruction: 'catalog-partial',
      });
      partialReconstructions++;
      continue;
    }
    documents.set(catalogReading._id, { ...candidates[0].candidate, id: catalogReading._id });
  }
  locallyMissingDocuments = Math.max(0, 822 - documents.size);
  if (partialReconstructions) {
    console.warn(`Local reconstruction used catalog-only payloads for ${partialReconstructions} unchanged documents.`);
  }
  return [...documents.values()];
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
}

function validateAlleluia(document, issues) {
  const section = document.alleluia;
  if (!section || typeof section !== 'object') {
    issues.push({ section: 'alleluia', field: null, problem: 'missing-section' });
    return;
  }
  for (const field of ['verse', 'bible']) {
    if (!present(section[field])) issues.push({ section: 'alleluia', field, problem: 'missing-required-field' });
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
  let documents;
  if (FROM_BACKUPS) {
    documents = await loadReconstructedDocuments();
  } else {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    const snapshot = await db.collection('parsedData').get();
    documents = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
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
      locallyPartialDocuments: documents.filter((item) => item._localReconstruction === 'catalog-partial').length,
      locallyMissingDocuments,
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
  if (!FROM_BACKUPS) await admin.app().delete();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('parsedData content-integrity audit failed:', error);
    process.exitCode = 1;
  });
}
