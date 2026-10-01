#!/usr/bin/env node
// Build the canonical Compendium dataset from the Catholic.by source.
//
//   node scripts/build-compendium.mjs                 # parse the cached HTML, write src/data/compendium/*
//   node scripts/build-compendium.mjs --fetch         # re-download the source pages into the cache first
//   node scripts/build-compendium.mjs --check         # verify the committed dataset matches the cache
//   node scripts/build-compendium.mjs --flutter-asset ../ibreviarybyapp/assets/compendium/compendium.json.gz
//
// No Firestore access. See docs/compendium.md.
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPENDIUM_SOURCE_URL,
  buildCompendium,
  parseIndexPage,
  parsePartPage,
} from './lib/compendium-parser.mjs';
import { validateCompendiumDataset } from '../src/utils/compendiumData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  fetch: false,
  check: false,
  source: path.join(ROOT, 'scripts/compendium-source'),
  outDir: path.join(ROOT, 'src/data/compendium'),
  report: path.join(ROOT, 'reports/compendium-build-report.json'),
  flutterAsset: null,
  today: new Date().toISOString().slice(0, 10),
};
for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === '--fetch') options.fetch = true;
  else if (arg === '--check') options.check = true;
  else if (['--source', '--out-dir', '--report', '--flutter-asset', '--today'].includes(arg)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    const key = { '--source': 'source', '--out-dir': 'outDir', '--report': 'report', '--flutter-asset': 'flutterAsset', '--today': 'today' }[arg];
    options[key] = key === 'today' ? value : path.resolve(value);
  } else throw new Error(`Unknown option: ${arg}`);
}

const DATASET_FILE = 'compendium.json';
const ALIASES_FILE = 'compendium_search_aliases.json';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pageFileName = (url) => `${decodeURIComponent(new URL(url).pathname.split('/').pop())}.html`;

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'mybrev-compendium-import (+https://github.com/senddownrain/mybrev)' } });
  if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}`);
  return response.text();
}

async function fetchSource() {
  await mkdir(options.source, { recursive: true });
  const pages = [];
  const save = async (url, html) => {
    const file = pageFileName(url);
    await writeFile(path.join(options.source, file), html);
    pages.push({ url, file, bytes: Buffer.byteLength(html), sha256: sha256(html) });
  };
  const indexHtml = await download(COMPENDIUM_SOURCE_URL);
  await save(COMPENDIUM_SOURCE_URL, indexHtml);
  for (const part of parseIndexPage(indexHtml).parts) await save(part.sourceUrl, await download(part.sourceUrl));
  const manifest = { sourceUrl: COMPENDIUM_SOURCE_URL, fetchedAt: new Date().toISOString(), pages };
  await writeFile(path.join(options.source, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Fetched ${pages.length} pages into ${path.relative(ROOT, options.source)}`);
}

async function readSource() {
  const files = new Set(await readdir(options.source).catch(() => []));
  const read = async (url) => {
    const file = pageFileName(url);
    if (!files.has(file)) throw new Error(`Missing cached page ${file}. Run with --fetch.`);
    return readFile(path.join(options.source, file), 'utf8');
  };
  const index = parseIndexPage(await read(COMPENDIUM_SOURCE_URL));
  const parts = [];
  for (const part of index.parts) parts.push(parsePartPage(await read(part.sourceUrl), part));
  return { index, parts };
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function main() {
  if (options.fetch) await fetchSource();
  const datasetPath = path.join(options.outDir, DATASET_FILE);
  const previous = await readJson(datasetPath);
  const { index, parts } = await readSource();
  const { dataset, report } = buildCompendium({ index, parts, previous });
  dataset.meta.updatedAt ??= options.today;

  const errors = validateCompendiumDataset(dataset);
  if (errors.length) throw new Error(`Validation failed:\n- ${errors.join('\n- ')}`);
  const json = `${JSON.stringify(dataset, null, 1)}\n`;
  const summary = {
    questions: dataset.meta.questionCount,
    units: dataset.meta.unitCount,
    contentVersion: dataset.meta.contentVersion,
    checksum: dataset.meta.checksum,
    unmatchedTocEntries: report.unmatchedTocEntries.length,
    skippedUnnumberedBlocks: report.skippedBlocks.length,
  };

  if (options.check) {
    const committed = await readFile(datasetPath, 'utf8').catch(() => '');
    if (committed.replace(/\r\n/g, '\n') !== json) throw new Error(`${path.relative(ROOT, datasetPath)} is out of date. Run: npm run compendium:build`);
    console.log(JSON.stringify({ ...summary, check: 'ok' }));
    return;
  }

  await mkdir(options.outDir, { recursive: true });
  await writeFile(datasetPath, json);
  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify({ ...summary, ...report }, null, 2)}\n`);

  if (options.flutterAsset) {
    await mkdir(path.dirname(options.flutterAsset), { recursive: true });
    // mtime 0 keeps the gzip byte-identical for identical content.
    await writeFile(options.flutterAsset, gzipSync(Buffer.from(JSON.stringify(dataset)), { level: 9 }));
    await copyFile(path.join(options.outDir, ALIASES_FILE), path.join(path.dirname(options.flutterAsset), ALIASES_FILE));
    console.log(`Flutter asset: ${options.flutterAsset} (+ ${ALIASES_FILE})`);
  }
  console.log(JSON.stringify(summary));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
