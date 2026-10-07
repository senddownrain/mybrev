#!/usr/bin/env node
/**
 * Refresh the offline Catholic.by Lectionary fixtures (network, read-only).
 * Stores only the article body with a provenance header, so the parser tests
 * and the readings migration run offline and reproducibly.
 *
 *   node scripts/liturgy/fetch-lectionary-fixtures.mjs [key ...]
 *
 * The fetch goes through curl (honours HTTPS_PROXY) with retries: the site
 * answers 403 without a browser User-Agent and the connection drops at times.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { LECTIONARY_PAGES } from './lib/lectionary-pages.mjs';
import { extractArticleBody } from './lib/lectionary-parser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'catholicby');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function fetchPage(url, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const html = execFileSync('curl', ['-sS', '-f', '-m', '60', '-A', UA, '-H', 'Accept-Language: be,ru;q=0.8', url], {
        encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (html.length > 1000) return html;
    } catch (error) {
      process.stderr.write(`  ${url}: attempt ${attempt} failed (${String(error.message).split('\n')[0]})\n`);
    }
    execFileSync('sleep', [String(Math.min(2 * attempt, 10))]);
  }
  throw new Error(`Could not fetch ${url}`);
}

const wanted = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
for (const page of LECTIONARY_PAGES.filter((item) => !wanted.length || wanted.includes(item.key))) {
  const raw = fetchPage(page.url);
  const body = extractArticleBody(raw);
  if (!body) throw new Error(`${page.key}: no article body`);
  const header = `<!-- source: ${page.url} -->\n<!-- fetched: ${new Date().toISOString().slice(0, 10)} -->\n`;
  fs.writeFileSync(path.join(OUT, `${page.key}.html`), `${header}${body.replace(/\r\n?/g, '\n').trim()}\n`);
  console.log(`${page.key}: ${body.length} bytes`);
}
