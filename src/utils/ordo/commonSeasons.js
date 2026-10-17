/**
 * Seasonal variants of the Commons («Агульныя тэксты»).
 *
 * A Common (`liturgicalTemplates/<id>`, `_kind: 'common'`) keeps its flat base
 * fields (`vesper1Ant3`, `officeOfReadingsR1`, …: the text of Ordinary Time)
 * and may carry a SPARSE object of seasonal deltas:
 *
 *   "_seasonalVariants": {
 *     "lent":   { "vesper1Ant3": "<p>…</p>", "vesper1Ps3": "<p>…</p>" },
 *     "easter": { … }
 *   }
 *
 * Variant seasons: advent | christmas | lent | easter. Ordinary Time is the
 * flat base and is never duplicated. A field is
 *   - absent from the season object  → inherits the flat base ("no override"),
 *   - a string / array of strings    → replaces the text of that field,
 *   - `null`                         → intentionally EMPTY in that season (rule `{ omit: true }`),
 *   - `{ rule: {…} }`                → replaces the text by a structured `_fieldRules` entry.
 *
 * `materializeCommonForSeason()` turns the template into the ordinary flat
 * object the assembler already understands; consumers never see the delta
 * object. Pure: the argument and any shared cache are never mutated.
 */
import { OFFICE_CONTENT_FIELDS, TE_DEUM_FIELD } from '../../constants/officeFields.js';
import { isValidFieldRule } from './fieldRules.js';

export const COMMON_SEASON_KEYS = Object.freeze(['advent', 'christmas', 'lent', 'easter']);
export const SEASONAL_VARIANTS_FIELD = '_seasonalVariants';

/**
 * Marian Common: `_mainSection[field]` is the text of the main section of Volume III WITHOUT the optional Saturday
 * memorial that the stored field merges with it (D-2). The Saturday memorial itself shows the whole stored field.
 */
export const MAIN_SECTION_FIELD = '_mainSection';
export const SATURDAY_MEMORIAL_OPTION = 'saturday-blessed-virgin-mary';

/**
 * Ordo period (+ phase) of the SELECTED Office → variant key (null = flat base).
 *
 * Holy Week: the rubric of Volume II reads «У Вялікі пост», and Great Lent (Quadragesima) lasts until the
 * Mass of the Lord's Supper, so Palm Sunday (`palm-sunday`) and Monday–Wednesday of Holy Week (`holy-week`)
 * take the Lent texts. The Ordo marks every day from Holy Thursday to Holy Saturday as `periodPhase: 'triduum'`
 * (`computeSeason`: the phase changes at the DATE of Holy Thursday, it does not know the hour of the Mass of
 * the Lord's Supper), and the Sacred Triduum is neither Lent nor Easter: no variant, so the Thursday morning
 * hours (Lent by the book) also read the flat text. No Common-based Office is celebrated on any of these days
 * (tests prove it from the calendar), so this never decides a real celebration.
 * The decision is made from the PHASE, never from the period alone: `holyweek` without a known phase gives no
 * variant (the Triduum cannot be told from Palm Sunday by the period).
 */
