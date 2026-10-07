#!/usr/bin/env node
/**
 * Check a saved lh.catholic.by day page into the repository as a source
 * snapshot: only the Office content (`#content`, the date header and the
 * eight hours) is kept — no scripts, styles, browser-extension markup.
 *
 *   node scripts/liturgy/snapshot-lh-page.mjs <saved page.html> [--note "why"]
 *
 * Output: patchs/sources/lh-catholic-by/<page date>.html (+ manifest.json).
 * The text is never edited: the importers read it with
 * `scripts/liturgy/lib/lh-catholic-by.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseLhPage, sourceIdentityOf, LH_SECTIONS } from './lib/lh-catholic-by.mjs';

export const LH_SOURCE_DIR = path.join('patchs', 'sources', 'lh-catholic-by');

export function trimLhPage(html) {
  const start = html.search(/<div id="content"/i);
  const endMatch = html.match(/<!--\s*DIV Kampleta End\s*-->/i);
  if (start < 0 || !endMatch) throw new Error('not a lh.catholic.by day page (no #content / Kampleta)');
  return html.slice(start, endMatch.index + endMatch[0].length)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/[ \t]+\n/g, '\n');
}

export function readLhSource(file, root = process.cwd()) {
  return fs.readFileSync(path.join(root, LH_SOURCE_DIR, file), 'utf8');
}

async function main() {
  const [input] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const noteIndex = process.argv.indexOf('--note');
  if (!input) throw new Error('Usage: snapshot-lh-page.mjs <page.html> [--note text]');
  const trimmed = trimLhPage(fs.readFileSync(input, 'utf8'));
  const page = parseLhPage(trimmed);
  if (!page.header?.date) throw new Error('no date in the page header');
  const file = `${page.header.date}.html`;
  const dir = path.join(process.cwd(), LH_SOURCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), `${trimmed}\n`);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { source: 'https://lh.catholic.by/showalldates/index.php', pages: {} };
  manifest.pages[file] = {
    date: page.header.date,
    savedAs: path.basename(input),
    title: page.header.title,
    rank: page.header.rank || null,
    hours: Object.fromEntries(LH_SECTIONS.map(([, key]) => key).filter((key) => page.hours[key])
      .map((key) => [key, sourceIdentityOf(page, key).ownHeading ? sourceIdentityOf(page, key) : 'day'])),
    ...(noteIndex > 0 ? { note: process.argv[noteIndex + 1] } : {}),
  };
  manifest.pages = Object.fromEntries(Object.entries(manifest.pages).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ file: path.join(LH_SOURCE_DIR, file), ...manifest.pages[file] }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
