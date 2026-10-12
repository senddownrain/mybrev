import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import {
  htmlToPrayerMarkdown, renderPrayerMarkdown, validatePrayerMarkdown,
} from '../../src/utils/prayerMarkdown.js';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const whitespace = (value) => String(value || '').replace(/\s+/gu, ' ').trim();
export const htmlPlain = (html) => whitespace(parse(String(html).replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/giu, ' ')).textContent);
export function normalizeUrl(value, base = 'https://old.catholic.by') {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}
export function articleBody(html) {
  const root = parse(html);
  const tables = root.querySelectorAll('table.contentpaneopen');
  const body = tables.find((table) => table.querySelector('td[valign="top"]'))?.querySelector('td[valign="top"]')
    || root.querySelector('[itemprop="articleBody"]') || root.querySelector('article');
  if (!body) throw new Error('Article body not found; refusing whole-page extraction');
  return { body, title: whitespace(root.querySelector('.contentheading')?.textContent || root.querySelector('h1')?.textContent) };
}
export function discoverCatalog(html, base) {
  const { body } = articleBody(html);
  const seen = new Set();
  return body.querySelectorAll('a[href]').flatMap((anchor) => {
    const title = whitespace(anchor.textContent);
    const sourceUrl = normalizeUrl(anchor.getAttribute('href'), base);
    if (!title || !sourceUrl.startsWith('https://old.catholic.by/2/liturgy/pray/') || seen.has(sourceUrl)) return [];
    seen.add(sourceUrl);
    return [{ title, sourceUrl }];
  });
}

// Uses MyBrev's converter, preserving poetry and emphasis. The sentinel
// prevents the converter's rubric heuristic from turning a sung response
// (a paragraph containing only <em>) into a stage direction.
export function contentMarkdown(html) {
  const root = parse(html);
  for (const paragraph of root.querySelectorAll('p')) {
    const text = htmlPlain(paragraph.innerHTML);
    if (/^(?:Чытаецца\s[^.!]*\.|\(навэнна распачынаецца[^)]*\)|Калі няма ўласнай малітвы[^:]*:)$/iu.test(text)) paragraph.setAttribute('class', 'rubric');
  }
  for (const em of root.querySelectorAll('em, i')) {
    const parent = em.parentNode;
    if (parent?.tagName === 'P' && !/rubric/.test(parent.getAttribute('class') || '') && whitespace(parent.textContent) === whitespace(em.textContent)) {
      em.insertAdjacentHTML('beforebegin', 'MYBREV_EM_SENTINEL');
    }
  }
  return htmlToPrayerMarkdown(root.toString()).replace(/MYBREV\\?_EM\\?_SENTINEL/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}
