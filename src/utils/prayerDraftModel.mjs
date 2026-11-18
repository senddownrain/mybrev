// Pure model for closed prayer drafts (`prayerDrafts`, admin-only).
// Used by the admin UI, the publish transaction and the import tooling.
import { isUndatedBogDobry, normalizePrayerSource, resolvePrayerSource, sourceForEditor, sourceForSave } from './prayerSource.mjs';

export const DRAFT_COLLECTION = 'prayerDrafts';
export const DRAFT_STATUSES = Object.freeze(['draft', 'published']);
export const DRAFT_STATUS_LABELS = Object.freeze({ draft: 'Чарнавік', published: 'Апублікавана' });
// Old imported drafts may still have historical statuses; show and treat all of them as drafts.
export function normalizeDraftStatus(status) {
  return ['needs_review', 'ready_for_publication', 'archived'].includes(status) ? 'draft' : status;
}
export const DRAFT_ORIGINS = Object.freeze({ bog_dobry: 'Бог Добры', disputed: 'Спрэчныя' });
export const DRAFT_REASON_LABELS = Object.freeze({
  unique_bog_dobry: 'Новы тэкст з «Бог Добры»',
  ambiguous: 'Нявызначанае супадзенне са старой малітвай',
  needs_review: 'Патрэбна праверка',
  structure: 'Спрэчная сегментацыя або структура',
});
export const DRAFT_TEXT_LIMIT = 200000;
export const DRAFT_TITLE_LIMIT = 200;

export function canTransition(from, to) {
  return normalizeDraftStatus(from) === 'draft' && ['draft', 'published'].includes(to);
}

/** Casefold + graphic variants (і/i, ё/е, ў/у, apostrophes, punctuation) for title matching. */
export function normalizeTitleKey(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´ʼ'"«»„“”]/g, '')
    .replace(/і/g, 'и').replace(/i/g, 'и').replace(/ё/g, 'е').replace(/ў/g, 'у').replace(/ґ/g, 'г')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function prayerTitleOf(prayer) {
  return prayer?.title || prayer?.titleVersions?.be || Object.values(prayer?.titleVersions || {})[0] || '';
}

function tokenSet(key) {
  return new Set(key.split(' ').filter((word) => word.length > 2));
}

/**
 * Candidates for "already exists": exact normalized title => `exact`, high token overlap => `similar`.
 * @param {string} title
 * @param {Array<object>} prayers published prayers (both collections)
 */
export function findDuplicateCandidates(title, prayers, { limit = 8 } = {}) {
  const key = normalizeTitleKey(title);
  if (!key) return [];
  const tokens = tokenSet(key);
  const found = [];
  for (const prayer of prayers || []) {
    const other = normalizeTitleKey(prayerTitleOf(prayer));
    if (!other) continue;
    if (other === key) { found.push({ id: prayer.id, title: prayerTitleOf(prayer), kind: 'exact', score: 1 }); continue; }
    const otherTokens = tokenSet(other);
    if (!tokens.size || !otherTokens.size) continue;
    let shared = 0;
    for (const token of tokens) if (otherTokens.has(token)) shared += 1;
    const score = shared / Math.max(tokens.size, otherTokens.size);
    if (score >= 0.6 || other.includes(key) || key.includes(other)) found.push({ id: prayer.id, title: prayerTitleOf(prayer), kind: 'similar', score: Math.round(score * 100) / 100 });
  }
  return found.sort((a, b) => (b.kind === 'exact') - (a.kind === 'exact') || b.score - a.score).slice(0, limit);
}

export function slugDraftId(...parts) {
  return parts.join('__').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/_+/g, '_').slice(0, 240);
}
/** Deterministic id of the single public document a draft produces. */
export function targetPrayerIdFor(draft) {
  return draft.targetPrayerId || `d_${draft.draftId || draft.id}`.slice(0, 250);
}

export function validateDraft(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Пусты чарнавік.'];
  const title = String(data.title ?? '').trim();
  const text = String(data.text ?? '');
  if (!title) errors.push('Патрэбна назва.');
  if (title.length > DRAFT_TITLE_LIMIT) errors.push(`Назва даўжэйшая за ${DRAFT_TITLE_LIMIT} сімвалаў.`);
  if (!text.trim()) errors.push('Патрэбны тэкст.');
  if (text.length > DRAFT_TEXT_LIMIT) errors.push('Тэкст занадта вялікі.');
  if (data.textFormat !== 'mybrev-markdown') errors.push('Дазволены толькі фармат mybrev-markdown.');
  if (!DRAFT_STATUSES.includes(normalizeDraftStatus(data.status))) errors.push('Невядомы статус.');
  if (!Array.isArray(data.tags)) errors.push('Тэгі павінны быць спісам.');
  return errors;
}

/** What must be true before a draft may go public (shown in the confirmation dialog). */
export function publishBlockers(draft) {
  const blockers = validateDraft({ ...draft, status: draft.status });
  if (!draft.tags?.length) blockers.push('Дадайце хаця б адзін тэг.');
  if (!draft.sourceBook && !draft.source) blockers.push('Патрэбна крыніца.');
  try { sourceForEditor(draftSourceNotice(draft)); } catch (error) { blockers.push(error.message); }
  return blockers;
}

export function draftSourceNotice(draft) {
  // The editor preserves unrelated manual attributions and canonicalizes confirmed editions.
  if (String(draft.source || '').trim()) {
    const book = resolvePrayerSource(draft.sourceBook);
    if (isUndatedBogDobry(draft.source) && book.sourceId?.startsWith('bog-dobry-')) return book.value;
    return sourceForEditor(draft.source);
  }
  return normalizePrayerSource(draft.sourceBook || '');
}

/** Only submit an attribution edit when the administrator changes the displayed field.
 * Legacy sourceBook-only drafts must not acquire a synthetic unknown source on unrelated edits. */
export function draftSourcePatch(draft, input) {
  const comparable = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim();
  return comparable(input) === comparable(draftSourceNotice(draft)) ? {} : { source: input };
}

/**
 * Public prayer document for a draft. Only reader-facing fields: no PDF hashes, notes, reasons.
 * Extra provenance (`sourceDraftId`, `sourceEntryId`) lets the rules and audits link both records.
 */
export function buildPrayerFromDraft(draft, { existing, editorSource = false } = {}) {
  const title = String(draft.title).trim();
  // A replaced multi-language prayer keeps its other versions; only Belarusian is canonical.
  const versions = existing?.textVersions || existing?.titleVersions
    ? { textVersions: { ...existing.textVersions, be: draft.text }, titleVersions: { ...existing.titleVersions, be: title } } : {};
  return {
    ...versions,
    title,
    text: draft.text,
    textFormat: 'mybrev-markdown',
    textFormatVersion: 1,
    tags: [...new Set((draft.tags || []).map((tag) => String(tag).trim()).filter(Boolean))],
    source: (editorSource ? sourceForEditor : sourceForSave)(draftSourceNotice(draft)),
    ...(editorSource ? { sourceManual: normalizePrayerSource(draftSourceNotice(draft)) !== draftSourceNotice(draft) } : {}),
    copyrightNotices: [...(draft.copyrightNotices || [])],
    priestOnly: draft.priestOnly === true,
    verified: existing?.verified === true,
    sourceDraftId: draft.draftId || draft.id,
    ...(draft.originalEntryId ? { sourceEntryId: draft.originalEntryId } : {}),
  };
}
