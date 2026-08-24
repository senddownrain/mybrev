#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { READING_SECTIONS, hasReadingSectionContent } from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const AUDIT_PATH = path.resolve('reports/parsed-readings-database-audit.json');
const OUTPUT = path.resolve('reports/parsed-data-collision-audit.json');

function normalizeBible(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‐‑‒—−]/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('be');
}

function bibleFingerprint(document) {
  return READING_SECTIONS
    .map((section) => `${section}:${normalizeBible(document?.[section]?.bible)}`)
    .join('|');
}

function contentLength(document) {
  return READING_SECTIONS.reduce((total, sectionName) => {
    const section = document?.[sectionName];
    if (!section || typeof section !== 'object') return total;
    return total + ['text', 'verse', 'chorus', 'altChorus']
      .reduce((sum, key) => sum + String(section[key] ?? '').trim().length, 0)
      + (Array.isArray(section.verses)
        ? section.verses.reduce((sum, item) => sum + String(item ?? '').trim().length, 0)
        : 0);
  }, 0);
}

function contentSectionCount(document) {
  return READING_SECTIONS.filter((section) => hasReadingSectionContent(document?.[section])).length;
}

function semanticVariant(document) {
  const title = String(document?.title ?? '').toLocaleLowerCase('be');
  if (/24\s+снежня.*нараджэнн/u.test(title)) return 'christmas-vigil';
  if (/ii\s+нядзел/u.test(title)) return 'sunday';
  if (/вігілі/u.test(title)) return 'vigil';
  if (/імша\s+вячэр/u.test(title)) return 'evening-mass';
  if (/імша\s+хрызм/u.test(title)) return 'chrism';
  return null;
}

function recommendation(group) {
  const variants = group.variants;
  if (variants.every((item) => item.contentSectionCount === 0)) return 'missing-content';
  if (group.identicalContent || group.sameBibleReferences) return 'deduplicate-after-field-normalization';
  if (variants.every((item) => item.semanticVariant)) return 'preserve-semantic-variants';
  return 'manual-review-different-readings';
}

async function main() {
  const audit = JSON.parse(await readFile(AUDIT_PATH, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const snapshot = await db.collection('parsedData').get();
  const documents = new Map(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));

  const staleSourceIds = [];
  const groups = audit.idCollisions.flatMap((collision) => {
    const liveSourceIds = collision.sourceIds.filter((id) => {
      if (documents.has(id)) return true;
      staleSourceIds.push(id);
      return false;
    });
    // A collision only exists while at least two of its source documents are live.
    // This also makes the audit safe when a prior pruning step invalidated an
    // older database-audit snapshot.
    if (liveSourceIds.length < 2) return [];

    const variants = liveSourceIds.map((id) => {
      const document = documents.get(id);
      return {
        id,
        title: document?.title ?? null,
        url: document?._sourceUrl ?? null,
        bibleFingerprint: bibleFingerprint(document),
        contentLength: contentLength(document),
        contentSectionCount: contentSectionCount(document),
        semanticVariant: semanticVariant(document),
        auditQualityScore: collision.variants.find((item) => item.id === id)?.qualityScore ?? 0,
      };
    });
    const group = {
      targetId: collision.proposedId,
      identicalContent: collision.identicalContent,
      sameBibleReferences: new Set(variants.map((item) => item.bibleFingerprint)).size === 1,
      variants,
    };
    return [{ ...group, recommendation: recommendation(group) }];
  });

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      groups: groups.length,
      documents: groups.reduce((sum, group) => sum + group.variants.length, 0),
      staleSourceDocumentsIgnored: new Set(staleSourceIds).size,
      byRecommendation: Object.fromEntries([...new Set(groups.map((group) => group.recommendation))]
        .map((key) => [key, groups.filter((group) => group.recommendation === key).length])),
    },
    groups,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
  await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData collision audit failed:', error);
  process.exitCode = 1;
});
