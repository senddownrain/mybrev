// Identify the same prayer in the live (or snapshot) content, without ever comparing editions
// for quality: titles find candidates, a word-shingle score confirms identity and guards against
// merging different texts (e.g. two litanies that only share the response lines).
import { normalizeTitleKey, prayerTitleOf } from '../../../src/utils/prayerDraftModel.mjs';

export const oldText = (prayer) => prayer?.text ?? prayer?.textVersions?.be ?? Object.values(prayer?.textVersions || {})[0] ?? '';
export const oldTitle = (prayer) => prayerTitleOf(prayer);

/** Kind implied by the leading word of a title: litany / novena / chaplet / null. */
export function kindFromTitle(title) {
  const key = normalizeTitleKey(title);
  if (/^литани[яи]/.test(key)) return 'litany';
  if (/^навэнн/.test(key)) return 'novena';
  if (/^вяночак|^вянок|^вянц/.test(key)) return 'chaplet';
  return null;
}

const words = (text) => normalizeTitleKey(String(text).replace(/\(\/prayer\/[^)]*\)|[*_#>:]/g, ' ')).split(' ').filter(Boolean);
export function shingles(text, size = 2) {
  const list = words(text);
  const set = new Set();
  for (let i = 0; i + size <= list.length; i += 1) set.add(list.slice(i, i + size).join(' '));
  return set;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}
export function containment(small, big) {
  if (!small.size) return 0;
  let shared = 0;
  for (const item of small) if (big.has(item)) shared += 1;
  return shared / small.size;
}
const titleTokens = (title) => new Set(normalizeTitleKey(title).split(' ').filter((word) => word.length > 2));
export function titleScore(a, b) {
  const left = titleTokens(a); const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

// Titles that differ only by inflection / word order (same 5-letter stems, ignoring short words).
const stems = (title) => [...new Set(normalizeTitleKey(title).split(' ').filter((word) => word.length > 3).map((word) => word.slice(0, 5)))].sort().join(' ');
export const sameStems = (a, b) => stems(a) === stems(b);

export const THRESHOLDS = Object.freeze({ sameTitleText: 0.3, fuzzyText: 0.45, textOnly: 0.6, fuzzyTitle: 0.5, similarTitleOnly: 0.7, pick: 0.5, pickGap: 0.25, strongText: 0.8 });

/**
 * @param {{ title: string, text: string, kind?: string }} canon canonical entry (title + derived markdown text)
 * @param {Array<object>} oldPrayers live prayers (both collections)
 * @returns {{ decision: 'REPLACE_KEEP_ID'|'REVIEW_AMBIGUOUS'|'CREATE', targetId?: string, reason: string, confidence: string, candidates: Array<object> }}
 */
export function matchCanonical(canon, oldPrayers) {
  const key = normalizeTitleKey(canon.title);
  const canonShingles = shingles(canon.text);
  const canonKind = canon.kind || kindFromTitle(canon.title);
  const scored = [];
  for (const prayer of oldPrayers) {
    const title = oldTitle(prayer);
    const oldKind = kindFromTitle(title);
    if (canonKind && oldKind && canonKind !== oldKind) continue; // a litany is never a novena
    const exact = normalizeTitleKey(title) === key;
    const tScore = exact ? 1 : titleScore(canon.title, title);
    const body = shingles(oldText(prayer));
    const textScore = jaccard(canonShingles, body);
    const embedded = body.size > canonShingles.size * 1.5 && containment(canonShingles, body) >= 0.8;
    scored.push({ id: prayer.id, title, exact, titleScore: Math.round(tScore * 100) / 100, textScore: Math.round(textScore * 100) / 100, embedded });
  }
  const summary = (list) => list.map(({ id, title, exact, titleScore: t, textScore: x, embedded }) => ({ id, title, exact, titleScore: t, textScore: x, embedded }));
  const exact = scored.filter((item) => item.exact);
  const T = THRESHOLDS;
  if (exact.length === 1) {
    const [hit] = exact;
    if (hit.textScore >= T.sameTitleText || !oldText(oldPrayers.find((p) => p.id === hit.id)).trim()) return { decision: 'REPLACE_KEEP_ID', targetId: hit.id, reason: 'exact normalized title', confidence: hit.textScore >= T.fuzzyText ? 'high' : 'medium', candidates: summary(exact) };
    return { decision: 'REVIEW_AMBIGUOUS', reason: 'same title, texts differ strongly (possibly a different prayer)', confidence: 'low', candidates: summary(exact) };
  }
  if (exact.length > 1) {
    const ranked = [...exact].sort((a, b) => b.textScore - a.textScore);
    if (ranked[0].textScore >= T.pick && ranked[0].textScore - ranked[1].textScore >= T.pickGap) {
      return { decision: 'REPLACE_KEEP_ID', targetId: ranked[0].id, reason: 'several same-title duplicates; best text match kept, others listed as aliases', confidence: 'medium', candidates: summary(ranked) };
    }
    return { decision: 'REVIEW_AMBIGUOUS', reason: 'several prayers with the same title and no clear text match', confidence: 'low', candidates: summary(ranked) };
  }
  // A different distinguishing word (another saint, another title) needs near-identical text to count as the same prayer.
  const fuzzy = scored.filter((item) => item.titleScore >= T.fuzzyTitle && ((item.textScore >= T.fuzzyText && sameStems(canon.title, item.title)) || item.textScore >= T.strongText)).sort((a, b) => b.textScore - a.textScore);
  if (fuzzy.length === 1 || (fuzzy.length > 1 && fuzzy[0].textScore - fuzzy[1].textScore >= T.pickGap)) {
    return { decision: 'REPLACE_KEEP_ID', targetId: fuzzy[0].id, reason: 'similar title confirmed by text', confidence: 'medium', candidates: summary(fuzzy) };
  }
  const textOnly = scored.filter((item) => item.textScore >= T.textOnly).sort((a, b) => b.textScore - a.textScore);
  const similar = scored.filter((item) => item.titleScore >= T.similarTitleOnly && sameStems(canon.title, item.title));
  const doubtful = [...new Map([...fuzzy, ...textOnly, ...similar].map((item) => [item.id, item])).values()];
  if (doubtful.length) return { decision: 'REVIEW_AMBIGUOUS', reason: fuzzy.length ? 'several similar prayers' : textOnly.length ? 'text matches a prayer with another title' : 'similar title without text confirmation', confidence: 'low', candidates: summary(doubtful) };
  const embedded = scored.filter((item) => item.embedded);
  return { decision: 'CREATE', reason: embedded.length ? 'no counterpart; text also appears inside a larger old document' : 'no counterpart in current content', confidence: 'high', candidates: summary(embedded) };
}
