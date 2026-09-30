/**
 * Normalization of the fixed-feast source material (`patchs/feasts`,
 * `patchs/feasts/common-texts`) into sparse documents.
 *
 * A source value is either a liturgical text (kept as it is) or an
 * instruction written in Belarusian / as a legacy marker. Instructions are
 * turned into structured `_fieldRules` here, at import time, so the runtime
 * never has to read a phrase to find out where a text comes from.
 */
import { FIRST_VESPER_FIELDS, OFFICE_CONTENT_FIELDS, TE_DEUM_FIELD } from '../../src/constants/officeFields.js';

const CONTENT_FIELD_SET = new Set(OFFICE_CONTENT_FIELDS);

export function isEmptyValue(value) {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && (value.length === 0 || value.every((item) => item === '' || item === null)));
}

/** The single plain-text line of a value, lower-cased; '' when it is a real text. */
export function instructionText(value) {
  const single = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (typeof single !== 'string') return '';
  const text = single.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 120 || /<[a-z]/i.test(text)) return '';
  return text.toLocaleLowerCase('be');
}

/** Latin look-alikes typed instead of Cyrillic letters (I тыдня → І тыдня). */
const cyrillic = (text) => text.replace(/i/g, 'і');

const COMMON_BY_PHRASE = [
  [/найсв\. панну марыю/, 'blessed-virgin-mary'],
  [/апосталаў/, 'apostles'],
  [/пастыраў/, 'pastors'],
  [/аднаго мучаніка/, 'martyr-one'],
  [/мучанікаў/, 'martyrs-many'],
  [/святых жанчын/, 'holy-women'],
  [/святых мужчын/, 'holy-men'],
  [/доктараў/, 'doctors-of-church'],
  [/паннаў/, 'virgins'],
  [/законнікаў/, 'religious'],
];

const MARKERS = Object.freeze({
  'from-day': { source: 'current-day' },
  '[from-day]': { source: 'current-day' },
  'from-first-week': { source: 'sunday-week-1' },
  'from-apostles': { source: 'template', template: 'apostles' },
  'from-apostels': { source: 'template', template: 'apostles' },
});

/**
 * Classify one source value.
 * @returns {{ kind: 'text' } | { kind: 'empty' } | { kind: 'rule', rule: object, wholeHour?: boolean }
 *   | { kind: 'te-deum' } | { kind: 'unresolved', reason: string }}
 */
export function classifyValue(field, value) {
  if (isEmptyValue(value)) return { kind: 'empty' };
  if (field === TE_DEUM_FIELD) return { kind: 'te-deum' };
  const marker = instructionText(value);
  if (!marker) return { kind: 'text' };
  if (MARKERS[marker]) return { kind: 'rule', rule: MARKERS[marker] };
  const text = cyrillic(marker);
  if (marker === 'from-own-texts') {
    // «З уласных тэкстаў»: the collect of the celebration for every prayer;
    // any other component simply has no Common text.
    return /Pr$/.test(field) ? { kind: 'rule', rule: { ref: 'laudesPr' } } : { kind: 'empty', note: 'own-texts-expected' };
  }
  if (/^з нядзелі і тыдня$/.test(text)) return { kind: 'rule', rule: { source: 'sunday-week-1' } };
  if (/усё бярэцца з актавы нараджэння пана/.test(text)) return { kind: 'rule', rule: { source: 'current-day' }, wholeHour: true };
  if (/бягучага (?:дня|тыдня)/.test(text)) return { kind: 'rule', rule: { source: 'current-day' } };
  if (/агульных тэкстаў пра/.test(text)) {
    const match = COMMON_BY_PHRASE.find(([pattern]) => pattern.test(text));
    if (match) return { kind: 'rule', rule: { source: 'template', template: match[1] } };
    return { kind: 'unresolved', reason: 'unknown Common' };
  }
  if (/^(?:астатняе|малітва) з агульных тэкстаў/.test(text)) return { kind: 'rule', rule: { source: 'common' } };
  if (/^малітва, як пададзена вышэй/.test(text)) return { kind: 'rule', rule: { ref: 'laudesPr' } };
  if (/Hymn$/.test(field)) {
    if (/з ютрані\.?$/.test(text)) return { kind: 'rule', rule: { ref: 'laudesHymn' } };
    if (/з і нешпараў\.?$/.test(text)) return { kind: 'rule', rule: { ref: 'vesper1Hymn' } };
    if (/з нешпараў\.?$/.test(text)) {
      // «Ты гонар з Нешпараў»: the incipit tells I from II Vespers.
      const incipit = text.replace(/,?\s*з нешпараў\.?$/, '').replace(/^гімн\s*/, '').trim();
      return { kind: 'rule', rule: { ref: ['vesperHymn', 'vesper1Hymn'] }, ...(incipit ? { incipit } : {}) };
    }
    if (/з гадзіны чытанняў\.?$/.test(text)) return { kind: 'rule', rule: { ref: 'officeOfReadingsHymn' } };
    if (/с\. \d+/.test(text) || /з уласных тэкстаў/.test(text)) return { kind: 'unresolved', reason: 'page or own-text reference' };
  }
  if (/\bfrom(?:-[a-z]+)+\b/.test(marker)) return { kind: 'unresolved', reason: 'unknown marker' };
  return { kind: 'text' };
}

