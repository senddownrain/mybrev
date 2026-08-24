#!/usr/bin/env node

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import {
  READING_SECTIONS,
  buildReadingDocumentId,
  hasReadingSectionContent,
  normalizeFeastCode,
  normalizeReadingCycle,
  readingSelector,
  removeDuplicatedBiblePrefix,
  removeTrailingParserStub,
  resolveReadingDayLink,
} from '../src/utils/parsedReadingsIdentity.js';
import { getFixedCelebrationKey } from '../src/utils/liturgicalDayResolution.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const OUTPUT = path.resolve('reports/parsed-readings-database-audit.json');

const BIBLE_REF_LEAD = /^(?:пар\.\s*)?[А-ЯЁІЎA-Z][а-яёіўa-z]{0,6}\.?\s+\d+(?:\s*\(\d+\))?,\s*[\d\s,.;:\-–—abcABCабвгд]+/u;
const STUB_VALUE = /^[аa]$/iu;
const TRAILING_STUB = /(?:(?:^|\n)|(?<=[.!?;:»”])\s+)[аa]\s*$/iu;
const MIGRATION_FIELDS = [
  '_date', '_feast', '_periodType', '_periodWeekNumber', '_dayOfWeek',
  '_rank', '_place', '_variant', '_dayId', '_dayIds', 'year',
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function compactDay(day) {
  return {
    id: day.id,
    selector: readingSelector(day),
    _date: day._date ?? null,
    _feast: day._feast ?? null,
    _periodType: day._periodType ?? null,
    _periodWeekNumber: day._periodWeekNumber ?? null,
    _dayOfWeek: day._dayOfWeek ?? null,
    _rank: day._rank ?? day._feastType ?? null,
    _place: day._place ?? null,
    title: day._title ?? day._feastName ?? day.title ?? null,
  };
}

function celebrationGroupKey(day) {
  const selector = readingSelector(day);
  if (selector.startsWith('date:')) return `fixed:${baseDayId(day) || getFixedCelebrationKey(day)}`;
  if (selector.startsWith('feast:')) return selector;
  return selector;
}

function baseDayId(day) {
  return String(day?.id ?? '').replace(/--[^-].*$/, '');
}

function groupCandidateDays(candidates) {
  const groups = new Map();
  for (const day of candidates) {
    const key = celebrationGroupKey(day);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(day);
  }
  return [...groups.entries()].map(([key, days]) => ({
    key,
    baseIds: [...new Set(days.map(baseDayId))],
    dayIds: days.map((day) => day.id).sort(),
    days: days.map(compactDay),
  }));
}

function sectionProblems(document) {
  const result = [];
  for (const sectionName of READING_SECTIONS) {
    const section = document[sectionName];
    if (!section || typeof section !== 'object') continue;
    if (!hasReadingSectionContent(section)) result.push({ section: sectionName, problem: 'missing-content' });

    const contentFields = sectionName === 'psalm'
      ? ['chorus', 'altChorus', 'text', ...(Array.isArray(section.verses) ? ['verses'] : [])]
      : [sectionName === 'alleluia' ? 'verse' : 'text'];
    const values = contentFields.flatMap((field) => {
      const value = section[field];
      return Array.isArray(value)
        ? value.map((item, index) => ({ field: `${field}[${index}]`, value: item }))
        : [{ field, value }];
    });

    for (const { field, value } of values) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (STUB_VALUE.test(trimmed)) result.push({ section: sectionName, field, problem: 'stub-value', value: trimmed });
      else if (TRAILING_STUB.test(trimmed)) result.push({ section: sectionName, field, problem: 'trailing-stub' });
    }

    const primaryText = sectionName === 'alleluia' ? section.verse : section.text;
    const bible = String(section.bible ?? '').trim();
    if (typeof primaryText === 'string' && primaryText.trim()) {
      const trimmedText = primaryText.trim();
      if (bible && trimmedText.startsWith(bible)) {
        result.push({ section: sectionName, problem: 'bible-duplicated-in-text', bible });
      } else if (!bible) {
        const match = trimmedText.match(BIBLE_REF_LEAD);
        if (match) result.push({ section: sectionName, problem: 'bible-at-text-start', value: match[0] });
      }
    }
  }
  return result;
}

