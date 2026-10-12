/**
 * Loads the crawled Catholic.by pages (reports/lectionary/snapshots) and the
 * checked-in special-page fixtures, parses them with the Lectionary parser
 * and gives them a normalized identity.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseLectionaryPage, validateParsedPage } from '../../liturgy/lib/lectionary-parser.mjs';
import { pageIdentity } from './identity.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
export const SNAPSHOT_DIR = path.join(ROOT, 'reports', 'lectionary', 'snapshots');
export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** Numeric article id of a Catholic.by URL (`…/5043-15-zhniunya-…`), or ''. */
export const pageIdOfUrl = (url) => /\/(\d{3,6})-[^/]+(?:[?#].*)?$/.exec(String(url || ''))?.[1] || '';

export function loadCrawl() {
  const file = path.join(SNAPSHOT_DIR, '_crawl.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** Parsed pages by id: { id, record, html, parsed, errors, identity }. */
export function loadPages() {
  const crawl = loadCrawl();
  const pages = new Map();
  for (const record of Object.values(crawl?.items || {})) {
    const file = path.join(SNAPSHOT_DIR, record.category || '_root', `${record.id}.html`);
    if (!fs.existsSync(file)) { pages.set(String(record.id), { id: String(record.id), record, html: '', parsed: null, errors: [], identity: pageIdentity(record.title) }); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const parsed = parseLectionaryPage(html);
    pages.set(String(record.id), { id: String(record.id), record, html, parsed, errors: validateParsedPage(parsed), identity: pageIdentity(record.title) });
  }
  return { crawl, pages };
}
