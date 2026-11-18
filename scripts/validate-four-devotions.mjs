#!/usr/bin/env node
// Offline-only validation and candidate planning. No Firebase reads or writes.
// Usage: node scripts/validate-four-devotions.mjs [--snapshot <local-dir>] [--out <private-report.json>]
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { prayerCategoryMatch } from '../src/utils/prayerCategoryMembership.mjs';
import { prayerAccessPolicy } from '../src/utils/priestPolicy.mjs';
import { PRAYER_TEXT_FORMAT, PRAYER_TEXT_FORMAT_VERSION, prayerMarkdownToPlainText, validatePrayerMarkdown } from '../src/utils/prayerMarkdown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs/content-imports/four-devotions-2026-11-18');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const titleKey = (s) => String(s || '').normalize('NFC').toLocaleLowerCase('be').replace(/[’‘ʼ]/gu, "'").replace(/\s+/gu, ' ').trim();
const stations = ['Першы', 'Другі', 'Трэці', 'Чацвёрты'];

function contentKeys(prayer) {
  const plain = prayerMarkdownToPlainText(prayer.text, prayer.textFormat);
  const paragraphs = plain.split(/\n+/u).map((line) => titleKey(line).replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
  return { text: titleKey(plain), paragraphs: new Set(paragraphs.filter((line) => line.length >= 160)) };
}

export function validateContent(text, id) {
  const errors = [];
  let inRubric = false, headings = 0;
  for (const [i, line] of text.split('\n').entries()) {
    if (line === ':::rubric') {
      if (inRubric) errors.push(`line ${i + 1}: nested rubric`);
      inRubric = true;
    } else if (line === ':::') {
      if (!inRubric) errors.push(`line ${i + 1}: unmatched rubric close`);
      inRubric = false;
    } else {
      if (line.includes('\uFFFD') || [...line].some((char) => char < ' ' && char !== '\t')) {
        errors.push(`line ${i + 1}: damaged text`);
      }
      if (/^# /u.test(line)) errors.push(`line ${i + 1}: redundant title heading`);
      if (/^#{2,6} /u.test(line)) headings++;
    }
  }
  if (inRubric) errors.push('unclosed rubric');
  if (!headings) errors.push('no headings');
  if (!text.endsWith('\n')) errors.push('missing trailing newline');
  if (id === 'devotion-euharystychnaja-pracesija') {
    for (const station of stations) {
      if (!text.includes(`## ${station} прыпынак`)) errors.push(`missing ${station} прыпынак`);
    }
    const actual = [...text.matchAll(/^## (\S+) прыпынак\s*$/gmu)].map((match) => match[1]);
    if (actual.join(',') !== stations.join(',')) errors.push('Procession stations must each occur once and in order');
  }
  return errors;
}

export async function prepareFourDevotions({ snapshotPath, out } = {}) {
  const manifest = JSON.parse(await readFile(path.join(DIR, 'manifest.json'), 'utf8'));
  if (manifest.documents?.length !== 4) throw new Error('Expected exactly four records');
  const seen = new Set();
  const candidates = [];
  for (const item of manifest.documents) {
    if (seen.has(item.id)) throw new Error(`Duplicate candidate ID: ${item.id}`);
    seen.add(item.id);
    const text = await readFile(path.join(DIR, item.filename), 'utf8');
    if (hash(text) !== item.sha256) throw new Error(`Checksum mismatch: ${item.filename}`);
    const errors = [...validateContent(text, item.id), ...validatePrayerMarkdown(text).map(({ line, message }) => `line ${line}: ${message}`)];
    if (item.textFormat !== PRAYER_TEXT_FORMAT || item.textFormatVersion !== PRAYER_TEXT_FORMAT_VERSION) {
      errors.push('Unsupported prayer Markdown version');
    }
    candidates.push({ id: item.id, title: item.title, hash: item.sha256, errors,
      sourcePdf: item.sourcePdf, sourcePageLabels: item.sourcePageLabels,
      proposed: { title: item.title, text, tags: [manifest.categoryTag], priestOnly: false, effectivePriestOnly: false,
        textFormat: PRAYER_TEXT_FORMAT, textFormatVersion: PRAYER_TEXT_FORMAT_VERSION },
      decision: errors.length ? 'INVALID' : 'PENDING_SNAPSHOT' });
  }
  const blockers = ['Independent page-by-page proofreading is pending', 'Source book/imprint is unverified'];
  let category = null, snapshotChecked = false;
  if (!snapshotPath) blockers.push('No local snapshot supplied: category/duplicates unverified');
  else {
    const snapshot = await openFirestoreSnapshot(snapshotPath);
    const names = ['prayers', 'priestProtectedPrayers', 'prayerCategories', 'priestProtectedCategories'];
    const missing = names.filter((name) => !snapshot.collectionPaths.includes(name));
    if (missing.length) throw new Error(`Snapshot lacks ${missing.join(', ')}`);
    const [pub, priv, publicCats, protectedCats] = await Promise.all(names.map(async (name) => (
      (await snapshot.collectionEntries(name)).map(({ id, data }) => ({ ...data, id }))
    )));
    const categories = [...publicCats, ...protectedCats];
    if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Duplicate category IDs in snapshot');
    const policy = prayerAccessPolicy([], categories);
    const found = categories.filter((c) => c.name === manifest.categoryDisplayName);
    category = found.map((c) => ({ id: c.id, name: c.name, tags: c.tags, priestOnly: c.priestOnly }));
    const target = found.length === 1 && publicCats.includes(found[0]) && !found[0].effectivePriestOnly
      && !policy.categoryRestricted(found[0].id) ? found[0] : null;
    if (!target) blockers.push('Public category not uniquely identified');
    const published = [pub, priv].flatMap((rows, i) => rows.map((prayer) => ({
      prayer, collection: names[i], title: titleKey(prayer.title),
      ...contentKeys(prayer),
    })));
    for (const candidate of candidates) {
      const content = contentKeys(candidate.proposed);
      const paragraphs = [...content.paragraphs];
      const matches = published.flatMap((item) => {
        const sharedParagraphs = paragraphs.filter((paragraph) => item.paragraphs.has(paragraph)).length;
        const same = item.prayer.id === candidate.id || item.title === titleKey(candidate.title) || (item.text && item.text === content.text);
        return same || sharedParagraphs >= 2 ? [{ ...item, sharedParagraphs }] : [];
      });
      candidate.existing = matches.map(({ prayer, collection, sharedParagraphs }) => ({
        id: prayer.id, collection, sharedParagraphs, sameText: hash(prayer.text || '') === candidate.hash,
      }));
      const record = matches.length === 1 ? matches[0] : null;
      const alreadyPublished = record?.collection === 'prayers' && candidate.existing[0].sameText
        && record.prayer.title === candidate.title && record.prayer.textFormat === PRAYER_TEXT_FORMAT
        && record.prayer.textFormatVersion === PRAYER_TEXT_FORMAT_VERSION && !record.prayer.effectivePriestOnly
        && !policy.prayerRestricted(record.prayer) && target && prayerCategoryMatch(record.prayer, target).matches;
      const proposed = { id: candidate.id, ...candidate.proposed };
      const publicMember = target && prayerCategoryMatch(proposed, target).matches && !policy.prayerRestricted(proposed);
      candidate.decision = candidate.errors.length ? 'INVALID' : alreadyPublished ? 'ALREADY_EXISTS'
        : matches.length ? 'DUPLICATE_REVIEW' : publicMember ? 'CREATE_CANDIDATE' : 'CATEGORY_REVIEW';
      if (candidate.decision === 'DUPLICATE_REVIEW') blockers.push(`Potential duplicate: ${candidate.id}`);
      if (candidate.decision === 'CATEGORY_REVIEW') blockers.push(`Public category membership unverified: ${candidate.id}`);
    }
    snapshotChecked = true;
  }
  const report = { mode: 'OFFLINE_DRY_RUN', writesPerformed: 0, snapshotChecked, category, blockers, candidates };
  if (out) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); let snapshotPath, out;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--snapshot') snapshotPath = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  prepareFourDevotions({ snapshotPath, out })
    .then((r) => {
      console.log(JSON.stringify({ mode: r.mode, checkedSnapshot: r.snapshotChecked, blockers: r.blockers,
        candidates: r.candidates.map(({ id, errors, decision }) => ({ id, errors, decision })), writes: 0 }, null, 2));
      if (r.candidates.some((c) => c.errors.length)) process.exitCode = 1;
    })
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
