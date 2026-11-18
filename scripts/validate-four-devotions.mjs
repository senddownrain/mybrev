#!/usr/bin/env node
// Offline-only validation and candidate planning. No Firebase reads or writes.
// Usage: node scripts/validate-four-devotions.mjs [--snapshot <local-dir>] [--out <private-report.json>]
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs/content-imports/four-devotions-2026-11-18');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const titleKey = (s) => String(s || '').normalize('NFC').toLocaleLowerCase('be').replace(/[’‘ʼ]/gu, "'").replace(/\s+/gu, ' ').trim();

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
      if (/[\uFFFD\u0000-\u0008\u000B-\u001F]/u.test(line)) errors.push(`line ${i + 1}: damaged text`);
      if (/^# /u.test(line)) errors.push(`line ${i + 1}: redundant title heading`);
      if (/^#{2,6} /u.test(line)) headings++;
    }
  }
  if (inRubric) errors.push('unclosed rubric');
  if (!headings) errors.push('no headings');
  if (!text.endsWith('\n')) errors.push('missing trailing newline');
  if (id === 'devotion-euharystychnaja-pracesija') {
    for (const station of ['Першы', 'Другі', 'Трэці', 'Чацвёрты']) {
      if (!text.includes(`## ${station} прыпынак`)) errors.push(`missing ${station} прыпынак`);
    }
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
    const errors = validateContent(text, item.id);
    candidates.push({ id: item.id, title: item.title, hash: item.sha256, errors,
      proposed: { title: item.title, text, tags: ['Набажэнства'], priestOnly: false,
        textFormat: 'mybrev-markdown', textFormatVersion: 1 },
      decision: errors.length ? 'INVALID' : 'PENDING_SNAPSHOT' });
  }
  const blockers = ['Source book/imprint not established by the supplied PDF extracts'];
  let category = null, snapshotChecked = false;
  if (!snapshotPath) blockers.push('No local snapshot supplied: category/duplicates unverified');
  else {
    const snapshot = await openFirestoreSnapshot(snapshotPath);
    const names = ['prayers', 'priestProtectedPrayers', 'prayerCategories', 'priestProtectedCategories'];
    const missing = names.filter((name) => !snapshot.collectionPaths.includes(name));
    if (missing.length) throw new Error(`Snapshot lacks ${missing.join(', ')}`);
    const [pub, priv, publicCats, protectedCats] = await Promise.all(names.map((name) => snapshot.collection(name)));
    const categories = [...publicCats, ...protectedCats];
    const found = categories.filter((c) => c.name === 'Набажэнствы' || (c.tags || []).includes('Набажэнства'));
    category = found.map((c) => ({ id: c.id, name: c.name, tags: c.tags, priestOnly: c.priestOnly }));
    if (found.length !== 1 || found[0].priestOnly || found[0].effectivePriestOnly)
      blockers.push('Public category not uniquely identified');
    for (const candidate of candidates) {
      const matches = [...pub, ...priv].filter((p) => p.id === candidate.id || titleKey(p.title) === titleKey(candidate.title));
      candidate.existing = matches.map((p) => ({ id: p.id, sameText: hash(p.text || '') === candidate.hash }));
      candidate.decision = candidate.errors.length ? 'INVALID' : !matches.length ? 'CREATE_CANDIDATE'
        : matches.length === 1 && candidate.existing[0].sameText ? 'ALREADY_EXISTS' : 'DUPLICATE_REVIEW';
      if (candidate.decision === 'DUPLICATE_REVIEW') blockers.push(`Potential duplicate: ${candidate.id}`);
    }
    snapshotChecked = true;
  }
  const report = { mode: 'OFFLINE_DRY_RUN', writesPerformed: 0, snapshotChecked, category, blockers, candidates };
  if (out) {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + '\n', { flag: 'w' });
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