export function plainText(text, format = 'mybrev-markdown') {
  return htmlPlain(renderPrayerMarkdown(text, format));
}
export const comparableText = (text, format) => plainText(text, format).normalize('NFC').toLocaleLowerCase('be');
export const prayerTitle = (document) => document.title || document.titleVersions?.be || document.titleVersions?.ru || Object.values(document.titleVersions || {}).find(Boolean) || '';
export const prayerText = (document) => document.text || document.textVersions?.be || document.textVersions?.ru || Object.values(document.textVersions || {}).find(Boolean) || '';
const titleKey = (value) => whitespace(value).toLocaleLowerCase('be').replace(/[«»“”"‘’.,:;–—-]/gu, '');
const comparisonCache = new WeakMap();
function dice(left, right) {
  const words = (text) => new Set(text.match(/[\p{L}\p{N}]+/gu) || []);
  const a = words(left), b = words(right);
  if (!a.size || !b.size) return 0;
  return 2 * [...a].filter((word) => b.has(word)).length / (a.size + b.size);
}

// Comparison only: never changes the stored spelling or source text.
export function comparisonWords(text, format) {
  return comparableText(text, format).replace(/[\u00ad¬]/g, '').replace(/i/g, 'і')
    .replace(/[’‘`]/g, "'").match(/[\p{L}\p{N}]+/gu) || [];
}
export function shingleCoverage(leftWords, rightWords, width = 5) {
  const shingles = (words) => new Set(Array.from({ length: Math.max(0, words.length - width + 1) }, (_, i) => words.slice(i, i + width).join(' ')));
  const left = shingles(leftWords), right = shingles(rightWords);
  const common = [...left].filter((s) => right.has(s)).length;
  return { candidateCoverage: left.size ? common / left.size : 0, existingCoverage: right.size ? common / right.size : 0, commonShingles: common };
}
export function contextualAudit(candidates, existing) {
  const sources = existing.flatMap((document) => {
    const variants = [{ locale: 'primary', text: prayerText(document) }, ...Object.entries(document.textVersions || {}).map(([locale, text]) => ({ locale, text }))];
    const seen = new Set();
    return variants.filter(({ text }) => typeof text === 'string' && text.trim()).flatMap(({ locale, text }) => {
      const words = comparisonWords(text, document.textFormat), key = words.join(' ');
      if (seen.has(key)) return []; seen.add(key);
      return [{ id: document.id, title: prayerTitle(document), locale, words, key }];
    });
  });
  return candidates.map((candidate) => {
    const words = comparisonWords(candidate.text, candidate.textFormat), key = words.join(' ');
    const matches = sources.map((source) => ({ id: source.id, title: source.title, locale: source.locale,
      candidateWords: words.length, existingWords: source.words.length,
      normalizedExact: key === source.key, embedded: key.length > 500 && source.key.includes(key),
      ...shingleCoverage(words, source.words),
    })).sort((a, b) => b.candidateCoverage - a.candidateCoverage);
    const bestById = [...new Map(matches.map((m) => [m.id, matches.find((best) => best.id === m.id)])).values()];
    return { id: candidate.id, title: candidate.title, matches: bestById.slice(0, 5) };
  });
}

export function deduplicate(candidate, existing) {
  if (existing === null) return { status: 'database-not-audited', matches: [] };
  const text = comparableText(candidate.text), title = titleKey(candidate.title);
  const matches = existing.flatMap((document) => {
    let oldText = comparisonCache.get(document);
    if (oldText === undefined) { oldText = comparableText(prayerText(document), document.textFormat); comparisonCache.set(document, oldText); }
    const urls = [document.sourceUrl, ...(String(document.source || '').match(/https?:\/\/[^\s)\]<>]+/g) || [])].map((url) => normalizeUrl(url));
    const sameIdentity = document.id === candidate.id || document.importKey === candidate.importKey
      || (candidate.sourceUrl && urls.includes(normalizeUrl(candidate.sourceUrl)));
    const exact = oldText === text;
    const sameTitle = titleKey(prayerTitle(document)) === title;
    // Collection index links are not evidence that it contains the prayers.
    const embedded = candidate.sourceKind === 'local-docx' && text.length > 500 && oldText.includes(text);
    const similarity = dice(titleKey(prayerTitle(document)), title);
    const contentSimilarity = dice(oldText, text);
    if (!sameIdentity && !exact && !sameTitle && !embedded && !(similarity >= 0.7 && contentSimilarity >= 0.5)) return [];
    let position = 0;
    while (position < Math.min(oldText.length, text.length) && oldText[position] === text[position]) position++;
    return [{ id: document.id, title: prayerTitle(document), exact, embedded, contentSimilarity,
      firstDifference: exact ? null : { position, existing: oldText.slice(Math.max(0, position - 40), position + 160), candidate: text.slice(Math.max(0, position - 40), position + 160) },
      reason: sameIdentity ? 'source-url/import-key/id' : exact ? 'text-hash' : embedded ? 'embedded-full-text' : 'similar-title',
      textHash: hash(oldText), oldTextLength: oldText.length, newTextLength: text.length }];
  });
  if (!matches.length) return { status: 'create', matches };
  if (matches.length !== 1 || !matches[0].exact) return { status: 'needs-review', matches };
  const old = existing.find((item) => item.id === matches[0].id);
  if (old.priestOnly || old.effectivePriestOnly) return { status: 'needs-review', matches, reason: 'restricted-existing-document' };
  const tags = [...new Set([...(old.tags || []), ...candidate.tags])];
  const patch = {};
  if (tags.length !== (old.tags || []).length) patch.tags = tags;
  if (!old.source && candidate.source) patch.source = candidate.source;
  const status = patch.tags ? 'add-tags-only' : patch.source ? 'add-source-only' : 'already-present';
  return { status, matches, patch, expected: { text: old.text, title: old.title, tags: old.tags || [], source: old.source || '' } };
}

export function extractArticle(html, sourceUrl, type) {
  const { body, title } = articleBody(html);
  const removed = [];
  for (const node of body.querySelectorAll('script, style, iframe, object, .buttonheading, .modifydate, .article_separator, .pagenav, .divider')) {
    removed.push({ kind: node.getAttribute('class') || node.tagName, text: whitespace(node.textContent) });
    node.remove();
  }
  for (const node of body.querySelectorAll('p, div')) {
    if (/^Пры выкарыстанні матэрыялаў/iu.test(whitespace(node.textContent))) {
      removed.push({ kind: 'reuse-notice', text: whitespace(node.textContent) }); node.remove();
    }
  }
  const images = body.querySelectorAll('img').map((img) => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt') || '' }));
  // An article illustration needs review, never becomes an untrusted remote asset.
  body.querySelectorAll('img').forEach((img) => img.remove());
  const links = body.querySelectorAll('a[href]').map((a) => ({ title: whitespace(a.textContent), url: normalizeUrl(a.getAttribute('href'), sourceUrl) })).filter((a) => a.url);
  for (const anchor of body.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (href.startsWith('#')) continue;
    const url = new URL(href, sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol)) anchor.removeAttribute('href');
    else anchor.setAttribute('href', url.href);
  }
  // Old Joomla embeds station headings inside preceding prayer paragraphs.
  for (const node of body.querySelectorAll('b, strong, h1, h2, h3')) {
    const text = whitespace(node.textContent);
    if (type === 'stations' && stationNumber(text) !== null) {
      node.replaceWith(parse(`<h2>${node.innerHTML}</h2>`));
    } else if (node.tagName === 'H1') node.replaceWith(parse(`<h2>${node.innerHTML}</h2>`));
  }
  if (type === 'stations') for (const node of body.querySelectorAll('p')) {
    const text = htmlPlain(node.innerHTML);
    if (!node.querySelector('h2') && /^Стацыя(?:\s|$)/iu.test(text) && text.length < 120 && stationNumber(text) !== null) {
      node.replaceWith(parse(`<h2>${node.innerHTML}</h2>`));
    }
  }
  let text = contentMarkdown(body.innerHTML);
  text = text.replace(/^# /gm, '## ');
  const originalPlain = htmlPlain(body.innerHTML);
  const outputPlain = plainText(text);
  const words = (value) => (value.match(/[\p{L}\p{N}]+/gu) || []).join(' ');
  const fidelity = words(originalPlain) === words(outputPlain);
  const stationNumbers = body.querySelectorAll('h2').map((node) => stationNumber(htmlPlain(node.innerHTML))).filter((number) => number !== null);
  const issues = [];
  const novenaDays = [...outputPlain.matchAll(/Дзень\s+(першы|другі|трэці|чацвёрты|пяты|шосты|сёмы|восьмы|дзявяты|дзевяты)/giu)].map((m) => m[1]);
  if (outputPlain.length < 200) issues.push('short-or-empty-article');
  if (!fidelity) issues.push('conversion-word-order-mismatch');
  if (type === 'stations' && (stationNumbers.length !== 14 || stationNumbers.some((n, i) => n !== i + 1))) issues.push('station-sequence-needs-review');
  if (images.length) issues.push('article-images-require-review');
  if (validatePrayerMarkdown(text).length) issues.push('invalid-markdown');
  return { title, text, links, removed, images, stationNumbers, fidelity, issues,
    novenaDays,
    articleHash: hash(body.innerHTML), textHash: hash(text), articleLength: originalPlain.length,
    beginning: outputPlain.slice(0, 160), ending: outputPlain.slice(-160) };
}

export function stationNumber(value) {
  const text = whitespace(value);
  const ordinal = ['Першая', 'Другая', 'Трэцяя', 'Чацвёртая', 'Пятая', 'Шостая', 'Сёмая', 'Восьмая', 'Дз[еяв]+тая', 'Дзясятая', 'Адзінаццатая', 'Дванаццатая', 'Трынаццатая', 'Чатырнаццатая'];
  const index = ordinal.findIndex((word) => new RegExp(`^${word} стацыя`, 'iu').test(text));
  if (index !== -1) return index + 1;
  const match = /^(?:Стацыя\s+)?(\d{1,2}|[IVXІХ]+)(?=[.\s:–—-]|$)/iu.exec(text);
  if (!match) return null;
  if (!/^Стацыя/iu.test(text) && !/^[IVXІХ\d]+\./iu.test(text)) return null;
  if (/^\d+$/.test(match[1])) return Number(match[1]);
  const roman = match[1].toUpperCase().replaceAll('І', 'I').replaceAll('Х', 'X');
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'].indexOf(roman) + 1 || null;
}
