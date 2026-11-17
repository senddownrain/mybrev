// The /sources bibliography is also the single registry of short prayer source names.
import bibliography from '../data/sourceBibliography.json' with { type: 'json' };

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLocaleLowerCase('be').replace(/[«»„“”"']/gu, '');
export const PRAYER_SOURCE_POLICY_VERSION = '2026-11-17-source-policy-v2';
export const PRAYER_SOURCE_REGISTRY = bibliography.entries;
export const hasSourcePages = (value) => /(?:^|[\s,.;(])(?:с\.|стар\.?|старонк[аіуы]|стр\.?|страниц[аы]?|pp?\.)\s*\d/iu.test(String(value ?? ''));
export const hasLongSourceDetails = (value) => hasSourcePages(value) || /©|ISBN|https?:\/\/|выдавецтв|издательств|\b\d{4}\b|(?:том|частка|часть|выданне)\s+[\dIVІX]+/iu.test(String(value ?? '')) || /\d+\s*[–—-]\s*\d+/u.test(String(value ?? '')) || clean(value).length > 100;

function aliases(entry) {
  // Extract the title only from an explicitly quoted edition; never guess from arbitrary input.
  const printed = /«([^»]+)»/u.exec(entry.title)?.[1];
  return [...new Set([entry.shortTitle, entry.title, printed, printed ? entry.title.slice(0, entry.title.indexOf('»') + 1) : null, ...(entry.aliases || [])].filter(Boolean).map(key))];
}
const registry = PRAYER_SOURCE_REGISTRY.map((entry) => ({ entry, aliases: aliases(entry) }));
// Only publication metadata may follow a known title. A second work or arbitrary prose is disputed.
function metadataOnly(value) {
  let rest = value.replace(/^[\s,.;:]+/u, '');
  rest = rest.replace(/\((?:Мінск|Пінск|Гродна|Минск|Minsk)\s*,\s*\d{4}(?:[–—-]\d{4})?\)/giu, '')
    .replace(/(?:с\.|стар\.?|старонк[аіуы]|стр\.?|страниц[аы]?|pp?\.)\s*\d+(?:\s*[–—-]\s*\d+)?/giu, '')
    .replace(/(?:том|т\.|частка|часть|ч\.)\s*[\dIVІX]+/giu, '')
    .replace(/[\dIVІX]+\s*[-–]?\s*(?:е|я|га)?\s*выданне/giu, '')
    .replace(/©[^©]*/gu, '')
    .replace(/ISBN\s*[\d–-]+/giu, '')
    .replace(/[\s,.;:]+/gu, '');
  return !rest;
}

/** Unknown/ambiguous input is returned byte-for-byte; callers can report or reject it. */
export function resolvePrayerSource(value) {
  if (typeof value !== 'string') return { value, status: value == null ? 'empty' : 'unknown' };
  const input = key(value);
  const link = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/u.exec(clean(value));
  const urlText = link ? link[2] : clean(value);
  if (/^https?:\/\/[^\s[\]()]+$/u.test(urlText)) {
    try {
      const url = new URL(urlText);
      const digital = PRAYER_SOURCE_REGISTRY.filter((entry) => entry.digitalHosts?.includes(url.hostname.toLowerCase()) && !url.username && !url.password);
      if (digital.length === 1) return { value: digital[0].shortTitle, status: 'known', sourceId: digital[0].id };
    } catch { /* Preserve malformed URLs for editorial review. */ }
  }
  if (!input) return { value, status: 'empty' };
  const candidates = registry.map(({entry, aliases}) => ({
    entry,
    score: Math.max(0, ...aliases.filter((alias) => input === alias || (input.startsWith(alias) && /^[\s,.;:(]/u.test(input.slice(alias.length)) && metadataOnly(input.slice(alias.length)))).map((alias) => alias.length)),
  }));
  const longest = Math.max(0, ...candidates.map(({score}) => score));
  const matches = candidates.filter(({score}) => score > 0 && score === longest);
  if (matches.length !== 1) return { value, status: 'unknown' };
  const entry = matches[0].entry;
  return { value: entry.shortTitle, status: 'known', sourceId: entry.id };
}
export const normalizePrayerSource = (value) => resolvePrayerSource(value).value;

/** Unknown sources must be resolved in the registry before writing; the input stays intact. */
export function sourceForSave(value) {
  const result = resolvePrayerSource(value);
  if (result.status === 'unknown') {
    const error = new Error('Невядомая крыніца: захавайце зыходныя звесткі і ўдакладніце кароткую назву ў даведніку /sources.');
    error.code = 'unknown-prayer-source';
    error.policyVersion = PRAYER_SOURCE_POLICY_VERSION;
    throw error;
  }
  return result.status === 'empty' ? '' : result.value;
}

export function normalizePrayerSourceFields(data, { forSave = true, existing } = {}) {
  const normalize = forSave ? sourceForSave : normalizePrayerSource;
  const result = { ...data };
  for (const field of ['source', 'sourceBook']) if (Object.hasOwn(data, field)) {
    const value = data[field];
    const unchanged = existing && Object.hasOwn(existing, field)
      && (typeof value === 'string' && typeof existing[field] === 'string'
        ? clean(value) === clean(existing[field])
        : JSON.stringify(value) === JSON.stringify(existing[field]));
    // Existing attribution is evidence, even when unresolved. Editing another
    // field must neither erase it nor silently replace it with trimmed UI input.
    result[field] = forSave && unchanged && resolvePrayerSource(value).status === 'unknown'
      ? existing[field] : normalize(value);
  }
  return result;
}

// Compatibility API for existing importers. Pages and legal notices belong in provenance and /sources.
export function formatSourceNotice({ book } = {}) {
  return sourceForSave(book ?? '');
}
export function pageSpanLabel(start, end) {
  if (!start) return '';
  return end && end !== start ? `${start}–${end}` : String(start);
}