export function variantKeyForSeason(season) {
  const period = typeof season === 'string' ? season : season?.period;
  const phase = typeof season === 'string' ? '' : season?.periodPhase;
  switch (period) {
    case 'advent': return 'advent';
    case 'christmas': return 'christmas';
    case 'lent': return 'lent';
    case 'holyweek': return phase === 'palm-sunday' || phase === 'holy-week' ? 'lent' : null;
    case 'easter': return 'easter';
    default: return null;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Variant keys that really carry fields in this template. */
export function seasonalVariantKeys(template) {
  const variants = template?.[SEASONAL_VARIANTS_FIELD];
  return isPlainObject(variants) ? COMMON_SEASON_KEYS.filter((key) => isPlainObject(variants[key]) && Object.keys(variants[key]).length) : [];
}

export const hasSeasonalVariants = (template) => seasonalVariantKeys(template).length > 0;

/**
 * @param {object|null} template  Common template (never mutated)
 * @param {string|{period:string, periodPhase?:string}|null} officeSeason  season of the selected Office (`computeSeason`)
 * @returns {object|null} the same object when nothing applies, else a new flat object with
 *   `_seasonal: { variant, fields }` and without `_seasonalVariants`.
 */
export function materializeCommonForSeason(template, officeSeason) {
  if (!template || !hasSeasonalVariants(template)) return template ?? null;
  const key = variantKeyForSeason(officeSeason);
  const delta = key ? template[SEASONAL_VARIANTS_FIELD][key] : null;
  if (!isPlainObject(delta) || !Object.keys(delta).length) return template;
  const { [SEASONAL_VARIANTS_FIELD]: ignored, ...flat } = template;
  void ignored;
  const rules = isPlainObject(flat._fieldRules) ? { ...flat._fieldRules } : {};
  const applied = [];
  Object.entries(delta).forEach(([field, value]) => {
    if (!OFFICE_CONTENT_FIELDS.includes(field) || field === TE_DEUM_FIELD) return;
    if (typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'))) {
      flat[field] = Array.isArray(value) ? [...value] : value;
      delete rules[field];
    } else if (value === null) {
      delete flat[field];
      rules[field] = { omit: true };
    } else if (isPlainObject(value) && isValidFieldRule(value.rule)) {
      delete flat[field];
      rules[field] = { ...value.rule };
    } else return;
    applied.push(field);
  });
  if (Object.keys(rules).length) flat._fieldRules = rules; else delete flat._fieldRules;
  flat._seasonal = { variant: key, fields: applied };
  return flat;
}

/**
 * Season-scoped view of a templates map. Never mutates the map; materialises
 * lazily and memoises per call so one assembly never mixes seasons.
 */
export function seasonalTemplateGetter(templates, officeSeason) {
  const raw = (id) => (templates instanceof Map ? templates.get(id) : templates?.[id]) || null;
  const memo = new Map();
  return (id) => {
    if (!memo.has(id)) memo.set(id, materializeCommonForSeason(raw(id), officeSeason));
    return memo.get(id);
  };
}

const MAX_FIELD_LENGTH = 200000;
const OPEN_CLOSE = ['p', 'span', 'em', 'strong'];

function unbalancedTags(html) {
  const stack = [];
  const re = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>/gi;
  let match;
  while ((match = re.exec(html))) {
    const [, closing, name, , selfClosing] = match;
    const tag = name.toLowerCase();
    if (!OPEN_CLOSE.includes(tag)) continue;
    if (selfClosing) continue;
    if (!closing) stack.push(tag);
    else if (stack.pop() !== tag) return true;
  }
  return stack.length > 0;
}

/**
 * Validate the `_seasonalVariants` object of a Common (used by the generator,
 * the import validator and the tests). Returns a list of `{ path, message }`.
 */
export function validateSeasonalVariants(template, { id = template?._id || template?.id || '?' } = {}) {
  const issues = [];
  const variants = template?.[SEASONAL_VARIANTS_FIELD];
  if (variants === undefined) return issues;
  const add = (pathLabel, message) => issues.push({ path: `${id}.${SEASONAL_VARIANTS_FIELD}${pathLabel}`, message });
  if (!isPlainObject(variants)) { add('', 'must be an object'); return issues; }
  Object.entries(variants).forEach(([season, delta]) => {
    if (!COMMON_SEASON_KEYS.includes(season)) { add(`.${season}`, `unknown season (allowed: ${COMMON_SEASON_KEYS.join(', ')}; Ordinary Time is the flat base)`); return; }
    if (!isPlainObject(delta)) { add(`.${season}`, 'must be an object of fields'); return; }
    Object.entries(delta).forEach(([field, value]) => {
      const where = `.${season}.${field}`;
      if (!OFFICE_CONTENT_FIELDS.includes(field)) { add(where, 'unknown field (not in OFFICE_CONTENT_FIELDS)'); return; }
      if (field === TE_DEUM_FIELD) { add(where, 'the Te Deum flag cannot be seasonal'); return; }
      const texts = typeof value === 'string' ? [value] : (Array.isArray(value) ? value : null);
      if (value === null) return;
      if (isPlainObject(value)) {
        if (Object.keys(value).some((key) => key !== 'rule')) add(where, 'only { rule } objects are allowed');
        else if (!isValidFieldRule(value.rule)) add(where, 'invalid structured rule');
        return;
      }
      if (!texts || texts.some((text) => typeof text !== 'string')) { add(where, 'must be a string, an array of strings, null or { rule }'); return; }
      texts.forEach((text, index) => {
        const at = texts.length > 1 ? `${where}[${index}]` : where;
        if (!text.trim()) add(at, 'empty text (use null for an intentionally empty field)');
        if (text.length > MAX_FIELD_LENGTH) add(at, `text longer than ${MAX_FIELD_LENGTH} characters`);
        if (/<\s*(script|iframe|object|style)/i.test(text)) add(at, 'forbidden HTML');
        if (/\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)/u.test(text)) add(at, 'editorial mark «(Велікодны перыяд Аллелюя)» left in the text');
        if (/(?:^|>)\s*У\s+(?:Вялікі\s+пост|Велікодны\s+перыяд|перыяд\s+Адвэнту|перыяд\s+Нараджэння\s+Пана)\s*:?\s*(?:<|$)/u.test(text)) add(at, 'a seasonal rubric of the book is left inside the text (two alternatives in one field)');
        if (unbalancedTags(text)) add(at, 'unbalanced HTML tags');
      });
    });
  });
  return issues;
}