const hourPrefix = (field) => field.replace(/(Hymn|Ant\d|Ps\d|R|AntBen|AntMag|Inter|Pr|Vers|R\d)$/, '');

/**
 * Split a source object into own texts and structured rules.
 * A rule that points at the field itself or at an empty field is dropped.
 */
export function splitSource(raw, { file = '' } = {}) {
  const texts = {};
  const rules = {};
  const report = { normalized: [], unresolved: [], droppedPlaceholders: [] };
  const wholeHours = [];
  const incipits = {};
  Object.entries(raw).forEach(([field, value]) => {
    if (!CONTENT_FIELD_SET.has(field)) return;
    const result = classifyValue(field, value);
    if (result.kind === 'text') texts[field] = value;
    else if (result.kind === 'te-deum') texts[field] = true;
    else if (result.kind === 'rule') {
      rules[field] = result.rule;
      if (result.incipit) incipits[field] = result.incipit;
      report.normalized.push({ file, field, from: value, rule: result.rule });
      if (result.wholeHour) wholeHours.push({ prefix: hourPrefix(field), rule: result.rule });
    } else if (result.kind === 'unresolved') {
      report.unresolved.push({ file, field, value, reason: result.reason });
    }
  });
  // «Усё бярэцца з …»: the rule covers every field of that hour without own text.
  wholeHours.forEach(({ prefix, rule }) => {
    [...CONTENT_FIELD_SET].filter((field) => hourPrefix(field) === prefix && !(field in texts) && !(field in rules))
      .forEach((field) => { rules[field] = rule; });
  });
  // A reference with several candidates is decided here, from the own texts:
  // the hymn that begins with the quoted incipit, else the first own hymn.
  const plain = (value) => String(Array.isArray(value) ? value.join(' ') : value || '').replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ').trim().toLocaleLowerCase('be');
  Object.entries(rules).forEach(([field, rule]) => {
    if (!Array.isArray(rule.ref)) return;
    const own = rule.ref.filter((name) => name !== field && name in texts);
    const byIncipit = incipits[field] ? own.find((name) => plain(texts[name]).startsWith(incipits[field])) : null;
    if (byIncipit || own.length) rules[field] = { ref: byIncipit || own[0] };
  });
  // `ref` to the same field or to something the document cannot provide.
  Object.entries(rules).forEach(([field, rule]) => {
    if (!rule.ref) return;
    const targets = (Array.isArray(rule.ref) ? rule.ref : [rule.ref]).filter((name) => name !== field);
    if (!targets.length) delete rules[field];
    else rules[field] = { ref: targets.length === 1 ? targets[0] : targets };
  });
  return { texts, rules, report };
}

/** Is a I Vespers field present as own text or rule? */
export const hasFirstVespers = (texts, rules) => FIRST_VESPER_FIELDS.some((field) => field in texts || field in rules);

const TEMPLATE_HINTS = [
  [/панны марыі|багародзіцы|маці божай/u, 'blessed-virgin-mary'],
  [/пасвячэння/u, 'church-dedication'],
  [/апостал/u, 'apostles'],
  [/мучанікаў|мучаніц(?!ы)|паплечнік/u, 'martyrs-many'],
  [/мучаніка|мучаніцы/u, 'martyr-one'],
  [/доктара/u, 'doctors-of-church'],
  [/біскупа|прэзбітэра|папы|пастыра/u, 'pastors'],
  [/панны(?! марыі)|паннаў/u, 'virgins'],
  [/законніка|законніцы|абата|пустэльніка/u, 'religious'],
];

/** Commons a title clearly points at (scaffolds only; flagged as inferred). */
export function inferTemplates(title) {
  const text = String(title || '').toLocaleLowerCase('be');
  return TEMPLATE_HINTS.filter(([pattern]) => pattern.test(text)).map(([, template]) => template);
}
