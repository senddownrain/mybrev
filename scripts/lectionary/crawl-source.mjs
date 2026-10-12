#!/usr/bin/env node
/**
 * Catholic.by Lectionary crawler (network, read-only, sequential, polite).
 *
 *   node scripts/lectionary/crawl-source.mjs [--refresh] [--delay 400] [--limit N]
 *
 * 1. Fetches the index and every category it links.
 * 2. Collects every article link from each category page (the menu lists the
 *    items) and, transitively, from every article page (BFS), so an article
 *    that is only linked from another article is still found.
 * 3. Stores the trimmed article body per page under
 *    reports/lectionary/snapshots/<category>/<id>.html (cached: a stored page
 *    is not fetched again without --refresh) and the crawl state in
 *    reports/lectionary/snapshots/_crawl.json (status, redirects, sha256,
 *    title, discovery path, anomalies).
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { extractArticleBody } from '../liturgy/lib/lectionary-parser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'reports', 'lectionary', 'snapshots');
const HOST = 'https://catholic.by';
const BASE = '/3/liturgy/lectionary';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : (args[i + 1] ?? true); };
const REFRESH = args.includes('--refresh');
const DELAY = Number(flag('--delay', 400));
const LIMIT = Number(flag('--limit', 0));

const sleep = (ms) => execFileSync('sleep', [String(ms / 1000)]);
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function fetchRaw(url, attempts = 8) {
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const out = execFileSync('curl', ['-sS', '-m', '60', '-A', UA, '-H', 'Accept-Language: be,ru;q=0.8', '-L',
        '-w', '\n__CURL__%{http_code} %{num_redirects} %{url_effective}', url], {
        encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const cut = out.lastIndexOf('\n__CURL__');
      const [status, redirects, finalUrl] = out.slice(cut + 9).trim().split(' ');
      const body = out.slice(0, cut);
      if (Number(status) >= 500 || (Number(status) === 200 && body.length < 1000)) throw new Error(`status ${status}, ${body.length} bytes`);
      return { status: Number(status), redirects: Number(redirects), finalUrl, html: body };
    } catch (error) {
      lastError = String(error.message).split('\n')[0];
      sleep(Math.min(2 * attempt, 12) * 1000);
    }
  }
  return { status: 0, redirects: 0, finalUrl: url, html: '', error: lastError };
}

const ITEM = new RegExp(`href="(?:${HOST})?(${BASE}/(?:([a-z]+)/)?(\\d+)-[^"?#]*)(\\?[^"#]*)?"`, 'g');
export function itemLinks(html) {
  const found = new Map();
  for (const match of html.matchAll(ITEM)) {
    const [, pathname, category, id, query] = match;
    const key = pathname;
    if (!found.has(key)) found.set(key, { path: pathname, category: category || null, id: Number(id), queries: new Set() });
    if (query) found.get(key).queries.add(query);
  }
  return found;
}
const categoryLinks = (html) => [...new Set([...html.matchAll(new RegExp(`href="(?:${HOST})?${BASE}/([a-z]+)(?:["?#])`, 'g'))].map((m) => m[1]))]
  .filter((name) => !/^\d/.test(name));
const tokenFirstLine = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
const titleOf = (html) => (/<title>([^<]*)<\/title>/i.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim();

const state = {
  crawledAt: new Date().toISOString(), index: null, categories: {}, items: {}, anomalies: [],
};
fs.mkdirSync(OUT, { recursive: true });
const statePath = path.join(OUT, '_crawl.json');
const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
if (previous && !REFRESH) Object.assign(state, { items: previous.items, categories: previous.categories, index: previous.index });
const save = () => fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

// ---- 1. index + categories
if (!state.index || REFRESH) {
  const index = fetchRaw(`${HOST}${BASE}`);
  state.index = { url: `${HOST}${BASE}`, status: index.status, bytes: index.html.length, sha256: sha256(index.html), categories: categoryLinks(index.html).sort() };
  sleep(DELAY);
}
const queue = new Map();
const enqueue = (link, via) => {
  const url = `${HOST}${link.path}`;
  if (!queue.has(url)) queue.set(url, { url, ...link, queries: [...(link.queries || [])], via: [] });
  if (!queue.get(url).via.includes(via)) queue.get(url).via.push(via);
};
for (const category of state.index.categories) {
  const url = `${HOST}${BASE}/${category}`;
  if (state.categories[category] && !REFRESH) {
    for (const item of state.categories[category].links) enqueue({ path: item.path, category: item.category, id: item.id }, `category:${category}`);
    continue;
  }
  const page = fetchRaw(url);
  const links = [...itemLinks(page.html).values()];
  state.categories[category] = {
    url, status: page.status, finalUrl: page.finalUrl, redirects: page.redirects, bytes: page.html.length, sha256: sha256(page.html),
    pagination: [...page.html.matchAll(/href="[^"]*[?&](?:start|limitstart|page)=\d+[^"]*"/g)].length,
    links: links.map((l) => ({ path: l.path, category: l.category, id: l.id })),
  };
  for (const link of links) enqueue(link, `category:${category}`);
  console.log(`category ${category}: ${page.status}, ${links.length} links`);
  sleep(DELAY);
}
save();

// ---- 2. BFS over article pages
let fetched = 0;
const pending = [...queue.keys()];
for (let i = 0; i < pending.length; i += 1) {
  const url = pending[i];
  const entry = queue.get(url);
  const id = String(entry.id);
  const bucket = entry.category || '_root';
  const file = path.join(OUT, bucket, `${id}.html`);
  const known = state.items[id];
  let html = '';
  if (known && fs.existsSync(file) && !REFRESH) {
    html = fs.readFileSync(file, 'utf8');
    for (const link of itemLinks(html).values()) if (!queue.has(`${HOST}${link.path}`)) { enqueue(link, `page:${id}`); pending.push(`${HOST}${link.path}`); }
    known.via = [...new Set([...(known.via || []), ...entry.via])];
    continue;
  }
  if (LIMIT && fetched >= LIMIT) break;
  const page = fetchRaw(url);
  fetched += 1;
  const body = page.html ? extractArticleBody(page.html).replace(/\r\n?/g, '\n').trim() : '';
  const record = {
    id: entry.id, category: entry.category, url, finalUrl: page.finalUrl, status: page.status, redirects: page.redirects,
    title: titleOf(page.html), bytes: body.length, sha256: body ? sha256(body) : null, rawSha256: page.html ? sha256(page.html) : null,
    fetchedAt: new Date().toISOString(), via: entry.via, queries: entry.queries, error: page.error || null,
  };
  if (!body && page.status === 200) record.error = 'no articleBody';
  state.items[id] = record;
  if (body) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `<!-- source: ${url} -->\n<!-- fetched: ${record.fetchedAt.slice(0, 10)} -->\n${body}\n`);
  }
  // article-to-article links found in the page chrome (menus excluded: the
  // category menus were already walked, a new id here is a hidden page)
  for (const link of itemLinks(page.html).values()) {
    const target = `${HOST}${link.path}`;
    if (!queue.has(target)) { enqueue(link, `page:${id}`); pending.push(target); }
  }
  console.log(`${i + 1}/${pending.length} ${id} ${page.status}${page.redirects ? ` redirects=${page.redirects}` : ''} ${record.title.slice(0, 60)}`);
  if (fetched % 25 === 0) save();
  sleep(DELAY);
}
// ---- 3. holes in the id range: small gaps between listed articles are probed
// by id (`index.php?option=com_content&view=article&id=N`); an article that
// answers with a body but is in no category menu is recorded as `unlisted`.
const listedIds = Object.values(state.items).filter((item) => item.category !== '_unlisted').map((item) => item.id).sort((a, b) => a - b);
const holes = [];
for (let i = 0; i + 1 < listedIds.length; i += 1) {
  const gap = listedIds[i + 1] - listedIds[i] - 1;
  if (gap > 0 && gap <= 8) for (let id = listedIds[i] + 1; id < listedIds[i + 1]; id += 1) holes.push(id);
}
state.holes = { probed: holes, note: 'gaps of at most 8 ids between listed articles; larger gaps are other site content' };
for (const id of holes) {
  if (state.items[id] && !REFRESH) continue;
  const url = `${HOST}/3/index.php?option=com_content&view=article&id=${id}`;
  const page = fetchRaw(url);
  const body = page.html ? extractArticleBody(page.html).replace(/\r\n?/g, '\n').trim() : '';
  const record = {
    id, category: '_unlisted', url, finalUrl: page.finalUrl, status: page.status, redirects: page.redirects,
    title: body ? (tokenFirstLine(body)) : '', bytes: body.length, sha256: body ? sha256(body) : null, rawSha256: page.html ? sha256(page.html) : null,
    fetchedAt: new Date().toISOString(), via: ['hole-probe'], queries: [], error: body ? null : (page.error || 'no articleBody'),
  };
  state.items[id] = record;
  if (body) {
    fs.mkdirSync(path.join(OUT, '_unlisted'), { recursive: true });
    fs.writeFileSync(path.join(OUT, '_unlisted', `${id}.html`), `<!-- source: ${url} -->\n<!-- fetched: ${record.fetchedAt.slice(0, 10)} -->\n${body}\n`);
  }
  console.log(`hole ${id}: ${page.status} ${body.length} bytes ${record.title.slice(0, 60)}`);
  sleep(DELAY);
}
save();
console.log(`done: ${Object.keys(state.items).length} items, ${fetched} fetched this run`);
