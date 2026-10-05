/**
 * Plan of the Ordinary Time period-document repair (pure; see
 * `scripts/liturgy/repair-temporal-days.mjs`).
 */
import { OFFICE_CONTENT_FIELDS, FIRST_VESPER_FIELDS, TE_DEUM_FIELD } from '../../../src/constants/officeFields.js';
import { isFromDayReference } from '../../../src/constants/days.js';

const WEEK_FIELDS = new Set(['officeOfReadingsPr']);
const WEEK_SPECIFIC = new Set(['officeOfReadingsR1', 'officeOfReadingsR2']);
const SKIP = new Set([TE_DEUM_FIELD, ...FIRST_VESPER_FIELDS]);

export const norm = (value) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''))
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&ndash;/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim();
export const isEmpty = (value) => !norm(value) || isFromDayReference(norm(value));

/** Majority value of `docs[field]` among non-empty peers, or null. */
export function consensus(docs, field, { unanimous = false } = {}) {
  const groups = new Map();
  const present = docs.filter((doc) => !isEmpty(doc[field]));
  present.forEach((doc) => {
    const key = norm(doc[field]);
    groups.set(key, [...(groups.get(key) || []), doc]);
  });
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const best = sorted[0] || [];
  const ok = unanimous
    ? sorted.length === 1 && best.length >= 2
    : best.length >= 3 && best.length / present.length >= 0.75;
  if (!ok) return null;
  return { value: best[0][field], agree: best.map((doc) => doc.id), disagree: sorted.slice(1).flat().map((doc) => doc.id) };
}

export function planTemporalRepairs(days) {
  const byId = new Map(days.map((doc) => [doc.id, doc]));
  const period = days.filter((doc) => doc._periodType === 'ordinary' && !doc._date && /^ordinary-w\d+-d\d$/.test(doc.id));
  const repairs = [];
  const unfillable = [];
  period.forEach((doc) => {
    const week = Number(doc._periodWeekNumber);
    const dow = Number(doc._dayOfWeek);
    const empty = OFFICE_CONTENT_FIELDS.filter((field) => !SKIP.has(field) && isEmpty(doc[field]));
    if (!empty.length) return;
    const psalterPeers = [...Array(34).keys()].map((index) => index + 1)
      .filter((other) => other !== week && (other - week) % 4 === 0)
      .map((other) => byId.get(`ordinary-w${other}-d${dow}`)).filter(Boolean);
    const weekPeers = [1, 2, 3, 4, 5, 6, 7].filter((other) => other !== dow && other !== 1)
      .map((other) => byId.get(`ordinary-w${week}-d${other}`)).filter(Boolean);
    const fields = {};
    const evidence = {};
    empty.forEach((field) => {
      if (WEEK_SPECIFIC.has(field)) { unfillable.push({ id: doc.id, field, reason: 'week-specific reading' }); return; }
      // A Sunday has its own texts: only weekdays are repaired.
      if (dow === 1) { unfillable.push({ id: doc.id, field, reason: 'Sunday proper' }); return; }
      const found = WEEK_FIELDS.has(field)
        ? consensus(weekPeers, field, { unanimous: true })
        : consensus(psalterPeers, field);
      if (!found) { unfillable.push({ id: doc.id, field, reason: 'no consensus among equivalent documents' }); return; }
      fields[field] = found.value;
      evidence[field] = { rule: WEEK_FIELDS.has(field) ? 'same week' : 'same psalter week', agree: found.agree, disagree: found.disagree };
    });
    if (Object.keys(fields).length) repairs.push({ id: doc.id, fields, evidence });
  });
  return { repairs, unfillable };
}


/** `days` with the planned repairs applied (target state for the audits). */
export function withTemporalRepairs(days) {
  const { repairs } = planTemporalRepairs(days);
  const byId = new Map(repairs.map((item) => [item.id, item.fields]));
  return days.map((doc) => (byId.has(doc.id) ? { ...doc, ...byId.get(doc.id) } : doc));
}
