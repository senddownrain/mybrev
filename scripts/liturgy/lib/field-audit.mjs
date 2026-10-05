/**
 * What a liturgical content value IS — field-aware.
 *
 *   REAL_TEXT              a text to pray
 *   STRUCTURED_REFERENCE   another field of the same Office («Гімн з Ютрані» → { ref })
 *   SOURCE_RULE            another source (day, Sunday week I, a Common, from-day)
 *   OMIT                   intentionally empty (`{ omit: true }`)
 *   EMPTY_ALLOWED          no value; the Office descriptor supplies the field
 *   SUSPICIOUS_SHORT_TEXT  plain text too short for the field AND worded like an instruction
 *   UNRESOLVED_REFERENCE   an instruction that cannot be followed (page of the book, unknown Common)
 *
 * The normalizer (`scripts/lib/feast-content.mjs#classifyValue`) decides the
 * rules; this module adds the diagnostics a runtime must never meet as text.
 */
import { isFromDayReference } from '../../../src/constants/days.js';
import { TE_DEUM_FIELD } from '../../../src/constants/officeFields.js';
import { classifyValue } from '../../lib/feast-content.mjs';

export const FIELD_VALUE_TYPE = Object.freeze({
  REAL_TEXT: 'REAL_TEXT',
  STRUCTURED_REFERENCE: 'STRUCTURED_REFERENCE',
  SOURCE_RULE: 'SOURCE_RULE',
  OMIT: 'OMIT',
  EMPTY_ALLOWED: 'EMPTY_ALLOWED',
  SUSPICIOUS_SHORT_TEXT: 'SUSPICIOUS_SHORT_TEXT',
  UNRESOLVED_REFERENCE: 'UNRESOLVED_REFERENCE',
});

export const plainText = (value) => (Array.isArray(value) ? value.join(' ') : String(value ?? ''))
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&ndash;|&mdash;/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim();

/** Smallest plausible length of a real text of the field (characters of plain text). */
export function minimumTextLength(field) {
  if (/Ps\d$/.test(field)) return 120;
  if (/officeOfReadingsR[12]$/.test(field)) return 150;
  if (/Hymn$/.test(field)) return 60;
  if (/Inter$/.test(field)) return 80;
  if (/Pr$/.test(field)) return 50;
  if (/R$/.test(field)) return 30;
  return 4; // antiphons, versicles, canticle antiphons: short by nature
}

/** Words of rubrics and source instructions (never a reason on their own). */
const SOURCE_VOCABULARY = /ютран|нешпар|будз|будн|бягуч|нядзел|тыдн|агульн|малітва з|гімн з|псальмы? з|антыфон[аы]? з|як вышэй|як пададзена|с\.\s?\d|from-|уласных тэкстаў|усё бярэцца/iu;

/**
 * @param {string} field
 * @param {*} value
 * @param {{ rule?: object }} [o]  the document's `_fieldRules[field]`, if any
 */
export function classifyField(field, value, { rule } = {}) {
  const T = FIELD_VALUE_TYPE;
  if (field === TE_DEUM_FIELD) return { type: T.REAL_TEXT };
  const text = plainText(value);
  if (!text) {
    if (rule?.omit) return { type: T.OMIT };
    if (rule?.ref) return { type: T.STRUCTURED_REFERENCE, rule };
    if (rule) return { type: T.SOURCE_RULE, rule };
    return { type: T.EMPTY_ALLOWED };
  }
  if (isFromDayReference(text)) return { type: T.SOURCE_RULE, rule: { source: 'current-day' }, marker: true };
  const result = classifyValue(field, value);
  if (result.kind === 'rule') {
    return { type: result.rule.ref ? T.STRUCTURED_REFERENCE : T.SOURCE_RULE, rule: result.rule, ...(result.wholeHour ? { wholeHour: true } : {}) };
  }
  if (result.kind === 'unresolved') return { type: T.UNRESOLVED_REFERENCE, reason: result.reason };
  if (result.kind === 'empty') return { type: T.EMPTY_ALLOWED, note: result.note };
  const minimum = minimumTextLength(field);
  if (text.length < minimum && SOURCE_VOCABULARY.test(text)) {
    return { type: T.SUSPICIOUS_SHORT_TEXT, reason: `${text.length} < ${minimum} chars, instruction vocabulary` };
  }
  if (minimum >= 120 && text.length < 40) return { type: T.SUSPICIOUS_SHORT_TEXT, reason: `${text.length} chars for a psalm/reading` };
  return { type: T.REAL_TEXT };
}

/** Types a reader must never see as the text of a field. */
export const NOT_RENDERABLE = new Set([
  FIELD_VALUE_TYPE.STRUCTURED_REFERENCE,
  FIELD_VALUE_TYPE.SOURCE_RULE,
  FIELD_VALUE_TYPE.SUSPICIOUS_SHORT_TEXT,
  FIELD_VALUE_TYPE.UNRESOLVED_REFERENCE,
]);