function normalizedSectionPayload(document) {
  const payload = {};
  for (const sectionName of READING_SECTIONS) {
    const section = document[sectionName];
    if (!section || typeof section !== 'object') continue;
    const normalized = {};
    for (const key of Object.keys(section).sort()) {
      const value = section[key];
      if (Array.isArray(value)) {
        normalized[key] = value.map(removeTrailingParserStub).filter((item) => item !== null);
      } else if (typeof value === 'string') {
        let cleaned = removeTrailingParserStub(value);
        if (key === (sectionName === 'alleluia' ? 'verse' : 'text')) {
          cleaned = removeDuplicatedBiblePrefix(cleaned, section.bible);
        }
        normalized[key] = cleaned;
      } else {
        normalized[key] = value;
      }
    }
    payload[sectionName] = normalized;
  }
  return payload;
}

function contentMetrics(document) {
  const payload = normalizedSectionPayload(document);
  let qualityScore = document._sourceUrl ? 1 : 0;
  for (const sectionName of READING_SECTIONS) {
    const section = payload[sectionName];
    if (!section) continue;
    if (hasReadingSectionContent(section)) qualityScore += 10;
    if (String(section.bible ?? '').trim()) qualityScore += 2;
    if (String(section.title ?? '').trim()) qualityScore += 1;
    if (String(section.comment ?? '').trim()) qualityScore += 1;
  }
  return {
    contentHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    qualityScore,
    sections: Object.keys(payload),
  };
}

function identityProblems(document) {
  const result = [];
  const dimensions = ['_date', '_feast', '_periodType'].filter((key) => {
    const value = document[key];
    return value !== null && value !== undefined && value !== '';
  });
  if (dimensions.length === 0) result.push('missing-selector');
  if (dimensions.length > 1) result.push(`overlapping-selectors:${dimensions.join(',')}`);
  if (document._feast && document._feast !== normalizeFeastCode(document._feast)) result.push('noncanonical-feast-code');
  if (hasOwn(document, 'year') && document.year !== null && !normalizeReadingCycle(document.year)) result.push('invalid-cycle');
  return result;
}

function proposedMetadata(document, group) {
  if (!group?.days?.length) return {};
  const updates = {};
  if (group.dayIds.length === 1) {
    updates._dayId = group.dayIds[0];
    if (hasOwn(document, '_dayIds')) updates._dayIds = { __op: 'delete' };
  } else {
    updates._dayIds = group.dayIds;
    if (hasOwn(document, '_dayId')) updates._dayId = { __op: 'delete' };
  }
  if (document._feast) updates._feast = normalizeFeastCode(document._feast);
  const ranks = [...new Set(group.days.map((day) => day._rank).filter(Boolean))];
  if (ranks.length === 1) updates._rank = ranks[0];
  const places = [...new Set(group.days.flatMap((day) => (
    Array.isArray(day._place) ? day._place : [day._place]
  )).filter(Boolean))].sort();
  if (places.length === 1) updates._place = places[0];
  else if (places.length > 1) updates._place = places;
  return updates;
}

