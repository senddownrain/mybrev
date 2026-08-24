#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { load } from 'cheerio';
import {
  documentIssues,
  loadReconstructedDocuments,
  present,
  readingSectionNames,
  validTitle,
} from './audit-parsed-readings-content-integrity.mjs';
import {
  inferReadingCycleFromTitle,
  normalizeReadingCycle,
} from '../src/utils/parsedReadingsIdentity.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
const APPLY = process.argv.includes('--apply');
const FROM_BACKUPS = process.argv.includes('--from-backups');
const FETCH_SOURCES = process.argv.includes('--fetch-sources');
const OUTPUT = path.resolve('reports/parsed-readings-content-repair-report.json');
const READING_SECTIONS = ['reading1', 'reading2', 'gospel'];

function textSectionNames(document) {
  return [...new Set([...readingSectionNames(document), 'gospel'])];
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalized(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('be')
    .replace(/[‐‑‒—−]/g, '–').replace(/\s+/g, ' ').trim();
}

function sectionToPlainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sourceBible(sectionHtml) {
  for (const match of sectionHtml.matchAll(/<div[^>]*align=["']?right["']?[^>]*>([\s\S]*?)<\/div>/gi)) {
    const value = load(match[1]).text().replace(/\s+/g, ' ').trim();
    if (value) return value;
  }
  return null;
}

function extractYearSection(articleHtml, year) {
  const cycle = normalizeReadingCycle(year);
  if (cycle !== '1' && cycle !== '2') return articleHtml;
  const secondYear = /Год\s+ІІ(?!\p{L})/u.exec(articleHtml);
  if (!secondYear) return articleHtml;
  return cycle === '1' ? articleHtml.slice(0, secondYear.index) : articleHtml.slice(secondYear.index);
}

function extractHeading(sectionName, sectionHtml) {
  const $ = load(`<div>${sectionHtml}</div>`);
  const paragraphs = $('p').toArray().map((element) => ({
    text: $(element).text().replace(/\s+/g, ' ').trim(),
    emphasis: $(element).find('i, em').first().text().replace(/\s+/g, ' ').trim(),
  })).filter((item) => item.text);
  const comment = paragraphs.map((item) => item.emphasis)
    .find((value) => present(value) && !validTitle(sectionName, value)) ?? null;
  let title = paragraphs.map((item) => item.text).find((value) => validTitle(sectionName, value)) ?? null;
  if (!title) {
    const plain = sectionToPlainText(sectionHtml);
    const pattern = sectionName === 'gospel'
      ? /(?:^|\n)(\+?\s*(?:(?:Чытанне|Пачатак|Заканчэнне)\s+(?:[сc]вятога\s+)?Евангелля\s+паводле[^\n.]*\.|Мука\s+Пана[^\n.]*\s+паводле[^\n.]*\.))/iu
      : /(?:^|\n)((?:Чытанне|Пачатак|Заканчэнне)[^\n.]*\.)/iu;
    title = plain.match(pattern)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  }
  return { title, comment, bible: sourceBible(sectionHtml) };
}

function parseSourcePsalm(sectionHtml) {
  const $ = load(`<div>${sectionHtml}</div>`);
  const verses = [];
  let chorus = null;
  let nextIsChorus = false;
  $('p').each((index, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const bold = $(element).find('b').first().text().replace(/\s+/g, ' ').trim();
    if (/^Рэфрэн:$/iu.test(bold)) {
      const after = text.replace(/^Рэфрэн:\s*/iu, '').trim();
      if (after) chorus ??= after;
      else nextIsChorus = true;
      return;
    }
    if (nextIsChorus) {
      chorus ??= text;
      nextIsChorus = false;
      return;
    }
    if (/^Рэфрэн:?$/iu.test(text)) return;
    const cleaned = text.replace(/\s*Рэфрэн:?\s*$/iu, '').trim();
    if (/^\d+[а-яёіўa-z]?\.\s/iu.test(cleaned)) verses.push(cleaned);
  });
  if (!verses.length) {
    const plain = sectionToPlainText(sectionHtml);
    for (const line of plain.split('\n').map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
      if (/^\d+[а-яёіўa-z]?\.\s/iu.test(line)) verses.push(line);
    }
  }
  return {
    bible: sourceBible(sectionHtml),
    chorus,
    verses: verses.length ? verses : null,
  };
}

function parseSourcePage(html, year) {
  const $ = load(html);
  const articleHtml = $('div.article').first().html();
  if (!articleHtml) throw new Error('div.article not found');
  const selected = extractYearSection(articleHtml, year);
  const markers = {
    reading1: /ПЕРШАЕ ЧЫТАННЕ/,
    psalm: /РЭСПАНСАРЫЙНЫ ПСАЛЬМ/,
    reading2: /ДРУГОЕ ЧЫТАННЕ/,
    alleluia: /СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ/,
    gospel: /ЕВАНГЕЛЛЕ(?!М)/,
  };
  const bounds = Object.entries(markers).map(([sectionName, pattern]) => {
    const match = pattern.exec(selected);
    return match ? [sectionName, match.index] : null;
  }).filter(Boolean).sort((left, right) => left[1] - right[1]);
  const sections = {};
  for (let index = 0; index < bounds.length; index++) {
    const [sectionName, start] = bounds[index];
    const end = bounds[index + 1]?.[1] ?? selected.length;
    const sectionHtml = selected.slice(start, end);
    if (READING_SECTIONS.includes(sectionName)) sections[sectionName] = extractHeading(sectionName, sectionHtml);
    else if (sectionName === 'alleluia') {
      const plain = sectionToPlainText(sectionHtml);
      const verse = plain.match(/Аллелюя[.,\s]*\n([\s\S]+?)(?:\nАкламацыя|$)/iu)?.[1]
        ?.replace(/\s+/g, ' ').trim() ?? null;
      sections.alleluia = { bible: sourceBible(sectionHtml), verse };
    } else if (sectionName === 'psalm') sections.psalm = parseSourcePsalm(sectionHtml);
  }
  return sections;
}

function bibleKey(section) {
  return normalized(section?.bible);
}

function bibleBookKey(section) {
  return bibleKey(section).match(/^(?:[123]\s*)?[\p{L}.]+/u)?.[0] ?? '';
}

const GOSPEL_AUTHORS = new Map([
  ['мц', 'Мацвея'],
  ['мк', 'Марка'],
  ['лк', 'Лукі'],
  ['ян', 'Яна'],
]);

function textKey(sectionName, section) {
  const value = sectionName === 'alleluia'
    ? section?.verse
    : sectionName === 'psalm'
      ? (section?.verses ?? []).join('\n')
      : section?.text;
  return normalized(value);
}

function readingSetKey(document) {
  return ['reading1', 'reading2', 'psalm', 'alleluia', 'gospel']
    .map((sectionName) => bibleKey(document[sectionName]))
    .join('|');
}

function sectionQuality(sectionName, section) {
  if (!section || typeof section !== 'object') return 0;
  if (sectionName === 'psalm') {
    return Number(present(section.bible)) * 2
      + Number(present(section.chorus)) * 2
      + (Array.isArray(section.verses) ? section.verses.length : 0)
      + Number(Object.hasOwn(section, 'altChorus'));
  }
  if (sectionName === 'alleluia') return Number(present(section.bible)) + Number(present(section.verse));
  return Number(present(section.bible)) * 2 + Number(present(section.text)) * 3
    + Number(present(section.comment)) + Number(validTitle(sectionName, section.title)) * 2;
}

function mostCommon(items, field, predicate = present) {
  const groups = new Map();
  for (const item of items) {
    const value = item?.[field];
    if (!predicate(value)) continue;
    const key = normalized(value);
    if (!groups.has(key)) groups.set(key, { value, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((left, right) => right.count - left.count)[0]?.value;
}

function exactSectionDonors(documents, document, sectionName) {
  const section = document[sectionName];
  const bible = bibleKey(section);
  const text = textKey(sectionName, section);
  if (!bible || !text) return [];
  return documents.filter((candidate) => candidate.id !== document.id
    && bibleKey(candidate[sectionName]) === bible
    && textKey(sectionName, candidate[sectionName]) === text);
}

function getPath(document, fieldPath) {
  return fieldPath.split('.').reduce((value, key) => value?.[key], document);
}

function setVirtual(document, fieldPath, value) {
  const keys = fieldPath.split('.');
  let cursor = document;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = structuredClone(value);
}

function addChange(operation, fieldPath, value, reason, donorId = null) {
  if (JSON.stringify(getPath(operation.document, fieldPath)) === JSON.stringify(value)) return;
  setVirtual(operation.document, fieldPath, value);
  operation.changes = operation.changes.filter((change) => change.fieldPath !== fieldPath);
  operation.changes.push({ fieldPath, value, reason, donorId });
}

function buildOperations(documents) {
  const groups = new Map();
  for (const document of documents) {
    const key = readingSetKey(document);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(document);
  }

  const operations = documents.map((source) => ({
    id: source.id,
    original: source,
    document: structuredClone(source),
    changes: [],
  }));

  for (const operation of operations) {
    const document = operation.document;
    if (Object.hasOwn(document, '_sourceCategory')) {
      delete document._sourceCategory;
      operation.changes.push({ fieldPath: '_sourceCategory', delete: true, reason: 'obsolete-field' });
    }
    const canonicalYear = normalizeReadingCycle(document.year)
      || inferReadingCycleFromTitle(document.title)
      || null;
    if (!Object.hasOwn(document, 'year') || document.year !== canonicalYear) {
      addChange(operation, 'year', canonicalYear, 'canonical-year');
    }
    if (document.psalm && (!Object.hasOwn(document.psalm, 'altChorus')
      || (document.psalm.altChorus !== null && !present(document.psalm.altChorus)))) {
      addChange(operation, 'psalm.altChorus', null, 'nullable-alt-chorus');
    }

    const sameSet = groups.get(readingSetKey(operation.original)) ?? [];
    for (const sectionName of textSectionNames(document)) {
      const section = document[sectionName];
      if (!section || typeof section !== 'object') continue;
      const exactDonors = exactSectionDonors(documents, operation.original, sectionName);
      const sameBibleDonors = documents.filter((candidate) => candidate.id !== document.id
        && bibleKey(candidate[sectionName])
        && bibleKey(candidate[sectionName]) === bibleKey(section));
      const donors = exactDonors.length ? exactDonors : sameBibleDonors;

      if (present(section.title) && !validTitle(sectionName, section.title)) {
        const misplacedComment = section.title;
        const donorTitle = mostCommon(donors.map((item) => item[sectionName]), 'title', (value) => validTitle(sectionName, value));
        if (donorTitle) addChange(operation, `${sectionName}.title`, donorTitle, 'replace-misplaced-comment-with-heading', donors.find((item) => item[sectionName]?.title === donorTitle)?.id);
        addChange(operation, `${sectionName}.comment`, misplacedComment, 'move-title-to-comment');
      } else if (!present(section.title)) {
        if (validTitle(sectionName, section.comment)) {
          addChange(operation, `${sectionName}.title`, section.comment, 'move-comment-to-title');
        } else {
          const donorTitle = mostCommon(donors.map((item) => item[sectionName]), 'title', (value) => validTitle(sectionName, value));
          if (donorTitle) addChange(operation, `${sectionName}.title`, donorTitle, 'fill-title-from-donor');
        }
      }

      if (!present(getPath(document, `${sectionName}.comment`))) {
        const donorComment = mostCommon(exactDonors.map((item) => item[sectionName]), 'comment');
        if (donorComment) addChange(operation, `${sectionName}.comment`, donorComment, 'fill-comment-from-exact-donor');
      }

      for (const field of ['text', 'bible']) {
        if (present(getPath(document, `${sectionName}.${field}`))) continue;
        const donor = sameSet.filter((item) => present(item[sectionName]?.[field]))
          .sort((left, right) => sectionQuality(sectionName, right[sectionName]) - sectionQuality(sectionName, left[sectionName]))[0];
        if (donor) addChange(operation, `${sectionName}.${field}`, donor[sectionName][field], 'fill-required-field-from-reading-set', donor.id);
      }
    }

    const bestSetDonor = sameSet.filter((item) => item.id !== document.id)
      .sort((left, right) => sectionQuality('psalm', right.psalm) - sectionQuality('psalm', left.psalm))[0];
    if (bestSetDonor?.psalm) {
      if (!document.psalm) addChange(operation, 'psalm', bestSetDonor.psalm, 'fill-missing-psalm-from-reading-set', bestSetDonor.id);
      else {
        for (const field of ['bible', 'chorus', 'verses']) {
          const current = document.psalm[field];
          const missing = field === 'verses' ? !Array.isArray(current) || !current.length : !present(current);
          if (missing && bestSetDonor.psalm[field]) {
            addChange(operation, `psalm.${field}`, bestSetDonor.psalm[field], 'fill-psalm-field-from-reading-set', bestSetDonor.id);
          }
        }
        const donorVerses = bestSetDonor.psalm.verses;
        const currentVerses = document.psalm.verses;
        const firstRepeatsChorus = Array.isArray(currentVerses) && currentVerses.length
          && normalized(currentVerses[0]) === normalized(document.psalm.chorus);
        if (Array.isArray(donorVerses) && Array.isArray(currentVerses)
          && donorVerses.length > currentVerses.length && firstRepeatsChorus) {
          addChange(operation, 'psalm.verses', donorVerses, 'replace-truncated-psalm-from-reading-set', bestSetDonor.id);
        }
      }
    }

    if (document.alleluia) {
      if (!present(document.alleluia.bible) && present(document.alleluia.verse)) {
        const donor = documents.find((item) => normalized(item.alleluia?.verse) === normalized(document.alleluia.verse)
          && present(item.alleluia?.bible));
        if (donor) addChange(operation, 'alleluia.bible', donor.alleluia.bible, 'fill-alleluia-bible-from-exact-verse', donor.id);
      }
    } else if (bestSetDonor?.alleluia) {
      addChange(operation, 'alleluia', bestSetDonor.alleluia, 'fill-missing-alleluia-from-reading-set', bestSetDonor.id);
    }
  }
  return operations;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function enrichFromSources(operations) {
  const verifiedOfficiallyEmptyFields = [];
  const candidates = operations.filter((operation) => operation.document._sourceUrl
    && documentIssues(operation.document).some((issue) => (
      issue.problem === 'non-lectionary-title'
      || issue.problem === 'missing-required-field'
      || issue.problem === 'missing-section'
    )));
  const keys = [...new Map(candidates.map((operation) => [
    `${operation.document._sourceUrl}\u0000${normalizeReadingCycle(operation.document.year)}`,
    { url: operation.document._sourceUrl, year: operation.document.year },
  ])).values()];
  const fetched = await mapWithConcurrency(keys, 5, async ({ url, year }) => {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-content-audit/1.0)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { url, year, parsed: parseSourcePage(await response.text(), year), error: null };
    } catch (error) {
      return { url, year, parsed: null, error: error.message };
    }
  });
  const byKey = new Map(fetched.map((item) => [`${item.url}\u0000${normalizeReadingCycle(item.year)}`, item]));
  for (const operation of candidates) {
    const source = byKey.get(`${operation.document._sourceUrl}\u0000${normalizeReadingCycle(operation.document.year)}`)?.parsed;
    if (!source) continue;
    for (const sectionName of textSectionNames(operation.document)) {
      const section = operation.document[sectionName];
      const parsed = source[sectionName];
      if (!section || !parsed) continue;
      if (!validTitle(sectionName, section.title) && validTitle(sectionName, parsed.title)) {
        addChange(operation, `${sectionName}.title`, parsed.title, 'fill-title-from-source-url');
      }
      if (!present(section.comment) && present(parsed.comment)) {
        addChange(operation, `${sectionName}.comment`, parsed.comment, 'fill-comment-from-source-url');
      }
      if (!present(section.bible) && present(parsed.bible)) {
        addChange(operation, `${sectionName}.bible`, parsed.bible, 'fill-bible-from-source-url');
      }
    }
    if (operation.document.alleluia && source.alleluia) {
      for (const field of ['bible', 'verse']) {
        if (!present(operation.document.alleluia[field]) && present(source.alleluia[field])) {
          addChange(operation, `alleluia.${field}`, source.alleluia[field], 'fill-alleluia-from-source-url');
        } else if (!present(operation.document.alleluia[field]) && !present(source.alleluia[field])) {
          verifiedOfficiallyEmptyFields.push({
            id: operation.id,
            fieldPath: `alleluia.${field}`,
            sourceUrl: operation.document._sourceUrl,
          });
        }
      }
    } else if (!operation.document.alleluia && source.alleluia?.verse) {
      addChange(operation, 'alleluia', {
        bible: source.alleluia.bible ?? null,
        verse: source.alleluia.verse,
      }, 'fill-alleluia-section-from-source-url');
    }
    if (operation.document.psalm && source.psalm) {
      for (const field of ['bible', 'chorus', 'verses']) {
        const current = operation.document.psalm[field];
        const missing = field === 'verses' ? !Array.isArray(current) || !current.length : !present(current);
        if (missing && (field === 'verses' ? Array.isArray(source.psalm[field]) && source.psalm[field].length : present(source.psalm[field]))) {
          addChange(operation, `psalm.${field}`, source.psalm[field], 'fill-psalm-from-source-url');
        }
      }
    }
  }
  return {
    requestedPages: keys.length,
    fetchedPages: fetched.filter((item) => item.parsed).length,
    failedPages: fetched.filter((item) => item.error).map(({ url, year, error }) => ({ url, year, error })),
    verifiedOfficiallyEmptyFields,
  };
}

function inferRemainingHeadings(operations) {
  const learned = new Map();
  for (const operation of operations) {
    for (const sectionName of readingSectionNames(operation.document)) {
      const section = operation.document[sectionName];
      const key = bibleBookKey(section);
      if (!key || !validTitle(sectionName, section?.title)) continue;
      if (!learned.has(key)) learned.set(key, []);
      learned.get(key).push(section.title);
    }
  }
  for (const operation of operations) {
    for (const sectionName of textSectionNames(operation.document)) {
      const section = operation.document[sectionName];
      if (!section || validTitle(sectionName, section.title)) continue;
      let heading = null;
      const book = bibleBookKey(section);
      if (sectionName === 'gospel') {
        const author = GOSPEL_AUTHORS.get(book);
        if (author) {
          const passion = /(?:palmsunday|holyweek-w1-d6)/u.test(operation.id)
            || /^мука\s+пана/iu.test(section.title ?? '');
          heading = passion
            ? `Мука Пана нашага Езуса Хрыста паводле ${author}.`
            : `+ Чытанне святога Евангелля паводле ${author}.`;
        }
      } else {
        const learnedHeadings = learned.get(book) ?? [];
        heading = mostCommon(learnedHeadings.map((title) => ({ title })), 'title', (value) => validTitle(sectionName, value));
      }
      if (heading) addChange(operation, `${sectionName}.title`, heading, 'infer-title-from-bible-book');
    }
  }
}

function firestoreUpdate(changes) {
  return Object.fromEntries(changes.map((change) => [
    change.fieldPath,
    change.delete ? admin.firestore.FieldValue.delete() : change.value,
  ]));
}

async function loadDocuments() {
  if (FROM_BACKUPS) return loadReconstructedDocuments();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const snapshot = await admin.firestore().collection('parsedData').get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function main() {
  if (APPLY && FROM_BACKUPS) throw new Error('--apply cannot be combined with --from-backups');
  const documents = await loadDocuments();
  const operations = buildOperations(documents);
  const sourceFetch = FETCH_SOURCES
    ? await enrichFromSources(operations)
    : { requestedPages: 0, fetchedPages: 0, failedPages: [], verifiedOfficiallyEmptyFields: [] };
  inferRemainingHeadings(operations);
  const affected = operations.filter((item) => item.changes.length);
  const virtualDocuments = operations.map((item) => item.document);
  const remaining = virtualDocuments.map((document) => ({ id: document.id, issues: documentIssues(document) }))
    .filter((item) => item.issues.length);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : FROM_BACKUPS ? 'local-reconstructed-dry-run' : 'production-dry-run',
    counts: {
      documents: documents.length,
      affectedDocuments: affected.length,
      fieldChanges: affected.reduce((sum, item) => sum + item.changes.length, 0),
      remainingDocumentsWithIssues: remaining.length,
      remainingIssues: remaining.reduce((sum, item) => sum + item.issues.length, 0),
      appliedDocuments: 0,
    },
    operations: affected.map(({ id, changes }) => ({ id, changes })),
    remaining,
    sourceFetch,
  };

  if (APPLY) {
    const backupPath = path.resolve('reports/backups', `parsedData-before-content-integrity-repair-${timestamp()}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: 'parsedData',
      documents: affected.map((item) => ({ id: item.id, data: item.original })),
    }, null, 2)}\n`, 'utf8');
    for (let offset = 0; offset < affected.length; offset += 200) {
      const batch = admin.firestore().batch();
      for (const operation of affected.slice(offset, offset + 200)) {
        batch.update(admin.firestore().collection('parsedData').doc(operation.id), firestoreUpdate(operation.changes));
      }
      await batch.commit();
    }
    report.counts.appliedDocuments = affected.length;
    report.backupPath = backupPath;
  }

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log(`Wrote ${OUTPUT}`);
  if (!FROM_BACKUPS) await admin.app().delete();
}

main().catch((error) => {
  console.error('parsedData content-integrity repair failed:', error);
  process.exitCode = 1;
});
