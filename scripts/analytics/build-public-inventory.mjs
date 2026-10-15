#!/usr/bin/env node
/**
 * Builds the analytics public content_id inventory (docs/analytics-contract.md §4)
 * from the PUBLISHED app content bundle, never from a raw Firestore snapshot.
 *
 *   node scripts/analytics/build-public-inventory.mjs --bundle <dir> [--out <file>] [--check]
 *
 * <dir> is the app content bundle (Flutter `assets/content`: manifest.json,
 * prayers.json.gz, songs.json.gz, compendium.json.gz). Only documents that the
 * bundle publishes and that carry no priestOnly / effectivePriestOnly flag are
 * listed. Reads local files only; no Firestore access.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { BIBLE_BOOKS } from '../../src/constants/bible.js';
import { HOUR_IDS, validateContentId } from '../../src/utils/analytics/contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const bundle = option('--bundle');
const out = path.resolve(option('--out') || path.join(root, 'src/utils/analytics/public-inventory.json'));
const check = args.includes('--check');
if (!bundle) { console.error('usage: --bundle <dir> [--out <file>] [--check]'); process.exit(2); }

const readJson = (file) => JSON.parse(file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8'));
const manifest = readJson(path.join(bundle, 'manifest.json'));
const isOpen = (doc) => !doc.priestOnly && !doc.effectivePriestOnly;

const ids = [];
const problems = [];
const counts = {};
const add = (kind, section, list) => {
  counts[kind] = 0;
  for (const id of list) {
    const contentId = `${kind}:${id}`;
    const bad = validateContentId(section, contentId);
    if (bad.length) { problems.push(`${contentId}: ${bad.join('; ')}`); continue; }
    ids.push(contentId);
    counts[kind] += 1;
  }
};

const closed = {};
for (const [collection, kind, section] of [['prayers', 'prayer', 'prayers'], ['songs', 'song', 'songs'], ['compendium', 'comp', 'compendium']]) {
  const docs = readJson(path.join(bundle, `${collection}.json.gz`)).docs;
  const entries = Object.entries(docs);
  closed[collection] = entries.filter(([, doc]) => !isOpen(doc)).length;
  add(kind, section, entries.filter(([, doc]) => isOpen(doc)).map(([id]) => id));
}
add('mass', 'mass', ['order']);
add('hour', 'hours', HOUR_IDS.map((hour) => hour));
add('bible', 'bible', Object.entries(BIBLE_BOOKS).flatMap(([language, books]) => books.map((book) => `${language}:${book.id}`)));

ids.sort();
const body = {
  schema_version: 1,
  source: { bundleContentVersion: manifest.contentVersion, bundleContentDate: manifest.contentDate },
  counts,
  excluded_closed_in_bundle: closed,
  ids,
};
body.sha256 = createHash('sha256').update(JSON.stringify(ids)).digest('hex');
if (problems.length) { console.error(`invalid ids:\n${problems.join('\n')}`); process.exit(1); }
const text = `${JSON.stringify(body, null, 1)}\n`;
if (check) {
  const current = readFileSync(out, 'utf8');
  if (current !== text) { console.error('public-inventory.json is out of date: rebuild from the current bundle'); process.exit(1); }
  console.log('inventory is up to date');
} else {
  writeFileSync(out, text);
  console.log(`wrote ${path.relative(root, out)}: ${ids.length} ids`, counts);
}