function canonicalMetadataChanges(original, canonical) {
  const changes = {};
  for (const field of MIGRATION_FIELDS) {
    const beforeExists = hasOwn(original, field);
    const afterExists = hasOwn(canonical, field);
    if (beforeExists && !afterExists) changes[field] = { __op: 'delete' };
    else if (afterExists && !sameJson(original[field], canonical[field])) changes[field] = canonical[field];
  }
  return changes;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditDocument(document, fixedDays) {
  const link = resolveReadingDayLink(document, fixedDays);
  const canonical = link.canonical;
  const candidates = fixedDays.filter((day) => link.dayIds.includes(day.id));
  const groups = groupCandidateDays(candidates);
  const mapping = link.status;
  const proposedId = link.baseId ? buildReadingDocumentId(link.baseId, canonical) : '';
  const linkedGroup = mapping === 'mapped' ? {
    dayIds: link.dayIds,
    days: candidates.map(compactDay),
  } : null;
  const metadata = proposedMetadata(canonical, linkedGroup);
  const metadataChanges = {
    ...canonicalMetadataChanges(document, canonical),
    ...Object.fromEntries(Object.entries(metadata).filter(([key, value]) => !sameJson(document[key], value))),
  };

  return {
    id: document.id,
    selector: readingSelector(document),
    canonicalSelector: readingSelector(canonical),
    mapping,
    proposedId: proposedId || null,
    idMatches: proposedId === document.id,
    metadataChanges,
    candidates: groups,
    linkedDayIds: link.dayIds,
    identityProblems: identityProblems(document),
    sectionProblems: sectionProblems(document),
    ...contentMetrics(document),
    source: {
      title: document.title ?? null,
      category: document._sourceCategory ?? null,
      url: document._sourceUrl ?? null,
      year: document.year ?? null,
      _rank: document._rank ?? null,
      _place: document._place ?? null,
    },
  };
}

function countsBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = String(getKey(item) || '(none)');
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const [parsedSnapshot, fixedSnapshot] = await Promise.all([
    db.collection('parsedData').get(),
    db.collection('fixedDays').get(),
  ]);
  const parsed = parsedSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  const fixedDays = fixedSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  const documents = parsed.map((document) => auditDocument(document, fixedDays));

  const targetIds = new Map();
  for (const document of documents) {
    if (!document.proposedId) continue;
    if (!targetIds.has(document.proposedId)) targetIds.set(document.proposedId, []);
    targetIds.get(document.proposedId).push(document.id);
  }
  const idCollisions = [...targetIds.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([proposedId, sourceIds]) => {
      const variants = sourceIds.map((id) => {
        const document = documents.find((item) => item.id === id);
        return {
          id,
          contentHash: document.contentHash,
          qualityScore: document.qualityScore,
          sections: document.sections,
          title: document.source.title,
          url: document.source.url,
        };
      });
      return {
        proposedId,
        sourceIds,
        identicalContent: new Set(variants.map((item) => item.contentHash)).size === 1,
        variants,
      };
    });

  const parsedSelectors = new Set(parsed.map(readingSelector).filter(Boolean));
  const fixedSelectors = new Set(fixedDays.map(readingSelector).filter(Boolean));
  const mappedDayIds = new Set(documents.flatMap((document) => (
    document.mapping === 'mapped' ? document.linkedDayIds : []
  )));

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      parsedDocuments: parsed.length,
      fixedDayDocuments: fixedDays.length,
      parsedBySelectorType: countsBy(parsed, (item) => readingSelector(item).split(':')[0]),
      fixedDaysBySelectorType: countsBy(fixedDays, (item) => readingSelector(item).split(':')[0]),
      mappings: countsBy(documents, (item) => item.mapping),
      canonicalIds: documents.filter((item) => item.idMatches).length,
      documentsNeedingMetadataChanges: documents.filter((item) => Object.keys(item.metadataChanges).length).length,
      documentsWithIdentityProblems: documents.filter((item) => item.identityProblems.length).length,
      documentsWithSectionProblems: documents.filter((item) => item.sectionProblems.length).length,
      sectionProblems: countsBy(documents.flatMap((item) => item.sectionProblems), (item) => item.problem),
      idCollisions: idCollisions.length,
      fixedDayDocumentsMapped: mappedDayIds.size,
      fixedDayDocumentsUnmapped: fixedDays.filter((item) => !mappedDayIds.has(item.id)).length,
    },
    coverage: {
      fixedSelectorsWithoutParsedData: [...fixedSelectors].filter((selector) => !parsedSelectors.has(selector)).sort(),
      parsedSelectorsWithoutFixedDays: [...parsedSelectors].filter((selector) => !fixedSelectors.has(selector)).sort(),
      fixedDayDocumentsWithoutMappedReading: fixedDays
        .filter((item) => !mappedDayIds.has(item.id))
        .map(compactDay),
    },
    idCollisions,
    unmapped: documents.filter((item) => item.mapping === 'unmapped'),
    ambiguous: documents.filter((item) => item.mapping === 'ambiguous'),
    identityIssues: documents.filter((item) => item.identityProblems.length),
    fieldIssues: documents.filter((item) => item.sectionProblems.length),
    migration: documents
      .filter((item) => item.mapping === 'mapped' && (!item.idMatches || Object.keys(item.metadataChanges).length))
      .map(({ id, proposedId, metadataChanges, linkedDayIds }) => ({
        fromId: id,
        toId: proposedId,
        metadataChanges,
        dayIds: linkedDayIds,
      })),
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT}`);
  console.log(JSON.stringify(report.counts, null, 2));
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData/fixedDays audit failed:', error);
  process.exitCode = 1;
});
