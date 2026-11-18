// The /sources bibliography is also the single registry of canonical prayer source names.
import bibliography from '../data/sourceBibliography.json' with { type: 'json' };

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLocaleLowerCase('be').replace(/[«»„“”"']/gu, '');
export const PRAYER_SOURCE_POLICY_VERSION = '2026-11-18-edition-policy-v5';
export const PRAYER_SOURCE_REGISTRY = bibliography.entries;
export const isUndatedBogDobry = (value) => typeof value === 'string'
  && /^(?:малітоўнік )?бог добры(?:[\s,.;:]+.+)?$/iu.test(key(value))
  && !/\b(?:19|20)\d{2}\b/u.test(value)
  && metadataOnly(key(value).replace(/^(?:малітоўнік )?бог добры/iu, ''));
export const hasSourcePages = (value) => /(?:^|[\s,.;(])(?:с\.|стар\.?|старонк[аіуы]|стр\.?|страниц[аы]?|pp?\.)\s*\d/iu.test(String(value ?? ''));
export const hasLongSourceDetails = (value) => hasSourcePages(value) || /©|ISBN|https?:\/\/|выдавецтв|издательств|\b\d{4}\b|(?:том|частка|часть|выданне)\s+[\dIVІX]+/iu.test(String(value ?? '')) || /\d+\s*[–—-]\s*\d+/u.test(String(value ?? '')) || clean(value).length > 100;

function aliases(entry) {
  // Extract the title only from an explicitly quoted edition; never guess from arbitrary input.
  const printed = /«([^»]+)»/u.exec(entry.title)?.[1];
  const shorthand = entry.explicitEdition ? [] : [entry.shortTitle, printed, printed ? entry.title.slice(0, entry.title.indexOf('»') + 1) : null];
  return [...new Set([entry.canonicalValue, entry.title, ...shorthand, ...(entry.aliases || [])].filter(Boolean).map(key))];
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
    .replace(/(?:[-–—]\s*)?гл\.\s*№\s*\d+/giu, '')
    .replace(/ISBN\s*[\d–-]+/giu, '')
    .replace(/[\s,.;:]+/gu, '');
  return !rest;
}

/** Unknown/ambiguous input is returned byte-for-byte; callers can report or reject it. */
export function resolvePrayerSource(value) {
  if (typeof value !== 'string') return { value, status: value == null ? 'empty' : 'unknown' };
  const input = key(value);
  const digitalInput = clean(value).replace(/^для прыватнага карыстання,\s*/iu, '');
  const link = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/u.exec(digitalInput);
  const urlText = link ? link[2] : /^\[(https?:\/\/[^\s[\]()]+)\]$/u.exec(digitalInput)?.[1] || digitalInput;
  if (/^https?:\/\/[^\s[\]()]+$/u.test(urlText)) {
    try {
      const url = new URL(urlText);
      const digital = PRAYER_SOURCE_REGISTRY.filter((entry) => entry.digitalHosts?.includes(url.hostname.toLowerCase()) && !url.username && !url.password);
      if (digital.length === 1) return { value: digital[0].shortTitle, status: 'known', sourceId: digital[0].id };
    } catch { /* Preserve malformed URLs for editorial review. */ }
  }
  if (!input) return { value, status: 'empty' };
  const citedYears = [...input.matchAll(/(?:мінск|пінск|гродна|минск|minsk)\s*,?\s*(\d{4})/giu)].map((match) => match[1]);
  const candidates = registry.filter(({entry}) => !entry.canonicalValue || citedYears.every((year) => entry.canonicalValue.endsWith(year + ')'))).map(({entry, aliases}) => ({
    entry,
    score: Math.max(0, ...aliases.filter((alias) => input === alias || (input.startsWith(alias) && /^[\s,.;:(]/u.test(input.slice(alias.length)) && metadataOnly(input.slice(alias.length)))).map((alias) => alias.length)),
  }));
  const longest = Math.max(0, ...candidates.map(({score}) => score));
  const matches = candidates.filter(({score}) => score > 0 && score === longest);
  if (matches.length !== 1) return { value, status: 'unknown' };
  const entry = matches[0].entry;
  return { value: entry.canonicalValue || entry.shortTitle, status: 'known', sourceId: entry.id };
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

// The editor may save a manually attributed source not yet present in /sources.
// Imports continue to use sourceForSave and still require the canonical registry.
export const EDITOR_SOURCE_MAX_LENGTH = 500;
export function sourceForEditor(value) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > EDITOR_SOURCE_MAX_LENGTH) {
    const error = new Error('Крыніца павінна быць тэкстам да 500 сімвалаў.');
    error.code = 'invalid-prayer-source';
    throw error;
  }
  const input = value.trim();
  const resolved = resolvePrayerSource(input);
  return registry.some(({entry}) => entry.canonicalValue === resolved.value && entry.id === resolved.sourceId)
    ? resolved.value : input;
}

export function normalizePrayerSourceFields(data, { forSave = true, existing, editor = false } = {}) {
  const normalize = editor ? sourceForEditor : forSave ? sourceForSave : normalizePrayerSource;
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
